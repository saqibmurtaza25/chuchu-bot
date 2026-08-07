import { AnalyticsMetrics, PaperTrade } from '@athena/shared';
/**
 * AnalyticsEngine
 * Evaluates mathematical risk & performance metrics on paper trade history.
 * Formulas: Sharpe Ratio, Sortino Ratio, Max Drawdown, Profit Factor, Win Rate, Expectancy.
 */
export declare class AnalyticsEngine {
    /**
     * Evaluates complete analytics metrics for a set of completed paper trades
     */
    evaluate(trades: PaperTrade[], initialBalance?: number): AnalyticsMetrics;
}
//# sourceMappingURL=AnalyticsEngine.d.ts.map