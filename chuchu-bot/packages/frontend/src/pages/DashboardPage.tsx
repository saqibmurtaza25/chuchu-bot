import React, { useState } from 'react';
import { useChuchuStore } from '../store/useChuchuStore';
import { CoinCard } from '../components/CoinCard';
import {
  LayoutGrid,
  RefreshCw,
  Search,
  Activity,
  Clock,
  DollarSign
} from 'lucide-react';
import { formatPrice } from '../utils/formatting';

export const DashboardPage: React.FC = () => {
  const {
    states,
    paperBalance,
    isConnected,
    fetchStateSnapshots
  } = useChuchuStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'HOT' | 'HEATING' | 'MAJORS'>('ALL');

  const symbolList = Array.from(states.values());

  // Filter by search term
  const searchFiltered = symbolList.filter(s => s.symbol.toLowerCase().includes(searchTerm.toLowerCase()));

  // Category counts
  const hotCoins = searchFiltered.filter(s => (s.hunter?.hunterScore || 0) >= 60);
  const heatingCoins = searchFiltered.filter(s => (s.hunter?.hunterScore || 0) >= 40 && (s.hunter?.hunterScore || 0) < 60);
  const majorCoins = searchFiltered.filter(s => ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'].includes(s.symbol));

  const displayedList = searchFiltered.filter(s => {
    if (activeTab === 'HOT') return (s.hunter?.hunterScore || 0) >= 60;
    if (activeTab === 'HEATING') return (s.hunter?.hunterScore || 0) >= 40 && (s.hunter?.hunterScore || 0) < 60;
    if (activeTab === 'MAJORS') return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'].includes(s.symbol);
    return true;
  });

  // SORT BY HIGHEST OVERBOUGHT / OVERSOLD PROBABILITY EXTREME
  displayedList.sort((a, b) => {
    const probA = Math.abs((a.longPct || 50) - 50);
    const probB = Math.abs((b.longPct || 50) - 50);
    if (probB !== probA) return probB - probA;

    const rsiA = Math.abs((a.indicators?.rsi14 || 50) - 50);
    const rsiB = Math.abs((b.indicators?.rsi14 || 50) - 50);
    return rsiB - rsiA;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 font-sans text-chuchu-text">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-chuchu-text tracking-tight flex items-center space-x-2.5">
            <LayoutGrid className="w-6 h-6 text-chuchu-cyan" />
            <span>CHUCHU BOT</span>
          </h1>
          <p className="text-xs text-chuchu-muted mt-1 font-semibold">
            Built for High-Probability Scalping • Binance Futures Real-Time Engine
          </p>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-chuchu-muted absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search Symbol (e.g. BTC, SOL)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 rounded-lg bg-chuchu-card border border-chuchu-border text-xs text-chuchu-text focus:outline-none focus:border-chuchu-cyan w-full font-sans"
            />
          </div>

          <button
            onClick={() => fetchStateSnapshots()}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-chuchu-card text-chuchu-cyan text-xs font-bold border border-chuchu-cyan/30 hover:bg-chuchu-cyan/10 transition-all duration-150 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${!isConnected ? 'animate-spin' : ''}`} />
            <span>REFRESH</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-chuchu-border flex items-center justify-between">
          <div>
            <div className="text-[11px] text-chuchu-muted font-bold uppercase tracking-wider">PAPER BALANCE</div>
            <div className="text-lg font-black text-chuchu-green num-font mt-0.5">
              ${formatPrice(paperBalance)}
            </div>
          </div>
          <div className="p-2.5 bg-chuchu-green/10 rounded-lg text-chuchu-green border border-chuchu-green/20">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-chuchu-border flex items-center justify-between">
          <div>
            <div className="text-[11px] text-chuchu-muted font-bold uppercase tracking-wider font-sans">HOT MOMENTUM CANDIDATES</div>
            <div className="text-lg font-black text-chuchu-cyan num-font mt-0.5">
              {hotCoins.length} QUALIFIED (≥60)
            </div>
          </div>
          <div className="p-2.5 bg-chuchu-cyan/10 rounded-lg text-chuchu-cyan border border-chuchu-cyan/20">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-chuchu-border flex items-center justify-between">
          <div>
            <div className="text-[11px] text-chuchu-muted font-bold uppercase tracking-wider font-sans">SOCKET STREAM STATUS</div>
            <div className="text-xs font-bold text-chuchu-text flex items-center space-x-1.5 mt-1">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'}`} />
              <span>{isConnected ? 'LIVE 100ms TICK' : 'CONNECTING...'}</span>
            </div>
          </div>
          <div className="p-2.5 bg-chuchu-panel rounded-lg text-chuchu-muted border border-chuchu-border">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Presentation Layer UI Grouping Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-chuchu-border/60 pb-3">
        <div className="flex items-center space-x-2">
          {[
            { id: 'ALL', label: `ALL MARKETS (${searchFiltered.length})` },
            { id: 'HOT', label: `🔥 HOT (≥60) (${hotCoins.length})` },
            { id: 'HEATING', label: `⚡ HEATING (40-59) (${heatingCoins.length})` },
            { id: 'MAJORS', label: `📌 MAJORS (${majorCoins.length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold tracking-wider transition-all duration-150 ${
                activeTab === tab.id
                  ? 'bg-chuchu-cyan text-black shadow-md'
                  : 'bg-chuchu-panel/60 text-chuchu-muted hover:text-chuchu-text border border-chuchu-border/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-chuchu-muted font-medium">
          Original Hunting Logic Preserved (RSI + W%R MTF Weighting)
        </span>
      </div>

      {/* Grid of 22-Metric Coin Cards */}
      <div className="space-y-3">
        {activeTab === 'HOT' && hotCoins.length === 0 && (
          <div className="p-4 bg-chuchu-yellow/10 border border-chuchu-yellow/30 rounded-xl text-chuchu-yellow text-xs font-bold flex items-center space-x-2">
            <Activity className="w-4 h-4 shrink-0" />
            <span>Market Regime is Quiet — 0 Coins currently meet strict Hot Candidate criteria (Hunter $\ge 60$). Switch to HEATING or ALL MARKETS tab to inspect developing pairs.</span>
          </div>
        )}

        {displayedList.length === 0 ? (
          <div className="glass-panel rounded-xl p-12 text-center text-chuchu-muted space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-chuchu-cyan" />
            <div>No coins match the active filter or connecting to WebSocket...</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
            {displayedList.map((state) => (
              <CoinCard key={state.symbol} state={state} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
