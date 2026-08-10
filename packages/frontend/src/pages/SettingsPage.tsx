import React, { useState, useEffect } from 'react';
import { useChuchuStore } from '../store/useChuchuStore';
import { Settings, Save, RefreshCw, KeyRound, Unplug, Lock } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const {
    serverUrl,
    connect,
    autoTradeConfig,
    setAutoTradeConfig,
    fetchAutoTradeConfig,
    exchangeStatus,
    fetchExchangeStatus,
    saveExchangeKeys,
    disconnectExchange
  } = useChuchuStore();
  const [urlInput, setUrlInput] = useState(serverUrl);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiSecretInput, setApiSecretInput] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  useEffect(() => {
    fetchExchangeStatus();
    fetchAutoTradeConfig();
  }, [fetchExchangeStatus, fetchAutoTradeConfig]);

  const handleSave = () => {
    connect(urlInput);
  };

  const handleAutoTradeChange = (key: keyof typeof autoTradeConfig, value: any) => {
    setAutoTradeConfig({ [key]: value });
  };

  const handleSaveKeys = async () => {
    if (!apiKeyInput || !apiSecretInput) return;
    setSaveState('saving');
    const ok = await saveExchangeKeys(apiKeyInput, apiSecretInput);
    setSaveState(ok ? 'done' : 'error');
    if (ok) {
      setApiKeyInput('');
      setApiSecretInput('');
    }
    setTimeout(() => setSaveState('idle'), 2500);
  };

  const toggle = (label: string, key: keyof typeof autoTradeConfig, value: boolean) => (
    <button
      onClick={() => handleAutoTradeChange(key, !value)}
      className={`px-3 py-1.5 rounded-md text-xs font-bold border transition-all ${
        value
          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
          : 'bg-chuchu-card text-chuchu-muted border-chuchu-border'
      }`}
    >
      {value ? 'ON' : 'OFF'}
    </button>
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 font-sans text-chuchu-text max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-chuchu-text tracking-wider flex items-center space-x-2">
          <Settings className="w-5 h-5 text-chuchu-cyan" />
          <span>SYSTEM CONFIGURATION & ENGINE WEIGHTS</span>
        </h1>
        <p className="text-chuchu-muted text-xs mt-1">
          Configure WebSocket gateway endpoint, setup quality thresholds, risk bounds, trailing stop & real-account trading
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
            <label className="text-chuchu-muted font-bold block uppercase text-[10px]">EXECUTION ACCOUNT</label>
            <select
              value={autoTradeConfig.execution}
              onChange={(e) => handleAutoTradeChange('execution', e.target.value)}
              className="w-full px-3 py-2 bg-chuchu-bg border border-chuchu-border rounded text-chuchu-text font-bold focus:outline-none focus:border-chuchu-cyan"
            >
              <option value="PAPER">PAPER (Virtual — $100 Demo)</option>
              <option value="REAL">REAL (Live Binance Futures)</option>
            </select>
            {autoTradeConfig.execution === 'REAL' && !exchangeStatus?.configured && (
              <div className="text-amber-400 text-[10px] font-bold">
                WARNING: REAL mode needs Binance API keys below. Without keys it falls back to paper.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-chuchu-muted font-bold block uppercase text-[10px]">MIN RISK:REWARD (SMART-MONEY FILTER)</label>
            <select
              value={autoTradeConfig.minRiskReward}
              onChange={(e) => handleAutoTradeChange('minRiskReward', Number(e.target.value))}
              className="w-full px-3 py-2 bg-chuchu-bg border border-chuchu-border rounded text-chuchu-text font-bold focus:outline-none focus:border-chuchu-cyan"
            >
              <option value="1">1.0 (Aggressive)</option>
              <option value="1.5">1.5 (Balanced)</option>
              <option value="2">2.0 (Pro Trader)</option>
              <option value="2.5">2.5 (Premium Setups Only)</option>
              <option value="3">3.0 (Top-Tier Only)</option>
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
              <option value="50">50 USDT</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-chuchu-muted font-bold block uppercase text-[10px]">LEVERAGE (x)</label>
            <select
              value={autoTradeConfig.leverage}
              onChange={(e) => handleAutoTradeChange('leverage', Number(e.target.value))}
              className="w-full px-3 py-2 bg-chuchu-bg border border-chuchu-border rounded text-chuchu-text font-bold focus:outline-none focus:border-chuchu-cyan"
            >
              <option value="3">3x</option>
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
              <option value="3">3 Trades</option>
              <option value="4">4 Trades</option>
              <option value="5">5 Trades</option>
              <option value="6">6 Trades</option>
              <option value="8">8 Trades</option>
              <option value="10">10 Trades</option>
            </select>
            <p className="text-chuchu-muted text-[10px]">Har trade isolated — apna alag SL/TP/trailing/momentum check. Max 10 coins tak parallel.</p>
          </div>

          <div className="space-y-2">
            <label className="text-chuchu-muted font-bold block uppercase text-[10px]">RISK PERCENTAGE (%)</label>
            <select
              value={autoTradeConfig.riskPct}
              onChange={(e) => handleAutoTradeChange('riskPct', Number(e.target.value))}
              className="w-full px-3 py-2 bg-chuchu-bg border border-chuchu-border rounded text-chuchu-text font-bold focus:outline-none focus:border-chuchu-cyan"
            >
              <option value="0.5">0.5% Risk</option>
              <option value="1">1% Risk</option>
              <option value="2">2% Risk</option>
              <option value="3">3% Risk</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-chuchu-muted font-bold block uppercase text-[10px]">RE-ENTRY COOLDOWN (AFTER A WIN/LOSS CLOSE)</label>
            <select
              value={autoTradeConfig.reentryCooldownMin}
              onChange={(e) => handleAutoTradeChange('reentryCooldownMin', Number(e.target.value))}
              className="w-full px-3 py-2 bg-chuchu-bg border border-chuchu-border rounded text-chuchu-text font-bold focus:outline-none focus:border-chuchu-cyan"
            >
              <option value="0">0 min (instant re-entry)</option>
              <option value="3">3 min</option>
              <option value="5">5 min</option>
              <option value="10">10 min</option>
              <option value="15">15 min</option>
            </select>
            <p className="text-chuchu-muted text-[10px]">Same coin dobara trade tabhi hoga jab cooldown khatam + woh phir se qualify kare.</p>
          </div>

          <div className="space-y-2">
            <label className="text-chuchu-muted font-bold block uppercase text-[10px]">HIGHER-TIMEFRAME TREND FILTER (WIN-RATE BOOSTER)</label>
            <div className="flex items-center justify-between bg-chuchu-bg border border-chuchu-border rounded px-3 py-2">
              <span className="text-chuchu-text font-bold text-[11px]">
                {autoTradeConfig.htfTrendFilter ? 'ON — sirf 1h/4h trend ke direction me trades' : 'OFF — counter-trend trades allowed'}
              </span>
              <button
                onClick={() => handleAutoTradeChange('htfTrendFilter', !autoTradeConfig.htfTrendFilter)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-black border transition-all ${
                  autoTradeConfig.htfTrendFilter
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-chuchu-card text-chuchu-muted border-chuchu-border'
                }`}
              >
                {autoTradeConfig.htfTrendFilter ? 'ON' : 'OFF'}
              </button>
            </div>
            <p className="text-chuchu-muted text-[10px]">Counter-trend scalps low win rate ka sabse bada reason hain. Is filter se win rate boost hota hai.</p>
          </div>
        </div>

        {/* Trailing Stop */}
        <div className="pt-4 border-t border-chuchu-border space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-chuchu-muted font-bold block uppercase text-[10px]">TRAILING STOP (PROFIT LOCK)</label>
              <p className="text-chuchu-muted text-[10px] mt-0.5">
                Locks profits — once price gains activation% of the entry→TP distance, the stop trails behind price and never moves back.
              </p>
            </div>
            {toggle('Trailing Stop', 'trailingStopEnabled', autoTradeConfig.trailingStopEnabled ?? true)}
          </div>
          {autoTradeConfig.trailingStopEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-chuchu-muted font-bold block uppercase text-[10px]">ACTIVATION (% of entry→TP distance)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={autoTradeConfig.trailingActivationPct ?? 40}
                  onChange={(e) => handleAutoTradeChange('trailingActivationPct', Number(e.target.value))}
                  className="w-full bg-chuchu-panel border border-chuchu-border rounded-lg px-4 py-2 text-chuchu-text text-sm focus:outline-none focus:border-chuchu-cyan"
                />
                <p className="text-chuchu-muted text-[10px]">Lower = arms earlier. 40 = arms at 40% of the way to TP.</p>
              </div>
              <div className="space-y-2">
                <label className="text-chuchu-muted font-bold block uppercase text-[10px]">TRAIL DISTANCE (% of entry price)</label>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={autoTradeConfig.trailingDistancePct ?? 0.6}
                  onChange={(e) => handleAutoTradeChange('trailingDistancePct', Number(e.target.value))}
                  className="w-full bg-chuchu-panel border border-chuchu-border rounded-lg px-4 py-2 text-chuchu-text text-sm focus:outline-none focus:border-chuchu-cyan"
                />
                <p className="text-chuchu-muted text-[10px]">Higher = wider trail (fewer stop-outs). 0.6 = stop sits 0.6% behind price.</p>
              </div>
            </div>
          )}
        </div>

        {/* Real Account Integration */}
        <div className="pt-4 border-t border-chuchu-border space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-chuchu-muted font-bold block uppercase text-[10px] flex items-center space-x-1.5">
                <KeyRound className="w-3.5 h-3.5 text-chuchu-yellow" />
                <span>BINANCE FUTURES LIVE ACCOUNT (REAL MONEY)</span>
              </label>
              <p className="text-chuchu-muted text-[10px] mt-0.5">
                Keys are kept in backend memory only — never written to disk or committed. Futures API permission required. IP-allowlist Binance's IP if requested.
              </p>
            </div>
            <button
              onClick={disconnectExchange}
              disabled={!exchangeStatus?.configured}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-md text-[10px] font-bold border transition-all ${
                exchangeStatus?.configured
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                  : 'bg-chuchu-card text-chuchu-muted border-chuchu-border cursor-not-allowed'
              }`}
            >
              <Unplug className="w-3 h-3" />
              <span>DISCONNECT</span>
            </button>
          </div>

          <div className="rounded-lg border border-chuchu-border bg-chuchu-bg/60 p-3 space-y-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-chuchu-muted font-bold">CONNECTION STATUS</span>
              <span className={`font-black ${exchangeStatus?.configured ? 'text-emerald-400' : 'text-rose-400'}`}>
                {exchangeStatus?.configured
                  ? `CONNECTED · ${exchangeStatus.source === 'ENV' ? 'ENV VARS' : 'RUNTIME'} · Balance $${(exchangeStatus.balanceUsdt ?? 0).toFixed(2)}`
                  : exchangeStatus?.error
                    ? `ERROR: ${exchangeStatus.error}`
                    : 'NOT CONNECTED'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="API KEY"
                autoComplete="off"
                className="px-3 py-2 bg-chuchu-bg border border-chuchu-border rounded text-chuchu-text font-mono text-xs focus:outline-none focus:border-chuchu-cyan"
              />
              <input
                type="password"
                value={apiSecretInput}
                onChange={(e) => setApiSecretInput(e.target.value)}
                placeholder="API SECRET"
                autoComplete="off"
                className="px-3 py-2 bg-chuchu-bg border border-chuchu-border rounded text-chuchu-text font-mono text-xs focus:outline-none focus:border-chuchu-cyan"
              />
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={handleSaveKeys}
                disabled={!apiKeyInput || !apiSecretInput || saveState === 'saving'}
                className="px-4 py-2 bg-chuchu-yellow/20 text-chuchu-yellow border border-chuchu-yellow/40 rounded font-bold hover:bg-chuchu-yellow/30 flex items-center space-x-1.5 disabled:opacity-40"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{saveState === 'saving' ? 'SAVING...' : saveState === 'done' ? 'SAVED ✓' : saveState === 'error' ? 'FAILED' : 'SAVE & TEST CONNECTION'}</span>
              </button>
              <button onClick={fetchExchangeStatus} className="flex items-center space-x-1 text-chuchu-muted hover:text-chuchu-text font-bold text-[10px]">
                <RefreshCw className="w-3 h-3" />
                <span>REFRESH</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
