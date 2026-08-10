import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { CandleOHLCV } from '@chuchu/shared';

/**
 * BybitDataClient
 * Fast market-data + authenticated endpoints via the Bybit v5 REST API.
 *
 * Why Bybit:
 *  - Public ticker/kline endpoints answer in ~10-30ms and use a separate
 *    rate-limit budget from Binance, so the 1-second priority position loop
 *    and MTF backfills stop competing with Binance REST (no more 429s).
 *  - The API key/secret (BYBIT_API_KEY / BYBIT_API_SECRET) unlock private
 *    endpoints (balance, positions) with higher per-IP weight.
 *
 * Credentials are read from environment only and never logged.
 */
export class BybitDataClient {
  private client: AxiosInstance;
  private apiKey: string;
  private apiSecret: string;

  constructor() {
    this.apiKey = process.env.BYBIT_API_KEY || '';
    this.apiSecret = process.env.BYBIT_API_SECRET || '';
    this.client = axios.create({
      baseURL: process.env.BYBIT_BASE_URL || 'https://api.bybit.com',
      timeout: 8000,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  public isConfigured(): boolean {
    return this.apiKey.length > 0 && this.apiSecret.length > 0;
  }

  // Bybit v5 kline interval names
  private static readonly TF_MAP: Record<string, string> = {
    '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
    '1h': '60', '2h': '120', '4h': '240', '12h': '720', '1d': 'D'
  };

  private signHeaders(queryString: string): Record<string, string> {
    const timestamp = Date.now().toString();
    const recvWindow = '20000';
    const signString = `${timestamp}${this.apiKey}${recvWindow}${queryString}`;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(signString)
      .digest('hex');
    return {
      'X-BAPI-API-KEY': this.apiKey,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow,
      'X-BAPI-SIGN': signature
    };
  }

  /** Latest price for a linear perpetual (no auth needed, super fast). */
  public async getTickerPrice(symbol: string): Promise<number | null> {
    try {
      const response = await this.client.get('/v5/market/tickers', {
        params: { category: 'linear', symbol: symbol.toUpperCase() }
      });
      const price = parseFloat(response.data?.result?.list?.[0]?.lastPrice);
      return isFinite(price) && price > 0 ? price : null;
    } catch (error: any) {
      console.error(`BybitDataClient: getTickerPrice failed for ${symbol}:`, error.message);
      return null;
    }
  }

  /** Kline history — used as a fast fallback / parallel source for MTF backfills. */
  public async getKlines(symbol: string, interval: string = '1m', limit: number = 250): Promise<CandleOHLCV[]> {
    const bybitInterval = BybitDataClient.TF_MAP[interval];
    if (!bybitInterval) return [];
    try {
      const response = await this.client.get('/v5/market/kline', {
        params: { category: 'linear', symbol: symbol.toUpperCase(), interval: bybitInterval, limit }
      });
      const list = response.data?.result?.list || [];
      return list.map((item: any[]) => {
        const openTime = parseInt(item[0], 10);
        return {
          symbol: symbol.toUpperCase(),
          interval,
          openTime,
          closeTime: openTime + 60 * 1000,
          open: parseFloat(item[1]),
          high: parseFloat(item[2]),
          low: parseFloat(item[3]),
          close: parseFloat(item[4]),
          volume: parseFloat(item[5]),
          isClosed: true
        };
      });
    } catch (error: any) {
      console.error(`BybitDataClient: getKlines failed for ${symbol} ${interval}:`, error.message);
      return [];
    }
  }

  /**
   * Connectivity + auth check used by /api/v1/bybit/status.
   * Reports booleans/latency only — never exposes key, secret or balance.
   */
  public async ping(): Promise<{ reachable: boolean; latencyMs: number; authValid: boolean | null }> {
    const start = Date.now();
    try {
      const res = await this.client.get('/v5/market/time');
      const reachable = res.data?.retCode === 0;
      const latencyMs = Date.now() - start;
      let authValid: boolean | null = null;
      if (reachable && this.isConfigured()) {
        try {
          const authRes = await this.client.get('/v5/account/wallet-balance', {
            params: { accountType: 'UNIFIED' },
            headers: this.signHeaders('accountType=UNIFIED')
          });
          authValid = authRes.data?.retCode === 0;
        } catch {
          authValid = false;
        }
      }
      return { reachable, latencyMs, authValid };
    } catch {
      return { reachable: false, latencyMs: Date.now() - start, authValid: null };
    }
  }
}
