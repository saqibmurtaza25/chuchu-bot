import React from 'react';
import { useAthenaStore } from '../store/useAthenaStore';
import { CoinCard } from '../components/CoinCard';
import { Target, StarOff, Trophy, AlertTriangle, ArrowUpRight, ArrowDownRight, Layers, Award } from 'lucide-react';
import { formatPrice } from '../utils/formatting';

export const SniperPage: React.FC = () => {
  const { states, focusedSymbol, setFocusedSymbol, submitOrder, setActivePage, setSelectedSymbol } = useAthenaStore();

  const symbol = focusedSymbol ? focusedSymbol.toUpperCase() : null;
  const state = symbol ? states.get(symbol) : null;

  const handleExecute = (side: 'BUY' | 'SELL') => {
    if (!symbol) return;
    setSelectedSymbol(symbol);
    submitOrder(symbol, side, 1.0);
    setActivePage('paper-trading');
  };

  // Find better opportunity (higher Setup Quality) than the currently focused coin
  const currentSetupQuality = state?.signal?.setupQuality || 0;
  const betterOpportunity = Array.from(states.values())
    .filter(s => s.symbol !== symbol && s.signal && s.signal.signal !== 'NEUTRAL')
    .sort((a, b) => (b.signal?.setupQuality || 0) - (a.signal?.setupQuality || 0))[0];
  
  const showBetterNotification = betterOpportunity && (betterOpportunity.signal?.setupQuality || 0) > currentSetupQuality;

  return (
    <div className="p-6 space-y-6 font-sans text-athena-text">
      {/* Top Workstation Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-athena-text tracking-wider flex items-center space-x-2.5">
            <Target className="w-5 h-5 text-athena-cyan animate-pulse" />
            <span>MISSION CONTROL WORKSTATION</span>
            {symbol && (
              <span className="text-xs px-2.5 py-0.5 rounded border bg-athena-cyan/15 text-athena-cyan border-athena-cyan/30 animate-pulse font-bold uppercase">
                {symbol} FOCUS MODE ACTIVE
              </span>
            )}
          </h1>
          <p className="text-xs text-athena-muted mt-1 font-medium">
            0-Second Delay Dedicated WebSocket Stream • Direct L2 Orderbook Matching
          </p>
        </div>

        {symbol && (
          <button
            onClick={() => setFocusedSymbol(null)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-300 text-xs font-bold border border-rose-500/30 hover:bg-rose-500/20 transition-all duration-150"
          >
            <StarOff className="w-3.5 h-3.5" />
            <span>EXIT SNIPER MODE</span>
          </button>
        )}
      </div>

      {/* Better Opportunity Notification Banner */}
      {symbol && showBetterNotification && (
        <div className="flex items-center justify-between p-3.5 bg-athena-yellow/15 border border-athena-yellow/30 rounded-xl animate-pulse text-xs text-athena-yellow font-bold">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              BETTER OPPORTUNITY DETECTED: {betterOpportunity.symbol} has a Setup Quality of {betterOpportunity.signal?.setupQuality}% ({betterOpportunity.signal?.signal})!
            </span>
          </div>
          <button
            onClick={() => setFocusedSymbol(betterOpportunity.symbol)}
            className="px-3.5 py-1.5 bg-athena-yellow text-black rounded font-black text-[10px] uppercase hover:bg-amber-400 transition-all shadow-md shrink-0"
          >
            Switch Sniper Focus
          </button>
        </div>
      )}

      {!symbol || !state ? (
        <div className="glass-panel rounded-xl p-16 text-center text-athena-muted space-y-4 max-w-2xl mx-auto mt-12 border border-athena-border/60 shadow-2xl">
          <Target className="w-12 h-12 text-athena-cyan/40 mx-auto animate-pulse" />
          <h2 className="text-lg font-black text-athena-text">NO SYMBOL CURRENTLY FOCUSED</h2>
          <p className="text-xs text-athena-muted leading-relaxed">
            Sniper mode directs 100% of WebSocket multiplex streams, orderbook matching, and indicators recalculation strictly to one selective pair to eliminate delays.
          </p>
          <button
            onClick={() => setActivePage('dashboard')}
            className="px-4 py-2 bg-athena-cyan text-athena-bg font-extrabold rounded-lg text-xs hover:bg-athena-cyan/90 transition-all shadow-md"
          >
            GO TO DASHBOARD & STAR A COIN
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Column: Live dashboard card */}
          <div className="space-y-4">
            <h2 className="text-xs text-athena-muted font-bold uppercase tracking-widest pl-1">
              L1/L2 Microstructure Metrics (Dashboard View)
            </h2>
            <CoinCard state={state} />
          </div>

          {/* Right Column: Dynamic Signals workstation card */}
          <div className="space-y-4">
            <h2 className="text-xs text-athena-muted font-bold uppercase tracking-widest pl-1">
              Execution Logic Matrix (Signal Decision View)
            </h2>

            <div className="glass-panel rounded-xl p-6 border border-athena-cyan/40 bg-athena-cyan/5 shadow-2xl space-y-5">
              {/* Stars & Zone indicators header */}
              <div className="flex items-center justify-between pb-3 border-b border-athena-border/50">
                <div className="flex items-center space-x-2">
                  <span className="text-base font-bold text-athena-text">{symbol}</span>
                  <span className="text-sm font-semibold px-2 py-0.5 rounded bg-athena-panel text-athena-cyan text-[10px] border border-athena-cyan/30">
                    FOCUS ACTIVE
                  </span>
                  <span className="text-xs text-amber-300 font-bold font-mono">
                    WMR: {state.indicators?.williamsR200 || '---'}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-athena-muted uppercase">Risk Level:</span>
                  <span className="text-xs font-black text-rose-400">{state.riskLevel || 'LOW'}</span>
                </div>
              </div>

              {/* Price Levels Grid */}
              <div className="grid grid-cols-3 gap-4 p-3.5 rounded-lg bg-athena-bg/90 border border-athena-border text-center text-xs">
                <div>
                  <div className="text-[10px] text-athena-muted uppercase font-sans">ENTRY TARGET</div>
                  <div className="text-sm font-black text-athena-text num-font mt-0.5">
                    ${formatPrice(state.signal?.entryPrice || state.lastTick?.price || 0)}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-athena-muted uppercase font-sans font-bold">STOP LOSS</div>
                  <div className="text-sm font-black text-rose-400 num-font mt-0.5">
                    ${formatPrice(state.signal?.stopLoss || 0)}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-athena-muted uppercase font-sans font-bold">TAKE PROFIT</div>
                  <div className="text-sm font-black text-emerald-400 num-font mt-0.5">
                    ${formatPrice(state.signal?.takeProfit || 0)}
                  </div>
                </div>
              </div>

              {/* Confirmation reasons matrix */}
              <div className="space-y-3 bg-athena-bg/40 p-4 rounded-lg border border-athena-border">
                <div className="text-[10px] text-athena-muted font-bold tracking-wider uppercase flex items-center space-x-1">
                  <Layers className="w-3.5 h-3.5 text-athena-cyan" />
                  <span>DECISION MATRIX CONFIRMATIONS</span>
                </div>
                <ul className="space-y-2 text-xs text-slate-200">
                  {state.reasons && state.reasons.length > 0 ? (
                    state.reasons.map((r, idx) => (
                      <li key={idx} className="flex items-center space-x-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-athena-cyan" />
                        <span className="font-mono">{r}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-athena-muted font-medium">Evaluating market dynamics...</li>
                  )}
                </ul>
              </div>

              {/* Execution action controls */}
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleExecute('BUY')}
                    className="py-3 rounded-lg font-black text-xs bg-emerald-500 text-black hover:bg-emerald-400 flex items-center justify-center space-x-2 transition-all shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>EXECUTE SNIPER LONG</span>
                  </button>
                  <button
                    onClick={() => handleExecute('SELL')}
                    className="py-3 rounded-lg font-black text-xs bg-rose-500 text-white hover:bg-rose-400 flex items-center justify-center space-x-2 transition-all shadow-[0_0_15px_rgba(244,63,94,0.25)]"
                  >
                    <ArrowDownRight className="w-4 h-4" />
                    <span>EXECUTE SNIPER SHORT</span>
                  </button>
                </div>
                <div className="text-center text-[10px] text-athena-muted font-bold uppercase tracking-widest pt-1">
                  Setup Conviction: {state.signal?.confidence || state.hunter?.hunterScore || 0}% Setup Quality
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
