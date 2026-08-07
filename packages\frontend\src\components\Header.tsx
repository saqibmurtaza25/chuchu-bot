import React from 'react';
import { useAthenaStore, ActivePage } from '../store/useAthenaStore';
import { Activity, ShieldCheck, Cpu, BarChart2, Radio, Terminal, TrendingUp, Settings, Clock, Target } from 'lucide-react';
import { formatPrice } from '../utils/formatting';

export const Header: React.FC = () => {
  const { activePage, setActivePage, isConnected, states, paperBalance, systemTime, focusedSymbol } = useAthenaStore();

  const navItems: { id: ActivePage; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'DASHBOARD', icon: <Activity className="w-4 h-4" /> },
    { id: 'sniper', label: focusedSymbol ? `SNIPER: ${focusedSymbol}` : 'SNIPER MODE', icon: <Target className={`w-4 h-4 ${focusedSymbol ? 'text-athena-cyan animate-pulse' : ''}`} /> },
    { id: 'scanner', label: 'SCANNER', icon: <Cpu className="w-4 h-4" /> },
    { id: 'signals', label: 'SIGNALS', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'paper-trading', label: 'PAPER TRADING', icon: <Terminal className="w-4 h-4" /> },
    { id: 'analytics', label: 'ANALYTICS', icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'settings', label: 'SETTINGS', icon: <Settings className="w-4 h-4" /> },
    { id: 'health', label: 'API HEALTH', icon: <ShieldCheck className="w-4 h-4" /> }
  ];

  const symbolList = Array.from(states.values());

  return (
    <header className="bg-athena-card border-b border-athena-border sticky top-0 z-50 font-sans antialiased">
      {/* Single Compact Institutional Navigation Bar */}
      <div className="flex items-center justify-between px-5 py-2">
        {/* Left: Brand Logo & Navigation Tabs */}
        <div className="flex items-center space-x-5">
          <div className="flex items-center space-x-2 text-athena-cyan font-black tracking-wider text-sm shrink-0">
            <Radio className={`w-4 h-4 ${isConnected ? 'text-athena-green animate-pulse' : 'text-athena-red'}`} />
            <span>NOVA SIGMA BOT</span>
          </div>

          <div className="h-4 w-px bg-athena-border shrink-0" />

          <div className="flex items-center space-x-1">
            {navItems.map((item) => {
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActivePage(item.id)}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-extrabold tracking-wide transition-all duration-150 ${
                    isActive
                      ? 'bg-athena-cyan/10 text-athena-cyan border border-athena-cyan/30 shadow-[0_0_10px_rgba(0,240,255,0.15)]'
                      : 'text-athena-muted hover:text-athena-text hover:bg-athena-panel/50'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Paper Balance */}
        <div className="flex items-center shrink-0 text-xs font-semibold">
          <div className="flex items-center space-x-1.5 bg-athena-green/10 border border-athena-green/30 px-3.5 py-1.5 rounded-lg text-athena-green font-extrabold shadow-sm">
            <span className="text-[10px] text-athena-muted uppercase">PAPER BALANCE:</span>
            <span className="num-font text-xs">${paperBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
