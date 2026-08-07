import { DepthSnapshot, MicrostructureState, MarketTick } from '@athena/shared';
/**
 * OrderbookEngine
 * Processes L2 Depth snapshots to analyze orderbook microstructure:
 * Imbalance (OBI), Buyer %, USD CVD, Icebergs, Spoofing Probability %, and Sweeps.
 */
export declare class OrderbookEngine {
    private depthHistory;
    private cvdMap;
    private maxHistoryLength;
    calculateImbalance(bids: {
        price: number;
        quantity: number;
    }[], asks: {
        price: number;
        quantity: number;
    }[]): {
        obi: number;
        totalBid: number;
        totalAsk: number;
        buyerPct: number;
    };
    calculateWeightedImbalance(bids: {
        price: number;
        quantity: number;
    }[], asks: {
        price: number;
        quantity: number;
    }[], lambda?: number): number;
    detectSpoofing(symbol: string, currentDepth: DepthSnapshot): number;
    updateCVD(tick: MarketTick): number;
    evaluate(depth: DepthSnapshot, recentTicks?: MarketTick[]): MicrostructureState;
}
//# sourceMappingURL=OrderbookEngine.d.ts.map