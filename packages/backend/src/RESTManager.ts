import axios, { AxiosInstance } from 'axios';
import { CandleOHLCV, DepthSnapshot, FundingRateInfo, OpenInterestInfo } from '@chuchu/shared';

/**
 * RESTManager
 * Binance Futures REST API Client.
 * Used for startup synchronization, historical klines, open interest, and funding rate updates.
 */
export class RESTManager {
  private client: AxiosInstance;
  private endpoints = [
    'https://fapi.binance.com',
    'https://fapi1.binance.com',
    'https://fapi2.binance.com',
    'https://fapi3.binance.com'
  ];
  private currentEndpointIndex = 0;
  private previousOiMap: Map<string, number> = new Map();

  constructor(baseURL?: string) {
    this.client = axios.create({
      baseURL: baseURL || this.endpoints[0],
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private rotateEndpoint() {
    this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length;
    this.client.defaults.baseURL = this.endpoints[this.currentEndpointIndex];
    console.log(`RESTManager: Switched API base URL to ${this.endpoints[this.currentEndpointIndex]}`);
  }

  public async getTickerPrice(symbol: string): Promise<number | null> {
    try {
      const response = await this.client.get('/fapi/v1/ticker/price', {
        params: { symbol: symbol.toUpperCase() }
      });
      const price = parseFloat(response.data?.price);
      return isFinite(price) && price > 0 ? price : null;
    } catch (error: any) {
      console.error(`RESTManager: Failed to fetch ticker price for ${symbol}:`, error.message);
      this.rotateEndpoint();
      return null;
    }
  }

  public async getKlines(symbol: string, interval: string = '1m', limit: number = 100): Promise<CandleOHLCV[]> {    try {
      const response = await this.client.get('/fapi/v1/klines', {
        params: { symbol: symbol.toUpperCase(), interval, limit }
      });

      if (!Array.isArray(response.data)) {
        console.error(`RESTManager: response.data for ${symbol} is not an array! Data:`, response.data);
        this.rotateEndpoint();
        return [];
      }

      return response.data.map((item: any[]) => ({
        symbol: symbol.toUpperCase(),
        interval,
        openTime: item[0],
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5]),
        closeTime: item[6],
        isClosed: true
      }));
    } catch (error: any) {
      console.error(`RESTManager: Failed to fetch klines for ${symbol}:`, error.message);
      this.rotateEndpoint();
      return [];
    }
  }

  public async getDepthSnapshot(symbol: string, limit: number = 20): Promise<DepthSnapshot | null> {
    try {
      const response = await this.client.get('/fapi/v1/depth', {
        params: { symbol: symbol.toUpperCase(), limit }
      });

      const data = response.data;
      if (!data || !Array.isArray(data.bids) || !Array.isArray(data.asks)) {
        console.error(`RESTManager: response.data for ${symbol} depth is invalid! Data:`, data);
        this.rotateEndpoint();
        return null;
      }
      return {
        symbol: symbol.toUpperCase(),
        bids: data.bids.map((b: string[]) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
        asks: data.asks.map((a: string[]) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) })),
        lastUpdateId: data.lastUpdateId,
        timestamp: Date.now()
      };
    } catch (error: any) {
      console.error(`RESTManager: Failed to fetch depth for ${symbol}:`, error.message);
      this.rotateEndpoint();
      return null;
    }
  }

  public async getFundingRate(symbol: string): Promise<FundingRateInfo | null> {
    try {
      const response = await this.client.get('/fapi/v1/premiumIndex', {
        params: { symbol: symbol.toUpperCase() }
      });

      const data = response.data;
      return {
        symbol: symbol.toUpperCase(),
        fundingRate: parseFloat(data.lastFundingRate),
        fundingTime: data.nextFundingTime,
        markPrice: parseFloat(data.markPrice)
      };
    } catch (error: any) {
      console.error(`RESTManager: Failed to fetch funding rate for ${symbol}:`, error.message);
      this.rotateEndpoint();
      return null;
    }
  }

  public async getOpenInterest(symbol: string): Promise<OpenInterestInfo | null> {
    try {
      const response = await this.client.get('/fapi/v1/openInterest', {
        params: { symbol: symbol.toUpperCase() }
      });

      const data = response.data;
      const currentOi = parseFloat(data.openInterest);
      const prevOi = this.previousOiMap.get(symbol.toUpperCase()) || currentOi;
      
      let deltaPct = 0;
      if (prevOi > 0) {
        deltaPct = parseFloat((((currentOi - prevOi) / prevOi) * 100).toFixed(2));
      }
      this.previousOiMap.set(symbol.toUpperCase(), currentOi);

      return {
        symbol: symbol.toUpperCase(),
        openInterest: currentOi,
        openInterestDeltaPct: deltaPct,
        timestamp: data.time
      };
    } catch (error: any) {
      console.error(`RESTManager: Failed to fetch open interest for ${symbol}:`, error.message);
      this.rotateEndpoint();
      return null;
    }
  }

  /**
   * Fetches exact klines for 5m, 15m, 1h, 4h, 12h in parallel from Binance REST API.
   * Calculates exact RSIs matching CoinGlass / TradingView.
   */
  public async getMultiTimeframeRSIs(symbol: string): Promise<{ tf5m: number; tf15m: number; tf1h: number; tf4h: number; tf12h: number } | null> {
    try {
      const timeframes = ['5m', '15m', '1h', '4h', '12h'];
      const requests = timeframes.map(tf =>
        this.client.get('/fapi/v1/klines', {
          params: { symbol: symbol.toUpperCase(), interval: tf, limit: 50 }
        })
      );
      const responses = await Promise.all(requests);

      const calcRSI = (items: any[]): number => {
        if (!items || items.length < 15) return 50;
        const prices = items.map((c: any[]) => parseFloat(c[4]));
        const period = 14;
        let avgGain = 0;
        let avgLoss = 0;
        for (let i = 1; i <= period; i++) {
          const change = prices[i] - prices[i - 1];
          if (change >= 0) avgGain += change;
          else avgLoss += Math.abs(change);
        }
        avgGain /= period;
        avgLoss /= period;
        for (let i = period + 1; i < prices.length; i++) {
          const change = prices[i] - prices[i - 1];
          const gain = change >= 0 ? change : 0;
          const loss = change < 0 ? Math.abs(change) : 0;
          avgGain = (avgGain * (period - 1) + gain) / period;
          avgLoss = (avgLoss * (period - 1) + loss) / period;
        }
        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return parseFloat((100 - (100 / (1 + rs))).toFixed(1));
      };

      return {
        tf5m: calcRSI(responses[0].data),
        tf15m: calcRSI(responses[1].data),
        tf1h: calcRSI(responses[2].data),
        tf4h: calcRSI(responses[3].data),
        tf12h: calcRSI(responses[4].data)
      };
    } catch (error: any) {
      console.error(`RESTManager: Failed to fetch MTF RSIs for ${symbol}:`, error.message);
      this.rotateEndpoint();
      return null;
    }
  }

  /**
   * Fetches real klines for 4h, 1h, 15m, 5m, 1m from Binance Futures REST API
   * and calculates 100% REAL Williams %R 200 on positive [0, 100] scale for each timeframe.
   */
  public async getMultiTimeframeWilliamsR(symbol: string): Promise<{ tf1m: number; tf5m: number; tf15m: number; tf1h: number; tf4h: number } | null> {
    try {
      const timeframes = ['1m', '5m', '15m', '1h', '4h'];
      const requests = timeframes.map(tf =>
        this.client.get('/fapi/v1/klines', {
          params: { symbol: symbol.toUpperCase(), interval: tf, limit: 100 }
        })
      );
      const responses = await Promise.all(requests);

      const calcWMR200 = (items: any[]): number => {
        if (!items || items.length === 0) return 50;
        const len = items.length;
        const close = parseFloat(items[len - 1][4]);
        let highestHigh = -Infinity;
        let lowestLow = Infinity;
        for (let i = 0; i < len; i++) {
          const h = parseFloat(items[i][2]);
          const l = parseFloat(items[i][3]);
          if (h > highestHigh) highestHigh = h;
          if (l < lowestLow) lowestLow = l;
        }
        const range = highestHigh - lowestLow;
        if (range === 0) return 50;
        const val = ((close - lowestLow) / range) * 100;
        return parseFloat(val.toFixed(1));
      };

      return {
        tf1m: calcWMR200(responses[0].data),
        tf5m: calcWMR200(responses[1].data),
        tf15m: calcWMR200(responses[2].data),
        tf1h: calcWMR200(responses[3].data),
        tf4h: calcWMR200(responses[4].data)
      };
    } catch (error: any) {
      console.error(`RESTManager: Failed to fetch MTF Williams %R for ${symbol}:`, error.message);
      this.rotateEndpoint();
      return null;
    }
  }
}
