import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { LoggerService } from '../logging/LoggerService';

export interface SocketServerConfig {
  corsOrigin: string;
  pingInterval?: number;
  pingTimeout?: number;
}

/**
 * SocketServerManager
 * Production wrapper around Socket.io server managing real-time client streaming and symbol room subscriptions.
 */
export class SocketServerManager {
  private io: SocketIOServer;
  private logger = LoggerService.getInstance();
  private connectedClientsCount = 0;

  constructor(httpServer: http.Server, config: SocketServerConfig) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.corsOrigin || '*',
        methods: ['GET', 'POST']
      },
      pingInterval: config.pingInterval || 25000,
      pingTimeout: config.pingTimeout || 20000,
      transports: ['websocket', 'polling']
    });

    this.setupListeners();
  }

  private setupListeners(): void {
    this.io.on('connection', (socket: Socket) => {
      this.connectedClientsCount++;
      this.logger.info('SocketServerManager', `Client connected [${socket.id}]. Total active: ${this.connectedClientsCount}`);

      // Symbol room subscription handlers
      socket.on('join:symbol', (symbol: string) => {
        if (typeof symbol === 'string') {
          const room = `symbol:${symbol.toUpperCase()}`;
          socket.join(room);
          this.logger.debug('SocketServerManager', `Socket ${socket.id} joined room ${room}`);
        }
      });

      socket.on('leave:symbol', (symbol: string) => {
        if (typeof symbol === 'string') {
          const room = `symbol:${symbol.toUpperCase()}`;
          socket.leave(room);
          this.logger.debug('SocketServerManager', `Socket ${socket.id} left room ${room}`);
        }
      });

      socket.on('disconnect', (reason: string) => {
        this.connectedClientsCount = Math.max(0, this.connectedClientsCount - 1);
        this.logger.info('SocketServerManager', `Client disconnected [${socket.id}] (${reason}). Active: ${this.connectedClientsCount}`);
      });

      socket.on('error', (err: Error) => {
        this.logger.error('SocketServerManager', `Socket ${socket.id} error`, err);
      });
    });
  }

  public broadcast(event: string, data: any): void {
    this.io.emit(event, data);
  }

  public broadcastToRoom(room: string, event: string, data: any): void {
    this.io.to(room).emit(event, data);
  }

  public broadcastSymbolState(symbol: string, state: any): void {
    this.io.emit('engine:update', state);
    this.io.to(`symbol:${symbol.toUpperCase()}`).emit('symbol:update', state);
  }

  public getConnectedClientCount(): number {
    return this.connectedClientsCount;
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      this.io.close(() => {
        this.logger.info('SocketServerManager', 'Socket.io Server closed.');
        resolve();
      });
    });
  }
}
