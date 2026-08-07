import React, { useState } from 'react';
import { useAthenaStore } from '../store/useAthenaStore';
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
  RefreshCw
} from 'lucide-react';
import { formatPrice, formatTime, formatLatencyDelay } from '../utils/formatting';

export const PaperTradingPage: React.FC = () => {
  const {
    states,
    selectedSymbol,
    setSelectedSymbol,
    paperBalance,
    positions,
    tradeHistory,
    submitOrder,
    closePosition,
    timezone,
    resetPaperAccount
  } = useAthenaStore();

  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState<number>(1.0);
  const [historyTab, setHistoryTab] = useState<'CARDS' | 'TABLE'>('CARDS');
  const [timeFilter, setTimeFilter] = useState<'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'ALL'>('TODAY');

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
    <div className="p-6 space-y-6 font-sans text-athena-text">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-athena-text tracking-wider flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-athena-cyan" />
            <span>INSTITUTIONAL PAPER EXECUTION TERMINAL</span>
          </h1>
          <p className="text-xs text-athena-muted mt-0.5 font-medium">
            Simulated order execution against live Binance L2 orderbook depth with dynamic slippage & fee model
          </p>
        </div>

        <div className="flex items-center space-x-4 text-xs">
          <div className="flex items-center space-x-2 bg-athena-card px-3 py-2 rounded-lg border border-athena-border">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="text-athena-muted font-sans">AVAILABLE USDT:</span>
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

          <div className="flex items-center space-x-2 bg-athena-card px-3 py-2 rounded-lg border border-athena-border">
            <Activity className="w-4 h-4 text-athena-cyan" />
            <span className="text-athena-muted font-sans">UNREALIZED PNL:</span>
            <span className={`font-black text-sm num-font ${totalUnrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalUnrealizedPnL >= 0 ? `+$${totalUnrealizedPnL.toFixed(2)}` : `-$${Math.abs(totalUnrealizedPnL).toFixed(2)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Main Terminal Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Order Form Column */}
        <div className="lg:col-span-4 glass-panel rounded-xl p-5 border border-athena-border space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-athena-border">
            <span className="text-sm font-bold text-athena-text">ORDER EXECUTION</span>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="bg-athena-bg border border-athena-border text-athena-cyan px-3 py-1 rounded text-xs font-bold focus:outline-none"
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
            <div className="grid grid-cols-2 gap-2 p-1 bg-athena-bg rounded border border-athena-border">
              <button
                type="button"
                onClick={() => setSide('BUY')}
                className={`py-2 rounded font-bold text-xs transition-all ${
                  side === 'BUY' ? 'bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'text-athena-muted'
                }`}
              >
                LONG / BUY
              </button>
              <button
                type="button"
                onClick={() => setSide('SELL')}
                className={`py-2 rounded font-bold text-xs transition-all ${
                  side === 'SELL' ? 'bg-rose-500 text-white shadow-[0_0_10px_rgba(244,63,94,0.3)]' : 'text-athena-muted'
                }`}
              >
                SHORT / SELL
              </button>
            </div>

            {/* Order Type Display */}
            <div className="text-xs space-y-1">
              <span className="text-athena-muted">ORDER TYPE:</span>
              <div className="w-full p-2 bg-athena-bg rounded border border-athena-border text-athena-text font-bold">
                MARKET (L2 DEPTH MATCHED)
              </div>
            </div>

            {/* Price Display */}
            <div className="text-xs space-y-1">
              <span className="text-athena-muted">MARKET PRICE:</span>
              <div className="w-full p-2 bg-athena-bg rounded border border-athena-border text-athena-cyan font-bold text-sm">
                ${markPrice > 0 ? formatPrice(markPrice) : '---'}
              </div>
            </div>

            {/* Quantity Input */}
            <div className="text-xs space-y-1">
              <span className="text-athena-muted">QUANTITY:</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={quantity}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                className="w-full p-2 bg-athena-bg border border-athena-border text-athena-text font-bold rounded focus:outline-none focus:border-athena-cyan"
              />
            </div>

            {/* Order Cost Est */}
            <div className="p-3 bg-athena-bg/60 rounded border border-athena-border/50 text-xs space-y-1">
              <div className="flex justify-between text-athena-muted">
                <span>EST NOTIONAL:</span>
                <span className="text-athena-text font-bold">${formatPrice(markPrice * quantity)} USDT</span>
              </div>
              <div className="flex justify-between text-athena-muted">
                <span>TAKER FEE (0.04%):</span>
                <span className="text-athena-text font-bold">${(markPrice * quantity * 0.0004).toFixed(2)} USDT</span>
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
        <div className="lg:col-span-8 glass-panel rounded-xl p-5 border border-athena-border space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-athena-border">
            <span className="text-sm font-bold text-athena-text flex items-center space-x-2">
              <Layers className="w-4 h-4 text-athena-cyan" />
              <span>LIVE L2 ORDERBOOK DEPTH ({selectedSymbol})</span>
            </span>
            <span className="text-xs text-athena-muted">100ms Streaming Snapshot</span>
          </div>

          {!depth ? (
            <div className="py-12 text-center text-athena-muted text-xs">Loading orderbook depth snapshot...</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-xs">
              {/* Asks (Sells) */}
              <div>
                <div className="text-[10px] text-rose-400 font-bold mb-2 uppercase">ASK DEPTH (SELL ORDERS)</div>
                <div className="space-y-1">
                  {depth.asks.slice(0, 8).map((a, i) => (
                    <div key={i} className="flex justify-between items-center bg-rose-500/10 p-1.5 rounded border border-rose-500/20">
                      <span className="text-rose-400 font-bold">${formatPrice(a.price)}</span>
                      <span className="text-athena-text font-semibold">{a.quantity.toFixed(3)}</span>
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
                      <span className="text-athena-text font-semibold">{b.quantity.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* OPEN POSITIONS & REAL-TIME PROFIT REALIZATION PANEL */}
      <div className="glass-panel rounded-xl p-5 border border-athena-border/80 shadow-lg space-y-4">
        <div className="flex items-center justify-between border-b border-athena-border pb-3">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
            <h2 className="text-base font-extrabold text-athena-text tracking-wide">
              OPEN POSITIONS & REAL-TIME PROFIT REALIZATION ({positions.length})
            </h2>
          </div>
          <span className="text-xs text-athena-muted font-medium bg-athena-bg px-2.5 py-1 rounded border border-athena-border">
            Live Mark Price & PnL Streaming
          </span>
        </div>

        {positions.length === 0 ? (
          <div className="py-8 text-center text-athena-muted space-y-2">
            <ShieldAlert className="w-8 h-8 mx-auto text-athena-muted/60" />
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
                  <div className="flex items-center justify-between pb-2 border-b border-athena-border/50">
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-sm text-athena-text">{pos.symbol}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          pos.side === 'LONG'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        }`}
                      >
                        {pos.side}
                      </span>
                      <span className="text-[10px] font-mono text-athena-yellow font-extrabold bg-athena-yellow/10 px-1.5 py-0.5 rounded">
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
                      <span className="text-athena-muted">Live Unrealized PnL:</span>
                      <span className={`font-black text-sm ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfitable ? `+$${unrealizedPnL.toFixed(2)}` : `-$${Math.abs(unrealizedPnL).toFixed(2)}`}
                        <span className="text-xs ml-1 font-bold">({roiPct >= 0 ? `+${roiPct.toFixed(2)}%` : `${roiPct.toFixed(2)}%`})</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-athena-bg/60 p-2 rounded border border-athena-border/40">
                      <div>
                        <div className="text-athena-muted text-[10px]">ENTRY PRICE</div>
                        <div className="font-bold text-athena-text">${formatPrice(pos.entryPrice)}</div>
                      </div>
                      <div>
                        <div className="text-athena-muted text-[10px]">MARK PRICE</div>
                        <div className="font-bold text-athena-cyan">${formatPrice(livePrice)}</div>
                      </div>
                      <div>
                        <div className="text-athena-muted text-[10px]">QUANTITY / NOTIONAL</div>
                        <div className="font-semibold text-athena-text">{pos.quantity} (${notional.toFixed(2)})</div>
                      </div>
                      <div>
                        <div className="text-athena-muted text-[10px]">REALIZED PNL</div>
                        <div className={`font-bold ${pos.realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ${pos.realizedPnL.toFixed(2)}
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
      <div className="glass-panel rounded-xl p-5 border border-athena-border/80 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-athena-border pb-3">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-athena-cyan" />
            <h2 className="text-base font-extrabold text-athena-text tracking-wide">
              DAILY PROFIT & LOSS HISTORY
            </h2>
            <span className="text-[10px] bg-athena-card px-2 py-0.5 rounded text-athena-cyan font-bold border border-athena-cyan/30">
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
                    ? 'bg-athena-panel text-athena-text shadow-sm border border-athena-border'
                    : 'text-athena-muted hover:text-athena-text'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2 text-xs border-l border-athena-border pl-3">
            <button
              onClick={() => setHistoryTab('CARDS')}
              className={`px-3 py-1 rounded-md font-bold transition-all ${
                historyTab === 'CARDS'
                  ? 'bg-athena-cyan text-black shadow-[0_0_10px_rgba(0,229,255,0.3)]'
                  : 'bg-athena-card text-athena-muted hover:text-athena-text border border-athena-border'
              }`}
            >
              BINANCE CARDS
            </button>
            <button
              onClick={() => setHistoryTab('TABLE')}
              className={`px-3 py-1 rounded-md font-bold transition-all ${
                historyTab === 'TABLE'
                  ? 'bg-athena-cyan text-black shadow-[0_0_10px_rgba(0,229,255,0.3)]'
                  : 'bg-athena-card text-athena-muted hover:text-athena-text border border-athena-border'
              }`}
            >
              COMPACT TABLE
            </button>
          </div>
        </div>

        {/* KPI Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-athena-bg/40 p-4 rounded-xl border border-athena-border">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-athena-cyan/10 rounded-lg border border-athena-cyan/20">
              <PieChart className="w-5 h-5 text-athena-cyan" />
            </div>
            <div>
              <div className="text-[10px] text-athena-muted font-bold">WIN RATE</div>
              <div className="text-base font-black text-athena-text num-font">{winRate.toFixed(1)}%</div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <Trophy className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-[10px] text-athena-muted font-bold">WINS / LOSSES</div>
              <div className="text-base font-black text-athena-text num-font">{kpis.wins}W - {kpis.losses}L</div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-lg border ${kpis.netPnl >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
              <DollarSign className={`w-5 h-5 ${kpis.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} />
            </div>
            <div>
              <div className="text-[10px] text-athena-muted font-bold">NET REALIZED PNL</div>
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
              <div className="text-[10px] text-athena-muted font-bold">CLOSED TRADES</div>
              <div className="text-base font-black text-athena-text num-font">{kpis.closes} EXECUTED</div>
            </div>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="py-8 text-center text-athena-muted text-xs">
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
                  className="bg-athena-card/90 p-4 rounded-xl border border-athena-border/80 hover:border-athena-cyan/40 transition-all shadow-md space-y-3 font-sans"
                >
                  {/* Card Top: Symbol & Side Badge */}
                  <div className="flex items-center justify-between pb-2 border-b border-athena-border/50">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-black text-sm text-athena-text tracking-wide">{trade.symbol}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-athena-panel text-athena-muted font-bold">BINANCE PERP</span>
                      </div>
                      <div className="text-[10px] text-athena-muted flex items-center space-x-1 mt-0.5">
                        <Clock className="w-3 h-3 text-athena-cyan" />
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
                    <div className="bg-athena-bg/80 p-2 rounded border border-athena-border/40">
                      <div className="text-[10px] text-athena-muted font-sans">EXECUTED PRICE</div>
                      <div className="font-bold text-athena-cyan text-sm">${formatPrice(trade.fillPrice)}</div>
                    </div>

                    <div className="bg-athena-bg/80 p-2 rounded border border-athena-border/40">
                      <div className="text-[10px] text-athena-muted font-sans">TRADE SIZE / NOTIONAL</div>
                      <div className="font-bold text-athena-text text-sm">{trade.quantity} <span className="text-[10px] text-athena-muted">(${notional.toFixed(2)})</span></div>
                    </div>

                    <div className="bg-athena-bg/80 p-2 rounded border border-athena-border/40">
                      <div className="text-[10px] text-athena-muted font-sans">TRADING FEE (VIP 0)</div>
                      <div className="font-semibold text-amber-400">${trade.fee.toFixed(4)} USDT</div>
                    </div>

                    <div className="bg-athena-bg/80 p-2 rounded border border-athena-border/40">
                      <div className="text-[10px] text-athena-muted font-sans">SLIPPAGE MATCH</div>
                      <div className="font-semibold text-athena-text">{trade.slippagePct.toFixed(3)}%</div>
                    </div>

                    {trade.pnl !== undefined && (
                      <div className="bg-athena-bg/80 p-2 rounded border border-athena-border/40 col-span-2">
                        <div className="text-[10px] text-athena-muted font-sans">REALIZED P&L</div>
                        <div className={`font-black text-sm ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {trade.pnl >= 0 ? `+$${trade.pnl.toFixed(4)}` : `-$${Math.abs(trade.pnl).toFixed(4)}`} USDT
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Trade Context & Exit Reason */}
                  {(trade.context || trade.exitReason) && (
                    <div className="pt-2 mt-2 border-t border-athena-border/40 text-[10px] space-y-1 bg-athena-bg/40 p-2 rounded">
                      {trade.context?.reasonOfEntry && (
                        <div className="flex justify-between">
                          <span className="text-athena-muted">ENTRY:</span>
                          <span className="text-athena-cyan font-bold">{trade.context.reasonOfEntry} (Score: {trade.context.setupQuality?.toFixed(0) || trade.context.hunterScore})</span>
                        </div>
                      )}
                      {trade.context?.marketRegime && (
                        <div className="flex justify-between">
                          <span className="text-athena-muted">REGIME:</span>
                          <span className="text-athena-text font-bold">{trade.context.marketRegime} (ADX: {trade.context.adx?.toFixed(1)})</span>
                        </div>
                      )}
                      {trade.exitReason && (
                        <div className="flex justify-between">
                          <span className="text-athena-muted">EXIT:</span>
                          <span className={`font-bold ${trade.exitReason === 'TAKE_PROFIT' ? 'text-emerald-400' : trade.exitReason === 'STOP_LOSS' ? 'text-rose-400' : 'text-amber-400'}`}>
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
                <tr className="bg-athena-card text-athena-muted uppercase text-[10px] border-b border-athena-border">
                  <th className="py-2.5 px-3">TIME & DATE</th>
                  <th className="py-2.5 px-3">SYMBOL</th>
                  <th className="py-2.5 px-3">SIDE</th>
                  <th className="py-2.5 px-3">FILL PRICE</th>
                  <th className="py-2.5 px-3">QUANTITY</th>
                  <th className="py-2.5 px-3">NOTIONAL (USDT)</th>
                  <th className="py-2.5 px-3">FEE (USDT)</th>
                  <th className="py-2.5 px-3">SLIPPAGE</th>
                  <th className="py-2.5 px-3">REALIZED PNL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-athena-border/50 text-athena-text num-font">
                {filteredHistory.map((trade) => {
                  const isBuy = trade.side === 'BUY';
                  const notional = trade.fillPrice * trade.quantity;
                  const dateStr = formatTime(trade.timestamp, timezone);

                  return (
                    <tr key={trade.tradeId} className="hover:bg-athena-panel/50 transition-colors">
                      <td className="py-2.5 px-3 text-athena-muted font-sans text-[11px]">{dateStr}</td>
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
                      <td className="py-2.5 px-3 font-bold text-athena-cyan">${formatPrice(trade.fillPrice)}</td>
                      <td className="py-2.5 px-3 font-semibold">{trade.quantity}</td>
                      <td className="py-2.5 px-3">${notional.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-amber-400">${trade.fee.toFixed(4)}</td>
                      <td className="py-2.5 px-3">{trade.slippagePct.toFixed(3)}%</td>
                      <td className={`py-2.5 px-3 font-bold ${trade.pnl !== undefined ? (trade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-athena-muted'}`}>
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
