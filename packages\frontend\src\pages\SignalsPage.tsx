import React from 'react';
import { TrendingUp, ShieldAlert, Zap, ArrowUpRight, ArrowDownRight, Layers, ScanSearch } from 'lucide-react';
import { useAthenaStore } from '../store/useAthenaStore';
import { formatPrice, formatLatencyDelay } from '../utils/formatting';

export const SignalsPage: React.FC = () => {
  const { states, setSelectedSymbol, setActivePage, submitOrder } = useAthenaStore();

  const symbolList = Array.from(states.values());
  // Show only qualified trade opportunities (BUY or SELL)
  const signals = symbolList.filter((s) => s.signal && s.signal.signal !== 'NEUTRAL');

  const handleExecute = (symbol: string, side: 'BUY' | 'SELL') => {
    setSelectedSymbol(symbol);
    submitOrder(symbol, side, 1.0);
    setActivePage('paper-trading');
  };

  return (
    <div className="p-6 space-y-6 font-sans text-athena-text">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-athena-text tracking-wider flex items-center space-x-2">
          <TrendingUp className="w-5 h-5 text-athena-green" />
          <span>QUALIFIED SIGNAL OPPORTUNITIES</span>
        </h1>
        <p className="text-xs text-athena-muted mt-0.5">
          Actionable high-quality trade setups filtered by multi-engine quantitative matrix
        </p>
      </div>

      {/* Signal Cards Grid */}
      {signals.length === 0 ? (
        <div className="glass-panel rounded-xl p-12 text-center text-athena-muted space-y-3">
          <div className="flex items-center space-x-3 mb-2">
            <ScanSearch className="w-5 h-5 text-athena-cyan" />
            <h2 className="text-sm font-bold text-athena-cyan">AWAITING HIGH-QUALITY SIGNALS</h2>
          </div>
          <p className="text-xs text-athena-muted leading-relaxed">
            ATHENA engines are scanning continuous streams. Signals trigger automatically when multi-factor setup quality exceeds threshold (\(\ge 45\%\)).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {signals.map((state) => {
            const sig = state.signal!;
            const isBuy = sig.signal === 'BUY';

            return (
              <div
                key={state.symbol}
                className={`glass-panel rounded-xl p-6 border transition-all duration-200 ${
                  isBuy ? 'border-athena-green/50 glow-green' : 'border-athena-red/50 glow-red'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-athena-border">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg font-bold text-athena-text">{state.symbol}</span>
                    <span
                      className={`px-3 py-1 rounded text-xs font-bold ${
                        isBuy ? 'bg-athena-green/20 text-athena-green border border-athena-green/40' : 'bg-athena-red/20 text-athena-red border border-athena-red/40'
                      }`}
                    >
                      {sig.signal} SETUP
                    </span>
                    <span className="text-[10px] font-mono text-athena-yellow font-extrabold bg-athena-yellow/10 px-1.5 py-0.5 rounded">
                      -{formatLatencyDelay(state.timestamp || Date.now())}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-athena-cyan text-xs font-extrabold tracking-wide mt-2">
                    <div className="flex items-center space-x-2">
                      <Zap className="w-3.5 h-3.5 text-athena-cyan" />
                      <span className="num-font">Hunter: {sig.hunterScore || (sig as any).confidence}</span>
                    </div>
                    <span className="text-athena-yellow num-font">Quality: {sig.setupQuality || (sig as any).confidence}/100</span>
                  </div>
                </div>

                {/* Price Levels Grid */}
                <div className="grid grid-cols-3 gap-2 my-2.5 p-2 rounded bg-slate-900/90 border border-slate-700/60 text-center text-xs">
                  <div>
                    <div className="text-[10px] text-slate-200 font-extrabold uppercase">ENTRY TARGET</div>
                    <div className="text-sm font-black text-white mt-0.5">${formatPrice(sig.entryPrice)}</div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-200 font-extrabold uppercase">STOP LOSS</div>
                    <div className="text-sm font-black text-rose-400 mt-0.5">${formatPrice(sig.stopLoss)}</div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-200 font-extrabold uppercase">TAKE PROFIT</div>
                    <div className="text-sm font-black text-emerald-400 mt-0.5">${formatPrice(sig.takeProfit)}</div>
                  </div>
                </div>

                {/* Real Quantitative Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-950/70 p-2 rounded-lg border border-slate-700/60 text-[11px] my-2.5 num-font font-sans">
                  <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                    <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">W%R 200 Avg</div>
                    <div className="font-extrabold text-sm text-emerald-400">{(state.indicators?.williamsR200 ?? 50)}%</div>
                  </div>
                  <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                    <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">Funding Rate</div>
                    <div className={`font-extrabold text-sm ${((state.fundingRate || 0) * 100) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {((state.fundingRate || 0) * 100) >= 0 ? `+${((state.fundingRate || 0) * 100).toFixed(4)}%` : `${((state.fundingRate || 0) * 100).toFixed(4)}%`}
                    </div>
                  </div>
                  <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60 col-span-2">
                    <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">Open Interest (24h Delta)</div>
                    <div className="font-extrabold text-sm text-white">
                      {(state.openInterest || 15000).toLocaleString()}{' '}
                      <span className="text-xs text-emerald-400">
                        ({(state.openInterestDeltaPct || 0) >= 0 ? `+${(state.openInterestDeltaPct || 0)}%` : `${(state.openInterestDeltaPct || 0)}%`})
                      </span>
                    </div>
                  </div>
                  <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60 col-span-2">
                    <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">CVD Delta</div>
                    <div className={`font-extrabold text-sm ${(state.microstructure?.cvd || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {(state.microstructure?.cvd || 0) >= 0 
                        ? `+$${((state.microstructure?.cvd || 0) / 1_000_000).toFixed(1)}M` 
                        : `-$${Math.abs((state.microstructure?.cvd || 0) / 1_000_000).toFixed(1)}M`}
                    </div>
                  </div>
                  <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                    <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">24h Volume</div>
                    <div className="font-extrabold text-sm text-amber-300">${((state.volume24h || 50000000) / 1_000_000).toFixed(1)}M</div>
                  </div>
                  <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                    <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">Market Regime</div>
                    <div className="font-extrabold text-xs text-athena-cyan truncate">{state.regime?.regime || 'MEAN_REVERTING'}</div>
                  </div>
                  <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                    <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">Orderbook</div>
                    <div className={`font-extrabold text-sm ${(state.microstructure?.orderbookBuyerPct || 50) >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      Buyers {(state.microstructure?.orderbookBuyerPct || 50).toFixed(0)}%
                    </div>
                  </div>
                  <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                    <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">Spoofing Prob</div>
                    <div className="font-extrabold text-sm text-white">{(state.microstructure?.spoofingProbabilityPct || 0)}%</div>
                  </div>
                  <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                    <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">Whale Activity</div>
                    <div className={`font-extrabold text-sm ${state.microstructure?.whaleActivity ? 'text-purple-300 font-bold' : 'text-slate-300'}`}>
                      {state.microstructure?.whaleActivity ? 'ACTIVE' : 'QUIET'}
                    </div>
                  </div>
                  <div className="p-1.5 bg-slate-900/90 rounded border border-slate-700/60">
                    <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5">Risk Level</div>
                    <div className={`font-bold text-sm ${state.riskLevel === 'EXTREME' ? 'text-rose-400' : state.riskLevel === 'HIGH' ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {state.riskLevel || 'LOW'}
                    </div>
                  </div>
                </div>

                {/* Reasons Matrix List */}
                <div className="space-y-1.5 mb-3">
                  <div className="text-[10px] text-slate-200 font-extrabold tracking-wider uppercase flex items-center space-x-1">
                    <Layers className="w-3.5 h-3.5 text-athena-cyan" />
                    <span>SIGNAL CONFIRMATION REASONS</span>
                  </div>
                  <ul className="space-y-1 text-xs text-athena-text">
                    {sig.reasons.map((reason, idx) => (
                      <li key={idx} className="flex items-center space-x-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${isBuy ? 'bg-athena-green' : 'bg-athena-red'}`} />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Execute Button */}
                <button
                  onClick={() => handleExecute(state.symbol, isBuy ? 'BUY' : 'SELL')}
                  className={`w-full py-3 px-4 rounded font-bold text-xs flex items-center justify-between transition-all duration-150 ${
                    isBuy
                      ? 'bg-athena-green text-black hover:bg-athena-green/90 shadow-[0_0_15px_rgba(0,230,118,0.3)] font-black'
                      : 'bg-athena-red text-white hover:bg-athena-red/90 shadow-[0_0_15px_rgba(255,23,68,0.3)] font-black'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {isBuy ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    <span>EXECUTE {sig.signal} ON PAPER TRADER</span>
                  </div>
                  <span className={`num-font text-[10px] px-2 py-0.5 rounded border font-extrabold ${
                    isBuy 
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40' 
                      : 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                  }`}>
                    {isBuy ? (state.longPct ?? 50) : (state.shortPct ?? 50)}%
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
