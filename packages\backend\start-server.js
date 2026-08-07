const { createServer } = require('./dist/backend/src/server');

async function main() {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
  const serverApp = createServer(symbols);
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
  await serverApp.start(port);
}

main().catch((err) => {
  console.error('Failed to start ATHENA Backend:', err);
});
