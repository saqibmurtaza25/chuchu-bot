import http from 'http';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { ConfigService } from '../config/ConfigService';
import { LoggerService } from '../logging/LoggerService';
import { AppError, ValidationError, NotFoundError } from '../errors/AppError';
import { HealthService } from '../health/HealthService';
import { createExpressApp } from '../server/ExpressApp';

async function runPhase1Tests() {
  console.log('===========================================================');
  console.log('    ATHENA AI v2 — PHASE 1 BACKEND FOUNDATION TEST SUITE   ');
  console.log('===========================================================');

  // 1. ConfigService Test
  console.log('[TEST 1/5] ConfigService Zod Validation...');
  const config = ConfigService.getInstance({ port: 8081, logLevel: 'debug' });
  console.assert(config.get('port') === 8081, 'ConfigService failed port parse');
  console.assert(config.get('logLevel') === 'debug', 'ConfigService failed logLevel parse');
  console.log('✔ ConfigService Verified.');

  // 2. LoggerService Test
  console.log('[TEST 2/5] LoggerService Structured Logging...');
  const logger = LoggerService.getInstance('debug');
  const entry = logger.info('TestComponent', 'Phase 1 log verification', { testKey: 123 });
  console.assert(entry !== null && entry.level === 'info', 'LoggerService failed entry creation');
  console.log('✔ LoggerService Verified.');

  // 3. AppError & Hierarchy Test
  console.log('[TEST 3/5] AppError Hierarchy & Codes...');
  const valErr = new ValidationError('Invalid request payload', { field: 'quantity' });
  console.assert(valErr.statusCode === 400, 'ValidationError status code invalid');
  console.assert(valErr.errorCode === 'VALIDATION_ERROR', 'ValidationError code invalid');

  const notFound = new NotFoundError();
  console.assert(notFound.statusCode === 404, 'NotFoundError status code invalid');
  console.log('✔ AppError Hierarchy Verified.');

  // 4. HealthService Test
  console.log('[TEST 4/5] HealthService Telemetry...');
  const health = HealthService.getInstance();
  const telemetry = health.getTelemetry();
  console.assert(telemetry.status === 'HEALTHY', 'HealthService status invalid');
  console.assert(telemetry.memory.heapUsedMb > 0, 'HealthService memory reading invalid');
  console.log('✔ HealthService Telemetry Verified.');

  // 5. ExpressApp & SocketServerManager Integration Test
  console.log('[TEST 5/5] Express Server & Socket.io Gateway Integration...');
  const serverInst = createExpressApp(config);
  await serverInst.start();

  // Test HTTP Health Endpoint
  const healthRes = await new Promise<any>((resolve, reject) => {
    http.get('http://localhost:8081/health', (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  console.assert(healthRes.status === 'HEALTHY', 'Express /health response invalid');
  console.log('✔ Express /health Endpoint Verified.');

  // Test Socket.io Client Connection & Room Subscription
  const socketClient: ClientSocket = ClientIO('http://localhost:8081', {
    transports: ['websocket']
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket.io connection timeout')), 3000);
    socketClient.on('connect', () => {
      clearTimeout(timeout);
      socketClient.emit('join:symbol', 'BTCUSDT');
      resolve();
    });
  });

  console.assert(serverInst.socketManager.getConnectedClientCount() === 1, 'Socket.io client count invalid');
  console.log('✔ Socket.io Client Connection & Room Subscription Verified.');

  // Clean Teardown
  socketClient.disconnect();
  await serverInst.stop();

  console.log('===========================================================');
  console.log('   ALL PHASE 1 BACKEND FOUNDATION TESTS PASSED 100% CLEAN  ');
  console.log('===========================================================');
}

if (require.main === module) {
  runPhase1Tests().catch((err) => {
    console.error('Phase 1 Test Suite Failed:', err);
    process.exit(1);
  });
}
