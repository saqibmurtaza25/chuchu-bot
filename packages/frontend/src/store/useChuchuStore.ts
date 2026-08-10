import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { AggregatedSymbolState, PaperPosition, PaperTrade, PaperStats, AnalyticsMetrics, ScanPipelineResult, AutoTradeConfig } from '@chuchu/shared';
import { TimezoneMode } from '../utils/formatting';

export type ActivePage = 'dashboard' | 'scanner' | 'signals' | 'paper-trading' | 'analytics' | 'settings' | 'health' | 'sniper';

interface ChuchuState {
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;
  
  isConnected: boolean;
  socket: Socket | null;
  serverUrl: string;
  
  states: Map<string, AggregatedSymbolState>;
  selectedSymbol: string;
  setSelectedSymbol: (symbol: string) => void;

  paperBalance: number;
  positions: PaperPosition[];
  tradeHistory: PaperTrade[];
  paperStats: PaperStats | null;
  analytics: AnalyticsMetrics | null;
  pipeline: ScanPipelineResult | null;
  pipelineLoading: boolean;
  systemTime: { utcTime: string; latencyMs: number; timestamp: number } | null;
  timezone: TimezoneMode;
  setTimezone: (tz: TimezoneMode) => void;

  autoTradeConfig: AutoTradeConfig;
  setAutoTradeConfig: (config: Partial<AutoTradeConfig>) => Promise<void>;
  fetchAutoTradeConfig: () => Promise<void>;

  exchangeStatus: { configured: boolean; balanceUsdt: number; source: string | null; error?: string } | null;
  fetchExchangeStatus: () => Promise<void>;
  saveExchangeKeys: (apiKey: string, apiSecret: string) => Promise<boolean>;
  disconnectExchange: () => Promise<void>;

  connect: (url?: string) => void;
  disconnect: () => void;
  submitOrder: (symbol: string, side: 'BUY' | 'SELL', quantity: number) => Promise<void>;
  closePosition: (symbol: string) => Promise<void>;
  fetchStateSnapshots: () => Promise<void>;
  fetchPipeline: () => Promise<void>;
  resetPaperAccount: () => Promise<void>;
  focusedSymbol: string | null;
  setFocusedSymbol: (symbol: string | null) => Promise<void>;
}

export const useChuchuStore = create<ChuchuState>((set, get) => {
  // Batch incoming engine:update messages into a single state write every 100ms.
  // This bounds React re-renders to ~10fps regardless of the underlying tick
  // stream rate, keeping the UI responsive during high-frequency updates.
  let pendingStates: AggregatedSymbolState[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let snapshotPollTimer: ReturnType<typeof setInterval> | null = null;

  const enqueueStateUpdate = (updatedState: AggregatedSymbolState): void => {
    pendingStates.push(updatedState);
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const batch = pendingStates;
      pendingStates = [];
      if (batch.length === 0) return;
      set((prev) => {
        const newStates = new Map(prev.states);
        for (const st of batch) newStates.set(st.symbol, st);
        return { states: newStates };
      });
    }, 100);
  };

  return ({
  activePage: 'dashboard',
  setActivePage: (page) => set({ activePage: page }),

  isConnected: false,
  socket: null,
  serverUrl: (import.meta.env.VITE_SERVER_URL as string | undefined) || '',

  states: new Map(),
  selectedSymbol: 'BTCUSDT',
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

  paperBalance: 100,
  positions: [],
  tradeHistory: [],
  paperStats: null,
  analytics: null,
  pipeline: null,
  pipelineLoading: false,
  systemTime: null,
  focusedSymbol: null,
  timezone: 'LOCAL',
  setTimezone: (tz) => set({ timezone: tz }),

  autoTradeConfig: {
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
  },

  exchangeStatus: null,
  fetchExchangeStatus: async () => {
    try {
      const res = await fetch(`${get().serverUrl}/api/v1/exchange/status`);
      const data = await res.json();
      set({ exchangeStatus: data });
    } catch (err) {
      console.error('Failed to fetch exchange status:', err);
    }
  },
  saveExchangeKeys: async (apiKey, apiSecret) => {
    try {
      const res = await fetch(`${get().serverUrl}/api/v1/exchange/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, apiSecret })
      });
      const ok = (await res.json()).success === true;
      if (ok) await get().fetchExchangeStatus();
      return ok;
    } catch (err) {
      console.error('Failed to save exchange keys:', err);
      return false;
    }
  },
  disconnectExchange: async () => {
    try {
      await fetch(`${get().serverUrl}/api/v1/exchange/disconnect`, { method: 'POST' });
      await get().fetchExchangeStatus();
    } catch (err) {
      console.error('Failed to disconnect exchange:', err);
    }
  },

  setAutoTradeConfig: async (configUpdate) => {
    // Optimistic UI update
    set((state) => ({
      autoTradeConfig: { ...state.autoTradeConfig, ...configUpdate }
    }));
    
    try {
      const url = get().serverUrl;
      await fetch(`${url}/api/v1/autotrade/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(get().autoTradeConfig)
      });
    } catch (err) {
      console.error('Failed to sync AutoTrade config:', err);
    }
  },

  fetchAutoTradeConfig: async () => {
    try {
      const res = await fetch(`${get().serverUrl}/api/v1/autotrade/config`);
      const data = await res.json();
      if (data && data.config) set({ autoTradeConfig: data.config });
    } catch (err) {
      console.error('Failed to fetch auto-trade config:', err);
    }
  },

  connect: (url) => {
    const targetUrl = url || get().serverUrl;
    if (get().socket) get().socket?.disconnect();

    const socket = io(targetUrl || undefined, {
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      set({ isConnected: true, socket });
      get().fetchStateSnapshots();
      get().fetchPipeline();
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    socket.on('engine:update', (updatedState: AggregatedSymbolState) => {
      enqueueStateUpdate(updatedState);
    });

    socket.on('trade:executed', (trade: PaperTrade) => {
      set((prev) => ({
        tradeHistory: [trade, ...prev.tradeHistory]
      }));
      get().fetchStateSnapshots();
    });

    socket.on('paper:update', (data: { balance: number; positions: PaperPosition[]; tradeHistory: PaperTrade[]; stats?: PaperStats }) => {
      set({
        paperBalance: data.balance,
        positions: data.positions,
        tradeHistory: data.tradeHistory,
        paperStats: data.stats || get().paperStats
      });
    });

    socket.on('system:time', (data: { utcTime: string; latencyMs: number; timestamp: number }) => {
      set({ systemTime: data });
    });

    // Start 3-second periodic REST snapshot fallback to guarantee 0-delay state refresh
    if (snapshotPollTimer) clearInterval(snapshotPollTimer);
    snapshotPollTimer = setInterval(() => {
      if (get().isConnected) {
        get().fetchStateSnapshots();
      }
    }, 3000);
  },

  disconnect: () => {
    const s = get().socket;
    if (s) s.disconnect();
    if (snapshotPollTimer) clearInterval(snapshotPollTimer);
    snapshotPollTimer = null;
    set({ isConnected: false, socket: null });
  },

  fetchStateSnapshots: async () => {
    try {
      const url = get().serverUrl;
      const res = await fetch(`${url}/api/v1/states`);
      const data = await res.json();
      if (data.states && Array.isArray(data.states)) {
        const map = new Map<string, AggregatedSymbolState>();
        for (const s of data.states) {
          map.set(s.symbol, s);
        }
        set({ states: map });
      }

      const posRes = await fetch(`${url}/api/v1/positions`);
      const posData = await posRes.json();
      if (posData) {
        set({
          paperBalance: posData.balance !== undefined ? posData.balance : 100,
          positions: posData.positions || [],
          tradeHistory: posData.tradeHistory || [],
          paperStats: posData.stats || get().paperStats
        });
      }

      const anaRes = await fetch(`${url}/api/v1/analytics`);
      const anaData = await anaRes.json();
      if (anaData && anaData.metrics) {
        set({ analytics: anaData.metrics });
      }

      // Fetch auto-trade config
      const autoRes = await fetch(`${url}/api/v1/autotrade/config`);
      const autoData = await autoRes.json();
      if (autoData && autoData.config) {
        set({ autoTradeConfig: autoData.config });
      }
    } catch (err) {
      console.error('Failed to fetch initial snapshots:', err);
    }
  },

  fetchPipeline: async () => {
    const url = get().serverUrl;
    set({ pipelineLoading: true });
    try {
      const res = await fetch(`${url}/api/v1/pipeline`);
      if (res.status === 202) return; // Still initializing
      const data: ScanPipelineResult = await res.json();
      set({ pipeline: data });
    } catch (err) {
      console.error('fetchPipeline failed:', err);
    } finally {
      set({ pipelineLoading: false });
    }
  },

  submitOrder: async (symbol, side, quantity) => {
    try {
      const url = get().serverUrl;
      const res = await fetch(`${url}/api/v1/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          side,
          type: 'MARKET',
          quantity
        })
      });
      const data = await res.json();
      if (data.success) {
        get().fetchStateSnapshots();
      }
    } catch (err) {
      console.error('Order submission failed:', err);
    }
  },

  closePosition: async (symbol) => {
    const pos = get().positions.find((p) => p.symbol === symbol);
    if (!pos || pos.quantity <= 0) return;
    const closingSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
    await get().submitOrder(symbol, closingSide, pos.quantity);
  },

  resetPaperAccount: async () => {
    try {
      const url = get().serverUrl;
      const res = await fetch(`${url}/api/v1/reset`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        set({
          paperBalance: data.balance,
          positions: [],
          tradeHistory: []
        });
      }
    } catch (err) {
      console.error('Reset paper account failed:', err);
    }
  },

  setFocusedSymbol: async (symbol) => {
    set({ focusedSymbol: symbol });
    try {
      const url = get().serverUrl;
      await fetch(`${url}/api/v1/focus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });
      // Force snapshot & pipeline refresh
      get().fetchStateSnapshots();
      get().fetchPipeline();
    } catch (err) {
      console.error('Failed to sync focused symbol:', err);
    }
  }
  });
});
