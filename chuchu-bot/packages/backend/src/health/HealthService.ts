export interface ComponentHealthStatus {
  name: string;
  status: 'UP' | 'DOWN' | 'DEGRADED';
  details?: Record<string, any>;
}

export interface HealthTelemetry {
  status: 'HEALTHY' | 'UNHEALTHY' | 'DEGRADED';
  timestamp: string;
  uptimeSeconds: number;
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
  };
  components: ComponentHealthStatus[];
}

/**
 * HealthService
 * Enterprise health check and telemetry service inspecting process metrics and subsystem states.
 */
export class HealthService {
  private static instance: HealthService;
  private startTime: number = Date.now();
  private componentStatuses: Map<string, ComponentHealthStatus> = new Map();

  private constructor() {
    this.registerComponent('expressApp', 'UP');
    this.registerComponent('socketIo', 'UP');
  }

  public static getInstance(): HealthService {
    if (!HealthService.instance) {
      HealthService.instance = new HealthService();
    }
    return HealthService.instance;
  }

  public registerComponent(name: string, status: 'UP' | 'DOWN' | 'DEGRADED', details?: Record<string, any>): void {
    this.componentStatuses.set(name, { name, status, details });
  }

  public getTelemetry(): HealthTelemetry {
    const mem = process.memoryUsage();
    const components = Array.from(this.componentStatuses.values());

    let overallStatus: 'HEALTHY' | 'UNHEALTHY' | 'DEGRADED' = 'HEALTHY';
    for (const comp of components) {
      if (comp.status === 'DOWN') {
        overallStatus = 'UNHEALTHY';
        break;
      } else if (comp.status === 'DEGRADED') {
        overallStatus = 'DEGRADED';
      }
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptimeSeconds: parseFloat(((Date.now() - this.startTime) / 1000).toFixed(1)),
      memory: {
        heapUsedMb: parseFloat((mem.heapUsed / 1024 / 1024).toFixed(2)),
        heapTotalMb: parseFloat((mem.heapTotal / 1024 / 1024).toFixed(2)),
        rssMb: parseFloat((mem.rss / 1024 / 1024).toFixed(2))
      },
      components
    };
  }
}
