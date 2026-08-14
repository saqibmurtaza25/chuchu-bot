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
  PaperPosition,
  PaperOrderIntent,
  AutoTradeConfig,
  ExitReason
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
  ReversalIntelligenceEngine,
  ScreenerConfig
} from '@chuchu/engine-core';

import { RESTManager } from './RESTManager';
import { WebSocketManager } from './WebSocketManager';
import { BinanceFuturesExecutor } from './BinanceFuturesExecutor';
import { BybitDataClient } from './BybitDataClient';

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
  public reversalIntelEngine = new ReversalIntelligenceEngine();

  // 4-Stage Discovery Pipeline Modules
  public discoveryEngine = new CoinDiscoveryEngine();
  public heatHunterEngine = new HeatHunterEngine();
  public priorityQueueEngine = new PriorityQueueEngine();

  public restManager: RESTManager;
  public bybitData: BybitDataClient;
  public wsManager: WebSocketManager | null = null; // futures depth
  public spotWs: WebSocketManager | null = null;   // spot trades + klines
  private pollIntervalTimer: NodeJS.Timeout | null = null;
  private discoveryTimer: NodeJS.Timeout | null = null;
  private positionPriorityTimer: NodeJS.Timeout | null = null;
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
      let klines = await this.restManager.getKlines(symbol, tf, 250);
      if (klines.length === 0 && this.bybitData) {
        // Binance REST busy/429 → Bybit is a fast independent fallback
        klines = await this.bybitData.getKlines(symbol, tf, 250);
      }
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

  // ─────────────────────────────────────────────────────────────
  // Reversal-intel kline source: WS keeps 1m/5m/15m/1h/4h/12h in
  // `mtfKlineHistory`; the remaining 4 timeframes (1d/2h/30m/3m)
  // are seeded once via REST here and kept in a separate cache.
  // ─────────────────────────────────────────────────────────────
  private reversalExtraHistory = new Map<string, Map<string, CandleOHLCV[]>>();
  private static readonly REVERSAL_EXTRA_TFS = ['1d', '2h', '30m', '3m'];
  private reversalBackfillInFlight = new Set<string>();
  private lastReversalIntelAt = new Map<string, number>();
  private static readonly REVERSAL_INTEL_MIN_INTERVAL_MS = 15000;

  private async ensureReversalHistory(symbol: string, tf: string): Promise<void> {
    const key = `${symbol}|${tf}`;
    if (this.reversalBackfillInFlight.has(key)) return;
    const existing = this.reversalExtraHistory.get(symbol)?.get(tf);
    if (existing && existing.length >= 100) return;

    this.reversalBackfillInFlight.add(key);
    try {
      let klines = await this.restManager.getKlines(symbol, tf, 250);
      if (klines.length === 0 && this.bybitData) {
        klines = await this.bybitData.getKlines(symbol, tf, 250);
      }
      if (klines.length > 0) {
        let tfMap = this.reversalExtraHistory.get(symbol);
        if (!tfMap) {
          tfMap = new Map();
          this.reversalExtraHistory.set(symbol, tfMap);
        }
        tfMap.set(tf, klines);
      }
    } catch (e) {
      // transient REST failure — retried next pipeline cycle
    } finally {
      this.reversalBackfillInFlight.delete(key);
    }
  }

  public async seedReversalHistories(symbols: string[]): Promise<void> {
    for (const sym of symbols) {
      await Promise.all(MarketDataEngine.REVERSAL_EXTRA_TFS.map(tf => this.ensureReversalHistory(sym, tf)));
      await new Promise(resolve => setTimeout(resolve, 40)); // pace REST calls
    }
  }

  /** Assemble the full TF kline map used by the reversal engine. */
  private getReversalTfKlines(symbol: string): Record<string, CandleOHLCV[]> {
    const tfKlines: Record<string, CandleOHLCV[]> = {};
    const live = this.mtfKlineHistory.get(symbol);
    if (live) {
      for (const [tf, klines] of live) {
        if (klines.length >= 50) tfKlines[tf] = klines;
      }
    }
    const extra = this.reversalExtraHistory.get(symbol);
    if (extra) {
      for (const [tf, klines] of extra) {
        if (klines.length >= 50) tfKlines[tf] = klines;
      }
    }
    return tfKlines;
  }

  /**
   * Compute + cache the multi-timeframe reversal intelligence for a symbol.
   * Throttled so rapid kline events don't recompute (10 TFs × W%R200 is ~O(n·p)).
   */
  public refreshReversalIntel(symbol: string): void {
    const lastAt = this.lastReversalIntelAt.get(symbol) || 0;
    if (Date.now() - lastAt < MarketDataEngine.REVERSAL_INTEL_MIN_INTERVAL_MS) return;

    const state = this.symbolStates.get(symbol);
    if (!state) return;
    const tfKlines = this.getReversalTfKlines(symbol);
    if (Object.keys(tfKlines).length < 3) return;

    const price = state.lastTick?.price || state.indicators?.vwap || undefined;
    state.reversalIntel = this.reversalIntelEngine.analyze(symbol, tfKlines, state.microstructure, price);
    this.lastReversalIntelAt.set(symbol, Date.now());
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
    trailingDistancePct: 0.6,
    reentryCooldownMin: 5,
    htfTrendFilter: true
  };

  private lastTradeExitAt: Map<string, number> = new Map();

  /**
   * FIFO re-entry queue, ordered by close time.
   * When a trade closes the coin is appended to the END of this list. On the
   * next pipeline cycles it must re-qualify from scratch (Stage 1 → heat →
   * Stage 4 signal), and even then it may ONLY reopen once every coin ahead
   * of it in the queue has had its turn (opened or dropped out). This stops
   * the rapid open→close→reopen churn on a single hot coin.
   */
  private reentryQueue: string[] = [];

  private enqueueReentry(symbol: string): void {
    if (!this.reentryQueue.includes(symbol)) this.reentryQueue.push(symbol);
  }

  /**
   * Called on EVERY position close (auto TP/SL/LIQ/trailing/momentum or manual).
   * Strips the coin back to the discovery stage and queues it at the END of the
   * FIFO re-entry list — it can only trade again after full pipeline
   * re-qualification AND after every coin that closed before it has its turn.
   */
  public markTradeExit(symbol: string): void {
    this.lastTradeExitAt.set(symbol, Date.now());
    this.enqueueReentry(symbol);

    const state = this.symbolStates.get(symbol);
    if (state) {
      state.signal = undefined;
      state.reasons = [];
      state.lifecycle = 'REQUALIFY';
    }
    console.log(`MarketDataEngine: ${symbol} trade closed → queued for re-entry (FIFO position ${this.reentryQueue.length})`);
  }

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
    this.bybitData = new BybitDataClient();

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

    // Priority loop: every open position gets its own 1-second focus — fresh
    // price (REST fallback if WS is stale) + momentum-based exit evaluation.
    // Where money is at risk is where the data + compute go.
    this.positionPriorityTimer = setInterval(() => this.priorityPositionLoop(), 1000);

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
      this.markTradeExit(tick.symbol);
      this.emitTrade(closedTrade);
    }

    // Momentum-based exit on live ticks — each open trade is tracked isolated
    const openPos = this.paperEngine.getPositions().find(p => p.symbol === tick.symbol);
    if (openPos) {
      this.evaluateMomentumExit(tick.symbol, state, openPos);
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

  /**
   * Priority loop (runs every 1s). Open positions get full focus:
   *  - If a position's price feed is stale (>3s), fetch a fresh price via REST
   *    so mark price never sticks while money is at risk.
   *  - Momentum-based exit is evaluated every second for every open position.
   *  - The rest of the market (scanning) runs on the normal cadence, NOT here.
   */
  private async priorityPositionLoop(): Promise<void> {
    const positions = this.paperEngine.getPositions();
    if (positions.length === 0) return;

    for (const pos of positions) {
      try {
        const state = this.symbolStates.get(pos.symbol);
        const staleMs = state ? Date.now() - state.timestamp : Infinity;

        // Stale or missing feed → force-refresh the price so the open trade is
        // never sitting on a frozen mark price. Bybit is tried first (fast,
        // separate rate-limit budget from Binance), Binance as fallback.
        if (!state || staleMs > 3000) {
          let price: number | null = null;
          if (this.bybitData) {
            price = await this.bybitData.getTickerPrice(pos.symbol);
          }
          if (!price) {
            price = await this.restManager.getTickerPrice(pos.symbol);
          }
          if (price && price > 0) {
            const tick: MarketTick = {
              symbol: pos.symbol,
              price,
              quantity: 0,
              timestamp: Date.now(),
              isBuyerMaker: false
            };
            this.processTick(tick);
          }
        }

        const freshState = this.symbolStates.get(pos.symbol);
        if (freshState) {
          this.evaluateMomentumExit(pos.symbol, freshState, pos);
        }
      } catch (err: any) {
        console.error(`MarketDataEngine: Priority position loop failed for ${pos.symbol}:`, err?.message || err);
      }
    }
  }

  /**
   * Momentum-based exit — each trade is treated in isolation with its own
   * indicators. The strategy is NOT married to the higher timeframe until TP:
   * the moment fast momentum flips against the position:
   *   - in profit  -> book the profit (MOMENTUM_PROFIT_BOOK)
   *   - in loss    -> cut early before it rides to the full stop (MOMENTUM_CUT_LOSS)
   * Requires 3 consecutive seconds of confirmation to avoid RSI noise.
   */
  private evaluateMomentumExit(symbol: string, state: AggregatedSymbolState, pos: PaperPosition): void {
    const ind = state.indicators;
    const rsi5m = ind?.rsiMultiTimeframe?.tf5m;
    const rsi15m = ind?.rsiMultiTimeframe?.tf15m;
    if (rsi5m === undefined || rsi15m === undefined) return;

    const shifted = pos.side === 'LONG'
      ? (rsi5m < 50 && rsi15m < 50)
      : (rsi5m > 50 && rsi15m > 50);

    pos.momentumShiftStreak = shifted ? (pos.momentumShiftStreak || 0) + 1 : 0;
    if (pos.momentumShiftStreak < 3) return;

    const pnl = pos.unrealizedPnL || 0;
    const margin = pos.margin || 1;

    let reason: ExitReason | null = null;
    if (pnl > 0) {
      // Green but momentum flipped — take the money instead of holding for a
      // TP that may never arrive. Minimum book threshold covers entry+exit fees
      // AND a meaningful result (1% of margin ≈ 0.1% price at 10x leverage),
      // so tiny micro-profits do not churn the trade count.
      if (pnl >= margin * 0.01) reason = 'MOMENTUM_PROFIT_BOOK';
    } else if (pnl < 0) {
      // Red + momentum flipped — cut at ~30% of the SL distance, saving ~70%
      // of the would-be loss instead of riding to the full stop.
      const slDistance = Math.abs((pos.stopLoss ?? pos.entryPrice) - pos.entryPrice);
      const moveAgainst = Math.abs((pos.markPrice ?? pos.entryPrice) - pos.entryPrice);
      if (slDistance > 0 && moveAgainst >= slDistance * 0.3) reason = 'MOMENTUM_CUT_LOSS';
    }

    if (!reason) return;

    pos.momentumShiftStreak = 0;
    const closePrice = pos.markPrice || state.lastTick?.price || 0;
    const closingIntent: PaperOrderIntent = {
      symbol,
      side: pos.side === 'LONG' ? 'SELL' : 'BUY',
      type: 'MARKET',
      quantity: pos.quantity,
      context: { reasonOfEntry: 'MOMENTUM_EXIT', marketRegime: state.regime?.regime }
    };
    const closingTrade = this.paperEngine.executeOrder(closingIntent, state.depth, closePrice);
    closingTrade.exitReason = reason;
    console.log(`MarketDataEngine: ${reason} ${symbol} @ $${closePrice} (PnL ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} | RSI5m=${rsi5m}, RSI15m=${rsi15m})`);
    this.markTradeExit(symbol);
    this.emitTrade(closingTrade);
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
      this.autoTradeConfig.minSetupQuality,
      this.autoTradeConfig.htfTrendFilter
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
    } else if (this.reentryQueue.includes(symbol)) {
      // Trade just closed — coin is queued at the END of the FIFO re-entry list
      // and must re-qualify through the full pipeline before it can reopen.
      state.lifecycle = 'REQUALIFY';
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

    // NOTE: Auto-trade EXECUTION does NOT happen here. Opening trades on every
    // tick caused the rapid open→close→reopen churn seen before. Entry is now
    // decided once per discovery-pipeline cycle by allocateAutoTrades(), which
    // respects maxOpenTrades and the FIFO re-entry queue. This method only
    // scores + publishes signals.
  }

  public getSymbolState(symbol: string): AggregatedSymbolState | undefined {
    return this.symbolStates.get(symbol.toUpperCase());
  }

  public getAllStates(): AggregatedSymbolState[] {
    return Array.from(this.symbolStates.values());
  }

  // ─────────────────────────────────────────────────────────────
  // AUTO-TRADE ALLOCATOR
  // Single, controlled entry point that runs once per discovery cycle.
  // 1) Re-entry is FIFO: coins whose trade closed go to the END of the queue
  //    and reopen only after full pipeline re-qualification AND after every
  //    coin that closed before them has had its turn.
  // 2) Any remaining free slots go to freshly-qualified coins by priority.
  // This is the ONLY place that opens AUTO trades — never per-tick.
  // ─────────────────────────────────────────────────────────────

  private async tryOpenAutoTrade(
    symbol: string,
    state: AggregatedSymbolState,
    signal: AggregatedSymbolState['signal']
  ): Promise<boolean> {
    const config = this.autoTradeConfig;
    if (!signal || signal.signal === 'NEUTRAL') return false;

    const lastPrice = state.lastTick?.price;
    if (!lastPrice || lastPrice <= 0) return false;

    // Smart-money filter: only enter setups that meet the minimum risk:reward
    const minRR = config.minRiskReward || 1.5;
    const rr = signal.riskRewardRatio || 0;
    if (rr < minRR) {
      console.log(`MarketDataEngine: Skipping ${symbol} — R:R ${rr.toFixed(2)} < ${minRR.toFixed(2)}`);
      return false;
    }

    const usdSize = config.margin * config.leverage;
    const quantity = parseFloat((usdSize / lastPrice).toFixed(4));
    if (quantity <= 0) return false;

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
      if (config.execution === 'REAL' && this.exchangeExecutor.isConfigured()) {
        console.log(`MarketDataEngine: REAL order for ${symbol} ${signal.signal}`);
        this.exchangeExecutor.setLeverage(symbol, config.leverage).catch((e) => console.error('setLeverage failed:', e.message));
        const order = await this.exchangeExecutor.placeMarketOrder(symbol, intent.side, quantity);
        const trade = this.paperEngine.executeOrder(intent, state.depth, lastPrice);
        trade.orderId = order?.orderId ? String(order.orderId) : trade.orderId;
        this.emitTrade(trade);
      } else {
        if (config.execution === 'REAL') {
          console.warn(`MarketDataEngine: REAL mode selected but Binance keys not configured — falling back to PAPER for ${symbol}`);
        }
        const trade = this.paperEngine.executeOrder(intent, state.depth, lastPrice);
        this.emitTrade(trade);
      }
      console.log(`MarketDataEngine: Auto-Trading triggered ${signal.signal} for ${symbol} Qty=${quantity} (Leverage=${config.leverage}x, R:R=${rr.toFixed(2)})`);
      state.lifecycle = 'OPEN_TRADE';
      return true;
    } catch (err) {
      console.error(`MarketDataEngine: Auto-Trading order execution failed for ${symbol}:`, err);
      return false;
    }
  }

  private async allocateAutoTrades(
    discoveredSymbols: Set<string>,
    finalSignals: PrioritizedCandidate[]
  ): Promise<void> {
    if (this.autoTradeConfig.mode !== 'AUTO') return;

    const activePositions = this.paperEngine.getPositions();
    let slots = this.autoTradeConfig.maxOpenTrades - activePositions.length;
    if (slots <= 0) return;

    const openSymbols = new Set(activePositions.map(p => p.symbol));
    const cooldownMs = (this.autoTradeConfig.reentryCooldownMin || 0) * 60 * 1000;

    // Drop queued coins that no longer exist in the discovery pool AND have no
    // open position — they failed to re-qualify, so they leave the list.
    this.reentryQueue = this.reentryQueue.filter(s => openSymbols.has(s) || discoveredSymbols.has(s));

    // 1) FIFO re-entry pass — close-time order, one slot each.
    for (const symbol of Array.from(this.reentryQueue)) {
      if (slots <= 0) break;
      if (openSymbols.has(symbol)) continue;

      const state = this.symbolStates.get(symbol);
      const signal = state?.signal;
      if (!state || !signal || signal.signal === 'NEUTRAL') continue;

      const lastExit = this.lastTradeExitAt.get(symbol) || 0;
      if (cooldownMs > 0 && (Date.now() - lastExit) < cooldownMs) continue;

      // Must have produced a fresh Stage 4 signal THIS cycle to re-enter.
      if (!finalSignals.some(s => s.symbol === symbol)) continue;

      const ok = await this.tryOpenAutoTrade(symbol, state, signal);
      if (ok) {
        slots--;
        openSymbols.add(symbol);
        this.reentryQueue = this.reentryQueue.filter(s => s !== symbol);
        console.log(`MarketDataEngine: ${symbol} re-entered via FIFO queue → removed from re-entry list`);
      }
    }

    // 2) Fresh-qualified coins fill remaining slots, highest priority first.
    if (slots > 0) {
      const ordered = finalSignals
        .filter(s => !openSymbols.has(s.symbol) && !this.reentryQueue.includes(s.symbol))
        .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));

      for (const cand of ordered) {
        if (slots <= 0) break;
        const state = this.symbolStates.get(cand.symbol);
        const signal = state?.signal;
        if (!state || !signal || signal.signal === 'NEUTRAL') continue;

        const lastExit = this.lastTradeExitAt.get(cand.symbol) || 0;
        if (cooldownMs > 0 && (Date.now() - lastExit) < cooldownMs) continue;

        const ok = await this.tryOpenAutoTrade(cand.symbol, state, signal);
        if (ok) {
          slots--;
          openSymbols.add(cand.symbol);
        }
      }
    }
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

      // Prune symbolStates and candleHistory/tickHistory for untracked symbols.
      // Symbols with an OPEN position are NEVER pruned: their live feed must
      // keep streaming so mark price, TP/SL and momentum monitoring stay fresh
      // until the trade closes. This stops the open-trade card from flapping.
      const discoveredSymbols = new Set(discovered.map(c => c.symbol));
      const openPositionSymbols = new Set(this.paperEngine.getPositions().map(p => p.symbol));
      for (const sym of this.symbolStates.keys()) {
        if (!discoveredSymbols.has(sym) && !openPositionSymbols.has(sym)) {
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

      // WebSocket Promotion Layer: Only subscribe to Majors OR coins with Hunter Score >= 60 OR Focused symbol.
      // Symbols holding an OPEN position are ALWAYS kept subscribed so their
      // mark price keeps flowing live — a position is never left on a dead feed.
      if (this.wsManager || this.spotWs) {
        const openPositionSymbols = new Set(this.paperEngine.getPositions().map(p => p.symbol));
        const wsSymbols = discovered
          .filter(c => {
            const s = this.symbolStates.get(c.symbol);
            const score = s?.hunter?.hunterScore || 0;
            const isMajor = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'].includes(c.symbol);
            const isFocused = this.focusedSymbol && c.symbol === this.focusedSymbol.toUpperCase();
            const hasPosition = openPositionSymbols.has(c.symbol);
            return score >= 60 || isMajor || isFocused || hasPosition;
          })
          .map(c => c.symbol);
        this.updateSymbolsForWebsockets(wsSymbols, this.focusedSymbol);
        console.log(`MarketDataEngine: WebSocket promoted ${wsSymbols.length} symbols. Focus coin: ${this.focusedSymbol || 'None'}`);

        // One-time REST backfill of MTF kline history so the live WS-based
        // RSI/W%R(200) matrix is accurate immediately (then WS keeps it fresh).
        this.seedMtfHistories(wsSymbols);
      }

      // ─────────────────────────────────────────────────────────────
      // RE-ENTRY + AUTO-TRADE ALLOCATION PASS
      // Runs ONCE per cycle. Opens trades only from here — never per tick.
      // 1. Coins whose trade closed are in the FIFO reentryQueue. They reopen
      //    only after full re-qualification AND after every earlier-closed
      //    coin has had its turn (respecting maxOpenTrades).
      // 2. Remaining free slots go to freshly-qualified coins by priority.
      // ─────────────────────────────────────────────────────────────
      try {
        await this.allocateAutoTrades(discoveredSymbols, finalSignals);
        const queued = this.reentryQueue.length;
        if (queued > 0) {
          console.log(`MarketDataEngine: Re-entry queue (FIFO): ${queued} waiting → [${this.reentryQueue.join(', ')}]`);
        }
      } catch (allocErr: any) {
        console.error('MarketDataEngine: Auto-trade allocation error:', allocErr.message);
      }

      // ─────────────────────────────────────────────────────────────
      // REVERSAL INTELLIGENCE PASS
      // Phase 1: advisory evidence layer for coins with fresh signals or
      // strong heat. Seeds the 4 extra TFs once via REST, then computes the
      // MTF historical reversal score and attaches it to state.reversalIntel.
      // This is NOT a gate — it only adds evidence for the frontend panel.
      // ─────────────────────────────────────────────────────────────
      try {
        const signalSymbols = finalSignals.map(s => s.symbol);
        const hotSymbols = heatCandidates
          .filter(c => c.heatConfirmed)
          .sort((a, b) => (b.rsi5m > 70 || b.rsi5m < 30 ? Math.abs(b.rsi5m - 50) : 0) - (a.rsi5m > 70 || a.rsi5m < 30 ? Math.abs(a.rsi5m - 50) : 0))
          .slice(0, 8)
          .map(c => c.symbol);
        const reversalSymbols = Array.from(new Set([...signalSymbols, ...hotSymbols, ...(this.focusedSymbol ? [this.focusedSymbol.toUpperCase()] : [])])).slice(0, 14);

        if (reversalSymbols.length > 0) {
          await this.seedReversalHistories(reversalSymbols);
          for (const sym of reversalSymbols) {
            this.refreshReversalIntel(sym);
          }
          console.log(`MarketDataEngine: Reversal intel refreshed for ${reversalSymbols.length} symbols (${Date.now() - pipelineStart}ms total)`);
        }
      } catch (reversalErr: any) {
        console.error('MarketDataEngine: Reversal intelligence pass error:', reversalErr.message);
      }

      // Dynamic next interval tuned for quick Godzilla-style momentum trades:
      //   - positions open      -> 10s (SL/TP/trailing must stay fresh)
      //   - free slots in AUTO  -> 15s (hunt momentum fast, don't miss the move)
      //   - otherwise (scanning)-> 30s (rests the REST budget)
      const activePositions = this.paperEngine.getPositions();
      const slotsFree = (this.autoTradeConfig.maxOpenTrades || 1) - activePositions.length > 0;
      let nextInterval = 30000;
      if (activePositions.length > 0) nextInterval = 10000;
      else if (slotsFree && this.autoTradeConfig.mode === 'AUTO') nextInterval = 15000;

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
