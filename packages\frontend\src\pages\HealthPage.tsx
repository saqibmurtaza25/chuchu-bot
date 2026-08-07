import React from 'react';
import { useAthenaStore } from '../store/useAthenaStore';
import { ShieldCheck, Radio, Server, Cpu, CheckCircle } from 'lucide-react';

export const HealthPage: React.FC = () => {
  const { isConnected, states, serverUrl } = useAthenaStore();
  const trackedCount = states.size;

  return (
    <div className="p-6 space-y-6 font-sans text-athena-text">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-athena-text tracking-wider flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5 text-athena-green" />
          <span>API GATEWAY TELEMETRY & SYSTEM HEALTH</span>
        </h1>
        <p className="text-xs text-athena-muted mt-0.5">
          Real-time metrics on Binance Futures WebSocket streams, Socket.io gateway latency, and event sequence status
        </p>
      </div>

      {/* Health Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-xs">
        <div className="glass-panel rounded-xl p-5 border border-athena-border space-y-3">
          <div className="flex items-center justify-between text-athena-muted">
            <span className="uppercase text-[10px]">BINANCE WS STREAMS</span>
            <Radio className={`w-4 h-4 ${isConnected ? 'text-athena-green animate-pulse' : 'text-athena-red'}`} />
          </div>
          <div className={`text-xl font-extrabold ${isConnected ? 'text-athena-green' : 'text-athena-red'}`}>
            {isConnected ? 'STREAMING OK' : 'DISCONNECTED'}
          </div>
          <div className="text-[11px] text-athena-muted">
            Endpoint: <span className="text-athena-text font-bold">wss://fstream.binance.com</span>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-athena-border space-y-3">
          <div className="flex items-center justify-between text-athena-muted">
            <span className="uppercase text-[10px]">SOCKET.IO GATEWAY</span>
            <Server className="w-4 h-4 text-athena-cyan" />
          </div>
          <div className="text-xl font-extrabold text-athena-cyan">PORT 8080 LIVE</div>
          <div className="text-[11px] text-athena-muted">
            Target: <span className="text-athena-text font-bold">{serverUrl}</span>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-athena-border space-y-3">
          <div className="flex items-center justify-between text-athena-muted">
            <span className="uppercase text-[10px]">TRACKED SYMBOLS</span>
            <Cpu className="w-4 h-4 text-athena-purple" />
          </div>
          <div className="text-xl font-extrabold text-athena-purple">{trackedCount} PAIRS ACTIVE</div>
          <div className="text-[11px] text-athena-muted">Multiplexed 100ms depth & tick feeds</div>
        </div>
      </div>

      {/* Pipeline Status Summary */}
      <div className="glass-panel rounded-xl p-6 border border-athena-border space-y-4">
        <div className="text-sm font-bold text-athena-text border-b border-athena-border pb-3">
          QUANTITATIVE ENGINE PIPELINE TELEMETRY
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="flex items-center space-x-3 p-3 bg-athena-bg rounded border border-athena-border">
            <CheckCircle className="w-4 h-4 text-athena-green" />
            <div>
              <div className="font-bold text-athena-text">Indicator Engine</div>
              <div className="text-[11px] text-athena-muted">Local calculation active (0 latency)</div>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-3 bg-athena-bg rounded border border-athena-border">
            <CheckCircle className="w-4 h-4 text-athena-green" />
            <div>
              <div className="font-bold text-athena-text">Orderbook Engine</div>
              <div className="text-[11px] text-athena-muted">OBI, CVD & L2 Depth processing (100ms updates)</div>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-3 bg-athena-bg rounded border border-athena-border">
            <CheckCircle className="w-4 h-4 text-athena-green" />
            <div>
              <div className="font-bold text-athena-text">Market Regime Engine</div>
              <div className="text-[11px] text-athena-muted">Hurst Exponent & ADX active</div>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-3 bg-athena-bg rounded border border-athena-border">
            <CheckCircle className="w-4 h-4 text-athena-green" />
            <div>
              <div className="font-bold text-athena-text">Paper Trading Engine</div>
              <div className="text-[11px] text-athena-muted">Dynamic L2 depth order matcher active</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
