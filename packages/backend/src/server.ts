import http from 'http';
import express, { Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { MarketDataEngine } from './MarketDataEngine';
import { PaperOrderIntent } from '@chuchu/shared';

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
    }
    res.json({ success: true, config: dataEngine.autoTradeConfig });
  });

  app.post('/api/v1/reset', (req: Request, res: Response) => {
    dataEngine.paperEngine.reset(100);
    io.emit('paper:update', {
      balance: dataEngine.paperEngine.getBalance(),
      positions: dataEngine.paperEngine.getPositions(),
      tradeHistory: dataEngine.paperEngine.getTradeHistory(),
      stats: dataEngine.paperEngine.getStats()
    });
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


  app.post('/api/v1/order', (req: Request, res: Response) => {
    const intent: PaperOrderIntent = req.body;
    if (!intent || !intent.symbol || !intent.side || !intent.quantity) {
      return res.status(400).json({ error: 'Invalid order intent payload schema' });
    }
    if (!intent.leverage) intent.leverage = dataEngine.autoTradeConfig.leverage;

    const state = dataEngine.getSymbolState(intent.symbol);
    const lastPrice = state?.lastTick?.price || 50000;
    const trade = dataEngine.paperEngine.executeOrder(intent, state?.depth, lastPrice);

    io.emit('trade:executed', trade);
    res.json({ success: true, trade });
  });

  const start = async (port: number = 8080): Promise<void> => {
    await dataEngine.initialize();
    dataEngine.startWebsocket();

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
