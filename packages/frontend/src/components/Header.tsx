import React from 'react';
import { useChuchuStore, ActivePage } from '../store/useChuchuStore';
import { Activity, ShieldCheck, Cpu, BarChart2, Radio, Terminal, TrendingUp, Settings, Clock, Target } from 'lucide-react';
import { formatPrice } from '../utils/formatting';

export const Header: React.FC = () => {
  const { activePage, setActivePage, isConnected, states, paperBalance, systemTime, focusedSymbol } = useChuchuStore();

  const navItems: { id: ActivePage; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'DASHBOARD', icon: <Activity className="w-4 h-4" /> },
    { id: 'sniper', label: focusedSymbol ? `SNIPER: ${focusedSymbol}` : 'SNIPER MODE', icon: <Target className={`w-4 h-4 ${focusedSymbol ? 'text-chuchu-cyan animate-pulse' : ''}`} /> },
    { id: 'scanner', label: 'SCANNER', icon: <Cpu className="w-4 h-4" /> },
    { id: 'signals', label: 'SIGNALS', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'paper-trading', label: 'PAPER TRADING', icon: <Terminal className="w-4 h-4" /> },
    { id: 'analytics', label: 'ANALYTICS', icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'settings', label: 'SETTINGS', icon: <Settings className="w-4 h-4" /> },
    { id: 'health', label: 'API HEALTH', icon: <ShieldCheck className="w-4 h-4" /> }
  ];

  const symbolList = Array.from(states.values());

  return (
    <header className="bg-chuchu-card border-b border-chuchu-border sticky top-0 z-50 font-sans antialiased">
      {/* Single Compact Institutional Navigation Bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-5 py-2 lg:flex-nowrap">
        {/* Left: Brand Logo */}
        <div className="flex items-center space-x-2 text-chuchu-cyan font-black tracking-wider text-sm shrink-0">
          <Radio className={`w-4 h-4 ${isConnected ? 'text-chuchu-green animate-pulse' : 'text-chuchu-red'}`} />
          <span>CHUCHU BOT</span>
        </div>

        {/* Navigation Tabs: scrollable horizontally on small screens */}
        <nav className="order-3 lg:order-2 w-full lg:w-auto lg:flex-1 min-w-0 flex items-center space-x-1 overflow-x-auto pb-1 lg:pb-0 lg:ml-3">
          {navItems.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`shrink-0 whitespace-nowrap flex items-center space-x-2 px-2 sm:px-3 py-1.5 rounded-md text-xs font-extrabold tracking-wide transition-all duration-150 ${
                  isActive
                    ? 'bg-chuchu-cyan/10 text-chuchu-cyan border border-chuchu-cyan/30 shadow-[0_0_10px_rgba(0,240,255,0.15)]'
                    : 'text-chuchu-muted hover:text-chuchu-text hover:bg-chuchu-panel/50'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: Paper Balance */}
        <div className="order-2 lg:order-3 ml-auto lg:ml-0 shrink-0 flex items-center text-xs font-semibold">
          <div className="flex items-center space-x-1.5 bg-chuchu-green/10 border border-chuchu-green/30 px-3 py-1.5 rounded-lg text-chuchu-green font-extrabold shadow-sm">
            <span className="hidden md:inline text-[10px] text-chuchu-muted uppercase">PAPER BALANCE:</span>
            <span className="num-font text-xs">${paperBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
