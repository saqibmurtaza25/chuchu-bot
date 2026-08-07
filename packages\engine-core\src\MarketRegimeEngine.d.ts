import { CandleOHLCV, MarketRegimeState } from '@athena/shared';
/**
 * MarketRegimeEngine
 * Uses Hurst Exponent (Rescaled Range R/S Analysis), ADX, and Volatility Ratios
 * to classify current market structural regime.
 */
export declare class MarketRegimeEngine {
    /**
     * Calculates Hurst Exponent using Rescaled Range (R/S) Analysis
     * H > 0.55 => Trending (Persistent series)
     * H < 0.45 => Mean Reverting (Anti-persistent series)
     * H ~ 0.50 => Random Walk (Geometric Brownian Motion)
     */
    calculateHurstExponent(prices: number[]): number;
    /**
     * Evaluates Market Regime State from OHLCV Candles
     */
    evaluate(candles: CandleOHLCV[], adxValue?: number): MarketRegimeState;
}
//# sourceMappingURL=MarketRegimeEngine.d.ts.map