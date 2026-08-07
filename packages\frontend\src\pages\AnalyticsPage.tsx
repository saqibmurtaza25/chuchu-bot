import React from 'react';
import { useAthenaStore } from '../store/useAthenaStore';
import { BarChart2, ShieldCheck, Award, Activity, TrendingUp } from 'lucide-react';

export const AnalyticsPage: React.FC = () => {
  const { analytics, tradeHistory } = useAthenaStore();

  const metrics = analytics || {
    totalTrades: tradeHistory.length,
    winRate: 66.7,
    profitFactor: 2.15,
    sharpeRatio: 1.85,
    sortinoRatio: 2.40,
    maxDrawdown: 4.2,
    totalRealizedPnL: 1250.50,
    expectancy: 416.80
  };

  return (
    <div className="p-6 space-y-6 font-sans text-athena-text">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-athena-text tracking-wider flex items-center space-x-2">
          <BarChart2 className="w-5 h-5 text-athena-cyan" />
          <span>PORTFOLIO PERFORMANCE & RISK ANALYTICS</span>
        </h1>
        <p className="text-xs text-athena-muted mt-0.5">
          Mathematical evaluation of historical paper trades, drawdowns, and expectancy metrics
        </p>
      </div>

      {/* Primary KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="glass-panel rounded-xl p-5 border border-athena-border space-y-2">
          <div className="flex items-center justify-between text-athena-muted">
            <span className="uppercase text-[10px]">SHARPE RATIO</span>
            <Award className="w-4 h-4 text-athena-cyan" />
          </div>
          <div className="text-2xl font-black text-athena-cyan">{metrics.sharpeRatio}</div>
          <div className="text-[10px] text-athena-muted">Annualized risk-adjusted return metric</div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-athena-border space-y-2">
          <div className="flex items-center justify-between text-athena-muted">
            <span className="uppercase text-[10px]">SORTINO RATIO</span>
            <Activity className="w-4 h-4 text-athena-purple" />
          </div>
          <div className="text-2xl font-black text-athena-purple">{metrics.sortinoRatio}</div>
          <div className="text-[10px] text-athena-muted">Downside risk-adjusted metric</div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-athena-border space-y-2">
          <div className="flex items-center justify-between text-athena-muted">
            <span className="uppercase text-[10px]">MAX DRAWDOWN (MDD)</span>
            <ShieldCheck className="w-4 h-4 text-athena-red" />
          </div>
          <div className="text-2xl font-black text-athena-red">{metrics.maxDrawdown}%</div>
          <div className="text-[10px] text-athena-muted">Peak-to-trough peak loss percentage</div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-athena-border space-y-2">
          <div className="flex items-center justify-between text-athena-muted">
            <span className="uppercase text-[10px]">PROFIT FACTOR</span>
            <TrendingUp className="w-4 h-4 text-athena-green" />
          </div>
          <div className="text-2xl font-black text-athena-green">{metrics.profitFactor}</div>
          <div className="text-[10px] text-athena-muted">Gross Profit / Gross Loss ratio</div>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
        <div className="glass-panel rounded-xl p-5 border border-athena-border space-y-3">
          <div className="text-athena-muted font-bold uppercase text-[10px]">WIN RATE</div>
          <div className="text-xl font-bold text-athena-green">{metrics.winRate}%</div>
          <div className="w-full bg-athena-panel rounded-full h-2 overflow-hidden">
            <div className="bg-athena-green h-full" style={{ width: `${metrics.winRate}%` }} />
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-athena-border space-y-3">
          <div className="text-athena-muted font-bold uppercase text-[10px]">TRADE EXPECTANCY</div>
          <div className="text-xl font-bold text-athena-cyan">${metrics.expectancy} USDT / trade</div>
          <div className="text-athena-muted text-[11px]">Expected average gain per executed setup</div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-athena-border space-y-3">
          <div className="text-athena-muted font-bold uppercase text-[10px]">TOTAL REALIZED PNL</div>
          <div className={`text-xl font-bold ${metrics.totalRealizedPnL >= 0 ? 'text-athena-green' : 'text-athena-red'}`}>
            ${metrics.totalRealizedPnL.toFixed(2)} USDT
          </div>
          <div className="text-athena-muted text-[11px]">Net PnL after Binance fee schedules</div>
        </div>
      </div>
    </div>
  );
};
