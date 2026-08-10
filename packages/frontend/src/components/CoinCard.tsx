import React from 'react';
import { AggregatedSymbolState, CandidateLifecycle } from '@chuchu/shared';
import { ArrowUpRight, ArrowDownRight, Layers, Star } from 'lucide-react';
import { useChuchuStore } from '../store/useChuchuStore';
import { formatPrice, formatLatencyDelay, formatUsdCompact } from '../utils/formatting';

interface CoinCardProps {
  state: AggregatedSymbolState;
}

export interface RsiZoneMeta {
  colorClass: string;
  status: string;
  badgeLabel: string;
}

/**
 * Exact User-Defined TIMEFRAME RSI MATRIX:
 * 0 - 20   : Extreme Oversold   -> 🟢 Green (Extreme Buy Zone)
 * 20 - 30  : Oversold           -> 🟩 Light Green (Oversold)
 * 30 - 45  : Bullish Recovery   -> ⚫ Gray (Recovering)
 * 45 - 55  : Neutral            -> ⚫ Gray (Neutral)
 * 55 - 70  : Bullish            -> ⚫ Gray (Bullish)
 * 70 - 80  : Overbought         -> 🟧 Orange (Overbought)
 * 80 - 100 : Extreme Overbought -> 🔴 Red (Extreme Sell Zone)
 */
export const getRsiZoneMeta = (rsi: number): RsiZoneMeta => {
  if (rsi >= 80) {
    return {
      colorClass: 'bg-rose-950/90 text-rose-300 border border-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.4)] font-black',
      status: 'Extreme Overbought',
      badgeLabel: 'Extreme Sell Zone'
    };
  }
  if (rsi >= 70) {
    return {
      colorClass: 'bg-amber-950/80 text-amber-300 border border-amber-500/80 font-bold',
      status: 'Overbought',
      badgeLabel: 'Overbought'
    };
  }
  if (rsi >= 55) {
    return {
      colorClass: 'bg-chuchu-panel text-slate-300 border border-chuchu-border font-medium',
      status: 'Bullish',
      badgeLabel: 'Bullish'
    };
  }
  if (rsi >= 45) {
    return {
      colorClass: 'bg-chuchu-panel text-slate-400 border border-chuchu-border font-normal',
      status: 'Neutral',
      badgeLabel: 'Neutral'
    };
  }
  if (rsi >= 30) {
    return {
      colorClass: 'bg-chuchu-panel text-slate-300 border border-chuchu-border font-medium',
      status: 'Bullish Recovery',
      badgeLabel: 'Recovering'
    };
  }
  if (rsi >= 20) {
    return {
      colorClass: 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/80 font-bold',
      status: 'Oversold',
      badgeLabel: 'Oversold'
    };
  }
  return {
    colorClass: 'bg-green-950/90 text-green-300 border border-green-400 shadow-[0_0_10px_rgba(34,197,94,0.4)] font-black',
    status: 'Extreme Oversold',
    badgeLabel: 'Extreme Buy Zone'
  };
};

export const getRsiColorClass = (rsi: number): string => getRsiZoneMeta(rsi).colorClass;

export const getWrZoneMeta = (wr: number): RsiZoneMeta => {
  if (wr >= 80) {
    return {
      colorClass: 'bg-rose-950/90 text-rose-300 border border-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.4)] font-black',
      status: 'Extreme Overbought',
      badgeLabel: 'Extreme Sell Zone'
    };
  }
  if (wr >= 70) {
    return {
      colorClass: 'bg-amber-950/80 text-amber-300 border border-amber-500/80 font-bold',
      status: 'Overbought',
      badgeLabel: 'Overbought'
    };
  }
  if (wr <= 20) {
    return {
      colorClass: 'bg-green-950/90 text-green-300 border border-green-400 shadow-[0_0_10px_rgba(34,197,94,0.4)] font-black',
      status: 'Extreme Oversold',
      badgeLabel: 'Extreme Buy Zone'
    };
  }
  if (wr <= 30) {
    return {
      colorClass: 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/80 font-bold',
      status: 'Oversold',
      badgeLabel: 'Oversold'
    };
  }
  return {
    colorClass: 'bg-chuchu-panel text-slate-300 border border-chuchu-border font-medium',
    status: 'Neutral',
    badgeLabel: 'Neutral'
  };
};

// Lifecycle badge styles
const LIFECYCLE_STYLES: Record<CandidateLifecycle, string> = {
  DISCOVERED: 'bg-slate-700/60 text-slate-400 border-slate-600/60',
  WATCHLIST:  'bg-blue-500/15 text-blue-300 border-blue-500/40',
  HEATING:    'bg-amber-500/15 text-amber-300 border-amber-500/50',
  QUALIFIED:  'bg-cyan-500/15 text-chuchu-cyan border-chuchu-cyan/50',
  SIGNAL:     'bg-emerald-500/20 text-emerald-300 border-emerald-400/60 animate-pulse',
  OPEN_TRADE: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/60 animate-pulse',
  REQUALIFY:  'bg-rose-500/20 text-rose-300 border-rose-500/60 animate-pulse',
  CLOSED:     'bg-slate-600/50 text-slate-400 border-slate-600/40',
};

export const CoinCard: React.FC<CoinCardProps> = React.memo(({ state }) => {
  const { setSelectedSymbol, setActivePage, submitOrder, focusedSymbol, setFocusedSymbol } = useChuchuStore();

  const symbol = state.symbol;
  const price = state.lastTick?.price || 0;
  const isBuy = !state.lastTick?.isBuyerMaker;

  const mtRsi = state.indicators?.rsiMultiTimeframe || { tf5m: 50, tf15m: 50, tf1h: 50, tf4h: 50, tf12h: 50 };
  const mtWr = state.indicators?.williamsRMultiTimeframe || { tf1m: 50, tf5m: 50, tf15m: 50, tf1h: 50, tf4h: 50 };
  const williamsR200Mtf = state.indicators?.williamsR200 ?? 50;
  const funding = (state.fundingRate || 0.0001) * 100;
  const openInterest = state.openInterest || 15000;
  const oiDelta = state.openInterestDeltaPct || 0;
  const cvd = state.microstructure?.cvd || 0;
  const cvdPerSec = state.microstructure?.cvdPerSec || 0;
  const cvdDelta5s = state.microstructure?.cvdDelta5s || 0;
  const volume = state.volume24h || 50_000_000;
  const vwap = state.indicators?.vwap || price;
  const atr = state.indicators?.atr14 || price * 0.015;
  const pocPrice = state.indicators?.vpvr?.pocPrice || price;

  const regime = state.regime?.regime || 'MEAN_REVERTING';
  const buyerPct = state.microstructure?.orderbookBuyerPct || 50;
  const sweepDetected = state.microstructure?.sweepDetected || false;
  const whaleActivity = state.microstructure?.whaleActivity || false;
  const spoofingProb = state.microstructure?.spoofingProbabilityPct || 0;

  const longPct = state.longPct || 50;
  const shortPct = state.shortPct || 50;
  const riskLevel = state.riskLevel || 'LOW';

  // Data Freshness & Data Age calculation
  const dataAgeMs = Date.now() - (state.timestamp || Date.now());
  const dataAgeSec = Math.max(0, dataAgeMs / 1000);

  let statusBadge: { label: string; style: string };
  if (dataAgeSec < 2.0) {
    statusBadge = {
      label: `🟢 LIVE (${dataAgeSec.toFixed(1)}s)`,
      style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-extrabold'
    };
  } else if (dataAgeSec < 10.0) {
    statusBadge = {
      label: `🟡 DELAYED (${dataAgeSec.toFixed(1)}s)`,
      style: 'bg-amber-500/10 text-amber-300 border-amber-500/30 font-extrabold animate-pulse'
    };
  } else {
    statusBadge = {
      label: `🔴 DISCONNECTED (${dataAgeSec.toFixed(1)}s)`,
      style: 'bg-rose-500/10 text-rose-400 border-rose-500/30 font-extrabold'
    };
  }

  const lastTickFormatted = state.timestamp
    ? new Date(state.timestamp).toISOString().split('T')[1].slice(0, 8) + ' UTC'
    : 'SYNCING...';

  const handleTrade = (side: 'BUY' | 'SELL') => {
    setSelectedSymbol(symbol);
    submitOrder(symbol, side, 1.0);
    setActivePage('paper-trading');
  };

  return (
    <div className="glass-panel rounded-xl p-3.5 border border-chuchu-border/80 hover:border-chuchu-cyan/40 transition-all duration-200 shadow-lg flex flex-col justify-between space-y-2 font-sans text-chuchu-text">
      {/* Header: Symbol & Price */}
      <div className="flex items-center justify-between pb-1.5 border-b border-chuchu-border">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-base font-bold text-chuchu-text tracking-wide">{symbol}</span>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const isCurrent = focusedSymbol === symbol;
                await setFocusedSymbol(isCurrent ? null : symbol);
                if (!isCurrent) {
                  setActivePage('sniper');
                }
              }}
              className="p-0.5 hover:text-chuchu-cyan transition-colors shrink-0"
              title={focusedSymbol === symbol ? "Remove from Sniper Mode" : "Activate Sniper Mode"}
            >
              <Star className={`w-3.5 h-3.5 ${focusedSymbol === symbol ? 'text-chuchu-cyan fill-chuchu-cyan' : 'text-chuchu-muted'}`} />
            </button>
            <span className="text-[10px] px-2 py-0.5 rounded bg-chuchu-panel text-chuchu-cyan font-semibold">PERP</span>
            {state.lifecycle && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold tracking-wider uppercase ${LIFECYCLE_STYLES[state.lifecycle]}`}>
                {state.lifecycle.replace('_', ' ')}
              </span>
            )}
            <span className={`text-[10px] px-2 py-0.5 rounded border font-mono ${statusBadge.style}`}>
              {statusBadge.label}
            </span>
          </div>
          <div className="text-[10px] text-chuchu-muted num-font flex items-center space-x-1.5 mt-0.5">
            <span>Last Tick: <strong className="text-white font-mono">{lastTickFormatted}</strong></span>
          </div>
        </div>

        <div className="text-right">
          <div className={`text-lg font-extrabold num-font ${isBuy ? 'text-chuchu-green' : 'text-chuchu-red'}`}>
            ${price > 0 ? formatPrice(price) : '---'}
          </div>
          <div className="text-[10px] text-chuchu-muted num-font">
            VWAP: <span className="text-chuchu-text">${formatPrice(vwap)}</span> | POC: <span className="text-chuchu-text">${formatPrice(pocPrice)}</span>
          </div>
        </div>
      </div>

      {/* TOP SECTION: Clickable LONG & SHORT Action Buttons with Embedded Probabilities */}
      <div className="grid grid-cols-2 gap-2 font-sans">
        <button
          onClick={() => handleTrade('BUY')}
          className="flex items-center justify-between px-3 py-1.5 rounded-lg font-black text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 hover:border-emerald-400 transition-all duration-150 shadow-[0_0_12px_rgba(16,185,129,0.15)] group"
          title={`Click to open LONG paper trade on ${symbol}`}
        >
          <div className="flex items-center space-x-1">
            <ArrowUpRight className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span>LONG</span>
          </div>
          <span className="num-font text-xs bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40 text-emerald-300 font-extrabold">
            {longPct}%
          </span>
        </button>

        <button
          onClick={() => handleTrade('SELL')}
          className="flex items-center justify-between px-3 py-1.5 rounded-lg font-black text-xs bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30 hover:border-rose-400 transition-all duration-150 shadow-[0_0_12px_rgba(244,63,94,0.15)] group"
          title={`Click to open SHORT paper trade on ${symbol}`}
        >
          <div className="flex items-center space-x-1">
            <ArrowDownRight className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span>SHORT</span>
          </div>
          <span className="num-font text-xs bg-rose-950/80 px-2 py-0.5 rounded border border-rose-500/40 text-rose-300 font-extrabold">
            {shortPct}%
          </span>
        </button>
      </div>

      {/* Multi-Timeframe RSI Matrix */}
      <div className="bg-chuchu-bg/80 p-1.5 rounded-lg border border-chuchu-border/60 text-xs space-y-1">
        <div className="flex items-center justify-between text-[10px] text-chuchu-muted font-extrabold tracking-wider uppercase">
          <span>TIMEFRAME RSI MATRIX</span>
          <span className="text-[9px] text-chuchu-cyan">Overbought / Oversold</span>
        </div>
        <div className="grid grid-cols-5 gap-1 text-center">
          {[
            { label: '5m', val: mtRsi.tf5m },
            { label: '15m', val: mtRsi.tf15m },
            { label: '1H', val: mtRsi.tf1h },
            { label: '4H', val: mtRsi.tf4h },
            { label: '12H', val: mtRsi.tf12h },
          ].map(tf => {
            const meta = getRsiZoneMeta(tf.val);
            return (
              <div key={tf.label} title={`${meta.status} (${meta.badgeLabel})`} className={`p-1 rounded text-xs transition-all ${meta.colorClass}`}>
                <div className="text-[9px] opacity-80 uppercase tracking-tighter">{tf.label}</div>
                <div className="num-font font-black text-xs">{tf.val}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Multi-Timeframe W%R (200) Matrix (4H, 1H, 15m, 5m, 1m) */}
      <div className="bg-chuchu-bg/80 p-1.5 rounded-lg border border-chuchu-border/60 text-xs space-y-1">
        <div className="flex items-center justify-between text-[10px] text-chuchu-muted font-extrabold tracking-wider uppercase">
          <span>TIMEFRAME W%R (200) MATRIX</span>
          <span className="text-[9px] text-emerald-400 font-bold">AVG: {williamsR200Mtf}%</span>
        </div>
        <div className="grid grid-cols-5 gap-1 text-center">
          {[
            { label: '4H', val: mtWr.tf4h },
            { label: '1H', val: mtWr.tf1h },
            { label: '15m', val: mtWr.tf15m },
            { label: '5m', val: mtWr.tf5m },
            { label: '1m', val: mtWr.tf1m },
          ].map(tf => {
            const meta = getWrZoneMeta(tf.val);
            return (
              <div key={tf.label} title={`W%R 200 (${tf.label}): ${tf.val}%`} className={`p-1 rounded text-xs transition-all ${meta.colorClass}`}>
                <div className="text-[9px] opacity-80 uppercase tracking-tighter">{tf.label}</div>
                <div className="num-font font-black text-xs">{tf.val}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real Quantitative Metrics Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs border-t border-chuchu-border/50 pt-1.5 num-font">
        <div className="flex justify-between">
          <span className="text-chuchu-muted font-sans">W%R 200 MTF Avg:</span>
          <span className="font-semibold text-emerald-400 font-bold">{williamsR200Mtf}%</span>
        </div>

        <div className="flex justify-between">
          <span className="text-chuchu-muted font-sans">Funding Rate:</span>
          <span className={`font-semibold ${funding >= 0 ? 'text-chuchu-green' : 'text-chuchu-red'}`}>{funding >= 0 ? `+${funding.toFixed(4)}%` : `${funding.toFixed(4)}%`}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-chuchu-muted font-sans">Open Interest:</span>
          <span className="font-semibold text-chuchu-text">{openInterest.toLocaleString()} <span className="text-[10px] text-chuchu-green">({oiDelta >= 0 ? `+${oiDelta}%` : `${oiDelta}%`})</span></span>
        </div>

        <div className="flex justify-between">
          <span className="text-chuchu-muted font-sans">CVD Delta:</span>
          <span className={`font-semibold ${cvd >= 0 ? 'text-chuchu-green' : 'text-chuchu-red'}`}>
            {formatUsdCompact(cvd)}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-chuchu-muted font-sans">CVD/s:</span>
          <span className={`font-semibold ${cvdPerSec >= 0 ? 'text-chuchu-green' : 'text-chuchu-red'}`}>
            {formatUsdCompact(cvdPerSec)}
            {cvdDelta5s !== 0 && <span className="text-[10px] ml-1">5s {formatUsdCompact(cvdDelta5s)}</span>}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-chuchu-muted font-sans">24h Volume:</span>
          <span className="font-semibold text-chuchu-text">${(volume / 1_000_000).toFixed(1)}M</span>
        </div>

        <div className="flex justify-between">
          <span className="text-chuchu-muted font-sans">Regime:</span>
          <span className="font-semibold text-chuchu-cyan text-[11px] truncate max-w-[90px] font-sans">{regime}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-chuchu-muted font-sans">Orderbook:</span>
          <span className={`font-semibold ${buyerPct >= 50 ? 'text-chuchu-green' : 'text-chuchu-red'}`}>
            Buyers {buyerPct.toFixed(0)}%
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-chuchu-muted font-sans">Liquidity Sweeps:</span>
          <span className={`font-semibold font-sans ${sweepDetected ? 'text-chuchu-green animate-pulse' : 'text-chuchu-muted'}`}>
            {sweepDetected ? 'DETECTED' : 'NONE'}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-chuchu-muted font-sans">Whale Activity:</span>
          <span className={`font-semibold font-sans ${whaleActivity ? 'text-chuchu-purple font-bold' : 'text-chuchu-muted'}`}>
            {whaleActivity ? 'ACTIVE' : 'QUIET'}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-chuchu-muted font-sans">Spoofing Prob:</span>
          <span className={`font-semibold ${spoofingProb > 20 ? 'text-chuchu-red' : 'text-chuchu-muted'}`}>{spoofingProb}%</span>
        </div>

        <div className="flex justify-between">
          <span className="text-chuchu-muted font-sans">ATR (14):</span>
          <span className="font-semibold text-chuchu-text">${atr.toFixed(2)}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-chuchu-muted font-sans">Risk Level:</span>
          <span className={`font-bold font-sans ${riskLevel === 'EXTREME' ? 'text-chuchu-red' : riskLevel === 'HIGH' ? 'text-chuchu-yellow' : 'text-chuchu-green'}`}>
            {riskLevel}
          </span>
        </div>
      </div>
    </div>
  );
});
