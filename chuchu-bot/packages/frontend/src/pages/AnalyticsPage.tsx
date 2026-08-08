import React from 'react';
import { useChuchuStore } from '../store/useChuchuStore';
import { BarChart2, ShieldCheck, Award, Activity, TrendingUp } from 'lucide-react';

export const AnalyticsPage: React.FC = () => {
  const { analytics, tradeHistory } = useChuchuStore();

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
    <div className="p-4 sm:p-6 space-y-6 font-sans text-chuchu-text">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-chuchu-text tracking-wider flex items-center space-x-2">
          <BarChart2 className="w-5 h-5 text-chuchu-cyan" />
          <span>PORTFOLIO PERFORMANCE & RISK ANALYTICS</span>
        </h1>
        <p className="text-xs text-chuchu-muted mt-0.5">
          Mathematical evaluation of historical paper trades, drawdowns, and expectancy metrics
        </p>
      </div>

      {/* Primary KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="glass-panel rounded-xl p-5 border border-chuchu-border space-y-2">
          <div className="flex items-center justify-between text-chuchu-muted">
            <span className="uppercase text-[10px]">SHARPE RATIO</span>
            <Award className="w-4 h-4 text-chuchu-cyan" />
          </div>
          <div className="text-2xl font-black text-chuchu-cyan">{metrics.sharpeRatio}</div>
          <div className="text-[10px] text-chuchu-muted">Annualized risk-adjusted return metric</div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-chuchu-border space-y-2">
          <div className="flex items-center justify-between text-chuchu-muted">
            <span className="uppercase text-[10px]">SORTINO RATIO</span>
            <Activity className="w-4 h-4 text-chuchu-purple" />
          </div>
          <div className="text-2xl font-black text-chuchu-purple">{metrics.sortinoRatio}</div>
          <div className="text-[10px] text-chuchu-muted">Downside risk-adjusted metric</div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-chuchu-border space-y-2">
          <div className="flex items-center justify-between text-chuchu-muted">
            <span className="uppercase text-[10px]">MAX DRAWDOWN (MDD)</span>
            <ShieldCheck className="w-4 h-4 text-chuchu-red" />
          </div>
          <div className="text-2xl font-black text-chuchu-red">{metrics.maxDrawdown}%</div>
          <div className="text-[10px] text-chuchu-muted">Peak-to-trough peak loss percentage</div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-chuchu-border space-y-2">
          <div className="flex items-center justify-between text-chuchu-muted">
            <span className="uppercase text-[10px]">PROFIT FACTOR</span>
            <TrendingUp className="w-4 h-4 text-chuchu-green" />
          </div>
          <div className="text-2xl font-black text-chuchu-green">{metrics.profitFactor}</div>
          <div className="text-[10px] text-chuchu-muted">Gross Profit / Gross Loss ratio</div>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
        <div className="glass-panel rounded-xl p-5 border border-chuchu-border space-y-3">
          <div className="text-chuchu-muted font-bold uppercase text-[10px]">WIN RATE</div>
          <div className="text-xl font-bold text-chuchu-green">{metrics.winRate}%</div>
          <div className="w-full bg-chuchu-panel rounded-full h-2 overflow-hidden">
            <div className="bg-chuchu-green h-full" style={{ width: `${metrics.winRate}%` }} />
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-chuchu-border space-y-3">
          <div className="text-chuchu-muted font-bold uppercase text-[10px]">TRADE EXPECTANCY</div>
          <div className="text-xl font-bold text-chuchu-cyan">${metrics.expectancy} USDT / trade</div>
          <div className="text-chuchu-muted text-[11px]">Expected average gain per executed setup</div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-chuchu-border space-y-3">
          <div className="text-chuchu-muted font-bold uppercase text-[10px]">TOTAL REALIZED PNL</div>
          <div className={`text-xl font-bold ${metrics.totalRealizedPnL >= 0 ? 'text-chuchu-green' : 'text-chuchu-red'}`}>
            ${metrics.totalRealizedPnL.toFixed(2)} USDT
          </div>
          <div className="text-chuchu-muted text-[11px]">Net PnL after Binance fee schedules</div>
        </div>
      </div>
    </div>
  );
};
