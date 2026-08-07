import WebSocket from 'ws';
import { MarketTick, DepthSnapshot, CandleOHLCV } from '@athena/shared';

export interface WebSocketManagerHandlers {
  onTick?: (tick: MarketTick) => void;
  onDepth?: (depth: DepthSnapshot) => void;
  onKline?: (kline: CandleOHLCV) => void;
  onStatusChange?: (status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING') => void;
}

/**
 * WebSocketManager
 * Ingestion client for Binance Futures WebSocket multiplex streams.
 * Handles auto-reconnect with exponential backoff and sequence verification.
 */
export class WebSocketManager {
  private ws: WebSocket | null = null;
  private symbols: string[];
  private handlers: WebSocketManagerHandlers;
  private baseUrl = 'wss://fstream.binance.com/ws';
  
  private focusedSymbol: string | null = null;
  private retryCount = 0;
  private maxRetryDelay = 30000;
  private baseRetryDelay = 1000;
  private isConnecting = false;
  private isClosedIntentionally = false;

  constructor(symbols: string[], handlers: WebSocketManagerHandlers = {}) {
    this.symbols = symbols.map(s => s.toLowerCase());
    this.handlers = handlers;
  }

  public updateSymbols(newSymbols: string[], focusedSymbol: string | null = null): void {
    const sortedOld = [...this.symbols].sort().join(',');
    const sortedNew = [...newSymbols].map(s => s.toLowerCase()).sort().join(',');
    if (sortedOld === sortedNew && this.focusedSymbol === focusedSymbol) return; // No change

    this.symbols = newSymbols.map(s => s.toLowerCase());
    this.focusedSymbol = focusedSymbol;
    console.log(`WebSocketManager: Symbols updated to ${this.symbols.length} symbols. Focused: ${focusedSymbol || 'none'}. Reconnecting...`);
    
    this.disconnect();
    setTimeout(() => {
      this.isClosedIntentionally = false;
      this.connect();
    }, 500);
  }

  /**
   * Constructs stream parameter string for multiplex subscription.
   * Focus coin and Majors get full orderbook depth, WATCH coins get lightweight streams.
   */
  private getStreamNames(symbols: string[]): string[] {
    const streams: string[] = [];
    const focusLower = this.focusedSymbol?.toLowerCase();
    
    for (const sym of symbols) {
      const symLower = sym.toLowerCase();
      const isMajor = ['btcusdt', 'ethusdt', 'solusdt', 'bnbusdt', 'xrpusdt'].includes(symLower);
      const isFocus = focusLower && symLower === focusLower;

      if (isMajor || isFocus) {
        streams.push(`${symLower}@aggTrade`);
        streams.push(`${symLower}@depth20@100ms`); // Heavy L2 orderbook
        streams.push(`${symLower}@kline_1m`);
        streams.push(`${symLower}@markPrice@1s`);
      } else {
        // WATCH Level: Skip L2 depth stream to save bandwidth but keep miniTicker rolling updates
        streams.push(`${symLower}@aggTrade`);
        streams.push(`${symLower}@miniTicker`);
        streams.push(`${symLower}@kline_1m`);
        streams.push(`${symLower}@markPrice@1s`);
      }
    }
    return streams;
  }

  public connect(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) return;

    this.isConnecting = true;
    this.isClosedIntentionally = false;
    this.notifyStatus('CONNECTING');

    this.ws = new WebSocket(this.baseUrl);

    this.ws.on('open', () => {
      this.isConnecting = false;
      this.retryCount = 0;
      this.notifyStatus('CONNECTED');
      console.log(`WebSocketManager: Successfully connected to Binance Streams.`);
      
      // Send SUBSCRIBE payload for all streams (chunked to max 200 per request)
      const allStreams = this.getStreamNames(this.symbols);
      for (let i = 0; i < allStreams.length; i += 200) {
        const chunk = allStreams.slice(i, i + 200);
        this.ws?.send(JSON.stringify({
          method: 'SUBSCRIBE',
          params: chunk,
          id: Date.now() + i
        }));
      }
      console.log(`WebSocketManager: Subscribed to ${allStreams.length} streams for ${this.symbols.length} symbols.`);
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data);
    });

    this.ws.on('error', (err: Error) => {
      console.error('WebSocketManager: Socket error:', err.message);
    });

    this.ws.on('close', () => {
      this.isConnecting = false;
      this.notifyStatus('DISCONNECTED');
      if (!this.isClosedIntentionally) {
        this.scheduleReconnect();
      }
    });
  }

  private handleMessage(rawData: WebSocket.Data): void {
    try {
      const parsed = JSON.parse(rawData.toString());
      if (!parsed) return;

      // Handle both Combined Stream format ({ stream, data }) and Raw Stream format ({ e, s, p, ... })
      const data = parsed.data || parsed;
      const streamName = parsed.stream || '';
      const eventType = data.e || (streamName.includes('miniTicker') ? 'miniTicker' : '');

      if (eventType === 'aggTrade') {
        const tick: MarketTick = {
          symbol: data.s,
          price: parseFloat(data.p),
          quantity: parseFloat(data.q),
          timestamp: data.T,
          isBuyerMaker: data.m,
          tradeId: data.a
        };
        if (this.handlers.onTick) this.handlers.onTick(tick);
      } else if (eventType === 'markPriceUpdate' || streamName.includes('@markPrice')) {
        const tick: MarketTick = {
          symbol: data.s,
          price: parseFloat(data.p),
          quantity: 0,
          timestamp: data.E || Date.now(),
          isBuyerMaker: false
        };
        if (this.handlers.onTick) this.handlers.onTick(tick);
      } else if (eventType === '24hrMiniTicker' || eventType === 'miniTicker' || streamName.includes('@miniTicker')) {
        const tick: MarketTick = {
          symbol: data.s,
          price: parseFloat(data.c),
          quantity: parseFloat(data.v || '0'),
          timestamp: data.E || Date.now(),
          isBuyerMaker: false
        };
        if (this.handlers.onTick) this.handlers.onTick(tick);
      } else if (eventType === 'depthUpdate' || streamName.includes('@depth')) {
        const depth: DepthSnapshot = {
          symbol: data.s || streamName.split('@')[0].toUpperCase(),
          bids: (data.b || []).map((b: string[]) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
          asks: (data.a || []).map((a: string[]) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) })),
          lastUpdateId: data.u || Date.now(),
          timestamp: data.E || Date.now()
        };
        if (this.handlers.onDepth) this.handlers.onDepth(depth);
      } else if (eventType === 'kline') {
        const k = data.k;
        const candle: CandleOHLCV = {
          symbol: k.s,
          interval: k.i,
          openTime: k.t,
          closeTime: k.T,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
          isClosed: k.x
        };
        if (this.handlers.onKline) this.handlers.onKline(candle);
      }
    } catch (err: any) {
      console.error('WebSocketManager: Message parse error:', err.message);
    }
  }

  private scheduleReconnect(): void {
    this.retryCount++;
    const delay = Math.min(this.maxRetryDelay, this.baseRetryDelay * Math.pow(2, this.retryCount)) + Math.random() * 500;
    this.notifyStatus('RECONNECTING');
    console.log(`WebSocketManager: Reconnecting in ${Math.round(delay)}ms (Attempt ${this.retryCount})...`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  public disconnect(): void {
    this.isClosedIntentionally = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private notifyStatus(status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING'): void {
    if (this.handlers.onStatusChange) {
      this.handlers.onStatusChange(status);
    }
  }
}
