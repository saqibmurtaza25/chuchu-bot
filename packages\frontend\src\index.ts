/**
 * ATHENA AI v2 - Frontend Dashboard Core Entry Point
 * Exports real-time UI state hooks and client configuration contracts.
 */

export interface IFrontendClientConfig {
  wsUrl: string;
  reconnectIntervalMs: number;
  maxFpsDebounce: number;
}

export function createFrontendConfig(): IFrontendClientConfig {
  return {
    wsUrl: 'ws://127.0.0.1:8080',
    reconnectIntervalMs: 1000,
    maxFpsDebounce: 16 // 60 FPS update loop
  };
}
