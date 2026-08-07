import { MarketTick, DepthSnapshot, CandleOHLCV } from '@athena/shared';
/**
 * ValidationEngine
 * Responsible for input sanitization, price bound guards, price jump anomaly detection,
 * and stream latency filtering.
 */
export declare class ValidationEngine {
    private lastPrices;
    private maxPriceJumpThreshold;
    private minPrice;
    private maxPrice;
    private maxAllowedLatencyMs;
    /**
     * Sanitizes and validates incoming market ticks.
     * Rejects ticks with invalid prices, extreme price jumps, or excessive network latency.
     */
    validateTick(tick: MarketTick): {
        valid: boolean;
        reason?: string;
    };
    /**
     * Sanitizes depth snapshot.
     */
    validateDepth(depth: DepthSnapshot): {
        valid: boolean;
        reason?: string;
    };
    /**
     * Sanitizes OHLCV candle.
     */
    validateCandle(candle: CandleOHLCV): {
        valid: boolean;
        reason?: string;
    };
}
//# sourceMappingURL=ValidationEngine.d.ts.map