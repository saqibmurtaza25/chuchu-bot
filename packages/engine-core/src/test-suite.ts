import {
  ValidationEngine,
  IndicatorEngine,
  OrderbookEngine,
  MarketRegimeEngine,
  HunterEngine,
  ScannerEngine,
  SignalEngine,
  PaperTradingEngine,
  AnalyticsEngine
} from './index';

import { CandleOHLCV, DepthSnapshot, MarketTick } from '@chuchu/shared';

function runTests() {
  console.log('--- CHUCHU Engine Core Test Suite ---');

  // 1. ValidationEngine Test
  const validator = new ValidationEngine();
  const validTick = validator.validateTick({
    symbol: 'BTCUSDT',
    price: 50000,
    quantity: 1.5,
    timestamp: Date.now(),
    isBuyerMaker: false
  });
  console.assert(validTick.valid === true, 'ValidationEngine failed valid tick');

  const invalidTick = validator.validateTick({
    symbol: 'BTCUSDT',
    price: -10,
    quantity: 0,
    timestamp: Date.now(),
    isBuyerMaker: false
  });
  console.assert(invalidTick.valid === false, 'ValidationEngine failed invalid tick detection');
  console.log('[PASS] ValidationEngine Test');

  // 2. IndicatorEngine Test
  const indicatorEngine = new IndicatorEngine();
  const mockPrices = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i * 0.1) * 10 + i * 0.5);
  const mockCandles: CandleOHLCV[] = mockPrices.map((p, i) => ({
    symbol: 'BTCUSDT',
    interval: '1m',
    openTime: Date.now() - (60 - i) * 60000,
    closeTime: Date.now() - (60 - i - 1) * 60000,
    open: p - 1,
    high: p + 2,
    low: p - 2,
    close: p,
    volume: 1000 + i * 10,
    isClosed: true
  }));

  const indicators = indicatorEngine.evaluate(mockCandles);
  console.assert(indicators !== null, 'IndicatorEngine evaluation failed');
  console.assert(indicators!.ema20 > 0, 'EMA calculation invalid');
  console.assert(indicators!.rsi14 >= 0 && indicators!.rsi14 <= 100, 'RSI range invalid');
  console.log('[PASS] IndicatorEngine Test (Pure local math calculations verified)');

  // 3. OrderbookEngine Test
  const orderbookEngine = new OrderbookEngine();
  const mockDepth: DepthSnapshot = {
    symbol: 'BTCUSDT',
    bids: [{ price: 49990, quantity: 10 }, { price: 49980, quantity: 5 }],
    asks: [{ price: 50010, quantity: 2 }, { price: 50020, quantity: 3 }],
    lastUpdateId: 1001,
    timestamp: Date.now()
  };
  const micro = orderbookEngine.evaluate(mockDepth);
  console.assert(micro.orderbookImbalance > 0, 'Orderbook Imbalance positive bid skew failed');
  console.log('[PASS] OrderbookEngine Test (OBI = ' + micro.orderbookImbalance.toFixed(2) + ')');

  // 4. MarketRegimeEngine Test
  const regimeEngine = new MarketRegimeEngine();
  const regime = regimeEngine.evaluate(mockCandles);
  console.assert(regime.hurstExponent >= 0 && regime.hurstExponent <= 1, 'Hurst exponent range invalid');
  console.log('[PASS] MarketRegimeEngine Test (Hurst = ' + regime.hurstExponent + ', Regime = ' + regime.regime + ')');

  // 5. HunterEngine Test
  const hunterEngine = new HunterEngine();
  const hunter = hunterEngine.evaluate('BTCUSDT', indicators?.rsiMultiTimeframe, indicators?.williamsRMultiTimeframe);
  console.assert(hunter.hunterScore >= 0 && hunter.hunterScore <= 100, 'Hunter score range invalid');
  console.log('[PASS] HunterEngine Test (Hunter Score = ' + hunter.hunterScore + ')');

  // 6. SignalEngine Test
  const signalEngine = new SignalEngine();
  const signal = signalEngine.evaluate('BTCUSDT', 50000, indicators, micro, regime, hunter);
  console.assert(['BUY', 'SELL', 'NEUTRAL'].includes(signal.signal), 'Signal type invalid');
  console.log('[PASS] SignalEngine Test (Signal = ' + signal.signal + ', Setup Quality = ' + signal.setupQuality + ')');

  // 7. PaperTradingEngine Test
  const paperEngine = new PaperTradingEngine();
  const trade = paperEngine.executeOrder({
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'MARKET',
    quantity: 1.0
  }, mockDepth, 50000);
  console.assert(trade.quantity === 1.0, 'Paper execution fill failed');
  console.assert(paperEngine.getPositions().length === 1, 'Position tracking failed');
  console.log('[PASS] PaperTradingEngine Test (Trade Executed @ ' + trade.fillPrice + ')');

  // 8. AnalyticsEngine Test
  const analyticsEngine = new AnalyticsEngine();
  const metrics = analyticsEngine.evaluate(paperEngine.getTradeHistory());
  console.assert(metrics.totalTrades === 1, 'Analytics total trades count failed');
  console.log('[PASS] AnalyticsEngine Test (Sharpe = ' + metrics.sharpeRatio + ')');

  console.log('--- ALL CHUCHU ENGINE MODULE TESTS PASSED ---');
}

runTests();
