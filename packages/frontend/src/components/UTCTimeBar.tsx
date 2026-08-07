import React, { useState, useEffect } from 'react';
import { useChuchuStore } from '../store/useChuchuStore';
import { Clock, Wifi, Activity } from 'lucide-react';

export const UTCTimeBar: React.FC = () => {
  const { systemTime, isConnected } = useChuchuStore();
  const [localUtc, setLocalUtc] = useState('');
  const [clockDrift, setClockDrift] = useState<number>(0);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setLocalUtc(now.toISOString().replace('T', '  ').slice(0, 19));
      if (systemTime?.timestamp) {
        setClockDrift(Math.round(Date.now() - systemTime.timestamp));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [systemTime]);

  const latency = systemTime?.latencyMs ?? null;
  const driftAbs = Math.abs(clockDrift);

  const latencyColor =
    latency === null ? 'text-chuchu-muted' :
    latency < 100   ? 'text-emerald-400' :
    latency < 300   ? 'text-amber-400' : 'text-rose-400';

  const driftColor =
    driftAbs < 50  ? 'text-emerald-400' :
    driftAbs < 200 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="w-full bg-chuchu-bg/80 border-b border-chuchu-border/60 backdrop-blur-sm">
      <div className="max-w-full px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] font-mono">
        <div className="flex items-center space-x-2 text-chuchu-muted">
          <Clock className="w-3 h-3 text-chuchu-cyan shrink-0" />
          <span className="text-chuchu-text font-bold tracking-widest num-font">
            UTC&nbsp;&nbsp;{localUtc}
          </span>
        </div>
        <div className="flex items-center space-x-4 md:space-x-5">
          <div className="flex items-center space-x-1.5">
            <Wifi className="w-3 h-3 text-chuchu-muted shrink-0" />
            <span className="text-chuchu-muted">Latency</span>
            <span className={`font-bold num-font ${latencyColor}`}>{latency !== null ? `${latency}ms` : '--'}</span>
          </div>
          <div className="hidden md:flex items-center space-x-1.5">
            <Activity className="w-3 h-3 text-chuchu-muted shrink-0" />
            <span className="text-chuchu-muted">Clock Drift</span>
            <span className={`font-bold num-font ${driftColor}`}>{clockDrift >= 0 ? '+' : ''}{clockDrift}ms</span>
          </div>
          <div className="hidden sm:flex items-center space-x-1.5">
            <span className="text-chuchu-muted">Server</span>
            <span className="text-chuchu-cyan font-bold">Binance UTC</span>
          </div>
        </div>
        <div className="flex items-center space-x-1.5 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'}`} />
          <span className={`font-bold ${isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>{isConnected ? 'LIVE' : 'OFFLINE'}</span>
        </div>
      </div>
    </div>
  );
};
