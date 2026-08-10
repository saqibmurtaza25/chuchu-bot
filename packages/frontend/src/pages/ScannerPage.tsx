import React, { useState, useEffect } from 'react';
import { useChuchuStore } from '../store/useChuchuStore';
import {
  Cpu, Flame, Award, BrainCircuit,
  ArrowUpRight, ArrowDownRight, RefreshCw, Search, Filter
} from 'lucide-react';
import { DiscoveredCoin, HeatCandidate, PrioritizedCandidate, CandidateLifecycle } from '@chuchu/shared';
import { getRsiColorClass } from '../components/CoinCard';
import { formatPrice, formatLatencyDelay, formatUsdCompact } from '../utils/formatting';

type ScannerTab = 'discovery' | 'heat' | 'signals' | 'all';
type TimeframeFilter = 'ALL' | '5m' | '15m' | '1H' | '4H' | '12H';

// Lifecycle badge
const LIFECYCLE_STYLES: Record<CandidateLifecycle, string> = {
  DISCOVERED: 'bg-slate-700/60 text-slate-400 border-slate-600/60',
  WATCHLIST:  'bg-blue-500/15 text-blue-300 border-blue-500/40',
  HEATING:    'bg-amber-500/15 text-amber-300 border-amber-500/50',
  QUALIFIED:  'bg-cyan-500/15 text-cyan-300 border-chuchu-cyan/50',
  SIGNAL:     'bg-emerald-500/20 text-emerald-300 border-emerald-400/60 animate-pulse',
  OPEN_TRADE: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/60 animate-pulse',
  REQUALIFY:  'bg-rose-500/20 text-rose-300 border-rose-500/60 animate-pulse',
  CLOSED:     'bg-slate-600/50 text-slate-400 border-slate-600/40',
};

const LifecycleBadge: React.FC<{ lifecycle?: CandidateLifecycle }> = ({ lifecycle }) => {
  if (!lifecycle) return <span className="text-chuchu-muted">—</span>;
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold tracking-wider uppercase ${LIFECYCLE_STYLES[lifecycle]}`}>
      {lifecycle.replace('_', ' ')}
    </span>
  );
};

// --- Tag badge component ---
const TagBadge: React.FC<{ tag: string }> = ({ tag }) => {
  const styles: Record<string, string> = {
    NEW_LISTING:        'bg-purple-500/15 text-purple-300 border-purple-500/30',
    TOP_GAINER:         'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    TOP_LOSER:          'bg-rose-500/15 text-rose-400 border-rose-500/30',
    HIGH_VOLUME:        'bg-blue-500/15 text-blue-300 border-blue-500/30',
    HIGH_VOLUME_CHANGE: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    HIGH_OI_CHANGE:     'bg-orange-500/15 text-orange-300 border-orange-500/30',
    USER_WATCHLIST:     'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  };
  const labels: Record<string, string> = {
    NEW_LISTING:        'NEW',
    TOP_GAINER:         'GAINER',
    TOP_LOSER:          'LOSER',
    HIGH_VOLUME:        'HIGH VOL',
    HIGH_VOLUME_CHANGE: 'VOL SPIKE',
    HIGH_OI_CHANGE:     'OI SPIKE',
    USER_WATCHLIST:     'WATCHLIST',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold tracking-wide ${styles[tag] || 'bg-chuchu-panel text-chuchu-muted border-chuchu-border'}`}>
      {labels[tag] || tag}
    </span>
  );
};

// --- Heat zone badge ---
const HeatZoneBadge: React.FC<{ zone: string; confirmed: boolean }> = ({ zone, confirmed }) => {
  const styles: Record<string, string> = {
    OVERBOUGHT:      'bg-rose-500/15 text-rose-400 border-rose-500/40',
    NEAR_OVERBOUGHT: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    OVERSOLD:        'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
    NEAR_OVERSOLD:   'bg-teal-500/15 text-teal-300 border-teal-500/30',
  };
  return (
    <div className="flex items-center space-x-1.5">
      <span className={`text-[11px] px-2.5 py-0.5 rounded border font-bold uppercase tracking-wider ${styles[zone] || 'bg-chuchu-panel text-chuchu-muted border-chuchu-border'}`}>
        {zone.replace('_', ' ')}
      </span>
      {confirmed && (
        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-cyan-500/10 text-chuchu-cyan border-chuchu-cyan/40 font-bold">
          WMR✓
        </span>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// TAB 1: Live Discovery
// ─────────────────────────────────────────────
const DiscoveryTab: React.FC<{ coins: DiscoveredCoin[] }> = ({ coins }) => (
  <div className="glass-panel rounded-xl overflow-x-auto border border-chuchu-border shadow-xl">
    <table className="w-full text-left border-collapse text-xs font-sans">
      <thead>
        <tr className="bg-chuchu-card/90 border-b border-chuchu-border text-chuchu-muted font-bold uppercase text-[11px] tracking-wider">
          <th className="py-3.5 px-5">SYMBOL</th>
          <th className="py-3.5 px-5">LIFECYCLE</th>
          <th className="py-3.5 px-5">CATEGORY / TAGS</th>
          <th className="py-3.5 px-5">MARK PRICE</th>
          <th className="py-3.5 px-5">24H CHANGE</th>
          <th className="py-3.5 px-5">24H VOLUME</th>
          <th className="py-3.5 px-5">AGE</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-chuchu-border/40 text-chuchu-text">
        {coins.length === 0 ? (
          <tr>
            <td colSpan={7} className="py-12 text-center text-chuchu-muted font-medium text-sm">
              Initializing 4-Stage Discovery Pipeline... (Auto-refreshes every 30s)
            </td>
          </tr>
        ) : (
          coins.map((coin) => (
            <tr key={coin.symbol} className="hover:bg-chuchu-panel/60 transition-all duration-150">
              <td className="py-3.5 px-5 font-bold text-chuchu-text text-sm flex items-center space-x-2">
                <span>{coin.symbol}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-chuchu-panel border border-chuchu-border text-chuchu-cyan font-semibold">PERP</span>
                <span className="text-[10px] font-mono text-chuchu-yellow font-extrabold bg-chuchu-yellow/10 px-1.5 py-0.5 rounded">
                  -{formatLatencyDelay(coin.timestamp || Date.now())}
                </span>
              </td>
              <td className="py-3.5 px-5">
                <LifecycleBadge lifecycle={(coin as any).lifecycle} />
              </td>
              <td className="py-3.5 px-5">
                <div className="flex flex-wrap gap-1.5">
                  {coin.tags.map(tag => <TagBadge key={tag} tag={tag} />)}
                </div>
              </td>
              <td className="py-3.5 px-5 font-semibold text-chuchu-text text-sm num-font">
                ${formatPrice(coin.lastPrice)}
              </td>
              <td className={`py-3.5 px-5 font-bold text-sm num-font ${coin.priceChangePercent24h >= 0 ? 'text-chuchu-green' : 'text-chuchu-red'}`}>
                {coin.priceChangePercent24h >= 0 ? '+' : ''}{coin.priceChangePercent24h}%
              </td>
              <td className="py-3.5 px-5 font-medium text-slate-300 num-font">
                ${(coin.quoteVolume24h / 1_000_000).toFixed(2)}M
              </td>
              <td className="py-3.5 px-5 font-medium text-chuchu-muted">
                {coin.listingAgeDays !== undefined
                  ? coin.listingAgeDays <= 7
                    ? <span className="text-purple-300 font-bold">🆕 {coin.listingAgeDays}d</span>
                    : `${coin.listingAgeDays} days`
                  : '---'}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

// ─────────────────────────────────────────────
// TAB 2: Heat Hunter (with Multi-Timeframe Matrix & TF Filter)
// ─────────────────────────────────────────────
const HeatTab: React.FC<{ candidates: HeatCandidate[] }> = ({ candidates }) => {
  const { states } = useChuchuStore();
  const [selectedTf, setSelectedTf] = useState<TimeframeFilter>('ALL');

  // Filter candidates by timeframe condition if selected
  const filteredCandidates = candidates.filter(c => {
    if (selectedTf === 'ALL') return true;
    const state = states.get(c.symbol);
    const mtRsi = state?.indicators?.rsiMultiTimeframe;
    if (!mtRsi) return true;

    const rsiVal =
      selectedTf === '5m' ? mtRsi.tf5m :
      selectedTf === '15m' ? mtRsi.tf15m :
      selectedTf === '1H' ? mtRsi.tf1h :
      selectedTf === '4H' ? mtRsi.tf4h : mtRsi.tf12h;

    // Show if selected timeframe is in extreme or near heat zone (>60 or <40)
    return rsiVal >= 60 || rsiVal <= 40;
  });

  return (
    <div className="space-y-4">
      {/* Timeframe Filter Controls */}
      <div className="flex items-center justify-between bg-chuchu-card p-3 rounded-xl border border-chuchu-border">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-chuchu-cyan" />
          <span className="text-xs font-bold text-chuchu-text uppercase tracking-wider">FILTER BY TIMEFRAME RSI:</span>
        </div>
        <div className="flex items-center space-x-1">
          {(['ALL', '5m', '15m', '1H', '4H', '12H'] as const).map(tf => (
            <button
              key={tf}
              onClick={() => setSelectedTf(tf)}
              className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${selectedTf === tf ? 'bg-chuchu-cyan text-black shadow-[0_0_10px_rgba(0,240,255,0.3)]' : 'bg-chuchu-panel text-chuchu-muted hover:text-chuchu-text'}`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Heat Hunter Table */}
      <div className="glass-panel rounded-xl overflow-x-auto border border-chuchu-border shadow-xl">
        <table className="w-full text-left border-collapse text-xs font-sans">
          <thead>
            <tr className="bg-chuchu-card/90 border-b border-chuchu-border text-chuchu-muted font-bold uppercase text-[11px] tracking-wider">
              <th className="py-3.5 px-4">SYMBOL</th>
              <th className="py-3.5 px-4">PRIMARY ZONE</th>
              <th className="py-3.5 px-4 text-center">5m RSI</th>
              <th className="py-3.5 px-4 text-center">15m RSI</th>
              <th className="py-3.5 px-4 text-center">1H RSI</th>
              <th className="py-3.5 px-4 text-center">4H RSI</th>
              <th className="py-3.5 px-4 text-center">W%R 4H</th>
              <th className="py-3.5 px-4 text-center">W%R 1H</th>
              <th className="py-3.5 px-4 text-center">W%R 15m</th>
              <th className="py-3.5 px-4 text-center">W%R 5m</th>
              <th className="py-3.5 px-4 text-center">W%R 1m</th>
              <th className="py-3.5 px-4 text-center">W%R MTF AVG</th>
              <th className="py-3.5 px-4">24H VOL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-chuchu-border/40 text-chuchu-text">
            {filteredCandidates.length === 0 ? (
              <tr>
                <td colSpan={13} className="py-12 text-center text-chuchu-muted font-medium text-sm">
                  No coins currently match the selected timeframe heat filter. Pipeline scanning live...
                </td>
              </tr>
            ) : (
              filteredCandidates.map((c) => {
                const state = states.get(c.symbol);
                const mtRsi = state?.indicators?.rsiMultiTimeframe || { tf5m: c.rsi5m, tf15m: 50, tf1h: 50, tf4h: 50, tf12h: 50 };
                const mtWr = state?.indicators?.williamsRMultiTimeframe || { tf1m: 50, tf5m: 50, tf15m: 50, tf1h: 50, tf4h: 50 };
                const wrAvg = state?.indicators?.williamsR200 ?? 50;

                return (
                  <tr key={c.symbol} className="hover:bg-chuchu-panel/60 transition-all duration-150">
                    <td className="py-3.5 px-4 font-bold text-chuchu-text text-sm">
                      <div className="flex items-center space-x-2">
                        <span>{c.symbol}</span>
                        <span className="text-[10px] font-mono text-chuchu-yellow font-extrabold bg-chuchu-yellow/10 px-1.5 py-0.5 rounded">
                          -{formatLatencyDelay(c.timestamp || Date.now())}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {c.tags.slice(0, 1).map(tag => <TagBadge key={tag} tag={tag} />)}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <HeatZoneBadge zone={c.heatZone} confirmed={c.heatConfirmed} />
                    </td>

                    {/* Color-Coded Multi-Timeframe RSI Cells */}
                    {[
                      { tf: '5m', val: mtRsi.tf5m },
                      { tf: '15m', val: mtRsi.tf15m },
                      { tf: '1H', val: mtRsi.tf1h },
                      { tf: '4H', val: mtRsi.tf4h },
                    ].map(cell => (
                      <td key={cell.tf} className="py-3.5 px-2 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded text-xs num-font ${getRsiColorClass(cell.val)}`}>
                          {cell.val}
                        </span>
                      </td>
                    ))}

                    {/* Color-Coded Multi-Timeframe W%R Cells (4H, 1H, 15m, 5m, 1m) */}
                    {[
                      { tf: '4H', val: mtWr.tf4h },
                      { tf: '1H', val: mtWr.tf1h },
                      { tf: '15m', val: mtWr.tf15m },
                      { tf: '5m', val: mtWr.tf5m },
                      { tf: '1m', val: mtWr.tf1m },
                    ].map(cell => (
                      <td key={cell.tf} className="py-3.5 px-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs num-font font-bold ${
                          cell.val >= 80 ? 'bg-rose-950/80 text-rose-300 border border-rose-500/80' :
                          cell.val >= 70 ? 'bg-amber-950/80 text-amber-300 border border-amber-500/80' :
                          cell.val <= 20 ? 'bg-green-950/80 text-green-300 border border-green-400' :
                          cell.val <= 30 ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/80' :
                          'bg-chuchu-panel text-slate-300 border border-chuchu-border'
                        }`}>
                          {cell.val}%
                        </span>
                      </td>
                    ))}

                    <td className="py-3.5 px-4 text-center font-extrabold text-sm text-emerald-400 num-font">
                      {wrAvg}%
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-300 num-font">
                      ${(c.quoteVolume24h / 1_000_000).toFixed(1)}M
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// TAB 3: Final Signals
// ─────────────────────────────────────────────
const SignalsTab: React.FC<{
  signals: PrioritizedCandidate[];
  onTrade: (symbol: string, side: 'BUY' | 'SELL') => void;
}> = ({ signals, onTrade }) => (
  <div className="space-y-4 font-sans">
    {signals.length === 0 ? (
      <div className="glass-panel rounded-xl border border-chuchu-border p-12 text-center text-chuchu-muted space-y-2">
        <div className="text-2xl font-bold text-chuchu-text">🎯 No High-Probability Signals Currently</div>
        <p className="text-xs text-chuchu-muted max-w-md mx-auto">
          CHUCHU's institutional signal engine filters noise strictly — 0 to 5 high-conviction scalping setups expected per scan cycle.
        </p>
      </div>
    ) : (
      signals.map((s) => {
        const sig = s.state?.signal;
        const isBuy = sig?.signal === 'BUY';
        const isSell = sig?.signal === 'SELL';
        return (
          <div
            key={s.symbol}
            className={`glass-panel rounded-xl border p-5 transition-all shadow-lg ${isBuy ? 'border-chuchu-green/50 bg-chuchu-green/5' : isSell ? 'border-chuchu-red/50 bg-chuchu-red/5' : 'border-chuchu-border'}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <span className="font-extrabold text-chuchu-text text-lg tracking-wide">{s.symbol}</span>
                <span className="text-base" title={s.priorityLabel}>{s.priorityStars}</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-chuchu-panel text-chuchu-text border border-chuchu-border">
                  {s.priorityLabel}
                </span>
                <HeatZoneBadge zone={s.heatZone} confirmed={s.heatConfirmed} />
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex flex-col items-end mr-2">
                  <span className="text-[10px] text-chuchu-muted font-bold tracking-widest uppercase">RATE / DELAY</span>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-mono text-sm text-chuchu-text font-bold">${formatPrice(s.state?.lastTick?.price || 0)}</span>
                    <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-1 rounded">-{formatLatencyDelay(s.state?.timestamp || Date.now())}</span>
                  </div>
                </div>
                <span className={`text-sm font-extrabold px-3.5 py-1 rounded border uppercase tracking-wider ${isBuy ? 'bg-chuchu-green/20 text-chuchu-green border-chuchu-green/50' : isSell ? 'bg-chuchu-red/20 text-chuchu-red border-chuchu-red/50' : 'bg-chuchu-panel text-chuchu-muted border-chuchu-border'}`}>
                  {sig?.signal || 'NEUTRAL'}
                </span>
                <div className="flex flex-col text-right text-[10px] sm:text-xs font-bold num-font text-chuchu-cyan">
                  <span>Hunter: {sig?.hunterScore || 0}</span>
                  <span className="text-chuchu-yellow">Quality: {sig?.setupQuality || 0}/100</span>
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-4 text-xs">
              <div className="bg-chuchu-panel/80 rounded-lg p-2.5 border border-chuchu-border/60">
                <div className="text-chuchu-muted font-medium text-[11px] mb-1">RSI (5m)</div>
                <div className={`font-extrabold text-sm num-font ${s.rsi5m > 70 ? 'text-rose-400' : s.rsi5m < 30 ? 'text-emerald-400' : 'text-chuchu-text'}`}>{s.rsi5m}</div>
              </div>
              <div className="bg-chuchu-panel/80 rounded-lg p-2.5 border border-chuchu-border/60">
                <div className="text-chuchu-muted font-medium text-[11px] mb-1">WMR (200)</div>
                <div className={`font-extrabold text-sm num-font ${s.wmr200 > -20 ? 'text-rose-400' : s.wmr200 < -80 ? 'text-emerald-400' : 'text-chuchu-text'}`}>{s.wmr200}</div>
              </div>
              <div className="bg-chuchu-panel/80 rounded-lg p-2.5 border border-chuchu-border/60">
                <div className="text-chuchu-muted font-medium text-[11px] mb-1">Composite Score</div>
                <div className="font-extrabold text-sm text-chuchu-cyan num-font">{sig?.compositeScore ?? '---'}</div>
              </div>
              <div className="bg-chuchu-panel/80 rounded-lg p-2.5 border border-chuchu-border/60">
                <div className="text-chuchu-muted font-medium text-[11px] mb-1">Priority Rank</div>
                <div className="font-extrabold text-sm text-chuchu-text">P{s.priority}</div>
              </div>
              <div className="bg-chuchu-panel/80 rounded-lg p-2.5 border border-chuchu-border/60">
                <div className="text-chuchu-muted font-medium text-[11px] mb-1">Stop Loss</div>
                <div className="font-extrabold text-sm text-chuchu-red num-font">${sig?.stopLoss ? formatPrice(sig.stopLoss) : '---'}</div>
              </div>
              <div className="bg-chuchu-panel/80 rounded-lg p-2.5 border border-chuchu-border/60">
                <div className="text-chuchu-muted font-medium text-[11px] mb-1">Take Profit</div>
                <div className="font-extrabold text-sm text-chuchu-green num-font">${sig?.takeProfit ? formatPrice(sig.takeProfit) : '---'}</div>
              </div>
            </div>

            {/* Real Quantitative Metrics Grid */}
            {s.state && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-950/70 p-2 rounded-lg border border-slate-700/60 text-[11px] my-2.5 num-font font-sans">
                <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">W%R 200 Avg</div>
                  <div className="font-extrabold text-sm text-emerald-400">{(s.state.indicators?.williamsR200 ?? 50)}%</div>
                </div>
                <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">Funding Rate</div>
                  <div className={`font-extrabold text-sm ${((s.state.fundingRate || 0) * 100) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {((s.state.fundingRate || 0) * 100) >= 0 ? `+${((s.state.fundingRate || 0) * 100).toFixed(4)}%` : `${((s.state.fundingRate || 0) * 100).toFixed(4)}%`}
                  </div>
                </div>
                <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60 col-span-2">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">Open Interest (24h Delta)</div>
                  <div className="font-extrabold text-sm text-white">
                    {(s.state.openInterest || 15000).toLocaleString()}{' '}
                    <span className="text-xs text-emerald-400">
                      ({(s.state.openInterestDeltaPct || 0) >= 0 ? `+${(s.state.openInterestDeltaPct || 0)}%` : `${(s.state.openInterestDeltaPct || 0)}%`})
                    </span>
                  </div>
                </div>
                <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60 col-span-2">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">CVD Delta</div>
                  <div className={`font-extrabold text-sm ${(s.state.microstructure?.cvd || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatUsdCompact(s.state.microstructure?.cvd || 0)}
                  </div>
                </div>
                <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">24h Volume</div>
                  <div className="font-extrabold text-sm text-amber-300">${((s.state.volume24h || 50000000) / 1_000_000).toFixed(1)}M</div>
                </div>
                <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">Market Regime</div>
                  <div className="font-extrabold text-xs text-chuchu-cyan truncate">{s.state.regime?.regime || 'MEAN_REVERTING'}</div>
                </div>
                <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">Orderbook</div>
                  <div className={`font-extrabold text-sm ${(s.state.microstructure?.orderbookBuyerPct || 50) >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    Buyers {(s.state.microstructure?.orderbookBuyerPct || 50).toFixed(0)}%
                  </div>
                </div>
                <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">Spoofing Prob</div>
                  <div className="font-extrabold text-sm text-white">{(s.state.microstructure?.spoofingProbabilityPct || 0)}%</div>
                </div>
                <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">Whale Activity</div>
                  <div className={`font-extrabold text-sm ${s.state.microstructure?.whaleActivity ? 'text-purple-300 font-bold' : 'text-slate-300'}`}>
                    {s.state.microstructure?.whaleActivity ? 'ACTIVE' : 'QUIET'}
                  </div>
                </div>
                <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">Risk Level</div>
                  <div className={`font-bold text-sm ${s.state.riskLevel === 'EXTREME' ? 'text-rose-400' : s.state.riskLevel === 'HIGH' ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {s.state.riskLevel || 'LOW'}
                  </div>
                </div>
              </div>
            )}

            {/* Reasons */}
            {sig?.reasons && sig.reasons.length > 0 && (
              <div className="text-xs text-chuchu-muted space-y-1 mb-3 font-sans bg-chuchu-card/50 p-2.5 rounded-lg border border-chuchu-border/50">
                <div className="font-bold text-slate-200 text-[11px] uppercase tracking-wider mb-1">Signal Reasons Matrix:</div>
                {sig.reasons.slice(0, 4).map((r, i) => (
                  <div key={i} className="text-slate-300 flex items-center space-x-1.5">
                    <span className="text-chuchu-cyan font-bold">•</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Trade buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => onTrade(s.symbol, 'BUY')}
                  className="px-4 py-2 rounded-lg bg-chuchu-green/20 text-chuchu-green border border-chuchu-green/40 hover:bg-chuchu-green/30 font-bold flex items-center space-x-2 text-xs transition-all shadow-md"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>EXECUTE LONG</span>
                  <span className="num-font text-[10px] bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-500/30 text-emerald-300 font-extrabold ml-1">
                    {(s.state?.longPct || 50)}%
                  </span>
                </button>
                <button
                  onClick={() => onTrade(s.symbol, 'SELL')}
                  className="px-4 py-2 rounded-lg bg-chuchu-red/20 text-chuchu-red border border-chuchu-red/40 hover:bg-chuchu-red/30 font-bold flex items-center space-x-2 text-xs transition-all shadow-md"
                >
                  <ArrowDownRight className="w-4 h-4" />
                  <span>EXECUTE SHORT</span>
                  <span className="num-font text-[10px] bg-rose-950/80 px-1.5 py-0.2 rounded border border-rose-500/30 text-rose-300 font-extrabold ml-1">
                    {(s.state?.shortPct || 50)}%
                  </span>
                </button>
              </div>
              <span className="text-xs font-semibold text-chuchu-muted">Risk-Reward Ratio: 1:{sig?.riskRewardRatio || 2.5}</span>
            </div>
          </div>
        );
      })
    )}
  </div>
);

// ─────────────────────────────────────────────
// MAIN SCANNER PAGE
// ─────────────────────────────────────────────
export const ScannerPage: React.FC = () => {
  const { states, setSelectedSymbol, setActivePage, submitOrder, pipeline, pipelineLoading, fetchPipeline } = useChuchuStore();
  const [activeTab, setActiveTab] = useState<ScannerTab>('discovery');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'heat' | 'candidate' | 'ai' | 'volume' | 'imbalance'>('candidate');

  // Auto-refresh pipeline every 30 seconds
  useEffect(() => {
    fetchPipeline();
    const timer = setInterval(() => { fetchPipeline(); }, 30000);
    return () => clearInterval(timer);
  }, [fetchPipeline]);

  const handleTrade = (symbol: string, side: 'BUY' | 'SELL') => {
    setSelectedSymbol(symbol);
    submitOrder(symbol, side, 1.0);
    setActivePage('paper-trading');
  };

  const symbolList = Array.from(states.values());
  const filtered = symbolList
    .filter(s => s.symbol.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'heat') return (b.scores?.heatScore || 0) - (a.scores?.heatScore || 0);
      if (sortBy === 'candidate') return (b.scores?.candidateScore || 0) - (a.scores?.candidateScore || 0);
      if (sortBy === 'ai') return (b.scores?.aiScore || 0) - (a.scores?.aiScore || 0);
      if (sortBy === 'volume') return (b.volume24h || 0) - (a.volume24h || 0);
      if (sortBy === 'imbalance') return Math.abs(b.microstructure?.orderbookImbalance || 0) - Math.abs(a.microstructure?.orderbookImbalance || 0);
      return 0;
    });

  const discovered = pipeline?.stage1_discovered || [];
  const heatCandidates = pipeline?.stage2_heatCandidates || [];
  const finalSignals = pipeline?.stage4_signals || [];
  const meta = pipeline?.meta;

  const tabs = [
    {
      id: 'discovery' as ScannerTab,
      label: '🔥 Live Discovery',
      count: discovered.length,
      color: 'text-orange-400',
      activeBg: 'border-orange-400/60 bg-orange-400/10',
    },
    {
      id: 'heat' as ScannerTab,
      label: '🌡 Heat Hunter',
      count: heatCandidates.length,
      color: 'text-red-400',
      activeBg: 'border-red-400/60 bg-red-400/10',
    },
    {
      id: 'signals' as ScannerTab,
      label: '🎯 Final Signals',
      count: finalSignals.length,
      color: 'text-chuchu-cyan',
      activeBg: 'border-chuchu-cyan/60 bg-chuchu-cyan/10',
    },
    {
      id: 'all' as ScannerTab,
      label: '⚙ All Tracked',
      count: symbolList.length,
      color: 'text-chuchu-muted',
      activeBg: 'border-chuchu-border bg-chuchu-panel',
    },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 font-sans antialiased text-chuchu-text">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-chuchu-text tracking-tight flex items-center space-x-2.5">
            <Cpu className="w-6 h-6 text-chuchu-cyan" />
            <span>CHUCHU HUNT ENGINE</span>
          </h1>
          <p className="text-xs text-chuchu-muted mt-1 font-medium">
            4-Stage Dynamic Coin Discovery • Binance Futures Universe • Live 30s Scan Pipeline
          </p>
        </div>

        {/* Pipeline stats */}
        <div className="flex items-center space-x-3 text-xs font-semibold">
          {meta && (
            <>
              <span className="text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded border border-orange-500/20">Stage 1: <strong className="text-chuchu-text num-font">{meta.discoveredCount}</strong></span>
              <span className="text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded border border-rose-500/20">Stage 2: <strong className="text-chuchu-text num-font">{meta.heatCount}</strong></span>
              <span className="text-chuchu-cyan bg-cyan-500/10 px-2.5 py-1 rounded border border-cyan-500/20">Signals: <strong className="text-chuchu-text num-font">{meta.signalCount}</strong></span>
            </>
          )}
          <button
            onClick={fetchPipeline}
            disabled={pipelineLoading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-chuchu-border bg-chuchu-card text-chuchu-muted hover:text-chuchu-text hover:border-chuchu-cyan/50 transition-colors shadow-sm text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${pipelineLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-chuchu-border pb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-t-lg border-b-2 text-xs font-extrabold tracking-wide transition-all duration-150 ${
              activeTab === tab.id
                ? `${tab.activeBg} ${tab.color} border-b-2`
                : 'border-transparent text-chuchu-muted hover:text-chuchu-text'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold num-font ${activeTab === tab.id ? 'bg-chuchu-card text-chuchu-text' : 'bg-chuchu-panel text-chuchu-muted'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab 1: Discovery */}
      {activeTab === 'discovery' && <DiscoveryTab coins={discovered} />}

      {/* Tab 2: Heat Hunter */}
      {activeTab === 'heat' && <HeatTab candidates={heatCandidates} />}

      {/* Tab 3: Final Signals */}
      {activeTab === 'signals' && <SignalsTab signals={finalSignals} onTrade={handleTrade} />}

      {/* Tab 4: All Tracked */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative w-64">
              <Search className="w-4 h-4 text-chuchu-muted absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search Symbol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 rounded-lg bg-chuchu-card border border-chuchu-border text-xs text-chuchu-text focus:outline-none focus:border-chuchu-cyan w-full font-sans"
              />
            </div>
            <div className="flex items-center space-x-1.5 bg-chuchu-card p-1 rounded-lg border border-chuchu-border text-xs">
              <span className="text-chuchu-muted text-[11px] font-bold px-2">SORT BY:</span>
              {(['candidate','heat','ai','volume'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase transition-all ${sortBy === s ? 'bg-chuchu-cyan/20 text-chuchu-cyan' : 'text-chuchu-muted hover:text-chuchu-text'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-xl overflow-x-auto border border-chuchu-border shadow-xl">
            <table className="w-full text-left border-collapse text-xs font-sans">
              <thead>
                <tr className="bg-chuchu-card/90 border-b border-chuchu-border text-chuchu-muted font-bold uppercase text-[11px] tracking-wider">
                  <th className="py-3.5 px-5">SYMBOL</th>
                  <th className="py-3.5 px-5">MARK PRICE</th>
                  <th className="py-3.5 px-5">HEAT SCORE</th>
                  <th className="py-3.5 px-5">CANDIDATE SCORE</th>
                  <th className="py-3.5 px-5">AI SCORE</th>
                  <th className="py-3.5 px-5">MARKET REGIME</th>
                  <th className="py-3.5 px-5">ORDERBOOK OBI</th>
                  <th className="py-3.5 px-5 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-chuchu-border/40 text-chuchu-text">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-chuchu-muted">
                      No tracked symbols match filter criteria.
                    </td>
                  </tr>
                ) : (
                  filtered.map(state => {
                    const price = state.lastTick?.price || 0;
                    const obi = state.microstructure?.orderbookImbalance || 0;
                    const heat = state.scores?.heatScore || 0;
                    const candidate = state.scores?.candidateScore || 0;
                    const ai = state.scores?.aiScore || 0;
                    const regime = state.regime?.regime || 'MEAN_REVERTING';
                    return (
                      <tr key={state.symbol} className="hover:bg-chuchu-panel/60 transition-all duration-150">
                        <td className="py-3.5 px-5 font-bold text-chuchu-text text-sm flex items-center space-x-2">
                          <span>{state.symbol}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-chuchu-panel text-chuchu-cyan font-semibold">PERP</span>
                        </td>
                        <td className="py-3.5 px-5 font-bold text-chuchu-text text-sm num-font">
                          ${price > 0 ? formatPrice(price) : '---'}
                        </td>
                        <td className="py-3.5 px-5 text-chuchu-yellow font-extrabold num-font">
                          <div className="flex items-center space-x-1">
                            <Flame className="w-3.5 h-3.5" />
                            <span>{heat}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-5 text-chuchu-cyan font-extrabold num-font">{candidate}</td>
                        <td className="py-3.5 px-5 text-chuchu-purple font-extrabold num-font">{ai}</td>
                        <td className="py-3.5 px-5">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-chuchu-panel border border-chuchu-border text-chuchu-cyan">
                            {regime}
                          </span>
                        </td>
                        <td className={`py-3.5 px-5 font-extrabold num-font ${obi >= 0 ? 'text-chuchu-green' : 'text-chuchu-red'}`}>
                          {obi >= 0 ? '+' : ''}{(obi * 100).toFixed(0)}%
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button onClick={() => handleTrade(state.symbol, 'BUY')} className="px-3 py-1 rounded-lg bg-chuchu-green/20 text-chuchu-green border border-chuchu-green/40 hover:bg-chuchu-green/30 font-bold flex items-center space-x-1 text-xs">
                              <ArrowUpRight className="w-3.5 h-3.5" /><span>BUY</span>
                            </button>
                            <button onClick={() => handleTrade(state.symbol, 'SELL')} className="px-3 py-1 rounded-lg bg-chuchu-red/20 text-chuchu-red border border-chuchu-red/40 hover:bg-chuchu-red/30 font-bold flex items-center space-x-1 text-xs">
                              <ArrowDownRight className="w-3.5 h-3.5" /><span>SELL</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
