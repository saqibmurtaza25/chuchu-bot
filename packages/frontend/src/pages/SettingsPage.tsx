import React, { useState } from 'react';
import { useChuchuStore } from '../store/useChuchuStore';
import { Settings, Save, RefreshCw } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { serverUrl, connect, autoTradeConfig, setAutoTradeConfig } = useChuchuStore();
  const [urlInput, setUrlInput] = useState(serverUrl);

  const handleSave = () => {
    connect(urlInput);
  };

  const handleAutoTradeChange = (key: keyof typeof autoTradeConfig, value: any) => {
    setAutoTradeConfig({ [key]: value });
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 font-sans text-chuchu-text max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-chuchu-text tracking-wider flex items-center space-x-2">
          <Settings className="w-5 h-5 text-chuchu-cyan" />
          <span>SYSTEM CONFIGURATION & ENGINE WEIGHTS</span>
        </h1>
        <p className="text-chuchu-muted text-xs mt-1">
          Configure WebSocket gateway endpoint, setup quality thresholds, and risk bounds
        </p>
      </div>

      <div className="glass-panel rounded-xl p-6 border border-chuchu-border space-y-6 text-xs">
        {/* Gateway Connection */}
        <div className="space-y-2">
          <label className="text-chuchu-muted font-bold block uppercase text-[10px]">BACKEND SOCKET.IO GATEWAY URL</label>
          <div className="flex space-x-3">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="flex-1 px-3 py-2 bg-chuchu-bg border border-chuchu-border rounded text-chuchu-text font-bold focus:outline-none focus:border-chuchu-cyan"
            />
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-chuchu-cyan/20 text-chuchu-cyan border border-chuchu-cyan/40 rounded font-bold hover:bg-chuchu-cyan/30 flex items-center space-x-1.5"
            >
              <Save className="w-4 h-4" />
              <span>RECONNECT</span>
            </button>
          </div>
        </div>

        {/* Engine Parameters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-chuchu-border">
          <div className="space-y-1">
            <label className="text-chuchu-muted font-bold block uppercase text-[10px]">MIN SETUP QUALITY (%)</label>
            <input
              type="number"
              value={autoTradeConfig.minSetupQuality ?? 75}
              onChange={(e) => handleAutoTradeChange('minSetupQuality', Number(e.target.value))}
              className="w-full bg-chuchu-panel border border-chuchu-border rounded-lg px-4 py-2 text-chuchu-text text-sm focus:outline-none focus:border-chuchu-cyan"
            />
          </div>

          <div className="space-y-2">
            <label className="text-chuchu-muted font-bold block uppercase text-[10px]">AUTO-TRADE MODE</label>
            <select
              value={autoTradeConfig.mode}
              onChange={(e) => handleAutoTradeChange('mode', e.target.value)}
              className="w-full px-3 py-2 bg-chuchu-bg border border-chuchu-border rounded text-chuchu-text font-bold focus:outline-none focus:border-chuchu-cyan"
            >
              <option value="OFF">OFF (Signals Only)</option>
              <option value="SEMI_AUTO">SEMI AUTO (Manual Click Required)</option>
              <option value="AUTO">AUTO (Full Execution)</option>
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="text-chuchu-muted font-bold block uppercase text-[10px]">MARGIN PER TRADE (USDT)</label>
            <select
              value={autoTradeConfig.margin}
              onChange={(e) => handleAutoTradeChange('margin', Number(e.target.value))}
              className="w-full px-3 py-2 bg-chuchu-bg border border-chuchu-border rounded text-chuchu-text font-bold focus:outline-none focus:border-chuchu-cyan"
            >
              <option value="5">5 USDT</option>
              <option value="10">10 USDT</option>
              <option value="20">20 USDT</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-chuchu-muted font-bold block uppercase text-[10px]">LEVERAGE (x)</label>
            <select
              value={autoTradeConfig.leverage}
              onChange={(e) => handleAutoTradeChange('leverage', Number(e.target.value))}
              className="w-full px-3 py-2 bg-chuchu-bg border border-chuchu-border rounded text-chuchu-text font-bold focus:outline-none focus:border-chuchu-cyan"
            >
              <option value="5">5x</option>
              <option value="10">10x</option>
              <option value="20">20x</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-chuchu-muted font-bold block uppercase text-[10px]">MAX OPEN TRADES</label>
            <select
              value={autoTradeConfig.maxOpenTrades}
              onChange={(e) => handleAutoTradeChange('maxOpenTrades', Number(e.target.value))}
              className="w-full px-3 py-2 bg-chuchu-bg border border-chuchu-border rounded text-chuchu-text font-bold focus:outline-none focus:border-chuchu-cyan"
            >
              <option value="1">1 Trade</option>
              <option value="2">2 Trades</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-chuchu-muted font-bold block uppercase text-[10px]">RISK PERCENTAGE (%)</label>
            <select
              value={autoTradeConfig.riskPct}
              onChange={(e) => handleAutoTradeChange('riskPct', Number(e.target.value))}
              className="w-full px-3 py-2 bg-chuchu-bg border border-chuchu-border rounded text-chuchu-text font-bold focus:outline-none focus:border-chuchu-cyan"
            >
              <option value="1">1% Risk</option>
              <option value="2">2% Risk</option>
              <option value="3">3% Risk</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
