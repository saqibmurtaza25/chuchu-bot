import React, { useState } from 'react';
import { useChuchuStore } from '../store/useChuchuStore';
import {
  Terminal,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  DollarSign,
  Activity,
  History,
  Clock,
  XCircle,
  ShieldAlert,
  Calendar,
  PieChart,
  Trophy,
  RefreshCw,
  Download
} from 'lucide-react';
import { formatPrice, formatTime, formatLatencyDelay } from '../utils/formatting';

const StatBox: React.FC<{ label: string; value: string; accent: string }> = ({ label, value, accent }) => (
  <div className="p-2.5 bg-chuchu-card/60 rounded-lg border border-chuchu-border">
    <div className="text-[9px] text-chuchu-muted font-bold tracking-wider uppercase mb-1">{label}</div>
    <div className={`text-sm font-black num-font ${accent}`}>{value}</div>
  </div>
);

export const PaperTradingPage: React.FC = () => {
  const {
    states,
    selectedSymbol,
    setSelectedSymbol,
    paperBalance,
    positions,
    tradeHistory,
    paperStats,
    submitOrder,
    closePosition,
    timezone,
    resetPaperAccount,
    serverUrl
  } = useChuchuStore();

  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState<number>(1.0);
  const [historyTab, setHistoryTab] = useState<'CARDS' | 'TABLE'>('CARDS');
  const [timeFilter, setTimeFilter] = useState<'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'ALL'>('TODAY');

  const handleDownloadCsv = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/v1/history/csv`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chuchu-trade-history-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV download failed:', err);
    }
  };

  const symbolList = Array.from(states.keys());
  const activeState = states.get(selectedSymbol);
  const markPrice = activeState?.lastTick?.price || 50000;
  const depth = activeState?.depth;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0) return;
    submitOrder(selectedSymbol, side, quantity);
  };

  // Total unrealized PnL
  const totalUnrealizedPnL = positions.reduce((acc, pos) => {
    const livePrice = states.get(pos.symbol)?.lastTick?.price || pos.markPrice;
    const uPnL = pos.side === 'LONG'
      ? (livePrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - livePrice) * pos.quantity;
    return acc + uPnL;
  }, 0);

  // Trade History Filtering & KPIs
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  
  const filteredHistory = tradeHistory.filter(trade => {
    if (timeFilter === 'ALL') return true;
    const diff = now - trade.timestamp;
    if (timeFilter === 'TODAY') return diff <= dayMs;
    if (timeFilter === 'YESTERDAY') return diff > dayMs && diff <= dayMs * 2;
    if (timeFilter === 'WEEK') return diff <= dayMs * 7;
    if (timeFilter === 'MONTH') return diff <= dayMs * 30;
    return true;
  });

  const kpis = {
    trades: filteredHistory.length,
    closes: filteredHistory.filter(t => t.pnl !== undefined).length,
    wins: filteredHistory.filter(t => t.pnl && t.pnl > 0).length,
    losses: filteredHistory.filter(t => t.pnl && t.pnl <= 0).length,
    netPnl: filteredHistory.reduce((sum, t) => sum + (t.pnl || 0), 0)
  };
  const winRate = (kpis.wins + kpis.losses) > 0 ? (kpis.wins / (kpis.wins + kpis.losses)) * 100 : 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 font-sans text-chuchu-text">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-chuchu-text tracking-wider flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-chuchu-cyan" />
            <span>INSTITUTIONAL PAPER EXECUTION TERMINAL</span>
          </h1>
          <p className="text-xs text-chuchu-muted mt-0.5 font-medium">
            Simulated order execution against live Binance L2 orderbook depth with dynamic slippage &amp; fee model
          </p>
          <p className="text-[10px] text-chuchu-yellow/70 mt-0.5 font-bold">
            AUTO-SAVED — balance, open positions &amp; full history continue after restart. Reset only clears when you press RESET.
          </p>
        </div>

        <div className="flex items-center space-x-4 text-xs">
          <div className="flex items-center space-x-2 bg-chuchu-card px-3 py-2 rounded-lg border border-chuchu-border">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="text-chuchu-muted font-sans">AVAILABLE USDT:</span>
            <span className="text-emerald-400 font-black text-sm num-font">
              ${formatPrice(paperBalance)}
            </span>
          </div>

          <button
            onClick={() => {
              if (window.confirm("Are you sure you want to reset your paper trading balance to $100, clear active positions and delete all trade history?")) {
                resetPaperAccount();
              }
            }}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-rose-500/10 text-rose-300 text-xs font-bold border border-rose-500/30 hover:bg-rose-500/20 transition-all duration-150 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>RESET</span>
          </button>

          <div className="flex items-center space-x-2 bg-chuchu-card px-3 py-2 rounded-lg border border-chuchu-border">
            <Activity className="w-4 h-4 text-chuchu-cyan" />
            <span className="text-chuchu-muted font-sans">UNREALIZED PNL:</span>
            <span className={`font-black text-sm num-font ${totalUnrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalUnrealizedPnL >= 0 ? `+$${totalUnrealizedPnL.toFixed(2)}` : `-$${Math.abs(totalUnrealizedPnL).toFixed(2)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Main Terminal Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Order Form Column */}
        <div className="lg:col-span-4 glass-panel rounded-xl p-5 border border-chuchu-border space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-chuchu-border">
            <span className="text-sm font-bold text-chuchu-text">ORDER EXECUTION</span>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="bg-chuchu-bg border border-chuchu-border text-chuchu-cyan px-3 py-1 rounded text-xs font-bold focus:outline-none"
            >
              {symbolList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Side Toggle */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-chuchu-bg rounded border border-chuchu-border">
              <button
                type="button"
                onClick={() => setSide('BUY')}
                className={`py-2 rounded font-bold text-xs transition-all ${
                  side === 'BUY' ? 'bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'text-chuchu-muted'
                }`}
              >
                LONG / BUY
              </button>
              <button
                type="button"
                onClick={() => setSide('SELL')}
                className={`py-2 rounded font-bold text-xs transition-all ${
                  side === 'SELL' ? 'bg-rose-500 text-white shadow-[0_0_10px_rgba(244,63,94,0.3)]' : 'text-chuchu-muted'
                }`}
              >
                SHORT / SELL
              </button>
            </div>

            {/* Order Type Display */}
            <div className="text-xs space-y-1">
              <span className="text-chuchu-muted">ORDER TYPE:</span>
              <div className="w-full p-2 bg-chuchu-bg rounded border border-chuchu-border text-chuchu-text font-bold">
                MARKET (L2 DEPTH MATCHED)
              </div>
            </div>

            {/* Price Display */}
            <div className="text-xs space-y-1">
              <span className="text-chuchu-muted">MARKET PRICE:</span>
              <div className="w-full p-2 bg-chuchu-bg rounded border border-chuchu-border text-chuchu-cyan font-bold text-sm">
                ${markPrice > 0 ? formatPrice(markPrice) : '---'}
              </div>
            </div>

            {/* Quantity Input */}
            <div className="text-xs space-y-1">
              <span className="text-chuchu-muted">QUANTITY:</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={quantity}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                className="w-full p-2 bg-chuchu-bg border border-chuchu-border text-chuchu-text font-bold rounded focus:outline-none focus:border-chuchu-cyan"
              />
            </div>

            {/* Order Cost Est */}
            <div className="p-3 bg-chuchu-bg/60 rounded border border-chuchu-border/50 text-xs space-y-1">
              <div className="flex justify-between text-chuchu-muted">
                <span>EST NOTIONAL:</span>
                <span className="text-chuchu-text font-bold">${formatPrice(markPrice * quantity)} USDT</span>
              </div>
              <div className="flex justify-between text-chuchu-muted">
                <span>TAKER FEE (0.04%):</span>
                <span className="text-chuchu-text font-bold">${(markPrice * quantity * 0.0004).toFixed(2)} USDT</span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className={`w-full py-3 rounded font-bold text-xs flex items-center justify-center space-x-2 transition-all duration-150 ${
                side === 'BUY'
                  ? 'bg-emerald-500 text-black hover:bg-emerald-400 font-black'
                  : 'bg-rose-500 text-white hover:bg-rose-400 font-black'
              }`}
            >
              {side === 'BUY' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              <span>SUBMIT PAPER {side} ORDER</span>
            </button>
          </form>
        </div>

        {/* Live Orderbook Ladder Column */}
        <div className="lg:col-span-8 glass-panel rounded-xl p-5 border border-chuchu-border space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-chuchu-border">
            <span className="text-sm font-bold text-chuchu-text flex items-center space-x-2">
              <Layers className="w-4 h-4 text-chuchu-cyan" />
              <span>LIVE L2 ORDERBOOK DEPTH ({selectedSymbol})</span>
            </span>
            <span className="text-xs text-chuchu-muted">100ms Streaming Snapshot</span>
          </div>

          {!depth ? (
            <div className="py-12 text-center text-chuchu-muted text-xs">Loading orderbook depth snapshot...</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-xs">
              {/* Asks (Sells) */}
              <div>
                <div className="text-[10px] text-rose-400 font-bold mb-2 uppercase">ASK DEPTH (SELL ORDERS)</div>
                <div className="space-y-1">
                  {depth.asks.slice(0, 8).map((a, i) => (
                    <div key={i} className="flex justify-between items-center bg-rose-500/10 p-1.5 rounded border border-rose-500/20">
                      <span className="text-rose-400 font-bold">${formatPrice(a.price)}</span>
                      <span className="text-chuchu-text font-semibold">{a.quantity.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bids (Buys) */}
              <div>
                <div className="text-[10px] text-emerald-400 font-bold mb-2 uppercase">BID DEPTH (BUY ORDERS)</div>
                <div className="space-y-1">
                  {depth.bids.slice(0, 8).map((b, i) => (
                    <div key={i} className="flex justify-between items-center bg-emerald-500/10 p-1.5 rounded border border-emerald-500/20">
                      <span className="text-emerald-400 font-bold">${formatPrice(b.price)}</span>
                      <span className="text-chuchu-text font-semibold">{b.quantity.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* OPEN POSITIONS & REAL-TIME PROFIT REALIZATION PANEL */}
      <div className="glass-panel rounded-xl p-5 border border-chuchu-border/80 shadow-lg space-y-4">
        <div className="flex items-center justify-between border-b border-chuchu-border pb-3">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
            <h2 className="text-base font-extrabold text-chuchu-text tracking-wide">
              OPEN POSITIONS & REAL-TIME PROFIT REALIZATION ({positions.length})
            </h2>
          </div>
          <span className="text-xs text-chuchu-muted font-medium bg-chuchu-bg px-2.5 py-1 rounded border border-chuchu-border">
            Live Mark Price & PnL Streaming
          </span>
        </div>

        {positions.length === 0 ? (
          <div className="py-8 text-center text-chuchu-muted space-y-2">
            <ShieldAlert className="w-8 h-8 mx-auto text-chuchu-muted/60" />
            <div className="text-xs">No active open positions. Submit a Long or Short paper order above to open a position.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {positions.map((pos) => {
              const livePrice = states.get(pos.symbol)?.lastTick?.price || pos.markPrice;
              const unrealizedPnL = pos.side === 'LONG'
                ? (livePrice - pos.entryPrice) * pos.quantity
                : (pos.entryPrice - livePrice) * pos.quantity;
              const notional = pos.entryPrice * pos.quantity;
              const roiPct = notional > 0 ? (unrealizedPnL / notional) * 100 : 0;
              const isProfitable = unrealizedPnL >= 0;

              return (
                <div
                  key={pos.symbol}
                  className={`p-4 rounded-xl border transition-all duration-200 shadow-md ${
                    isProfitable
                      ? 'bg-emerald-950/20 border-emerald-500/40 hover:border-emerald-400'
                      : 'bg-rose-950/20 border-rose-500/40 hover:border-rose-400'
                  }`}
                >
                  {/* Position Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-chuchu-border/50">
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-sm text-chuchu-text">{pos.symbol}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          pos.side === 'LONG'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        }`}
                      >
                        {pos.side}
                      </span>
                      <span className="text-[10px] font-mono text-chuchu-yellow font-extrabold bg-chuchu-yellow/10 px-1.5 py-0.5 rounded">
                        -{formatLatencyDelay(states.get(pos.symbol)?.timestamp || Date.now())}
                      </span>
                    </div>
                    <button
                      onClick={() => closePosition(pos.symbol)}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold border border-rose-500/40 transition-colors"
                      title="Close Position at Market Price"
                    >
                      <XCircle className="w-3 h-3" />
                      <span>CLOSE</span>
                    </button>
                  </div>

                  {/* Profit Realization & Metrics */}
                  <div className="pt-3 space-y-2 num-font text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-chuchu-muted">Live Unrealized PnL:</span>
                      <span className={`font-black text-sm ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfitable ? `+$${unrealizedPnL.toFixed(2)}` : `-$${Math.abs(unrealizedPnL).toFixed(2)}`}
                        <span className="text-xs ml-1 font-bold">({roiPct >= 0 ? `+${roiPct.toFixed(2)}%` : `${roiPct.toFixed(2)}%`})</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-chuchu-bg/60 p-2 rounded border border-chuchu-border/40">
                      <div>
                        <div className="text-chuchu-muted text-[10px]">ENTRY PRICE</div>
                        <div className="font-bold text-chuchu-text">${formatPrice(pos.entryPrice)}</div>
                      </div>
                      <div>
                        <div className="text-chuchu-muted text-[10px]">MARK PRICE</div>
                        <div className="font-bold text-chuchu-cyan">${formatPrice(livePrice)}</div>
                      </div>
                      <div>
                        <div className="text-chuchu-muted text-[10px]">QUANTITY / NOTIONAL</div>
                        <div className="font-semibold text-chuchu-text">{pos.quantity} (${notional.toFixed(2)})</div>
                      </div>
                      <div>
                        <div className="text-chuchu-muted text-[10px]">REALIZED PNL</div>
                        <div className={`font-bold ${pos.realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ${pos.realizedPnL.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-chuchu-muted text-[10px]">LEVERAGE</div>
                        <div className="font-bold text-chuchu-text">{pos.leverage || 1}x</div>
                      </div>
                      <div>
                        <div className="text-chuchu-muted text-[10px]">LIQUIDATION PRICE</div>
                        <div className="font-bold text-rose-300">
                          {pos.liquidationPrice !== undefined ? `$${formatPrice(pos.liquidationPrice)}` : '---'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* BINANCE-STYLE TRADE HISTORY RECORD */}
      <div className="glass-panel rounded-xl p-5 border border-chuchu-border/80 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-chuchu-border pb-3">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-chuchu-cyan" />
            <h2 className="text-base font-extrabold text-chuchu-text tracking-wide">
              DAILY PROFIT & LOSS HISTORY
            </h2>
            <span className="text-[10px] bg-chuchu-card px-2 py-0.5 rounded text-chuchu-cyan font-bold border border-chuchu-cyan/30">
              {filteredHistory.length} TRADES
            </span>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            {['TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'ALL'].map((f) => (
              <button
                key={f}
                onClick={() => setTimeFilter(f as any)}
                className={`px-3 py-1 rounded-md font-bold transition-all ${
                  timeFilter === f
                    ? 'bg-chuchu-panel text-chuchu-text shadow-sm border border-chuchu-border'
                    : 'text-chuchu-muted hover:text-chuchu-text'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2 text-xs border-l border-chuchu-border pl-3">
            <button
              onClick={() => setHistoryTab('CARDS')}
              className={`px-3 py-1 rounded-md font-bold transition-all ${
                historyTab === 'CARDS'
                  ? 'bg-chuchu-cyan text-black shadow-[0_0_10px_rgba(0,229,255,0.3)]'
                  : 'bg-chuchu-card text-chuchu-muted hover:text-chuchu-text border border-chuchu-border'
              }`}
            >
              BINANCE CARDS
            </button>
            <button
              onClick={() => setHistoryTab('TABLE')}
              className={`px-3 py-1 rounded-md font-bold transition-all ${
                historyTab === 'TABLE'
                  ? 'bg-chuchu-cyan text-black shadow-[0_0_10px_rgba(0,229,255,0.3)]'
                  : 'bg-chuchu-card text-chuchu-muted hover:text-chuchu-text border border-chuchu-border'
              }`}
            >
              COMPACT TABLE
            </button>
          </div>

          <button
            onClick={handleDownloadCsv}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 text-[10px] font-black transition-all"
            title="Download full trade history as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>DOWNLOAD CSV</span>
          </button>
        </div>

        {/* KPI Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-chuchu-bg/40 p-4 rounded-xl border border-chuchu-border">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-chuchu-cyan/10 rounded-lg border border-chuchu-cyan/20">
              <PieChart className="w-5 h-5 text-chuchu-cyan" />
            </div>
            <div>
              <div className="text-[10px] text-chuchu-muted font-bold">WIN RATE</div>
              <div className="text-base font-black text-chuchu-text num-font">{winRate.toFixed(1)}%</div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <Trophy className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-[10px] text-chuchu-muted font-bold">WINS / LOSSES</div>
              <div className="text-base font-black text-chuchu-text num-font">{kpis.wins}W - {kpis.losses}L</div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-lg border ${kpis.netPnl >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
              <DollarSign className={`w-5 h-5 ${kpis.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} />
            </div>
            <div>
              <div className="text-[10px] text-chuchu-muted font-bold">NET REALIZED PNL</div>
              <div className={`text-base font-black num-font ${kpis.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${kpis.netPnl.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <History className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="text-[10px] text-chuchu-muted font-bold">CLOSED TRADES</div>
              <div className="text-base font-black text-chuchu-text num-font">{kpis.closes} EXECUTED</div>
            </div>
          </div>
        </div>

        {/* 500-Trade Evaluation Stats (net of real fees + funding) */}
        {paperStats && (
          <div className="bg-chuchu-bg/40 p-4 rounded-xl border border-chuchu-border">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="flex items-center space-x-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span className="text-[11px] font-black tracking-wider text-chuchu-text">
                  500-TRADE STRATEGY EVALUATION
                </span>
              </div>
              <div className={`text-[11px] font-black px-2 py-1 rounded border ${
                paperStats.totalTrades >= 500
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-chuchu-cyan/10 text-chuchu-cyan border-chuchu-cyan/30'
              }`}>
                {paperStats.totalTrades} / 500 TRADES {paperStats.totalTrades >= 500 ? 'COMPLETE' : `(${paperStats.tradesToTarget} TO GO)`}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <StatBox label="WIN RATE (NET)" value={`${paperStats.winRate}%`} accent={paperStats.winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'} />
              <StatBox label="PROFIT FACTOR" value={paperStats.profitFactor.toFixed(2)} accent={paperStats.profitFactor >= 1 ? 'text-emerald-400' : 'text-rose-400'} />
              <StatBox label="NET PNL" value={`$${paperStats.netPnl.toFixed(2)}`} accent={paperStats.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
              <StatBox label="EXPECTANCY" value={`$${paperStats.expectancy.toFixed(2)}`} accent={paperStats.expectancy >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
              <StatBox label="AVG WIN" value={`$${paperStats.avgWin.toFixed(2)}`} accent="text-emerald-400" />
              <StatBox label="AVG LOSS" value={`$${paperStats.avgLoss.toFixed(2)}`} accent="text-rose-400" />
              <StatBox label="FEES PAID" value={`$${paperStats.totalFees.toFixed(2)}`} accent="text-amber-400" />
              <StatBox label="MAX DRAWDOWN" value={`$${paperStats.maxDrawdown.toFixed(2)}`} accent="text-rose-400" />
            </div>
          </div>
        )}

        {filteredHistory.length === 0 ? (
          <div className="py-8 text-center text-chuchu-muted text-xs">
            No trades found for this time period.
          </div>
        ) : historyTab === 'CARDS' ? (
          /* BINANCE CARD VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredHistory.map((trade) => {
              const isBuy = trade.side === 'BUY';
              const notional = trade.fillPrice * trade.quantity;
              const dateStr = formatTime(trade.timestamp, timezone);

              return (
                <div
                  key={trade.tradeId}
                  className="bg-chuchu-card/90 p-4 rounded-xl border border-chuchu-border/80 hover:border-chuchu-cyan/40 transition-all shadow-md space-y-3 font-sans"
                >
                  {/* Card Top: Symbol & Side Badge */}
                  <div className="flex items-center justify-between pb-2 border-b border-chuchu-border/50">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-black text-sm text-chuchu-text tracking-wide">{trade.symbol}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-chuchu-panel text-chuchu-muted font-bold">BINANCE PERP</span>
                      </div>
                      <div className="text-[10px] text-chuchu-muted flex items-center space-x-1 mt-0.5">
                        <Clock className="w-3 h-3 text-chuchu-cyan" />
                        <span>{dateStr}</span>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-md text-xs font-black tracking-wide border shadow-sm ${
                        isBuy
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                          : 'bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.2)]'
                      }`}
                    >
                      {isBuy ? 'LONG / BUY' : 'SHORT / SELL'}
                    </span>
                  </div>

                  {/* Binance Trade Metrics */}
                  <div className="grid grid-cols-2 gap-2 text-xs num-font pt-1">
                    <div className="bg-chuchu-bg/80 p-2 rounded border border-chuchu-border/40">
                      <div className="text-[10px] text-chuchu-muted font-sans">EXECUTED PRICE</div>
                      <div className="font-bold text-chuchu-cyan text-sm">${formatPrice(trade.fillPrice)}</div>
                    </div>

                    <div className="bg-chuchu-bg/80 p-2 rounded border border-chuchu-border/40">
                      <div className="text-[10px] text-chuchu-muted font-sans">TRADE SIZE / NOTIONAL</div>
                      <div className="font-bold text-chuchu-text text-sm">{trade.quantity} <span className="text-[10px] text-chuchu-muted">(${notional.toFixed(2)})</span></div>
                    </div>

                    <div className="bg-chuchu-bg/80 p-2 rounded border border-chuchu-border/40">
                      <div className="text-[10px] text-chuchu-muted font-sans">TRADING FEE (VIP 0)</div>
                      <div className="font-semibold text-amber-400">${trade.fee.toFixed(4)} USDT</div>
                    </div>

                    <div className="bg-chuchu-bg/80 p-2 rounded border border-chuchu-border/40">
                      <div className="text-[10px] text-chuchu-muted font-sans">SLIPPAGE MATCH</div>
                      <div className="font-semibold text-chuchu-text">{trade.slippagePct.toFixed(3)}%</div>
                    </div>

                    {trade.pnl !== undefined && (
                      <div className="bg-chuchu-bg/80 p-2 rounded border border-chuchu-border/40 col-span-2">
                        <div className="text-[10px] text-chuchu-muted font-sans">REALIZED P&L</div>
                        <div className={`font-black text-sm ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {trade.pnl >= 0 ? `+$${trade.pnl.toFixed(4)}` : `-$${Math.abs(trade.pnl).toFixed(4)}`} USDT
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Trade Context & Exit Reason */}
                  {(trade.context || trade.exitReason) && (
                    <div className="pt-2 mt-2 border-t border-chuchu-border/40 text-[10px] space-y-1 bg-chuchu-bg/40 p-2 rounded">
                      {trade.context?.reasonOfEntry && (
                        <div className="flex justify-between">
                          <span className="text-chuchu-muted">ENTRY:</span>
                          <span className="text-chuchu-cyan font-bold">{trade.context.reasonOfEntry} (Score: {trade.context.setupQuality?.toFixed(0) || trade.context.hunterScore})</span>
                        </div>
                      )}
                      {trade.context?.marketRegime && (
                        <div className="flex justify-between">
                          <span className="text-chuchu-muted">REGIME:</span>
                          <span className="text-chuchu-text font-bold">{trade.context.marketRegime} (ADX: {trade.context.adx?.toFixed(1)})</span>
                        </div>
                      )}
                      {trade.exitReason && (
                        <div className="flex justify-between">
                          <span className="text-chuchu-muted">EXIT:</span>
                          <span className={`font-bold ${
                            trade.exitReason === 'TAKE_PROFIT' || trade.exitReason === 'MOMENTUM_PROFIT_BOOK'
                              ? 'text-emerald-400'
                              : trade.exitReason === 'STOP_LOSS' || trade.exitReason === 'LIQUIDATION' || trade.exitReason === 'MOMENTUM_CUT_LOSS'
                                ? 'text-rose-400'
                                : trade.exitReason === 'TRAILING_STOP'
                                  ? 'text-cyan-400'
                                  : 'text-amber-400'
                          }`}>
                            {trade.exitReason} {trade.pnl ? `(${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)})` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* COMPACT TABLE VIEW */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-chuchu-card text-chuchu-muted uppercase text-[10px] border-b border-chuchu-border">
                  <th className="py-2.5 px-3">TIME & DATE</th>
                  <th className="py-2.5 px-3">SYMBOL</th>
                  <th className="py-2.5 px-3">SIDE</th>
                  <th className="py-2.5 px-3">FILL PRICE</th>
                  <th className="py-2.5 px-3">QUANTITY</th>
                  <th className="py-2.5 px-3">NOTIONAL (USDT)</th>
                  <th className="py-2.5 px-3">FEE (USDT)</th>
                  <th className="py-2.5 px-3">SLIPPAGE</th>
                  <th className="py-2.5 px-3">EXIT REASON</th>
                  <th className="py-2.5 px-3">REALIZED PNL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-chuchu-border/50 text-chuchu-text num-font">
                {filteredHistory.map((trade) => {
                  const isBuy = trade.side === 'BUY';
                  const notional = trade.fillPrice * trade.quantity;
                  const dateStr = formatTime(trade.timestamp, timezone);

                  return (
                    <tr key={trade.tradeId} className="hover:bg-chuchu-panel/50 transition-colors">
                      <td className="py-2.5 px-3 text-chuchu-muted font-sans text-[11px]">{dateStr}</td>
                      <td className="py-2.5 px-3 font-bold">{trade.symbol}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded font-black text-[10px] ${
                            isBuy
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          }`}
                        >
                          {isBuy ? 'BUY' : 'SELL'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-chuchu-cyan">${formatPrice(trade.fillPrice)}</td>
                      <td className="py-2.5 px-3 font-semibold">{trade.quantity}</td>
                      <td className="py-2.5 px-3">${notional.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-amber-400">${trade.fee.toFixed(4)}</td>
                      <td className="py-2.5 px-3">{trade.slippagePct.toFixed(3)}%</td>
                      <td className="py-2.5 px-3">
                        {trade.exitReason ? (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                            trade.exitReason === 'TAKE_PROFIT' || trade.exitReason === 'MOMENTUM_PROFIT_BOOK'
                              ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                              : trade.exitReason === 'STOP_LOSS' || trade.exitReason === 'LIQUIDATION' || trade.exitReason === 'MOMENTUM_CUT_LOSS'
                                ? 'text-rose-400 border-rose-500/40 bg-rose-500/10'
                                : trade.exitReason === 'TRAILING_STOP'
                                  ? 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10'
                                  : 'text-amber-400 border-amber-500/40 bg-amber-500/10'
                          }`}>
                            {trade.exitReason}
                          </span>
                        ) : (
                          <span className="text-chuchu-muted">—</span>
                        )}
                      </td>
                      <td className={`py-2.5 px-3 font-bold ${trade.pnl !== undefined ? (trade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-chuchu-muted'}`}>
                        {trade.pnl !== undefined ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(4)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
