/**
 * ATHENA AI v2 - Shared Type Definitions & Engine Contracts
 * Single Source of Truth for system schemas and engine interfaces.
 */
export interface MarketTick {
    symbol: string;
    price: number;
    quantity: number;
    timestamp: number;
    isBuyerMaker: boolean;
    tradeId?: number;
}
export interface OrderbookLevel {
    price: number;
    quantity: number;
}
export interface DepthSnapshot {
    symbol: string;
    bids: OrderbookLevel[];
    asks: OrderbookLevel[];
    timestamp: number;
    lastUpdateId: number;
}
export interface CandleOHLCV {
    symbol: string;
    interval: string;
    openTime: number;
    closeTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    isClosed: boolean;
}
export interface FundingRateInfo {
    symbol: string;
    fundingRate: number;
    fundingTime: number;
    markPrice: number;
}
export interface OpenInterestInfo {
    symbol: string;
    openInterest: number;
    openInterestDeltaPct: number;
    timestamp: number;
}
export interface MultiTimeframeRSI {
    tf5m: number;
    tf15m: number;
    tf1h: number;
    tf4h: number;
    tf12h: number;
}
export interface VPVRInfo {
    pocPrice: number;
    highVolumeNodes: number[];
    lowVolumeNodes: number[];
}
export interface IndicatorResult {
    symbol: string;
    ema20: number;
    ema50: number;
    rsi14: number;
    rsiMultiTimeframe: MultiTimeframeRSI;
    williamsR14: number;
    macd: {
        macdLine: number;
        signalLine: number;
        histogram: number;
    };
    vwap: number;
    microVwap: number;
    atr14: number;
    vpvr: VPVRInfo;
    bollingerBands: {
        upper: number;
        middle: number;
        lower: number;
    };
    supertrend: {
        value: number;
        direction: 'BULL' | 'BEAR';
    };
    stochRsi: {
        k: number;
        d: number;
    };
    adx14: {
        adx: number;
        plusDI: number;
        minusDI: number;
    };
    timestamp: number;
}
export interface MicrostructureState {
    symbol: string;
    orderbookImbalance: number;
    weightedImbalance: number;
    orderbookBuyerPct: number;
    totalBidDepth: number;
    totalAskDepth: number;
    cvd: number;
    tickVelocity: number;
    whaleActivity: boolean;
    icebergDetected: boolean;
    spoofingProbabilityPct: number;
    sweepDetected: boolean;
    timestamp: number;
}
export type MarketRegimeType = 'TRENDING_BULL' | 'TRENDING_BEAR' | 'MEAN_REVERTING' | 'VOLATILITY_EXPANSION';
export interface MarketRegimeState {
    symbol: string;
    regime: MarketRegimeType;
    hurstExponent: number;
    adx: number;
    volatilityRatio: number;
    timestamp: number;
}
export interface HunterState {
    symbol: string;
    volumeZScore: number;
    volatilityExpansionRatio: number;
    hunterScore: number;
    timestamp: number;
}
export interface EngineScoreState {
    symbol: string;
    heatScore: number;
    candidateScore: number;
    aiScore: number;
    confidenceScore: number;
    timestamp: number;
}
export type SignalType = 'BUY' | 'SELL' | 'NEUTRAL';
export interface SignalResult {
    symbol: string;
    signal: SignalType;
    compositeScore: number;
    confidence: number;
    hunterScore?: number;
    setupQuality?: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    riskRewardRatio: number;
    timeframe: '30s-3m SCALP' | 'SWING';
    reasons: string[];
    modifiers?: { name: string; value: number }[];
    timestamp: number;
}
export interface PaperOrderIntent {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT';
    quantity: number;
    price?: number;
    stopLoss?: number;
    takeProfit?: number;
}
export interface PaperTrade {
    tradeId: string;
    orderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    fillPrice: number;
    quantity: number;
    slippagePct: number;
    fee: number;
    timestamp: number;
}
export interface PaperPosition {
    symbol: string;
    side: 'LONG' | 'SHORT';
    quantity: number;
    entryPrice: number;
    markPrice: number;
    unrealizedPnL: number;
    realizedPnL: number;
    margin: number;
    stopLoss?: number;
    takeProfit?: number;
}
export interface AnalyticsMetrics {
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    totalRealizedPnL: number;
    expectancy: number;
}
export interface AggregatedSymbolState {
    symbol: string;
    volume24h?: number;
    fundingRate?: number;
    openInterest?: number;
    openInterestDeltaPct?: number;
    longPct?: number;
    shortPct?: number;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    reasons?: string[];
    lastTick?: MarketTick;
    depth?: DepthSnapshot;
    indicators?: IndicatorResult;
    microstructure?: MicrostructureState;
    regime?: MarketRegimeState;
    hunter?: HunterState;
    scores?: EngineScoreState;
    signal?: SignalResult;
    timestamp: number;
}
//# sourceMappingURL=index.d.ts.map