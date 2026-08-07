import { CandleOHLCV, HunterState } from '@athena/shared';
/**
 * HunterEngine
 * Identifies sudden volume surges, volatility expansions, and early gem/pump setups.
 */
export declare class HunterEngine {
    /**
     * Evaluates volume surge and volatility expansion metrics for a candidate token
     */
    evaluate(candles: CandleOHLCV[]): HunterState;
}
//# sourceMappingURL=HunterEngine.d.ts.map