import { CandleOHLCV, IndicatorResult, MultiTimeframeRSI, VPVRInfo } from '@athena/shared';
/**
 * IndicatorEngine
 * Calculates technical indicators 100% locally using mathematical formulas.
 * Supports multi-timeframe candle synthesis (5m, 15m, 1h, 4h, 12h RSIs), Williams %R [-100, 0], and VPVR Point of Control.
 */
export declare class IndicatorEngine {
    calculateEMA(prices: number[], period: number): number[];
    calculateRSI(prices: number[], period?: number): number[];
    /**
     * Aggregate 1m candles into larger timeframes (5m, 15m, 1h, 4h, 12h)
     */
    aggregateCandles(candles: CandleOHLCV[], factor: number): CandleOHLCV[];
    /**
     * Calculates Multi-Timeframe RSIs (5m, 15m, 1h, 4h, 12h)
     */
    calculateMultiTimeframeRSI(candles: CandleOHLCV[]): MultiTimeframeRSI;
    /**
     * Calculates Williams %R strictly in range [-100, 0]
     * Formula: %R = (Highest High_N - Close) / (Highest High_N - Lowest Low_N) * -100
     */
    calculateWilliamsR(candles: CandleOHLCV[], period?: number): number[];
    /**
     * Calculates Volume Profile Visible Range (VPVR) Point of Control (POC)
     */
    calculateVPVR(candles: CandleOHLCV[], bins?: number): VPVRInfo;
    calculateMACD(prices: number[], fastPeriod?: number, slowPeriod?: number, signalPeriod?: number): {
        macdLine: number[];
        signalLine: number[];
        histogram: number[];
    };
    calculateVWAP(candles: CandleOHLCV[]): number[];
    calculateMicroVWAP(candles: CandleOHLCV[], window?: number): number;
    calculateATR(candles: CandleOHLCV[], period?: number): number[];
    calculateBollingerBands(prices: number[], period?: number, multiplier?: number): {
        upper: number[];
        middle: number[];
        lower: number[];
    };
    calculateSupertrend(candles: CandleOHLCV[], period?: number, multiplier?: number): {
        value: number[];
        direction: ('BULL' | 'BEAR')[];
    };
    calculateStochRSI(prices: number[], rsiPeriod?: number, stochPeriod?: number, kPeriod?: number, dPeriod?: number): {
        k: number[];
        d: number[];
    };
    calculateADX(candles: CandleOHLCV[], period?: number): {
        adx: number[];
        plusDI: number[];
        minusDI: number[];
    };
    evaluate(candles: CandleOHLCV[]): IndicatorResult | null;
}
//# sourceMappingURL=IndicatorEngine.d.ts.map