import { CandleOHLCV, MarketRegimeState, MarketRegimeType } from '@athena/shared';

/**
 * MarketRegimeEngine
 * Uses Hurst Exponent (Rescaled Range R/S Analysis), ADX, and Volatility Ratios
 * to classify current market structural regime.
 */
export class MarketRegimeEngine {

  /**
   * Calculates Hurst Exponent using Rescaled Range (R/S) Analysis
   * H > 0.55 => Trending (Persistent series)
   * H < 0.45 => Mean Reverting (Anti-persistent series)
   * H ~ 0.50 => Random Walk (Geometric Brownian Motion)
   */
  public calculateHurstExponent(prices: number[]): number {
    const n = prices.length;
    if (n < 20) return 0.50; // Neutral baseline for short windows

    // 1. Log returns series
    const returns: number[] = [];
    for (let i = 1; i < n; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }

    const m = returns.length;
    let mean = 0;
    for (const r of returns) mean += r;
    mean /= m;

    // 2. Mean-adjusted cumulative deviations
    const cumDev: number[] = [];
    let currentCum = 0;
    for (const r of returns) {
      currentCum += (r - mean);
      cumDev.push(currentCum);
    }

    // 3. Range R = max(Z) - min(Z)
    const maxDev = Math.max(...cumDev);
    const minDev = Math.min(...cumDev);
    const R = maxDev - minDev;

    // 4. Standard Deviation S
    let varianceSum = 0;
    for (const r of returns) {
      varianceSum += Math.pow(r - mean, 2);
    }
    const S = Math.sqrt(varianceSum / m);

    if (S === 0) return 0.50;

    const rescaledRange = R / S;
    // H = log(R/S) / log(N)
    const H = Math.log(rescaledRange) / Math.log(m);

    // Clamp H to valid bounds [0, 1]
    return Math.max(0, Math.min(1, isNaN(H) ? 0.50 : H));
  }

  /**
   * Evaluates Market Regime State from OHLCV Candles
   */
  public evaluate(candles: CandleOHLCV[], adxValue: number = 25): MarketRegimeState {
    if (candles.length < 20) {
      return {
        symbol: candles[0]?.symbol || 'UNKNOWN',
        regime: 'MEAN_REVERTING',
        hurstExponent: 0.50,
        adx: adxValue,
        volatilityRatio: 1.0,
        timestamp: Date.now()
      };
    }

    const symbol = candles[0].symbol;
    const closes = candles.map(c => c.close);
    const hurst = this.calculateHurstExponent(closes);

    // Fast vs Slow Volatility expansion check
    const recentCandles = candles.slice(-5);
    const olderCandles = candles.slice(-20);

    const fastRangeAvg = recentCandles.reduce((sum, c) => sum + (c.high - c.low), 0) / 5;
    const slowRangeAvg = olderCandles.reduce((sum, c) => sum + (c.high - c.low), 0) / 20;

    const volatilityRatio = slowRangeAvg === 0 ? 1.0 : fastRangeAvg / slowRangeAvg;

    // Price Slope over window
    const firstClose = closes[closes.length - 20];
    const lastClose = closes[closes.length - 1];
    const priceChange = (lastClose - firstClose) / firstClose;

    let regime: MarketRegimeType = 'MEAN_REVERTING';

    if (volatilityRatio > 2.0) {
      regime = 'VOLATILITY_EXPANSION';
    } else if (hurst > 0.55 && adxValue > 22) {
      regime = priceChange >= 0 ? 'TRENDING_BULL' : 'TRENDING_BEAR';
    } else if (hurst < 0.45) {
      regime = 'MEAN_REVERTING';
    } else {
      regime = priceChange >= 0 ? 'TRENDING_BULL' : 'TRENDING_BEAR';
    }

    return {
      symbol,
      regime,
      hurstExponent: parseFloat(hurst.toFixed(4)),
      adx: adxValue,
      volatilityRatio: parseFloat(volatilityRatio.toFixed(2)),
      timestamp: Date.now()
    };
  }
}
