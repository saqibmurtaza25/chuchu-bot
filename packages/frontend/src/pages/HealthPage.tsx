import React from 'react';
import { useChuchuStore } from '../store/useChuchuStore';
import { ShieldCheck, Radio, Server, Cpu, CheckCircle } from 'lucide-react';

export const HealthPage: React.FC = () => {
  const { isConnected, states, serverUrl } = useChuchuStore();
  const trackedCount = states.size;

  return (
    <div className="p-4 sm:p-6 space-y-6 font-sans text-chuchu-text">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-chuchu-text tracking-wider flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5 text-chuchu-green" />
          <span>API GATEWAY TELEMETRY & SYSTEM HEALTH</span>
        </h1>
        <p className="text-xs text-chuchu-muted mt-0.5">
          Real-time metrics on Binance Futures WebSocket streams, Socket.io gateway latency, and event sequence status
        </p>
      </div>

      {/* Health Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-xs">
        <div className="glass-panel rounded-xl p-5 border border-chuchu-border space-y-3">
          <div className="flex items-center justify-between text-chuchu-muted">
            <span className="uppercase text-[10px]">BINANCE WS STREAMS</span>
            <Radio className={`w-4 h-4 ${isConnected ? 'text-chuchu-green animate-pulse' : 'text-chuchu-red'}`} />
          </div>
          <div className={`text-xl font-extrabold ${isConnected ? 'text-chuchu-green' : 'text-chuchu-red'}`}>
            {isConnected ? 'STREAMING OK' : 'DISCONNECTED'}
          </div>
          <div className="text-[11px] text-chuchu-muted">
            Endpoint: <span className="text-chuchu-text font-bold">wss://fstream.binance.com</span>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-chuchu-border space-y-3">
          <div className="flex items-center justify-between text-chuchu-muted">
            <span className="uppercase text-[10px]">SOCKET.IO GATEWAY</span>
            <Server className="w-4 h-4 text-chuchu-cyan" />
          </div>
          <div className="text-xl font-extrabold text-chuchu-cyan">PORT 8080 LIVE</div>
          <div className="text-[11px] text-chuchu-muted">
            Target: <span className="text-chuchu-text font-bold">{serverUrl || window.location.origin}</span>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-chuchu-border space-y-3">
          <div className="flex items-center justify-between text-chuchu-muted">
            <span className="uppercase text-[10px]">TRACKED SYMBOLS</span>
            <Cpu className="w-4 h-4 text-chuchu-purple" />
          </div>
          <div className="text-xl font-extrabold text-chuchu-purple">{trackedCount} PAIRS ACTIVE</div>
          <div className="text-[11px] text-chuchu-muted">Multiplexed 100ms depth & tick feeds</div>
        </div>
      </div>

      {/* Pipeline Status Summary */}
      <div className="glass-panel rounded-xl p-6 border border-chuchu-border space-y-4">
        <div className="text-sm font-bold text-chuchu-text border-b border-chuchu-border pb-3">
          QUANTITATIVE ENGINE PIPELINE TELEMETRY
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="flex items-center space-x-3 p-3 bg-chuchu-bg rounded border border-chuchu-border">
            <CheckCircle className="w-4 h-4 text-chuchu-green" />
            <div>
              <div className="font-bold text-chuchu-text">Indicator Engine</div>
              <div className="text-[11px] text-chuchu-muted">Local calculation active (0 latency)</div>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-3 bg-chuchu-bg rounded border border-chuchu-border">
            <CheckCircle className="w-4 h-4 text-chuchu-green" />
            <div>
              <div className="font-bold text-chuchu-text">Orderbook Engine</div>
              <div className="text-[11px] text-chuchu-muted">OBI, CVD & L2 Depth processing (100ms updates)</div>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-3 bg-chuchu-bg rounded border border-chuchu-border">
            <CheckCircle className="w-4 h-4 text-chuchu-green" />
            <div>
              <div className="font-bold text-chuchu-text">Market Regime Engine</div>
              <div className="text-[11px] text-chuchu-muted">Hurst Exponent & ADX active</div>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-3 bg-chuchu-bg rounded border border-chuchu-border">
            <CheckCircle className="w-4 h-4 text-chuchu-green" />
            <div>
              <div className="font-bold text-chuchu-text">Paper Trading Engine</div>
              <div className="text-[11px] text-chuchu-muted">Dynamic L2 depth order matcher active</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
