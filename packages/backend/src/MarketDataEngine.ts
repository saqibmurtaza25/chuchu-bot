import {
  AggregatedSymbolState,
  CandleOHLCV,
  DepthSnapshot,
  EngineScoreState,
  MarketTick,
  ScanPipelineResult,
  DiscoveredCoin,
  HeatCandidate,
  PrioritizedCandidate,
  PaperTrade,
  PaperOrderIntent,
  AutoTradeConfig
} from '@chuchu/shared';

import {
  ValidationEngine,
  IndicatorEngine,
  OrderbookEngine,
  MarketRegimeEngine,
  HunterEngine,
  ScannerEngine,
  SignalEngine,
  PaperTradingEngine,
  AnalyticsEngine,
  CoinDiscoveryEngine,
  HeatHunterEngine,
  PriorityQueueEngine,
  ScreenerConfig
} from '@chuchu/engine-core';

import { RESTManager } from './RESTManager';
import { WebSocketManager } from './WebSocketManager';
import { BinanceFuturesExecutor } from './BinanceFuturesExecutor';

export type StateListener = (state: AggregatedSymbolState) => void;
export type TradeListener = (trade: PaperTrade) => void;

/**
 * MarketDataEngine
 * Central orchestration engine binding data ingestion, validation, quantitative pipeline execution,
 * paper trading, analytics, and client state dispatching.
 */
export class MarketDataEngine {
  private symbols: string[];
  private tradeListeners: TradeListener[] = [];

  public onTrade(listener: TradeListener): void {
    this.tradeListeners.push(listener);
  }

  private emitTrade(trade: PaperTrade): void {
    for (const l of this.tradeListeners) {
      l(trade);
    }
  }

  // Core Modules
  public validator = new ValidationEngine();
  public indicatorEngine = new IndicatorEngine();
  public orderbookEngine = new OrderbookEngine();
  public regimeEngine = new MarketRegimeEngine();
  public hunterEngine = new HunterEngine();
  public scannerEngine = new ScannerEngine();
  public signalEngine = new SignalEngine();
  public paperEngine = new PaperTradingEngine();
  public exchangeExecutor = new BinanceFuturesExecutor();
  public analyticsEngine = new AnalyticsEngine();

  // 4-Stage Discovery Pipeline Modules
  public discoveryEngine = new CoinDiscoveryEngine();
  public heatHunterEngine = new HeatHunterEngine();
  public priorityQueueEngine = new PriorityQueueEngine();

  public restManager: RESTManager;
  public wsManager: WebSocketManager | null = null; // futures depth
  public spotWs: WebSocketManager | null = null;   // spot trades + klines
  private pollIntervalTimer: NodeJS.Timeout | null = null;
  private discoveryTimer: NodeJS.Timeout | null = null;
  private isPollingDerivatives = false;

  // ─────────────────────────────────────────────────────────────
  // Caching to slash Binance REST usage (prevents 429 / IP throttle)
  // MTF RSI & W%R change slowly — cache 60s instead of refetching
  // every discovery cycle. Same for the 15m RSI pre-filter.
  // ─────────────────────────────────────────────────────────────
  private static readonly MTF_CACHE_TTL_MS = 60000;
  private static readonly RSI15M_CACHE_TTL_MS = 60000;
  private mtfCache = new Map<string, { rsi: any; wr: any; ts: number }>();
  private rsi15mCache = new Map<string, { rsi: number; ts: number }>();
  private lastIndCalcAt = new Map<string, number>();
  private static readonly IND_CALC_THROTTLE_MS = 500;

  // Live MTF kline history fed by WebSocket kline streams (1m/5m/15m/1h/4h/12h).
  // RSI & W%R(200) are recomputed on every kline message (~1-2s) — no REST, no IP ban.
  private mtfKlineHistory = new Map<string, Map<string, CandleOHLCV[]>>();
  private static readonly MTF_MAX_CANDLES = 250;
  private static readonly MTF_TF_MAP: Record<string, string> = {
    '1m': 'tf1m',
    '5m': 'tf5m',
    '15m': 'tf15m',
    '1h': 'tf1h',
    '4h': 'tf4h',
    '12h': 'tf12h'
  };
  private mtfBackfillInFlight = new Set<string>();

  private async getMtfData(symbol: string): Promise<{ rsi: any; wr: any } | null> {
    const cached = this.mtfCache.get(symbol);
    if (cached && Date.now() - cached.ts < MarketDataEngine.MTF_CACHE_TTL_MS) {
      return { rsi: cached.rsi, wr: cached.wr };
    }
    const [rsi, wr] = await Promise.all([
      this.restManager.getMultiTimeframeRSIs(symbol),
      this.restManager.getMultiTimeframeWilliamsR(symbol)
    ]);
    if (rsi || wr) {
      this.mtfCache.set(symbol, { rsi, wr, ts: Date.now() });
    }
    return { rsi, wr };
  }

  private getCachedRsi15m(symbol: string, fetched: number | null): number | undefined {
    const cached = this.rsi15mCache.get(symbol);
    if (cached && Date.now() - cached.ts < MarketDataEngine.RSI15M_CACHE_TTL_MS) {
      return cached.rsi;
    }
    if (fetched !== null && fetched !== undefined) {
      this.rsi15mCache.set(symbol, { rsi: fetched, ts: Date.now() });
      return fetched;
    }
    return undefined;
  }

  // ─────────────────────────────────────────────────────────────
  // Live MTF RSI / W%R(200) via WebSocket kline streams
  // REST is used only ONCE to seed history; after that WS klines
  // (arriving every ~1-2s even mid-candle) keep RSI/W%R live per-second.
  // ─────────────────────────────────────────────────────────────
  private async ensureMtfHistory(symbol: string, tf: string): Promise<void> {
    const key = `${symbol}|${tf}`;
    if (this.mtfBackfillInFlight.has(key)) return;
    const existing = this.mtfKlineHistory.get(symbol)?.get(tf);
    if (existing && existing.length >= 20) return;

    this.mtfBackfillInFlight.add(key);
    try {
      const klines = await this.restManager.getKlines(symbol, tf, 250);
      if (klines.length > 0) {
        let tfMap = this.mtfKlineHistory.get(symbol);
        if (!tfMap) {
          tfMap = new Map();
          this.mtfKlineHistory.set(symbol, tfMap);
        }
        tfMap.set(tf, klines);
      }
    } catch (e) {
      // ignore — WS will keep whatever candles arrive
    } finally {
      this.mtfBackfillInFlight.delete(key);
    }
  }

  public async seedMtfHistories(symbols: string[]): Promise<void> {
    const tfs = ['5m', '15m', '1h', '4h', '12h'];
    for (const sym of symbols) {
      await Promise.all(tfs.map(tf => this.ensureMtfHistory(sym, tf)));
      await new Promise(resolve => setTimeout(resolve, 40)); // pace REST calls
    }
  }

  private updateMtfFromKline(kline: CandleOHLCV): void {
    const tfKey = MarketDataEngine.MTF_TF_MAP[kline.interval];
    if (!tfKey) return;

    let tfMap = this.mtfKlineHistory.get(kline.symbol);
    if (!tfMap) {
      tfMap = new Map();
      this.mtfKlineHistory.set(kline.symbol, tfMap);
    }
    let hist = tfMap.get(kline.interval);
    if (!hist) {
      hist = [];
      tfMap.set(kline.interval, hist);
    }
    if (hist.length > 0 && hist[hist.length - 1].openTime === kline.openTime) {
      hist[hist.length - 1] = kline;
    } else {
      hist.push(kline);
      if (hist.length > MarketDataEngine.MTF_MAX_CANDLES) hist.shift();
    }
    if (hist.length < 15) return;

    const state = this.symbolStates.get(kline.symbol);
    if (!state) return;
    if (!state.indicators) {
      state.indicators = {
        symbol: kline.symbol, ema20: 0, ema50: 0, ema200: 0, rsi14: 50,
        rsiMultiTimeframe: { tf5m: 50, tf15m: 50, tf1h: 50, tf4h: 50, tf12h: 50 },
        williamsR14: 50, williamsR200: 50,
        williamsRMultiTimeframe: { tf1m: 50, tf5m: 50, tf15m: 50, tf1h: 50, tf4h: 50 },
        macd: { macdLine: 0, signalLine: 0, histogram: 0 },
        vwap: 0, microVwap: 0, atr14: 0,
        vpvr: { pocPrice: 0, highVolumeNodes: [], lowVolumeNodes: [] },
        bollingerBands: { upper: 0, middle: 0, lower: 0 },
        supertrend: { value: 0, direction: 'BULL' },
        stochRsi: { k: 50, d: 50 },
        adx14: { adx: 25, plusDI: 20, minusDI: 20 },
        timestamp: Date.now()
      };
    }

    const closes = hist.map(c => c.close);
    const rsiArr = this.indicatorEngine.calculateRSI(closes, 14);
    const rsiVal = rsiArr[rsiArr.length - 1];
    if (rsiVal !== undefined && isFinite(rsiVal)) {
      const mtf = state.indicators.rsiMultiTimeframe || { tf5m: 50, tf15m: 50, tf1h: 50, tf4h: 50, tf12h: 50 };
      (mtf as any)[tfKey] = parseFloat(rsiVal.toFixed(1));
      state.indicators.rsiMultiTimeframe = mtf;
    }

    // W%R(200) has no 12h bucket — 12h updates RSI only
    if (kline.interval !== '12h') {
      const wrArr = this.indicatorEngine.calculateWilliamsR(hist, 200);
      const wrVal = wrArr[wrArr.length - 1];
      if (wrVal !== undefined && isFinite(wrVal)) {
        const wrKey = (tfKey === 'tf1m' ? 'tf1m' : tfKey) as keyof typeof state.indicators.williamsRMultiTimeframe;
        const wrMtf = state.indicators.williamsRMultiTimeframe || { tf1m: 50, tf5m: 50, tf15m: 50, tf1h: 50, tf4h: 50 };
        (wrMtf as any)[wrKey] = parseFloat(wrVal.toFixed(1));
        state.indicators.williamsRMultiTimeframe = wrMtf;
        const avg = (wrMtf.tf1m + wrMtf.tf5m + wrMtf.tf15m + wrMtf.tf1h + wrMtf.tf4h) / 5;
        state.indicators.williamsR200 = parseFloat(avg.toFixed(1));
      }
    }

    state.hunter = this.hunterEngine.evaluate(
      kline.symbol,
      state.indicators.rsiMultiTimeframe,
      state.indicators.williamsRMultiTimeframe
    );
    state.timestamp = Date.now();
  }

  // In-memory symbol state storage
  private symbolStates: Map<string, AggregatedSymbolState> = new Map();
  private candleHistory: Map<string, CandleOHLCV[]> = new Map();
  private tickHistory: Map<string, MarketTick[]> = new Map();
  private stateListeners: Set<StateListener> = new Set();

  // Pipeline state cache
  private lastDiscovery: DiscoveredCoin[] = [];
  private lastHeatCandidates: HeatCandidate[] = [];
  private lastPipelineResult: ScanPipelineResult | null = null;

  public autoTradeConfig: AutoTradeConfig = {
    mode: 'OFF',
    execution: 'PAPER',
    margin: 10,
    leverage: 10,
    maxOpenTrades: 1,
    riskPct: 2,
    minSetupQuality: 75,
    minRiskReward: 1.5,
    trailingStopEnabled: true,
    trailingActivationPct: 40,
    trailingDistancePct: 0.6
  };

  public applyTrailingConfig(): void {
    this.paperEngine.setTrailingConfig(
      this.autoTradeConfig.trailingStopEnabled,
      this.autoTradeConfig.trailingActivationPct,
      this.autoTradeConfig.trailingDistancePct
    );
  }

  public focusedSymbol: string | null = null;

  public setFocusedSymbol(symbol: string | null): void {
    this.focusedSymbol = symbol;
    console.log(`MarketDataEngine: Focus symbol updated to: ${symbol}`);
    this.runDiscoveryPipeline();
  }

  constructor(symbols: string[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']) {
    this.symbols = symbols;
    this.restManager = new RESTManager();

    for (const sym of this.symbols) {
      this.symbolStates.set(sym, {
        symbol: sym,
        timestamp: Date.now()
      });
      this.candleHistory.set(sym, []);
      this.tickHistory.set(sym, []);
    }
  }

  public async initialize(): Promise<void> {
    console.log('MarketDataEngine: Pre-loading historical klines, funding rates & OI via RESTManager...');
    for (const sym of this.symbols) {
      try {
        const klines = await this.restManager.getKlines(sym, '1m', 100);
        const depth = await this.restManager.getDepthSnapshot(sym, 20);
        const funding = await this.restManager.getFundingRate(sym);
        const oi = await this.restManager.getOpenInterest(sym);

        const state = this.symbolStates.get(sym)!;

        if (klines.length > 0) {
          this.candleHistory.set(sym, klines);
          const lastCandle = klines[klines.length - 1];
          state.lastTick = {
            symbol: sym,
            price: lastCandle.close,
            quantity: lastCandle.volume,
            timestamp: lastCandle.closeTime,
            isBuyerMaker: false
          };

          state.indicators = this.indicatorEngine.evaluate(klines) || undefined;
          state.regime = this.regimeEngine.evaluate(klines, state.indicators?.adx14.adx || 25);
          state.hunter = this.hunterEngine.evaluate(sym, state.indicators?.rsiMultiTimeframe, state.indicators?.williamsRMultiTimeframe);
          state.volume24h = klines.reduce((sum, c) => sum + c.volume * c.close, 0);
        }

        if (depth) {
          state.depth = depth;
          state.microstructure = this.orderbookEngine.evaluate(depth, []);
        }

        state.fundingRate = funding?.fundingRate || 0.0001;
        state.openInterest = oi?.openInterest || 15000;
        state.openInterestDeltaPct = oi?.openInterestDeltaPct || 0;
        state.timestamp = Date.now();

        // Fetch exact Binance Multi-Timeframe RSIs & Williams %R 200 from Binance REST API
        const mtfData = await this.getMtfData(sym);
        const mtfRsi = mtfData?.rsi || null;
        const mtfWr = mtfData?.wr || null;
        if (state.indicators) {
          if (mtfRsi) state.indicators.rsiMultiTimeframe = mtfRsi;
          if (mtfWr) {
            state.indicators.williamsRMultiTimeframe = mtfWr;
            const avg = (mtfWr.tf1m + mtfWr.tf5m + mtfWr.tf15m + mtfWr.tf1h + mtfWr.tf4h) / 5;
            state.indicators.williamsR200 = parseFloat(avg.toFixed(1));
          }
        }

        this.evaluateSignals(sym);
      } catch (err: any) {
        console.error(`MarketDataEngine: Failed to initialize state for ${sym}:`, err?.message || err);
      }
    }

    // Start periodic polling for derivatives (Funding, OI, MTF RSIs & MTF W%R 200 updates)
    this.pollIntervalTimer = setInterval(() => this.pollDerivativesData(), ScreenerConfig.intervals.derivativesPoll);

    // Start Stage 1 discovery pipeline — loads listing dates once, then runs dynamically
    await this.discoveryEngine.loadListingDates();
    this.runDiscoveryPipeline(); // run immediately and it will self-schedule

    console.log('MarketDataEngine: Startup REST synchronization complete.');
  }

  private async pollDerivativesData(): Promise<void> {
    if (this.isPollingDerivatives) return; // Prevent overlapping poll cycles
    this.isPollingDerivatives = true;
    try {
      const allSymbols = Array.from(this.symbolStates.keys());
      for (const sym of allSymbols) {
        try {
          const funding = await this.restManager.getFundingRate(sym);
          const oi = await this.restManager.getOpenInterest(sym);
          const state = this.symbolStates.get(sym);

          if (state) {
            if (funding) state.fundingRate = funding.fundingRate;
            if (oi) {
              state.openInterest = oi.openInterest;
              state.openInterestDeltaPct = oi.openInterestDeltaPct;
            }
            state.timestamp = Date.now();
            this.evaluateSignals(sym);
            this.notifyListeners(state);
          }
        } catch (err: any) {
          console.error(`MarketDataEngine: Derivatives poll failed for ${sym}:`, err?.message || err);
        }
      }
    } finally {
      this.isPollingDerivatives = false;
    }
  }


  public startWebsocket(): void {
    // SPOT manager: live aggTrades + MTF klines. Spot market data is never
    // silently IP-blocked (unlike futures non-depth streams on some datacenter IPs).
    this.spotWs = new WebSocketManager(this.symbols, {
      onTick: (tick) => this.processTick(tick),
      onKline: (kline) => this.processKline(kline)
    }, { market: 'spot', trades: true, klines: true, depthLevel: null });
    this.spotWs.connect();

    // FUTURES manager: orderbook depth only (reliable from datacenter IPs).
    this.wsManager = new WebSocketManager(this.symbols, {
      onDepth: (depth) => this.processDepth(depth)
    }, { market: 'futures', trades: false, klines: false, depthLevel: 10 });
    this.wsManager.connect();
  }

  private updateSymbolsForWebsockets(symbols: string[], focused: string | null): void {
    if (this.spotWs) {
      this.spotWs.updateSymbols(symbols, focused);
    }
    if (this.wsManager) {
      this.wsManager.updateSymbols(symbols, focused);
    }
  }

  public processTick(tick: MarketTick): void {
    const val = this.validator.validateTick(tick);
    if (!val.valid) return;

    let state = this.symbolStates.get(tick.symbol);
    if (!state) {
      state = { symbol: tick.symbol, timestamp: Date.now() };
      this.symbolStates.set(tick.symbol, state);
    }

    state.lastTick = tick;
    state.timestamp = Date.now();

    let ticks = this.tickHistory.get(tick.symbol);
    if (!ticks) {
      ticks = [];
      this.tickHistory.set(tick.symbol, ticks);
    }
    ticks.push(tick);
    if (ticks.length > 30) ticks.shift();

    const closedTrade = this.paperEngine.updateMarkPrice(tick.symbol, tick.price, state.fundingRate);
    if (closedTrade) {
      console.log(`MarketDataEngine: Auto-TP/SL/LIQ closed position for ${tick.symbol} at $${tick.price}`);
      this.emitTrade(closedTrade);
    }

    // Live rolling CVD delta — once per aggTrade, never double-counted
    this.orderbookEngine.updateCVD(tick);

    // Update last candle in place on every tick (cheap), but only fully
    // re-evaluate indicators every IND_CALC_THROTTLE_MS to avoid event-loop
    // stall on high-frequency symbols.
    const klines = this.candleHistory.get(tick.symbol);
    if (klines && klines.length > 0) {
      const lastCandle = klines[klines.length - 1];
      lastCandle.close = tick.price;
      if (tick.price > lastCandle.high) lastCandle.high = tick.price;
      if (tick.price < lastCandle.low) lastCandle.low = tick.price;

      const now = Date.now();
      const lastCalc = this.lastIndCalcAt.get(tick.symbol) || 0;
      if (now - lastCalc >= MarketDataEngine.IND_CALC_THROTTLE_MS) {
        const updatedInd = this.indicatorEngine.evaluate(
          klines,
          state.indicators?.rsiMultiTimeframe,
          state.indicators?.williamsRMultiTimeframe
        );
        if (updatedInd) {
          state.indicators = updatedInd;
        }
        this.lastIndCalcAt.set(tick.symbol, now);
      }
    }

    // Evaluate microstructure on tick level (captures CVD, Whale Activity, Sweeps instantly)
    const mockDepth = state.depth || {
      symbol: tick.symbol,
      bids: [{ price: tick.price, quantity: 1 }],
      asks: [{ price: tick.price, quantity: 1 }],
      timestamp: Date.now(),
      lastUpdateId: 0
    };
    state.microstructure = this.orderbookEngine.evaluate(mockDepth, ticks);

    this.evaluateSignals(tick.symbol);
    this.notifyListeners(state);
  }

  public processDepth(depth: DepthSnapshot): void {
    const val = this.validator.validateDepth(depth);
    if (!val.valid) return;

    const state = this.symbolStates.get(depth.symbol);
    if (!state) return;

    state.depth = depth;
    const ticks = this.tickHistory.get(depth.symbol) || [];
    state.microstructure = this.orderbookEngine.evaluate(depth, ticks);
    state.timestamp = Date.now();

    this.evaluateSignals(depth.symbol);
    this.notifyListeners(state);
  }

  public processKline(kline: CandleOHLCV): void {
    const val = this.validator.validateCandle(kline);
    if (!val.valid) return;

    // Non-1m klines feed the live MTF RSI / W%R(200) matrix
    if (kline.interval !== '1m') {
      this.updateMtfFromKline(kline);
      this.ensureMtfHistory(kline.symbol, kline.interval);
      const state = this.symbolStates.get(kline.symbol);
      if (state) {
        state.timestamp = Date.now();
        this.notifyListeners(state);
      }
      return;
    }

    const history = this.candleHistory.get(kline.symbol) || [];
    if (history.length > 0 && history[history.length - 1].openTime === kline.openTime) {
      history[history.length - 1] = kline;
    } else {
      history.push(kline);
      if (history.length > 100) history.shift();
    }
    this.candleHistory.set(kline.symbol, history);

    const state = this.symbolStates.get(kline.symbol);
    if (!state) return;

    const existingMtf = state.indicators?.rsiMultiTimeframe;
    const existingWrMtf = state.indicators?.williamsRMultiTimeframe;
    state.indicators = this.indicatorEngine.evaluate(history, existingMtf, existingWrMtf) || undefined;

    // Live W%R(200) for the 1m bucket (cheap short-array path, updates ~1/2s)
    if (state.indicators && history.length >= 15) {
      const wrMtf = state.indicators.williamsRMultiTimeframe || { tf1m: 50, tf5m: 50, tf15m: 50, tf1h: 50, tf4h: 50 };
      const wr1mArr = this.indicatorEngine.calculateWilliamsR(history, 200);
      const wr1mVal = wr1mArr[wr1mArr.length - 1];
      if (wr1mVal !== undefined && isFinite(wr1mVal)) {
        wrMtf.tf1m = parseFloat(wr1mVal.toFixed(1));
        state.indicators.williamsRMultiTimeframe = wrMtf;
        const avg = (wrMtf.tf1m + wrMtf.tf5m + wrMtf.tf15m + wrMtf.tf1h + wrMtf.tf4h) / 5;
        state.indicators.williamsR200 = parseFloat(avg.toFixed(1));
      }
    }

    state.regime = this.regimeEngine.evaluate(history, state.indicators?.adx14.adx || 25);
    state.hunter = this.hunterEngine.evaluate(kline.symbol, state.indicators?.rsiMultiTimeframe, state.indicators?.williamsRMultiTimeframe);
    state.volume24h = history.reduce((sum, c) => sum + c.volume * c.close, 0);
    state.timestamp = Date.now();

    this.evaluateSignals(kline.symbol);
    this.notifyListeners(state);
  }

  private async evaluateSignals(symbol: string): Promise<void> {
    const state = this.symbolStates.get(symbol);
    if (!state || !state.lastTick) return;

    const lastPrice = state.lastTick.price;
    const signal = this.signalEngine.evaluate(
      symbol,
      lastPrice,
      state.indicators,
      state.microstructure,
      state.regime,
      state.hunter,
      this.autoTradeConfig.minSetupQuality
    );
    state.signal = signal;
    state.reasons = signal.reasons;

    // Calculate dynamic Long % / Short % ratio based on Orderbook Buyer %, CVD, and Multi-timeframe RSI
    const buyerPct = state.microstructure?.orderbookBuyerPct || 50;
    const rsi5m = state.indicators?.rsiMultiTimeframe?.tf5m || 50;
    const cvd = state.microstructure?.cvd || 0;

    let longWeight = (buyerPct * 0.4) + (rsi5m * 0.4) + (cvd >= 0 ? 10 : 0);
    const longPct = Math.round(Math.min(92, Math.max(8, longWeight)));
    state.longPct = longPct;
    state.shortPct = 100 - longPct;

    // Risk Rating calculation
    const spoof = state.microstructure?.spoofingProbabilityPct || 0;
    const volRatio = state.regime?.volatilityRatio || 1.0;
    if (spoof > 50 || volRatio > 2.5) state.riskLevel = 'EXTREME';
    else if (spoof > 20 || volRatio > 1.8) state.riskLevel = 'HIGH';
    else if (volRatio > 1.2) state.riskLevel = 'MEDIUM';
    else state.riskLevel = 'LOW';

    // Candidate Lifecycle Stage computation
    const hunterScore = state.hunter?.hunterScore || 0;
    const hasOpenPosition = this.paperEngine.getPositions().some(p => p.symbol === symbol);
    if (hasOpenPosition) {
      state.lifecycle = 'OPEN_TRADE';
    } else if (signal.signal !== 'NEUTRAL') {
      state.lifecycle = 'SIGNAL';
    } else if (hunterScore >= 75) {
      state.lifecycle = 'QUALIFIED';
    } else if (hunterScore >= 60) {
      state.lifecycle = 'HEATING';
    } else if (hunterScore >= 40) {
      state.lifecycle = 'WATCHLIST';
    } else {
      state.lifecycle = 'DISCOVERED';
    }

    // AI Score calculation driven strictly by quantitative metrics
    const aiScore = Math.min(100, Math.max(0, Math.round(
      (state.signal?.confidence || 50) * 0.4 +
      (buyerPct) * 0.3 +
      (rsi5m) * 0.3
    )));

    const heatScore = Math.min(100, Math.round(
      (state.hunter?.hunterScore || 0) * 0.4 +
      Math.abs((buyerPct - 50) * 2) * 0.4 +
      (state.regime?.volatilityRatio || 1) * 10
    ));

    const candidateScore = Math.min(100, Math.round(
      (state.hunter?.hunterScore || 0) * 0.5 +
      aiScore * 0.5
    ));

    const confidenceScore = state.signal?.confidence || 50;

    const scores: EngineScoreState = {
      symbol,
      heatScore,
      candidateScore,
      aiScore,
      confidenceScore,
      timestamp: Date.now()
    };
    state.scores = scores;

    // Auto-Trading Execution Loop
    if (this.autoTradeConfig.mode === 'AUTO' && signal.signal !== 'NEUTRAL') {
      const activePositions = this.paperEngine.getPositions();
      
      // Smart-money filter: only enter setups that meet the minimum risk:reward
      const minRR = this.autoTradeConfig.minRiskReward || 1.5;
      const rr = signal.riskRewardRatio || 0;
      
      // Constraint: Check Max Open Trades Limit
      if (activePositions.length < this.autoTradeConfig.maxOpenTrades && !activePositions.some(p => p.symbol === symbol)) {
        const config = this.autoTradeConfig;
        
        if (rr < minRR) {
          console.log(`MarketDataEngine: Skipping ${symbol} — R:R ${rr.toFixed(2)} < ${minRR.toFixed(2)}`);
        } else {
          // Calculate target quantity using margin and leverage
          const usdSize = config.margin * config.leverage;
          const quantity = parseFloat((usdSize / lastPrice).toFixed(4));
          
          if (quantity > 0) {
            console.log(`MarketDataEngine: Auto-Trading triggering ${signal.signal} order for ${symbol} with Qty=${quantity} (Leverage=${config.leverage}x, R:R=${rr.toFixed(2)})`);
            
            const intent: PaperOrderIntent = {
              symbol,
              side: signal.signal === 'BUY' ? 'BUY' : 'SELL',
              type: 'MARKET',
              quantity,
              stopLoss: signal.stopLoss,
              takeProfit: signal.takeProfit,
              leverage: config.leverage,
              context: {
                reasonOfEntry: 'AUTO_TRADER_EXECUTION',
                hunterScore: state.hunter?.hunterScore,
                setupQuality: signal.setupQuality,
                rsi: state.indicators?.rsiMultiTimeframe?.tf5m,
                wmr: state.indicators?.williamsR200,
                adx: state.indicators?.adx14?.adx,
                emaTrend: state.indicators ? (state.indicators.ema20 > state.indicators.ema50 ? 'BULL' : 'BEAR') : 'NEUTRAL',
                marketRegime: state.regime?.regime
              }
            };
            
            try {
              // Real-account execution when enabled + keys configured, otherwise paper
              if (config.execution === 'REAL' && this.exchangeExecutor.isConfigured()) {
                console.log(`MarketDataEngine: REAL order for ${symbol} ${signal.signal}`);
                this.exchangeExecutor.setLeverage(symbol, config.leverage).catch((e) => console.error('setLeverage failed:', e.message));
                const order = await this.exchangeExecutor.placeMarketOrder(symbol, intent.side, quantity);
                const trade = this.paperEngine.executeOrder(intent, state.depth, lastPrice);
                trade.orderId = order?.orderId ? String(order.orderId) : trade.orderId;
                this.emitTrade(trade);
              } else if (config.execution === 'REAL') {
                console.warn(`MarketDataEngine: REAL mode selected but Binance keys not configured — falling back to PAPER for ${symbol}`);
                const trade = this.paperEngine.executeOrder(intent, state.depth, lastPrice);
                this.emitTrade(trade);
              } else {
                const trade = this.paperEngine.executeOrder(intent, state.depth, lastPrice);
                this.emitTrade(trade);
              }
            } catch (err) {
              console.error(`MarketDataEngine: Auto-Trading order execution failed for ${symbol}:`, err);
            }
          }
        }
      }
    }
  }

  public getSymbolState(symbol: string): AggregatedSymbolState | undefined {
    return this.symbolStates.get(symbol.toUpperCase());
  }

  public getAllStates(): AggregatedSymbolState[] {
    return Array.from(this.symbolStates.values());
  }

  // ─────────────────────────────────────────────────────────────
  // DISCOVERY PIPELINE PUBLIC GETTERS
  // ─────────────────────────────────────────────────────────────

  public getDiscoveryList(): DiscoveredCoin[] {
    return this.lastDiscovery;
  }

  public getHeatCandidates(): HeatCandidate[] {
    return this.lastHeatCandidates;
  }

  public getPipelineResult(): ScanPipelineResult | null {
    return this.lastPipelineResult;
  }

  /**
   * Runs the full 4-stage discovery pipeline.
   * Stage 1: CoinDiscoveryEngine.discover()
   * Stage 2: HeatHunterEngine.filter()
   * Stage 3: Deep analysis already running per-symbol via MarketDataEngine
   * Stage 4: PriorityQueueEngine.process() — returns final signals only
   */
  private async runDiscoveryPipeline(): Promise<void> {
    const pipelineStart = Date.now();
    try {
      // Stage 1: Discover active coins
      const rawDiscovered = await this.discoveryEngine.discover();

      // Limit pool to Top 45 by quoteVolume + 5 Majors to prevent 429 rate limiting
      const majors = rawDiscovered.filter(c => ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'].includes(c.symbol));
      const topByVolume = rawDiscovered
        .filter(c => !['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'].includes(c.symbol))
        .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
        .slice(0, 45);

      const uniquePool = new Set([...topByVolume.map(c => c.symbol), ...majors.map(c => c.symbol)]);
      const screenerPool = rawDiscovered.filter(c => uniquePool.has(c.symbol));

      console.log(`MarketDataEngine: Screening ${screenerPool.length} active symbols for MTF RSI heat zones...`);

      // Step 1: Fetch 15m klines in parallel batches to speed up execution
      const rsi15mMap = new Map<string, number>();
      const batchSize15m = 10;
      for (let i = 0; i < screenerPool.length; i += batchSize15m) {
        const batch = screenerPool.slice(i, i + batchSize15m);
        await Promise.all(batch.map(async (coin) => {
          try {
            const cachedRsi = this.getCachedRsi15m(coin.symbol, null);
            if (cachedRsi !== undefined) {
              rsi15mMap.set(coin.symbol, cachedRsi);
              return;
            }
            const klines = await this.restManager.getKlines(coin.symbol, '15m', 50);
            if (klines && klines.length >= 15) {
              const closes = klines.map(c => c.close);
              const rsiValues = this.indicatorEngine.calculateRSI(closes, 14);
              const rsi = rsiValues[rsiValues.length - 1];
              if (rsi !== undefined) {
                this.getCachedRsi15m(coin.symbol, rsi);
                rsi15mMap.set(coin.symbol, rsi);
              }
            }
          } catch (e) { }
        }));
        await new Promise(resolve => setTimeout(resolve, 50)); // Tiny pause between batches
      }

      // Step 2: Filter symbols where 15m RSI is extreme (>= 60 or <= 40)
      const candidates = screenerPool.filter(coin => {
        const rsi = rsi15mMap.get(coin.symbol);
        return rsi !== undefined && (rsi >= 60 || rsi <= 40);
      });

      console.log(`MarketDataEngine: 15m RSI screening narrowed to ${candidates.length} candidate symbols. Evaluating all 4 timeframes...`);

      // Step 3: Fetch MTF RSIs & WMR for candidates in parallel batches to calculate Hunter Score
      const matchedCoins: typeof rawDiscovered = [];
      const candidateBatchSize = 5;
      
      for (let i = 0; i < candidates.length; i += candidateBatchSize) {
        const batch = candidates.slice(i, i + candidateBatchSize);
        await Promise.all(batch.map(async (coin) => {
          try {
            const existingState = this.symbolStates.get(coin.symbol);
            // Prefer live WS-updated MTF values; REST only as a fallback for new symbols
            const liveRsi = existingState?.indicators?.rsiMultiTimeframe;
            const liveWr = existingState?.indicators?.williamsRMultiTimeframe;
            let mtfRsi = liveRsi || null;
            let mtfWr = liveWr || null;
            if (!liveRsi || !liveWr) {
              const mtfData = await this.getMtfData(coin.symbol);
              mtfRsi = mtfRsi || mtfData?.rsi || null;
              mtfWr = mtfWr || mtfData?.wr || null;
            }

            if (mtfRsi && mtfWr) {
              const hunterState = this.hunterEngine.evaluate(coin.symbol, mtfRsi, mtfWr);

              let state = existingState;
              if (!state) {
                state = { symbol: coin.symbol, timestamp: Date.now() };
                this.symbolStates.set(coin.symbol, state);
              }
              state.hunter = hunterState;

              // Only pre-populate indicators for NEW symbols — never clobber live WS data
              if (!state.indicators) {
                const avg = (mtfWr.tf1m + mtfWr.tf5m + mtfWr.tf15m + mtfWr.tf1h + mtfWr.tf4h) / 5;
                state.indicators = {
                  symbol: coin.symbol,
                  rsiMultiTimeframe: mtfRsi,
                  williamsRMultiTimeframe: mtfWr,
                  williamsR200: parseFloat(avg.toFixed(1)),
                  ema20: 0, ema50: 0, ema200: 0, rsi14: mtfRsi.tf15m, williamsR14: mtfWr.tf15m,
                  macd: { macdLine: 0, signalLine: 0, histogram: 0 },
                  vwap: 0, microVwap: 0, atr14: 0,
                  vpvr: { pocPrice: 0, highVolumeNodes: [], lowVolumeNodes: [] },
                  bollingerBands: { upper: 0, middle: 0, lower: 0 },
                  supertrend: { value: 0, direction: 'BULL' },
                  stochRsi: { k: 50, d: 50 },
                  adx14: { adx: 25, plusDI: 20, minusDI: 20 },
                  timestamp: Date.now()
                };
              }

              if (hunterState.hunterScore >= ScreenerConfig.hunter.threshold) {
                matchedCoins.push(coin);
              }
            }
          } catch (e) {}
        }));
        await new Promise(resolve => setTimeout(resolve, 100)); // Pause between batches of 5 to protect limits
      }

      // Always include top 5 majors as a baseline fallback
      const fallbackMajors = [
        { symbol: 'BTCUSDT', tags: ['USER_WATCHLIST'] as any[], priceChangePercent24h: 0, quoteVolume24h: 0, lastPrice: 0, timestamp: Date.now() },
        { symbol: 'ETHUSDT', tags: ['USER_WATCHLIST'] as any[], priceChangePercent24h: 0, quoteVolume24h: 0, lastPrice: 0, timestamp: Date.now() },
        { symbol: 'SOLUSDT', tags: ['USER_WATCHLIST'] as any[], priceChangePercent24h: 0, quoteVolume24h: 0, lastPrice: 0, timestamp: Date.now() },
        { symbol: 'BNBUSDT', tags: ['USER_WATCHLIST'] as any[], priceChangePercent24h: 0, quoteVolume24h: 0, lastPrice: 0, timestamp: Date.now() },
        { symbol: 'XRPUSDT', tags: ['USER_WATCHLIST'] as any[], priceChangePercent24h: 0, quoteVolume24h: 0, lastPrice: 0, timestamp: Date.now() }
      ];

      const finalMajors = rawDiscovered.length > 0
        ? rawDiscovered.filter(c => ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'].includes(c.symbol))
        : fallbackMajors;

      // Combine matches and majors, removing duplicates
      const uniqueDiscovered = new Map<string, typeof rawDiscovered[0]>();
      for (const coin of [...matchedCoins, ...finalMajors]) {
        uniqueDiscovered.set(coin.symbol, coin);
      }

      const discovered = Array.from(uniqueDiscovered.values());
      this.lastDiscovery = discovered;

      console.log(`MarketDataEngine: Dynamic Screener matched ${discovered.length} symbols (including majors).`);

      // Prune symbolStates and candleHistory/tickHistory for untracked symbols
      const discoveredSymbols = new Set(discovered.map(c => c.symbol));
      for (const sym of this.symbolStates.keys()) {
        if (!discoveredSymbols.has(sym)) {
          this.symbolStates.delete(sym);
          this.candleHistory.delete(sym);
          this.tickHistory.delete(sym);
        }
      }

      // Ensure new discovered symbols have candle state initialized
      for (const coin of discovered) {
        if (!this.candleHistory.has(coin.symbol)) {
          this.candleHistory.set(coin.symbol, []);
          
          let state = this.symbolStates.get(coin.symbol);
          if (!state) {
            state = { symbol: coin.symbol, timestamp: Date.now() };
            this.symbolStates.set(coin.symbol, state);
          }

          // Pre-load klines asynchronously (RSI & WMR already loaded during screening!)
          this.restManager.getKlines(coin.symbol, '1m', 200).then((klines) => {
            if (klines.length > 0) {
              this.candleHistory.set(coin.symbol, klines);
              
              const mtfRsi = state?.indicators?.rsiMultiTimeframe || undefined;
              const mtfWr = state?.indicators?.williamsRMultiTimeframe || undefined;
              
              const ind = this.indicatorEngine.evaluate(klines, mtfRsi, mtfWr);
              if (ind && state) {
                state.indicators = ind;
                state.regime = this.regimeEngine.evaluate(klines, ind.adx14.adx);
              }
              if (state) {
                state.lastTick = { symbol: coin.symbol, price: klines[klines.length - 1].close, quantity: 0, timestamp: Date.now(), isBuyerMaker: false };
                this.evaluateSignals(coin.symbol);
              }
            }
          }).catch(() => { });
        }
      }

      // Stage 2: Dynamic Watchlist mapping (bypass heavy HeatHunter filters)
      const heatCandidates: HeatCandidate[] = [];
      for (const coin of discovered) {
        const state = this.symbolStates.get(coin.symbol);
        const rsi5m = state?.indicators?.rsiMultiTimeframe?.tf5m || 50;
        const wmr200 = state?.indicators?.williamsR200 || 50;
        const hunterScore = state?.hunter?.hunterScore || 0;

        heatCandidates.push({
          ...coin,
          heatZone: rsi5m >= 70 ? 'OVERBOUGHT' : (rsi5m <= 30 ? 'OVERSOLD' : 'NEUTRAL'),
          rsi5m,
          wmr200,
          heatConfirmed: hunterScore >= ScreenerConfig.hunter.threshold
        });
      }
      this.lastHeatCandidates = heatCandidates;

      // Stage 3: On-Demand Microstructure Execution (Whale Activity, Liquidity Sweeps, Spoofing Prob, Orderbook Buyer %, CVD)
      // Fetches depth snapshot via FREE Binance REST API only for candidate coins passing Stage 2 heat criteria!
      const depthRequests = heatCandidates.slice(0, 20).map(async (candidate) => {
        try {
          const depth = await this.restManager.getDepthSnapshot(candidate.symbol, 20);
          if (depth) {
            const state = this.symbolStates.get(candidate.symbol);
            if (state) {
              state.depth = depth;
              state.microstructure = this.orderbookEngine.evaluate(depth, this.tickHistory.get(candidate.symbol) || []);
              this.evaluateSignals(candidate.symbol);
            }
          }
        } catch (err) { }
      });
      await Promise.all(depthRequests);

      // Stage 4: Priority Queue + Final Signals
      const finalSignals = this.priorityQueueEngine.process(
        heatCandidates,
        (symbol) => this.symbolStates.get(symbol),
        true // only BUY/SELL signals
      );

      this.lastPipelineResult = {
        timestamp: Date.now(),
        stage1_discovered: discovered,
        stage2_heatCandidates: heatCandidates,
        stage4_signals: finalSignals,
        meta: {
          discoveredCount: discovered.length,
          heatCount: heatCandidates.length,
          signalCount: finalSignals.length,
          lastRefreshMs: Date.now() - pipelineStart
        }
      };

      console.log(
        `Pipeline: Stage1=${discovered.length} | Stage2=${heatCandidates.length} | Signals=${finalSignals.length} | ${Date.now() - pipelineStart}ms`
      );

      // WebSocket Promotion Layer: Only subscribe to Majors OR coins with Hunter Score >= 60 OR Focused symbol
      if (this.wsManager || this.spotWs) {
        const wsSymbols = discovered
          .filter(c => {
            const s = this.symbolStates.get(c.symbol);
            const score = s?.hunter?.hunterScore || 0;
            const isMajor = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'].includes(c.symbol);
            const isFocused = this.focusedSymbol && c.symbol === this.focusedSymbol.toUpperCase();
            return score >= 60 || isMajor || isFocused;
          })
          .map(c => c.symbol);
        this.updateSymbolsForWebsockets(wsSymbols, this.focusedSymbol);
        console.log(`MarketDataEngine: WebSocket promoted ${wsSymbols.length} symbols. Focus coin: ${this.focusedSymbol || 'None'}`);

        // One-time REST backfill of MTF kline history so the live WS-based
        // RSI/W%R(200) matrix is accurate immediately (then WS keeps it fresh).
        this.seedMtfHistories(wsSymbols);
      }

      // Calculate dynamic next interval. 30s default reduces REST load ~3x;
      // tighten to 15s only when paper positions are open so TP/SL stays fresh.
      const activePositions = this.paperEngine.getPositions();
      let nextInterval = activePositions.length > 0 ? 15000 : 30000;

      console.log(`MarketDataEngine: Next discovery in ${nextInterval / 1000}s | Positions=${activePositions.length} | HeatCandidates=${heatCandidates.length}`);
      this.discoveryTimer = setTimeout(() => this.runDiscoveryPipeline(), nextInterval);

    } catch (err: any) {
      console.error('MarketDataEngine: Discovery pipeline error:', err.message);
      // Keep the discovery loop alive even after transient failures (network/REST hiccups)
      this.discoveryTimer = setTimeout(() => this.runDiscoveryPipeline(), 10000);
    }
  }

  public addListener(listener: StateListener): void {
    this.stateListeners.add(listener);
  }

  public removeListener(listener: StateListener): void {
    this.stateListeners.delete(listener);
  }

  private notifyListeners(state: AggregatedSymbolState): void {
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (err) {
        // Suppress listener errors
      }
    }
  }
}
