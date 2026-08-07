import { IndicatorResult, MicrostructureState, MarketRegimeState, SignalResult, HunterState } from '@athena/shared';
/**
 * SignalEngine
 * Multi-factor decision matrix optimized for 30-second to 3-minute high-frequency scalping.
 * Computes AI Score strictly from real indicator metrics and matches reasons matrix.
 */
export declare class SignalEngine {
    evaluate(symbol: string, lastPrice: number, indicators?: IndicatorResult | null, microstructure?: MicrostructureState | null, regime?: MarketRegimeState | null, hunter?: HunterState | null): SignalResult;
}
//# sourceMappingURL=SignalEngine.d.ts.map