import https from 'https';
import { DiscoveredCoin, DiscoveryTag } from '@athena/shared';

interface BinanceTicker {
  symbol: string;
  priceChangePercent: string;
  quoteVolume: string;
  lastPrice: string;
}

interface BinanceFuturesSymbolInfo {
  symbol: string;
  onboardDate: number;
}

/**
 * CoinDiscoveryEngine — Stage 1
 * Polls Binance Futures every 30 seconds to discover the live universe of
 * trading opportunities: New Listings, Top Gainers, Top Losers, High Volume,
 * High Volume Change, and User Watchlist.
 * Uses Node.js built-in https — zero external dependencies.
 */
export class CoinDiscoveryEngine {
  private endpoints = [
    'fapi.binance.com',
    'fapi1.binance.com',
    'fapi2.binance.com',
    'fapi3.binance.com'
  ];
  private currentEndpointIndex = 0;
  private previousVolumeMap: Map<string, number> = new Map();
  private symbolListingDates: Map<string, number> = new Map();
  private userWatchlist: string[] = [];
  private lastDiscovery: DiscoveredCoin[] = [];

  private readonly NEW_LISTING_DAYS = 14;
  private readonly TOP_N = 20;

  private rotateEndpoint() {
    this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length;
    console.log(`CoinDiscoveryEngine: Switched API base URL to ${this.endpoints[this.currentEndpointIndex]}`);
  }

  public setWatchlist(symbols: string[]): void {
    this.userWatchlist = symbols.map(s => s.toUpperCase());
  }

  public getLastDiscovery(): DiscoveredCoin[] {
    return this.lastDiscovery;
  }

  /**
   * Simple HTTPS GET returning parsed JSON with retries and endpoint rotation.
   */
  private httpsGet<T>(path: string, retries = 3): Promise<T> {
    return new Promise((resolve, reject) => {
      const attempt = (remaining: number) => {
        const req = https.get({ 
          hostname: this.endpoints[this.currentEndpointIndex], 
          path, 
          headers: { 'User-Agent': 'ATHENA/2.0' },
          timeout: 5000
        }, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try { 
              resolve(JSON.parse(data)); 
            }
            catch (e) { 
              if (remaining > 0) {
                this.rotateEndpoint();
                attempt(remaining - 1);
              } else {
                reject(new Error(`Failed to parse JSON. Data: ${data.slice(0, 100)}`)); 
              }
            }
          });
        });
        
        req.on('error', (err) => {
          if (remaining > 0) {
            this.rotateEndpoint();
            attempt(remaining - 1);
          } else {
            reject(err);
          }
        });

        req.on('timeout', () => {
          req.destroy();
          if (remaining > 0) {
            this.rotateEndpoint();
            attempt(remaining - 1);
          } else {
            reject(new Error('Request timeout'));
          }
        });
      };
      
      attempt(retries);
    });
  }

  /**
   * Loads symbol listing dates from Binance exchangeInfo.
   * Called once on startup to enable NEW_LISTING detection.
   */
  public async loadListingDates(): Promise<void> {
    try {
      const data = await this.httpsGet<{ symbols: BinanceFuturesSymbolInfo[] }>('/fapi/v1/exchangeInfo');
      for (const sym of data.symbols || []) {
        if (sym.symbol && sym.onboardDate) {
          this.symbolListingDates.set(sym.symbol, sym.onboardDate);
        }
      }
      console.log(`CoinDiscoveryEngine: Loaded listing dates for ${this.symbolListingDates.size} symbols.`);
    } catch (err: any) {
      console.warn('CoinDiscoveryEngine: Could not load listing dates:', err.message);
    }
  }

  /**
   * Fetches 24h ticker data for all Binance Futures symbols.
   */
  private async fetchAllTickers(): Promise<BinanceTicker[]> {
    const data = await this.httpsGet<BinanceTicker[]>('/fapi/v1/ticker/24hr');
    return data.filter(t => t.symbol.endsWith('USDT') && !t.symbol.includes('_'));
  }

  /**
   * Runs full Stage 1 discovery. Returns sorted DiscoveredCoin[].
   */
  public async discover(): Promise<DiscoveredCoin[]> {
    const startMs = Date.now();
    let tickers: BinanceTicker[] = [];

    try {
      tickers = await this.fetchAllTickers();
    } catch (err: any) {
      console.error('CoinDiscoveryEngine: Fetch failed:', err.message);
      return this.lastDiscovery;
    }

    const now = Date.now();
    const symbolTagMap = new Map<string, Set<DiscoveryTag>>();
    const tickerMap = new Map<string, BinanceTicker>();

    for (const t of tickers) {
      tickerMap.set(t.symbol, t);
      symbolTagMap.set(t.symbol, new Set<DiscoveryTag>());
    }

    // Sort by price change for gainers/losers
    const sortedByChange = [...tickers].sort(
      (a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent)
    );

    // TOP GAINERS
    sortedByChange.slice(0, this.TOP_N).forEach(t => {
      if (parseFloat(t.priceChangePercent) > 2.0) {
        symbolTagMap.get(t.symbol)?.add('TOP_GAINER');
      }
    });

    // TOP LOSERS
    sortedByChange.slice(-this.TOP_N).forEach(t => {
      if (parseFloat(t.priceChangePercent) < -2.0) {
        symbolTagMap.get(t.symbol)?.add('TOP_LOSER');
      }
    });

    // HIGH VOLUME (top N by quoteVolume)
    const sortedByVolume = [...tickers].sort(
      (a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)
    );
    sortedByVolume.slice(0, this.TOP_N).forEach(t => {
      symbolTagMap.get(t.symbol)?.add('HIGH_VOLUME');
    });

    // HIGH VOLUME CHANGE (vs previous snapshot)
    for (const t of tickers) {
      const currentVol = parseFloat(t.quoteVolume);
      const prevVol = this.previousVolumeMap.get(t.symbol);
      if (prevVol && prevVol > 0) {
        const changePct = ((currentVol - prevVol) / prevVol) * 100;
        if (changePct > 20) {
          symbolTagMap.get(t.symbol)?.add('HIGH_VOLUME_CHANGE');
        }
      }
      this.previousVolumeMap.set(t.symbol, currentVol);
    }

    // NEW LISTING (onboarded within last N days)
    const cutoffMs = now - this.NEW_LISTING_DAYS * 24 * 60 * 60 * 1000;
    for (const [sym, listDate] of this.symbolListingDates) {
      if (listDate > cutoffMs && symbolTagMap.has(sym)) {
        symbolTagMap.get(sym)?.add('NEW_LISTING');
      }
    }

    // USER WATCHLIST
    for (const sym of this.userWatchlist) {
      if (symbolTagMap.has(sym)) {
        symbolTagMap.get(sym)?.add('USER_WATCHLIST');
      }
    }

    // TOP 5 MAJORS — Symbolically tracked for market direction (per user request)
    const top5Majors = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
    for (const sym of top5Majors) {
      if (symbolTagMap.has(sym)) {
        symbolTagMap.get(sym)?.add('USER_WATCHLIST');
      }
    }


    // Build output — only tagged coins
    const discovered: DiscoveredCoin[] = [];

    for (const [symbol, tags] of symbolTagMap) {
      if (tags.size === 0) continue;
      const t = tickerMap.get(symbol)!;
      const listingDate = this.symbolListingDates.get(symbol);
      const listingAgeDays = listingDate
        ? Math.floor((now - listingDate) / (1000 * 60 * 60 * 24))
        : undefined;

      discovered.push({
        symbol,
        tags: Array.from(tags),
        priceChangePercent24h: parseFloat(parseFloat(t.priceChangePercent).toFixed(2)),
        quoteVolume24h: Math.round(parseFloat(t.quoteVolume)),
        lastPrice: parseFloat(t.lastPrice),
        listingAgeDays,
        timestamp: now
      });
    }

    // Sort by tag priority: NEW_LISTING → TOP_GAINER/LOSER → HIGH_VOLUME_CHANGE → HIGH_VOLUME → WATCHLIST
    const tagOrder: DiscoveryTag[] = [
      'NEW_LISTING', 'TOP_GAINER', 'TOP_LOSER',
      'HIGH_VOLUME_CHANGE', 'HIGH_VOLUME', 'USER_WATCHLIST'
    ];

    discovered.sort((a, b) => {
      const aMin = Math.min(...a.tags.map(tag => tagOrder.indexOf(tag)));
      const bMin = Math.min(...b.tags.map(tag => tagOrder.indexOf(tag)));
      return aMin - bMin;
    });

    console.log(`CoinDiscoveryEngine: Discovered ${discovered.length} coins in ${Date.now() - startMs}ms`);
    this.lastDiscovery = discovered;
    return discovered;
  }
}
