import http from 'http';
import express, { Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { MarketDataEngine } from './MarketDataEngine';
import { PaperOrderIntent, PaperPosition } from '@chuchu/shared';
import { StatePersistence, PersistedPaperState } from './StatePersistence';

export interface ServerApp {
  app: express.Application;
  httpServer: http.Server;
  io: SocketIOServer;
  dataEngine: MarketDataEngine;
  start: (port?: number) => Promise<void>;
}

export function createServer(symbols: string[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']): ServerApp {
  const app = express();
  app.use(express.json());

  // Enable CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  const dataEngine = new MarketDataEngine(symbols);

  // ─────────────────────────────────────────────────────────────
  // PERSISTENCE — paper balance, open positions, full trade history
  // and auto-trade config survive restarts. Only /api/v1/reset clears.
  // ─────────────────────────────────────────────────────────────
  const persistence = new StatePersistence();
  const savedState = persistence.load();
  if (savedState) {
    dataEngine.paperEngine.restoreState({
      balance: savedState.balance,
      positions: savedState.positions,
      trades: savedState.trades
    });
    if (savedState.autoTradeConfig) {
      dataEngine.autoTradeConfig = { ...dataEngine.autoTradeConfig, ...savedState.autoTradeConfig };
      dataEngine.applyTrailingConfig();
    }
    console.log(`StatePersistence: restored balance=$${dataEngine.paperEngine.getBalance().toFixed(2)} positions=${dataEngine.paperEngine.getPositions().length} trades=${dataEngine.paperEngine.getTradeHistory().length} from ${persistence.getFilePath()}`);
  } else {
    console.log(`StatePersistence: no state file at ${persistence.getFilePath()} — starting fresh ($100 paper demo)`);
  }

  const persistNow = (): void => {
    const state: PersistedPaperState = {
      version: 1,
      savedAt: Date.now(),
      balance: dataEngine.paperEngine.getBalance(),
      positions: dataEngine.paperEngine.getPositions(),
      trades: dataEngine.paperEngine.getTradeHistory(),
      autoTradeConfig: dataEngine.autoTradeConfig
    };
    persistence.save(state);
  };

  // ─────────────────────────────────────────────────────────────
  // Throttled Socket.io broadcasting
  // engine:update is per-symbol rate-limited to ~7Hz (150ms window).
  // paper:update (full positions + history snapshot) is rate-limited
  // to ~1Hz because it rarely changes between ticks. This prevents
  // flooding clients during high-frequency tick streams.
  // ─────────────────────────────────────────────────────────────
  const ENGINE_UPDATE_MIN_INTERVAL_MS = 150;
  const PAPER_UPDATE_MIN_INTERVAL_MS = 1000;
  const lastEngineEmit: Map<string, number> = new Map();
  let lastPaperEmit = 0;
  let paperDirty = false;

  const emitPaperUpdate = (force = false): void => {
    const now = Date.now();
    if (!force && now - lastPaperEmit < PAPER_UPDATE_MIN_INTERVAL_MS && !paperDirty) return;
    lastPaperEmit = now;
    paperDirty = false;
    io.emit('paper:update', {
      balance: dataEngine.paperEngine.getBalance(),
      positions: dataEngine.paperEngine.getPositions(),
      tradeHistory: dataEngine.paperEngine.getTradeHistory()
    });
  };

  dataEngine.addListener((state) => {
    const now = Date.now();
    const last = lastEngineEmit.get(state.symbol) || 0;
    if (now - last >= ENGINE_UPDATE_MIN_INTERVAL_MS) {
      lastEngineEmit.set(state.symbol, now);
      io.emit('engine:update', state);
    }
    emitPaperUpdate();
  });

  // Mark paper data dirty whenever trades execute so the next 1s window
  // broadcasts immediately and no execution is ever missed.
  dataEngine.onTrade(() => {
    paperDirty = true;
    emitPaperUpdate();
    persistNow();
  });

  // Broadcast trade executions (both manual and auto-executed/TP-SL closed) over Socket.io
  dataEngine.onTrade((trade) => {
    io.emit('trade:executed', trade);
  });

  // REST API Routes
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'OK',
      timestamp: Date.now(),
      symbolsTracked: symbols.length,
      paperBalance: dataEngine.paperEngine.getBalance()
    });
  });

  app.get('/api/v1/states', (req: Request, res: Response) => {
    res.json({
      states: dataEngine.getAllStates()
    });
  });

  app.get('/api/v1/state/:symbol', (req: Request, res: Response) => {
    const symbol = req.params.symbol.toUpperCase();
    const state = dataEngine.getSymbolState(symbol);
    if (!state) {
      return res.status(404).json({ error: `Symbol ${symbol} not tracked` });
    }
    res.json(state);
  });

  app.get('/api/v1/scanner', (req: Request, res: Response) => {
    const minHunterScore = req.query.minHunter ? Number(req.query.minHunter) : 40;
    const allStatesMap = new Map();
    for (const state of dataEngine.getAllStates()) {
      allStatesMap.set(state.symbol, state);
    }
    const candidates = dataEngine.scannerEngine.scan(allStatesMap, { minHunterScore });
    res.json({ candidates });
  });

  app.get('/api/v1/positions', (req: Request, res: Response) => {
    res.json({
      balance: dataEngine.paperEngine.getBalance(),
      positions: dataEngine.paperEngine.getPositions(),
      tradeHistory: dataEngine.paperEngine.getTradeHistory(),
      stats: dataEngine.paperEngine.getStats()
    });
  });

  app.get('/api/v1/paper/stats', (req: Request, res: Response) => {
    res.json({ stats: dataEngine.paperEngine.getStats() });
  });

  app.get('/api/v1/bybit/status', async (req: Request, res: Response) => {
    const client = dataEngine.bybitData;
    const result = await client.ping();
    res.json({
      configured: client.isConfigured(),
      reachable: result.reachable,
      latencyMs: result.latencyMs,
      authValid: result.authValid,
      // Exposed symbols only — never the key/secret
      baseUrl: process.env.BYBIT_BASE_URL || 'https://api.bybit.com'
    });
  });

  app.get('/api/v1/analytics', (req: Request, res: Response) => {
    const metrics = dataEngine.analyticsEngine.evaluate(dataEngine.paperEngine.getTradeHistory());
    res.json({ metrics });
  });

  // ─────────────────────────────────────────────────────────────
  // 4-STAGE DISCOVERY PIPELINE ENDPOINTS
  // ─────────────────────────────────────────────────────────────

  /** Stage 1: All dynamically discovered coins (20–50 coins, refreshed every 30s) */
  app.get('/api/v1/discovery', (req: Request, res: Response) => {
    const discovered = dataEngine.getDiscoveryList();
    res.json({
      count: discovered.length,
      lastRefresh: discovered[0]?.timestamp || null,
      coins: discovered
    });
  });

  /** Stage 2: Heat Hunter — coins in RSI heat zones with WMR(200) gate */
  app.get('/api/v1/heat', (req: Request, res: Response) => {
    const heatCandidates = dataEngine.getHeatCandidates();
    res.json({
      count: heatCandidates.length,
      overbought: heatCandidates.filter(c => c.heatZone === 'OVERBOUGHT').length,
      oversold: heatCandidates.filter(c => c.heatZone === 'OVERSOLD').length,
      nearOverbought: heatCandidates.filter(c => c.heatZone === 'NEAR_OVERBOUGHT').length,
      nearOversold: heatCandidates.filter(c => c.heatZone === 'NEAR_OVERSOLD').length,
      candidates: heatCandidates
    });
  });

  /** Full pipeline result: Stage 1 + Stage 2 + Stage 4 Final Signals */
  app.get('/api/v1/pipeline', (req: Request, res: Response) => {
    const result = dataEngine.getPipelineResult();
    if (!result) {
      return res.status(202).json({ message: 'Pipeline initializing, retry in 30s' });
    }
    res.json(result);
  });

  /** User Watchlist management */
  app.post('/api/v1/watchlist', (req: Request, res: Response) => {
    const { symbols } = req.body;
    if (!Array.isArray(symbols)) {
      return res.status(400).json({ error: 'symbols must be an array of strings' });
    }
    dataEngine.discoveryEngine.setWatchlist(symbols);
    res.json({ success: true, watchlist: symbols });
  });

  app.get('/api/v1/autotrade/config', (req: Request, res: Response) => {
    res.json({ config: dataEngine.autoTradeConfig });
  });

  app.post('/api/v1/autotrade/config', (req: Request, res: Response) => {
    const config = req.body;
    if (config) {
      dataEngine.autoTradeConfig = { ...dataEngine.autoTradeConfig, ...config };
      dataEngine.applyTrailingConfig();
      persistNow();
    }
    res.json({ success: true, config: dataEngine.autoTradeConfig });
  });

  // ── Trade history CSV export ─────────────────────────────────
  app.get('/api/v1/history/csv', (req: Request, res: Response) => {
    const trades = dataEngine.paperEngine.getTradeHistory();
    const header = ['timestamp', 'tradeId', 'symbol', 'side', 'fillPrice', 'openPrice', 'closePrice', 'openedAtUtc', 'closedAtUtc', 'quantity', 'notional', 'slippagePct', 'fee', 'fundingPaid', 'exitReason', 'netPnl', 'setupQuality', 'hunterScore', 'rsi', 'wmr', 'leverage'];
    const rows = trades.map((t) => {
      const ctx = t.context || {};
      const isClose = t.pnl !== undefined;
      return [
        new Date(t.timestamp).toISOString(),
        t.tradeId,
        t.symbol,
        t.side,
        t.fillPrice,
        t.openPrice ?? t.fillPrice,
        isClose ? t.fillPrice : '',
        t.openedAt ? new Date(t.openedAt).toISOString() : '',
        isClose ? new Date(t.timestamp).toISOString() : '',
        t.quantity,
        (t.fillPrice * t.quantity).toFixed(4),
        t.slippagePct ?? 0,
        t.fee ?? 0,
        t.fundingPaid ?? 0,
        t.exitReason || '',
        t.pnl ?? '',
        ctx.setupQuality ?? '',
        ctx.hunterScore ?? '',
        ctx.rsi ?? '',
        ctx.wmr ?? '',
        dataEngine.autoTradeConfig.leverage
      ];
    });
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [header.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="chuchu-trade-history-${Date.now()}.csv"`);
    res.send(csv);
  });

  // ── Real Binance account integration ──────────────────────────────
  app.get('/api/v1/exchange/status', async (req: Request, res: Response) => {
    try {
      const info = await dataEngine.exchangeExecutor.getAccountInfo();
      res.json(info);
    } catch (e: any) {
      res.status(500).json({ configured: true, error: e.message });
    }
  });

  app.post('/api/v1/exchange/keys', (req: Request, res: Response) => {
    const { apiKey, apiSecret } = req.body || {};
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'apiKey and apiSecret are required' });
    }
    dataEngine.exchangeExecutor.configure(apiKey, apiSecret);
    res.json({ success: true, configured: dataEngine.exchangeExecutor.isConfigured() });
  });

  app.post('/api/v1/exchange/disconnect', (req: Request, res: Response) => {
    dataEngine.exchangeExecutor.disconnect();
    res.json({ success: true, configured: false });
  });

  app.post('/api/v1/reset', (req: Request, res: Response) => {
    dataEngine.paperEngine.reset(100);
    io.emit('paper:update', {
      balance: dataEngine.paperEngine.getBalance(),
      positions: dataEngine.paperEngine.getPositions(),
      tradeHistory: dataEngine.paperEngine.getTradeHistory(),
      stats: dataEngine.paperEngine.getStats()
    });
    persistNow();
    res.json({ success: true, balance: 100 });
  });

  /**
   * Reset ONLY the trade history — balance and open positions are preserved.
   * History is never cleared by any backend process; only this explicit call.
   */
  app.post('/api/v1/reset/history', (req: Request, res: Response) => {
    const before = dataEngine.paperEngine.getTradeHistory().length;
    dataEngine.paperEngine.resetHistory();
    const state: PersistedPaperState = {
      version: 1,
      savedAt: Date.now(),
      balance: dataEngine.paperEngine.getBalance(),
      positions: dataEngine.paperEngine.getPositions(),
      trades: dataEngine.paperEngine.getTradeHistory(),
      autoTradeConfig: dataEngine.autoTradeConfig
    };
    persistence.save(state);
    io.emit('paper:update', {
      balance: dataEngine.paperEngine.getBalance(),
      positions: dataEngine.paperEngine.getPositions(),
      tradeHistory: dataEngine.paperEngine.getTradeHistory(),
      stats: dataEngine.paperEngine.getStats()
    });
    console.log(`StatePersistence: trade history cleared (${before} entries) — balance & positions kept`);
    res.json({ success: true, clearedTrades: before });
  });

  /**
   * Reset ONLY the demo balance back to $100 — trade history and open
   * positions are preserved so today's analysis stays intact.
   */
  app.post('/api/v1/reset/balance', (req: Request, res: Response) => {
    dataEngine.paperEngine.resetBalance(100);
    persistNow();
    io.emit('paper:update', {
      balance: dataEngine.paperEngine.getBalance(),
      positions: dataEngine.paperEngine.getPositions(),
      tradeHistory: dataEngine.paperEngine.getTradeHistory(),
      stats: dataEngine.paperEngine.getStats()
    });
    console.log('StatePersistence: demo balance reset to $100 (history + positions kept)');
    res.json({ success: true, balance: 100 });
  });

  app.get('/api/v1/focus', (req: Request, res: Response) => {
    res.json({ symbol: dataEngine.focusedSymbol });
  });

  app.post('/api/v1/focus', (req: Request, res: Response) => {
    const { symbol } = req.body;
    dataEngine.setFocusedSymbol(symbol);
    res.json({ success: true, symbol: dataEngine.focusedSymbol });
  });


  app.post('/api/v1/order', async (req: Request, res: Response) => {
    const intent: PaperOrderIntent = req.body;
    if (!intent || !intent.symbol || !intent.side || !intent.quantity) {
      return res.status(400).json({ error: 'Invalid order intent payload schema' });
    }
    if (!intent.leverage) intent.leverage = dataEngine.autoTradeConfig.leverage;

    const state = dataEngine.getSymbolState(intent.symbol);

    // NEVER fill at a hardcoded fallback price. Resolve the live price from
    // the tracked state first, then Bybit, then Binance REST. If none is
    // available the order is rejected — a garbage fill (e.g. $50000 on a
    // $0.13 coin) would otherwise poison PnL history.
    let lastPrice: number | null = state?.lastTick?.price || null;
    if (!lastPrice || lastPrice <= 0) {
      lastPrice = await dataEngine.bybitData.getTickerPrice(intent.symbol);
    }
    if (!lastPrice || lastPrice <= 0) {
      lastPrice = await dataEngine.restManager.getTickerPrice(intent.symbol);
    }
    if (!lastPrice || lastPrice <= 0) {
      console.error(`MarketDataEngine: Refused order for ${intent.symbol} — no live price available`);
      return res.status(503).json({ error: `No live price available for ${intent.symbol} — order rejected` });
    }

    const trade = dataEngine.paperEngine.executeOrder(intent, state?.depth, lastPrice);

    // If this manual order closed out the position, start the re-entry cooldown
    const remaining = dataEngine.paperEngine.getPositions().some(p => p.symbol === intent.symbol);
    if (!remaining) dataEngine.markTradeExit(intent.symbol);

    io.emit('trade:executed', trade);
    persistNow();
    res.json({ success: true, trade });
  });

  /**
   * Per-position trailing-stop manager for open trades.
   * body: { symbol, action: 'enable' | 'update' | 'disable', distancePct?, activationPct? }
   */
  app.post('/api/v1/trailing', (req: Request, res: Response) => {
    const { symbol, action, distancePct, activationPct } = req.body || {};
    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({ error: 'Invalid payload — symbol required' });
    }

    const engine = dataEngine.paperEngine;
    let position: PaperPosition | null | undefined;

    if (action === 'enable') {
      position = engine.enableTrailing(symbol.toUpperCase(), Number(distancePct) || 0.6, Number(activationPct) || 0);
      if (!position) return res.status(400).json({ error: `Cannot enable trailing — no open position for ${symbol}` });
    } else if (action === 'update') {
      position = engine.updateTrailing(symbol.toUpperCase(), Number(distancePct) || 0.6);
      if (!position) return res.status(400).json({ error: `Cannot update trailing — trailing not active or no open position for ${symbol}` });
    } else if (action === 'disable') {
      position = engine.disableTrailing(symbol.toUpperCase());
      if (!position) return res.status(400).json({ error: `Cannot disable trailing — no open position for ${symbol}` });
    } else {
      return res.status(400).json({ error: 'Invalid action — use enable | update | disable' });
    }

    io.emit('paper:update', {
      balance: engine.getBalance(),
      positions: engine.getPositions(),
      tradeHistory: engine.getTradeHistory(),
      stats: engine.getStats()
    });
    persistNow();
    res.json({ success: true, position });
  });

  const start = async (port: number = 8080): Promise<void> => {
    await dataEngine.initialize();
    dataEngine.startWebsocket();

    // Periodic autosave — catches funding accrual / balance drift between trades.
    setInterval(() => persistNow(), 20000);

    // Broadcast system time and exact API latency to the frontend every 3 seconds
    setInterval(async () => {
      const pingStart = Date.now();
      try {
        // Use the internal axios client to ping Binance for true REST latency
        const res = await (dataEngine.restManager as any).client.get('/fapi/v1/time');
        const pingEnd = Date.now();
        const latency = pingEnd - pingStart;
        const serverTime = res.data.serverTime;
        
        io.emit('system:time', {
          utcTime: new Date(serverTime).toISOString().split('T')[1].split('.')[0] + ' UTC',
          latencyMs: latency,
          timestamp: serverTime
        });
      } catch (e) {
        io.emit('system:time', {
          utcTime: new Date().toISOString().split('T')[1].split('.')[0] + ' UTC',
          latencyMs: 999,
          timestamp: Date.now()
        });
      }
    }, 3000);

    httpServer.listen(port, () => {
      console.log(`CHUCHU Backend Server listening on http://localhost:${port}`);
    });
  };

  return { app, httpServer, io, dataEngine, start };
}
