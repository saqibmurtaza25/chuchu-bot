import { ReversalIntelligenceEngine } from './ReversalIntelligenceEngine';
import { CandleOHLCV } from '@chuchu/shared';

function genCandles(priceFn: (i: number) => number, n = 260, interval = '5m'): CandleOHLCV[] {
  return Array.from({ length: n }, (_, i) => {
    const p = priceFn(i);
    return {
      symbol: 'BTCUSDT',
      interval,
      openTime: Date.now() - (n - i) * 300000,
      closeTime: Date.now() - (n - i - 1) * 300000,
      open: p,
      high: p * 1.01,
      low: p * 0.99,
      close: p,
      volume: 1000 + i * 10,
      isClosed: true
    };
  });
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

// Scenario A: uptrend ends → W%R overbought (near 100) on most TFs → BEARISH consensus expected
const upTrend = genCandles((i) => 100 + i * 0.4 + Math.sin(i * 0.15) * 3);
const tfMap: Record<string, CandleOHLCV[]> = {
  '1d': genCandles((i) => 100 + i * 0.4, 260, '1d'),
  '12h': genCandles((i) => 100 + i * 0.4, 260, '12h'),
  '4h': genCandles((i) => 100 + i * 0.4, 260, '4h'),
  '2h': genCandles((i) => 100 + i * 0.4, 260, '2h'),
  '1h': upTrend,
  '30m': genCandles((i) => 100 + i * 0.4 + Math.sin(i * 0.3) * 2, 260, '30m'),
  '15m': genCandles((i) => 100 + i * 0.4 + Math.sin(i * 0.5) * 1.5, 260, '15m'),
  '5m': genCandles((i) => 100 + i * 0.4 + Math.sin(i * 0.7) * 1, 260, '5m'),
  '3m': genCandles((i) => 100 + i * 0.4 + Math.sin(i * 0.9) * 1, 260, '3m'),
  '1m': genCandles((i) => 100 + i * 0.4 + Math.sin(i) * 0.5, 260, '1m')
};

const engine = new ReversalIntelligenceEngine();
const result = engine.analyze('BTCUSDT', tfMap, { symbol: 'BTCUSDT', cvd: 120000, orderbookBuyerPct: 45, whaleActivity: false } as any, 170);

console.log('Scenario A (steady uptrend → overbought):');
console.log(JSON.stringify({
  overallScore: result.overallScore,
  bull: result.bullishProbability,
  bear: result.bearishProbability,
  uncertain: result.uncertainPct,
  consensus: result.consensusDirection,
  horizon: result.expectedHorizon,
  timeframes: result.timeframes.map(t => `${t.timeframe}:${t.extreme}:${t.historicalReversalPct}%(${t.samples})`),
  layers: result.layers.map(l => `${l.layer}:${l.score}`)
}, null, 2));

assert(Array.isArray(result.timeframes) && result.timeframes.length >= 5, 'returns per-TF results for each TF with >=50 candles');
assert(typeof result.overallScore === 'number' && result.overallScore >= 0 && result.overallScore <= 100, 'overallScore within 0-100');
assert(result.bullishProbability + result.bearishProbability + result.uncertainPct <= 101 && result.bullishProbability + result.bearishProbability + result.uncertainPct >= 99, 'probabilities sum to ~100');
assert(result.consensusDirection === 'BULLISH' || result.consensusDirection === 'BEARISH' || result.consensusDirection === 'NEUTRAL', 'valid consensus direction');
assert(result.timeframes.every(t => t.rsi14 >= 0 && t.rsi14 <= 100 && t.wr200 >= 0 && t.wr200 <= 100), 'RSI/WR ranges valid');
assert(result.layers.length >= 5, 'layer confirmations present');
assert(typeof result.summary === 'string' && result.summary.length > 0, 'summary present');

// Scenario B: a flat/neutral set → low extreme count → NEUTRAL consensus tolerated
const flat = genCandles((i) => 100 + Math.sin(i * 0.2) * 2, 260, '1m');
const flatMap: Record<string, CandleOHLCV[]> = {};
for (const tf of ['1d', '12h', '4h', '2h', '1h', '30m', '15m', '5m', '3m', '1m']) {
  flatMap[tf] = genCandles((i) => 100 + Math.sin(i * 0.2) * 2, 260, tf);
}
const flatResult = engine.analyze('BTCUSDT', flatMap, { symbol: 'BTCUSDT', cvd: 0, orderbookBuyerPct: 50, whaleActivity: false } as any, 100);
console.log(`Scenario B (flat): consensus=${flatResult.consensusDirection} bull=${flatResult.bullishProbability} bear=${flatResult.bearishProbability}`);
assert(flatResult.consensusDirection === 'NEUTRAL' || flatResult.overallScore <= 70, 'flat market yields weak/neutral thesis');

// Scenario C: missing TFs should not crash
const partial = engine.analyze('SOLUSDT', { '1h': upTrend, '5m': upTrend }, undefined, 170);
assert(partial.timeframes.length === 2, 'works with partial TF data');
console.log(`[PASS] works with partial TF data: ${partial.timeframes.map(t => t.timeframe).join(',')}`);

console.log('\n--- ReversalIntelligenceEngine Test Suite Complete ---');
