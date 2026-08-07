/**
 * CHUCHU BOT v2 - Shared Type Definitions & Engine Contracts
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

export interface MultiTimeframeWilliamsR {
  tf1m: number;
  tf5m: number;
  tf15m: number;
  tf1h: number;
  tf4h: number;
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
  ema200: number;
  rsi14: number;
  rsiMultiTimeframe: MultiTimeframeRSI;
  williamsR14: number; // Williams %R (14)
  williamsR200: number; // Multi-Timeframe Average W%R (200) on positive [0, 100] scale across 4H-1m
  williamsRMultiTimeframe: MultiTimeframeWilliamsR; // W%R(200) across 4H, 1H, 15m, 5m, 1m timeframes
  macd: { macdLine: number; signalLine: number; histogram: number };
  vwap: number;
  microVwap: number;
  atr14: number;
  vpvr: VPVRInfo;
  bollingerBands: { upper: number; middle: number; lower: number };
  supertrend: { value: number; direction: 'BULL' | 'BEAR' };
  stochRsi: { k: number; d: number };
  adx14: { adx: number; plusDI: number; minusDI: number };
  timestamp: number;
}

export interface MicrostructureState {
  symbol: string;
  orderbookImbalance: number; // OBI in [-1, 1]
  weightedImbalance: number;  // OBI_w in [-1, 1]
  orderbookBuyerPct: number;  // Real Buyer % (e.g. 63.5%)
  totalBidDepth: number;
  totalAskDepth: number;
  cvd: number;                // Cumulative Volume Delta USD notional
  tickVelocity: number;
  whaleActivity: boolean;
  icebergDetected: boolean;
  spoofingProbabilityPct: number; // Spoofing Probability %
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
  hunterScore?: number; // Added for CHUCHU v2.0
  setupQuality?: number; // Added for CHUCHU v2.0
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  timeframe: '30s-3m SCALP' | 'SWING';
  reasons: string[];
  modifiers?: { name: string; value: number }[]; // Added for CHUCHU v2.0 explainability
  timestamp: number;
}

export interface TradeContext {
  reasonOfEntry?: string;
  hunterScore?: number;
  setupQuality?: number;
  rsi?: number;
  wmr?: number;
  adx?: number;
  emaTrend?: 'BULL' | 'BEAR' | 'NEUTRAL';
  marketRegime?: string;
}

export type ExitReason = 'TAKE_PROFIT' | 'STOP_LOSS' | 'MANUAL' | 'SIGNAL_REVERSAL' | 'TIME_EXPIRED';

export interface AutoTradeConfig {
  mode: 'OFF' | 'SEMI_AUTO' | 'AUTO';
  margin: number;
  leverage: number;
  maxOpenTrades: number;
  riskPct: number;
  minSetupQuality: number;
}

export interface PaperOrderIntent {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  context?: TradeContext;
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
  context?: TradeContext;
  exitReason?: ExitReason;
  pnl?: number;
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
  context?: TradeContext;
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

/**
 * Candidate Lifecycle stage — tracks a coin's journey from discovery to trade closure.
 * DISCOVERED → WATCHLIST → HEATING → QUALIFIED → SIGNAL → OPEN_TRADE → CLOSED
 */
export type CandidateLifecycle =
  | 'DISCOVERED'
  | 'WATCHLIST'
  | 'HEATING'
  | 'QUALIFIED'
  | 'SIGNAL'
  | 'OPEN_TRADE'
  | 'CLOSED';

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
  lifecycle?: CandidateLifecycle;
  timestamp: number;
}

// ============================================================
// 4-STAGE DYNAMIC COIN DISCOVERY & HUNTING PIPELINE TYPES
// ============================================================

export type DiscoveryTag =
  | 'NEW_LISTING'
  | 'TOP_GAINER'
  | 'TOP_LOSER'
  | 'HIGH_VOLUME'
  | 'HIGH_VOLUME_CHANGE'
  | 'HIGH_OI_CHANGE'
  | 'USER_WATCHLIST';

export type HeatZone =
  | 'OVERBOUGHT'        // RSI > 75
  | 'NEAR_OVERBOUGHT'  // RSI 70–75
  | 'OVERSOLD'         // RSI < 25
  | 'NEAR_OVERSOLD'    // RSI 25–30
  | 'NEUTRAL';

export type DiscoveryPriority = 1 | 2 | 3 | 4 | 5 | 6;

/** Stage 1: Coin discovered by the dynamic market scanner */
export interface DiscoveredCoin {
  symbol: string;
  tags: DiscoveryTag[];
  priceChangePercent24h: number;
  quoteVolume24h: number;
  oiChangePct?: number;
  lastPrice: number;
  listingAgeDays?: number;
  timestamp: number;
}

/** Stage 2: Heat Hunter output — passed RSI/WMR heat zone filter */
export interface HeatCandidate extends DiscoveredCoin {
  heatZone: HeatZone;
  rsi5m: number;
  wmr200: number;
  heatConfirmed: boolean;
}

/** Stage 4: Priority-ranked candidate ready for final signal */
export interface PrioritizedCandidate extends HeatCandidate {
  priority: DiscoveryPriority;
  priorityStars: string;
  priorityLabel: string;
  compositeScore: number;
  state?: AggregatedSymbolState;
}

/** Full pipeline result returned by /api/v1/pipeline */
export interface ScanPipelineResult {
  timestamp: number;
  stage1_discovered: DiscoveredCoin[];
  stage2_heatCandidates: HeatCandidate[];
  stage4_signals: PrioritizedCandidate[];
  meta: {
    discoveredCount: number;
    heatCount: number;
    signalCount: number;
    lastRefreshMs: number;
  };
}
