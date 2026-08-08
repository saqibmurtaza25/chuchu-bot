import http from 'http';
import express, { Express, Request, Response } from 'express';
import { ConfigService } from '../config/ConfigService';
import { LoggerService } from '../logging/LoggerService';
import { HealthService } from '../health/HealthService';
import { SocketServerManager } from '../websocket/SocketServerManager';
import { errorHandlerMiddleware, NotFoundError } from '../errors/AppError';

export interface ServerInstance {
  app: Express;
  httpServer: http.Server;
  socketManager: SocketServerManager;
  config: ConfigService;
  logger: LoggerService;
  health: HealthService;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Bootstrap Express Application & Server Gateway
 */
export function createExpressApp(customConfig?: ConfigService): ServerInstance {
  const config = customConfig || ConfigService.getInstance();
  const logger = LoggerService.getInstance(config.get('logLevel'));
  const health = HealthService.getInstance();

  const app: Express = express();
  app.use(express.json());

  // CORS Middleware
  const corsOrigin = config.get('corsOrigin');
  app.use((req: Request, res: Response, next) => {
    res.header('Access-Control-Allow-Origin', corsOrigin);
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  const httpServer = http.createServer(app);
  const socketManager = new SocketServerManager(httpServer, {
    corsOrigin: corsOrigin
  });

  // Health Routes
  app.get('/health', (req: Request, res: Response) => {
    const telemetry = health.getTelemetry();
    const statusCode = telemetry.status === 'UNHEALTHY' ? 503 : 200;
    res.status(statusCode).json(telemetry);
  });

  app.get('/health/liveness', (req: Request, res: Response) => {
    res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
  });

  // 404 Route Handler
  app.use((req: Request, res: Response, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
  });

  // Global Error Middleware
  app.use(errorHandlerMiddleware);

  const start = (): Promise<void> => {
    return new Promise((resolve) => {
      const port = config.get('port');
      const host = config.get('host');

      httpServer.listen(port, host, () => {
        logger.info('ExpressApp', `CHUCHU Backend Server Phase 1 running on http://${host}:${port}`);
        resolve();
      });
    });
  };

  const stop = (): Promise<void> => {
    return new Promise(async (resolve) => {
      await socketManager.close();
      httpServer.close(() => {
        logger.info('ExpressApp', 'HTTP Server stopped gracefully.');
        resolve();
      });
    });
  };

  return { app, httpServer, socketManager, config, logger, health, start, stop };
}
