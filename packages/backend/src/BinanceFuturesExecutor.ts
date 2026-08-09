import { createHmac } from 'crypto';

/**
 * Real Binance USDT-M Futures executor.
 * API keys are NEVER hardcoded/committed — they come from the host env vars
 * (BINANCE_API_KEY / BINANCE_API_SECRET) or are set at runtime via the
 * Settings page and kept in memory only. All requests are HMAC-SHA256 signed.
 */
export interface ExchangeAccountInfo {
  configured: boolean;
  source: 'ENV' | 'RUNTIME' | null;
  balanceUsdt: number;
  accountType: 'FUTURES';
  testnet: boolean;
}

export class BinanceFuturesExecutor {
  private apiKey = process.env.BINANCE_API_KEY || '';
  private apiSecret = process.env.BINANCE_API_SECRET || '';
  private keySource: 'ENV' | 'RUNTIME' | null = process.env.BINANCE_API_KEY ? 'ENV' : null;
  private baseUrl = process.env.BINANCE_FUTURES_BASE_URL || 'https://fapi.binance.com';

  public isConfigured(): boolean {
    return this.apiKey.length > 0 && this.apiSecret.length > 0;
  }

  public configure(apiKey: string, apiSecret: string): void {
    this.apiKey = apiKey.trim();
    this.apiSecret = apiSecret.trim();
    this.keySource = this.apiKey ? 'RUNTIME' : null;
  }

  public disconnect(): void {
    this.apiKey = '';
    this.apiSecret = '';
    this.keySource = null;
  }

  private async signedRequest(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string | number> = {}): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Exchange keys not configured');
    }
    const serverTimeRes = await fetch(`${this.baseUrl}/fapi/v1/time`);
    const { serverTime } = (await serverTimeRes.json()) as { serverTime: number };
    const query = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      timestamp: String(serverTime)
    });
    const signature = createHmac('sha256', this.apiSecret).update(query.toString()).digest('hex');
    const url = `${this.baseUrl}${path}?${query.toString()}&signature=${signature}`;
    const res = await fetch(url, {
      method,
      headers: { 'X-MBX-APIKEY': this.apiKey }
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Binance API ${res.status}: ${body}`);
    }
    return res.json();
  }

  public async getAccountInfo(): Promise<ExchangeAccountInfo> {
    if (!this.isConfigured()) {
      return { configured: false, source: null, balanceUsdt: 0, accountType: 'FUTURES', testnet: false };
    }
    const positions = await this.signedRequest('GET', '/fapi/v2/positionRisk');
    let balanceUsdt = 0;
    if (Array.isArray(positions)) {
      for (const p of positions) {
        if (p.symbol === 'USDT' || p.asset === 'USDT') {
          balanceUsdt = Number(p.walletBalance ?? p.balance ?? 0);
          break;
        }
        balanceUsdt += Number(p.walletBalance ?? p.balance ?? 0);
      }
    }
    return { configured: true, source: this.keySource, balanceUsdt, accountType: 'FUTURES', testnet: false };
  }

  public async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.signedRequest('POST', '/fapi/v1/leverage', { symbol, leverage });
  }

  public async placeMarketOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number): Promise<any> {
    return this.signedRequest('POST', '/fapi/v1/order', {
      symbol,
      side,
      type: 'MARKET',
      quantity: (Math.floor(quantity * 1000) / 1000).toFixed(3),
      recvWindow: 5000
    });
  }

  public async closePosition(symbol: string, side: 'LONG' | 'SHORT', quantity: number): Promise<any> {
    return this.placeMarketOrder(symbol, side === 'LONG' ? 'SELL' : 'BUY', quantity);
  }
}
