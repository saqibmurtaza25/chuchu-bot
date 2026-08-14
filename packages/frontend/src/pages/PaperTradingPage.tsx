import React, { useState } from 'react';
import { useChuchuStore } from '../store/useChuchuStore';
import {
  Terminal,
  DollarSign,
  Activity,
  History,
  XCircle,
  ShieldAlert,
  PieChart,
  Trophy,
  RefreshCw,
  Download,
  MoveRight,
  Power
} from 'lucide-react';
import { formatPrice, formatTime, formatLatencyDelay, formatUtcDate, formatUtcTime, formatHoldDuration } from '../utils/formatting';
import { PaperPosition } from '@chuchu/shared';

const StatBox: React.FC<{ label: string; value: string; accent: string }> = ({ label, value, accent }) => (
  <div className="p-2.5 bg-chuchu-card/60 rounded-lg border border-chuchu-border">
    <div className="text-[9px] text-chuchu-muted font-bold tracking-wider uppercase mb-1">{label}</div>
    <div className={`text-sm font-black num-font ${accent}`}>{value}</div>
  </div>
);

/**
 * Live trailing-stop bar: renders every key price level on a single horizontal
 * scale so the user can see where price sits relative to entry, stop-loss,
 * take-profit, and the ratcheting trailing stop — in real time.
 */
const TrailingBar: React.FC<{
  pos: PaperPosition;
  livePrice: number;
}> = ({ pos, livePrice }) => {
  const levels: { price: number; label: string; color: string; solid?: boolean }[] = [
    { price: pos.entryPrice, label: 'ENTRY', color: '#94a3b8' },
    ...(pos.stopLoss !== undefined ? [{ price: pos.stopLoss, label: 'SL', color: '#f43f5e' }] : []),
    ...(pos.takeProfit !== undefined ? [{ price: pos.takeProfit, label: 'TP', color: '#34d399' }] : []),
    ...(pos.trailingStopActive && pos.trailingStop !== undefined ? [{ price: pos.trailingStop, label: 'TRAIL', color: '#fbbf24', solid: true }] : []),
    ...(pos.trailingStopActive && pos.peakPrice !== undefined ? [{ price: pos.peakPrice, label: 'PEAK', color: '#a78bfa' }] : [])
  ];

  const prices = levels.map((l) => l.price).concat([livePrice]);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const pct = (p: number) => Math.max(0, Math.min(100, ((p - min) / span) * 100));

  const isLong = pos.side === 'LONG';
  const markPct = pct(livePrice);

  return (
    <div className="mt-3">
      <div className="relative h-7 rounded-md overflow-hidden border border-chuchu-border/60 bg-slate-950/80">
        {/* Directional gradient track */}
        <div
          className={`absolute inset-y-0 left-0 ${isLong ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}
          style={{ width: `${markPct}%` }}
        />
        <div className="absolute inset-0 flex items-center">
          {levels.map((l) => {
            const p = pct(l.price);
            return (
              <div key={l.label} className="absolute" style={{ left: `${p}%` }}>
                <div
                  className={`w-[2px] ${l.solid ? 'w-[3px]' : ''} h-7`}
                  style={{ backgroundColor: l.color, boxShadow: l.solid ? `0 0 8px ${l.color}` : undefined }}
                  title={`${l.label} $${l.price}`}
                />
              </div>
            );
          })}
        </div>
        {/* Live mark marker */}
        <div className="absolute top-0 bottom-0" style={{ left: `${markPct}%` }}>
          <div className="w-0.5 h-full bg-white" />
          <div className={`absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 ${isLong ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        </div>
      </div>
      <div className="flex justify-between mt-1 text-[8px] num-font">
        <span className="text-slate-400">${formatPrice(min)}</span>
        <span className="text-slate-400">${formatPrice(max)}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[8px]">
        <span className="text-slate-300">M: <b className="text-white">${formatPrice(livePrice)}</b></span>
        <span className="text-slate-400">E: <b>${formatPrice(pos.entryPrice)}</b></span>
        {pos.stopLoss !== undefined && <span className="text-rose-400">SL: ${formatPrice(pos.stopLoss)}</span>}
        {pos.takeProfit !== undefined && <span className="text-emerald-400">TP: ${formatPrice(pos.takeProfit)}</span>}
        {pos.trailingStopActive && pos.trailingStop !== undefined && (
          <span className="text-amber-300">TRAIL: ${formatPrice(pos.trailingStop)}</span>
        )}
        {pos.trailingStopActive && pos.peakPrice !== undefined && (
          <span className="text-purple-300">PEAK: ${formatPrice(pos.peakPrice)}</span>
        )}
      </div>
    </div>
  );
};

/**
 * Per-position trailing stop manager: enable / adjust / disable the trail and
 * show armed state + distance to the trailing stop live.
 */
const TrailingStopManager: React.FC<{
  pos: PaperPosition;
  livePrice: number;
  setTrailingStop: (symbol: string, action: 'enable' | 'update' | 'disable', distancePct?: number, activationPct?: number) => Promise<void>;
}> = ({ pos, livePrice, setTrailingStop }) => {
  const [distance, setDistance] = useState<number>(pos.trailingStopPct || 0.6);
  const [activation, setActivation] = useState<number>(pos.trailActivationPct || 0);

  const active = !!pos.trailingStopActive;
  const armed = !!pos.trailActivated;

  let distanceToTrail: number | null = null;
  if (active && pos.trailingStop !== undefined && livePrice > 0) {
    distanceToTrail = pos.side === 'LONG'
      ? ((livePrice - pos.trailingStop) / livePrice) * 100
      : ((pos.trailingStop - livePrice) / livePrice) * 100;
  }

  const savedPnlPct = (() => {
    if (!active || pos.trailingStop === undefined || pos.entryPrice <= 0) return null;
    return pos.side === 'LONG'
      ? ((pos.trailingStop - pos.entryPrice) / pos.entryPrice) * 100
      : ((pos.entryPrice - pos.trailingStop) / pos.entryPrice) * 100;
  })();

  return (
    <div className={`mt-3 p-2 rounded-lg border ${active ? 'border-amber-400/40 bg-amber-950/10' : 'border-chuchu-border/50 bg-chuchu-bg/50'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center space-x-1.5">
          <MoveRight className={`w-3.5 h-3.5 ${active ? 'text-amber-300' : 'text-chuchu-muted'}`} />
          <span className="text-[10px] font-extrabold tracking-wider uppercase text-chuchu-text">TRAILING STOP</span>
          {active && (
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${armed ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-700/60 text-slate-300 border-slate-500/40'}`}>
              {armed ? 'ARMED' : 'ARMING'}
            </span>
          )}
        </div>
        <button
          onClick={() => active ? setTrailingStop(pos.symbol, 'disable') : setTrailingStop(pos.symbol, 'enable', distance, activation)}
          className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[9px] font-black border transition-colors ${
            active
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
              : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
          }`}
          title={active ? 'Disable trailing stop' : 'Enable trailing stop'}
        >
          <Power className="w-3 h-3" />
          <span>{active ? 'DISABLE' : 'ENABLE'}</span>
        </button>
      </div>

      {active && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="text-[8px] text-chuchu-muted font-bold uppercase">Distance %</span>
              <input
                type="number"
                min={0.1}
                max={5}
                step={0.1}
                value={distance}
                onChange={(e) => setDistance(parseFloat(e.target.value) || 0.6)}
                className="w-full px-1.5 py-1 rounded bg-slate-900 border border-chuchu-border text-[11px] num-font text-amber-300 font-bold"
              />
            </label>
            <label className="block">
              <span className="text-[8px] text-chuchu-muted font-bold uppercase">Activation %</span>
              <input
                type="number"
                min={0}
                max={50}
                step={0.25}
                value={activation}
                onChange={(e) => setActivation(parseFloat(e.target.value) || 0)}
                className="w-full px-1.5 py-1 rounded bg-slate-900 border border-chuchu-border text-[11px] num-font text-purple-300 font-bold"
              />
            </label>
          </div>
          <button
            onClick={() => setTrailingStop(pos.symbol, 'update', distance, activation)}
            className="w-full py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[9px] font-black border border-amber-500/30 transition-colors"
          >
            APPLY TRAIL DISTANCE
          </button>

          <div className="grid grid-cols-2 gap-1.5 text-[10px] num-font">
            <div className="p-1 rounded bg-slate-900/80 border border-chuchu-border/40">
              <div className="text-[8px] text-chuchu-muted font-bold uppercase">Trail Stop Price</div>
              <div className={`font-black ${pos.trailingStop !== undefined ? 'text-amber-300' : 'text-slate-400'}`}>
                {pos.trailingStop !== undefined ? `$${formatPrice(pos.trailingStop)}` : '---'}
              </div>
            </div>
            <div className="p-1 rounded bg-slate-900/80 border border-chuchu-border/40">
              <div className="text-[8px] text-chuchu-muted font-bold uppercase">Dist to Trail</div>
              <div className={`font-black ${distanceToTrail !== null && distanceToTrail <= 0.15 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {distanceToTrail !== null ? `${distanceToTrail.toFixed(2)}%` : '---'}
              </div>
            </div>
            <div className="p-1 rounded bg-slate-900/80 border border-chuchu-border/40">
              <div className="text-[8px] text-chuchu-muted font-bold uppercase">Locked PnL</div>
              <div className={`font-black ${savedPnlPct !== null && savedPnlPct >= 0 ? 'text-emerald-400' : savedPnlPct !== null ? 'text-rose-400' : 'text-slate-400'}`}>
                {savedPnlPct !== null ? `${savedPnlPct >= 0 ? '+' : ''}${savedPnlPct.toFixed(2)}%` : '---'}
              </div>
            </div>
            <div className="p-1 rounded bg-slate-900/80 border border-chuchu-border/40">
              <div className="text-[8px] text-chuchu-muted font-bold uppercase">Peak Price</div>
              <div className="font-black text-purple-300">{pos.peakPrice !== undefined ? `$${formatPrice(pos.peakPrice)}` : '---'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const PaperTradingPage: React.FC = () => {
  const {
    states,
    paperBalance,
    positions,
    tradeHistory,
    paperStats,
    closePosition,
    setTrailingStop,
    resetTradeHistory,
    resetDemoBalance,
    serverUrl
  } = useChuchuStore();

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
            Simulated order execution at live Binance prices with dynamic slippage &amp; fee model
          </p>
          <p className="text-[10px] text-chuchu-yellow/70 mt-0.5 font-bold">
            AUTO-SAVED — trade history, balance &amp; positions survive every backend restart. History is NEVER auto-cleared; it only changes when you press RESET HISTORY / RESET BALANCE.
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

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                const count = tradeHistory.length;
                const warning =
                  `⚠️ WARNING — THIS CANNOT BE UNDONE\n\n` +
                  `You are about to DELETE the ENTIRE trade history (${count} records).\n\n` +
                  `Balance and open positions will NOT be touched, but all past trades,\n` +
                  `exit reasons, P&L and analysis data will be permanently removed from the server.\n\n` +
                  `Type CONFIRM to proceed with the deletion.`;
                const answer = window.prompt(warning);
                if (answer && answer.trim().toUpperCase() === 'CONFIRM') {
                  resetTradeHistory();
                } else if (answer !== null) {
                  alert('Reset cancelled — history is safe.');
                }
              }}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-rose-500/10 text-rose-300 text-xs font-bold border border-rose-500/30 hover:bg-rose-500/20 transition-all duration-150 shrink-0"
              title="Delete trade history only (keeps balance & positions)"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>RESET HISTORY</span>
            </button>

            <button
              onClick={() => {
                if (window.confirm("Reset DEMO BALANCE to $100? Trade history and open positions are kept.")) {
                  resetDemoBalance();
                }
              }}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-300 text-xs font-bold border border-amber-500/30 hover:bg-amber-500/20 transition-all duration-150 shrink-0"
              title="Reset demo dollars to $100 (keeps history & positions)"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>RESET BALANCE</span>
            </button>
          </div>

          <div className="flex items-center space-x-2 bg-chuchu-card px-3 py-2 rounded-lg border border-chuchu-border">
            <Activity className="w-4 h-4 text-chuchu-cyan" />
            <span className="text-chuchu-muted font-sans">UNREALIZED PNL:</span>
            <span className={`font-black text-sm num-font ${totalUnrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalUnrealizedPnL >= 0 ? `+$${totalUnrealizedPnL.toFixed(2)}` : `-$${Math.abs(totalUnrealizedPnL).toFixed(2)}`}
            </span>
          </div>
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
                      <div className="col-span-2">
                        <div className="text-chuchu-muted text-[10px]">TRADE OPENED AT (UTC)</div>
                        <div className="font-bold text-chuchu-yellow">
                          {pos.openedAt ? `${formatUtcDate(pos.openedAt)} ${formatUtcTime(pos.openedAt)} UTC` : '---'}
                        </div>
                      </div>
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

                  {/* Live Trailing Bar */}
                  <TrailingBar pos={pos} livePrice={livePrice} />

                  {/* Trailing Stop Manager */}
                  <TrailingStopManager pos={pos} livePrice={livePrice} setTrailingStop={setTrailingStop} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DAILY PROFIT & LOSS TRADE HISTORY */}
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
              onClick={handleDownloadCsv}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 text-[10px] font-black transition-all"
              title="Download full trade history as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>DOWNLOAD CSV</span>
            </button>
          </div>
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
        ) : (
          /* FULL TRADE HISTORY TABLE */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-chuchu-card text-chuchu-muted uppercase text-[10px] border-b border-chuchu-border">
                  <th className="py-2.5 px-3">OPEN → CLOSE (UTC)</th>
                  <th className="py-2.5 px-3">SYMBOL</th>
                  <th className="py-2.5 px-3">SIDE</th>
                  <th className="py-2.5 px-3">OPEN PRICE</th>
                  <th className="py-2.5 px-3">CLOSE PRICE</th>
                  <th className="py-2.5 px-3">QUANTITY</th>
                  <th className="py-2.5 px-3">NOTIONAL (USDT)</th>
                  <th className="py-2.5 px-3">FEE (USDT)</th>
                  <th className="py-2.5 px-3">SLIPPAGE</th>
                  <th className="py-2.5 px-3">ENTRY REASON</th>
                  <th className="py-2.5 px-3">REGIME</th>
                  <th className="py-2.5 px-3">FUNDING (USDT)</th>
                  <th className="py-2.5 px-3">EXIT REASON</th>
                  <th className="py-2.5 px-3">REALIZED PNL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-chuchu-border/50 text-chuchu-text num-font">
                {filteredHistory.map((trade) => {
                  const isBuy = trade.side === 'BUY';
                  const notional = trade.fillPrice * trade.quantity;
                  const isClose = trade.pnl !== undefined;
                  const openPrice = trade.openPrice ?? trade.fillPrice;
                  const openTime = trade.openedAt ?? trade.timestamp;
                  const holdMs = isClose ? trade.timestamp - openTime : 0;

                  return (
                    <tr key={trade.tradeId} className="hover:bg-chuchu-panel/50 transition-colors">
                      <td className="py-2.5 px-3 text-chuchu-muted font-sans text-[10px] whitespace-nowrap">
                        {isClose ? (
                          <div className="leading-tight">
                            <div className="text-chuchu-muted">{formatUtcDate(openTime)}</div>
                            <div className="flex items-center gap-1">
                              <span>{formatUtcTime(openTime)}</span>
                              <span className="text-chuchu-cyan">→</span>
                              <span>{formatUtcTime(trade.timestamp)}</span>
                              <span className="text-chuchu-cyan font-bold">UTC · {formatHoldDuration(holdMs)}</span>
                            </div>
                          </div>
                        ) : (
                          <span>{formatTime(trade.timestamp, 'UTC')}</span>
                        )}
                      </td>
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
                      <td className="py-2.5 px-3 font-bold text-chuchu-text">${formatPrice(openPrice)}</td>
                      <td className="py-2.5 px-3 font-bold text-chuchu-cyan">
                        {isClose ? `$${formatPrice(trade.fillPrice)}` : <span className="text-chuchu-muted">—</span>}
                      </td>
                      <td className="py-2.5 px-3 font-semibold">{trade.quantity}</td>
                      <td className="py-2.5 px-3">${notional.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-amber-400">${trade.fee.toFixed(4)}</td>
                      <td className="py-2.5 px-3">{trade.slippagePct.toFixed(3)}%</td>
                      <td className="py-2.5 px-3 text-chuchu-cyan font-sans text-[11px]">
                        {trade.context?.reasonOfEntry ? trade.context.reasonOfEntry : <span className="text-chuchu-muted">—</span>}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-[11px]">
                        {trade.context?.marketRegime ? trade.context.marketRegime : <span className="text-chuchu-muted">—</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        {trade.fundingPaid !== undefined && trade.fundingPaid !== 0 ? (
                          <span className={trade.fundingPaid > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                            {trade.fundingPaid > 0 ? '+' : ''}{trade.fundingPaid.toFixed(4)}
                          </span>
                        ) : (
                          <span className="text-chuchu-muted">—</span>
                        )}
                      </td>
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
