import { DepthSnapshot, PaperOrderIntent, PaperPosition, PaperTrade } from '@athena/shared';
/**
 * PaperTradingEngine
 * Deterministic virtual order matching engine operating against live L2 orderbook depth.
 * Implements dynamic slippage math and Binance VIP 0 Maker/Taker fee schedules.
 */
export declare class PaperTradingEngine {
    private balance;
    private positions;
    private trades;
    private takerFeeRate;
    private makerFeeRate;
    constructor(initialBalance?: number);
    getBalance(): number;
    getPositions(): PaperPosition[];
    getTradeHistory(): PaperTrade[];
    /**
     * Executes paper order intent against L2 depth snapshot
     */
    executeOrder(intent: PaperOrderIntent, depthSnapshot?: DepthSnapshot | null, lastPrice?: number): PaperTrade;
    /**
     * Position lifecycle management
     */
    private updatePosition;
    /**
     * Updates mark prices and evaluates TP/SL triggers
     */
    updateMarkPrice(symbol: string, markPrice: number): PaperTrade | null;
}
//# sourceMappingURL=PaperTradingEngine.d.ts.map