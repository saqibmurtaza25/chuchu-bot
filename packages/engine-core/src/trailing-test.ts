import { PaperTradingEngine } from './PaperTradingEngine';
import { PaperOrderIntent } from '@chuchu/shared';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

const engine = new PaperTradingEngine(1000);

// Open a LONG at $100
const openIntent: PaperOrderIntent = {
  symbol: 'TESTUSDT',
  side: 'BUY',
  type: 'MARKET',
  quantity: 1,
  leverage: 5,
  stopLoss: 95,
  takeProfit: 110,
  context: { reasonOfEntry: 'TEST', marketRegime: 'TRENDING_BULL' }
};
engine.executeOrder(openIntent, null, 100);

let pos = engine.getPositions().find(p => p.symbol === 'TESTUSDT')!;
assert(pos.side === 'LONG' && pos.entryPrice === 100, 'LONG position opened at $100');

// Enable per-position trailing: 1% distance, 0% activation
engine.enableTrailing('TESTUSDT', 1, 0);
pos = engine.getPositions().find(p => p.symbol === 'TESTUSDT')!;
assert(pos.trailingStopActive === true, 'trailing enabled');
assert(pos.trailingStopPct === 1, 'distance stored');

// Price rises to $102 → trail should arm immediately (activation 0) at $102*0.99 = $100.98
engine.updateMarkPrice('TESTUSDT', 102);
pos = engine.getPositions().find(p => p.symbol === 'TESTUSDT')!;
assert(pos.trailActivated === true, 'trail armed at 0% activation');
assert(pos.trailingStop !== undefined && Math.abs(pos.trailingStop - 100.98) < 0.01, `trail ratcheted to $100.98 (got ${pos.trailingStop})`);
assert(Math.abs(pos.peakPrice! - 102) < 0.001, 'peak tracked at $102');

// Price rises further to $105 → trail ratchets up to $103.95
engine.updateMarkPrice('TESTUSDT', 105);
pos = engine.getPositions().find(p => p.symbol === 'TESTUSDT')!;
assert(Math.abs(pos.trailingStop! - 103.95) < 0.01, `trail ratcheted up to $103.95 (got ${pos.trailingStop})`);

// Price pulls back to $103.5 (< trail) → should exit via TRAILING_STOP
const closed = engine.updateMarkPrice('TESTUSDT', 103.5);
assert(closed !== null && closed.exitReason === 'TRAILING_STOP', 'trailing stop triggered exit');
assert(engine.getPositions().find(p => p.symbol === 'TESTUSDT') === undefined, 'position closed');

// --- Activation-gated trail ---
engine.executeOrder(openIntent, null, 100);
engine.enableTrailing('TESTUSDT', 1, 2); // activate after 2% favorable move
engine.updateMarkPrice('TESTUSDT', 101); // +1% < 2% → should NOT arm
pos = engine.getPositions().find(p => p.symbol === 'TESTUSDT')!;
assert(pos.trailActivated === false && pos.trailingStop === undefined, 'trail not armed before activation threshold');
engine.updateMarkPrice('TESTUSDT', 102.5); // +2.5% ≥ 2% → arms
pos = engine.getPositions().find(p => p.symbol === 'TESTUSDT')!;
assert(pos.trailActivated === true, 'trail armed after activation threshold');
const trailAfterActivation = pos.trailingStop!;
engine.updateMarkPrice('TESTUSDT', 102.5); // same price, trail should not move
pos = engine.getPositions().find(p => p.symbol === 'TESTUSDT')!;
assert(pos.trailingStop === trailAfterActivation, 'trail does not loosen on pullback');

// Disable trailing → falls back to plain SL behavior
engine.disableTrailing('TESTUSDT');
pos = engine.getPositions().find(p => p.symbol === 'TESTUSDT')!;
assert(pos.trailingStopActive === false && pos.trailingStop === undefined, 'trailing disabled, trail cleared');

// --- Auto-configuration of trailing stop from R:R on new position ---
// Entry $100, SL $99 (1% risk), TP $101.5 (1.5% reward) → R:R 1.5.
// Standard scheme: arm after 1R, trail 0.5R behind peak, widened slightly for higher R:R.
const rrIntent: PaperOrderIntent = {
  symbol: 'RRUSDT',
  side: 'BUY',
  type: 'MARKET',
  quantity: 1,
  leverage: 5,
  stopLoss: 99,
  takeProfit: 101.5,
  context: { reasonOfEntry: 'TEST', marketRegime: 'TRENDING_BULL' }
};
engine.executeOrder(rrIntent, null, 100);
pos = engine.getPositions().find(p => p.symbol === 'RRUSDT')!;
assert(pos.trailingStopActive === true, 'auto-trailing enabled on open with SL');
assert(pos.trailingStopPct === 0.56, `auto-trail distance 0.5R widened for R:R 1.5 (got ${pos.trailingStopPct})`);
assert(pos.trailActivationPct === 1, `auto-trail arms after 1R (got ${pos.trailActivationPct})`);
assert(pos.peakPrice === 100 && pos.trailingStop === undefined, 'auto-trail starts disarmed at entry');

// Wider R:R setup gets a wider trail so winners have room to run.
const wideIntent: PaperOrderIntent = {
  symbol: 'WIDEUSDT',
  side: 'BUY',
  type: 'MARKET',
  quantity: 1,
  leverage: 5,
  stopLoss: 99,
  takeProfit: 104, // R:R 4
  context: { reasonOfEntry: 'TEST', marketRegime: 'TRENDING_BULL' }
};
engine.executeOrder(wideIntent, null, 100);
pos = engine.getPositions().find(p => p.symbol === 'WIDEUSDT')!;
assert(pos.trailingStopActive === true, 'auto-trailing on wide R:R setup');
assert(pos.trailingStopPct! > 0.56, 'wider R:R yields wider trail distance');

// No stop-loss given → the SL-by-default guard still inserts one (0.5%), so
// the R:R auto-trail is configured on every trade.
const noSlIntent: PaperOrderIntent = {
  symbol: 'NOSLUSDT',
  side: 'BUY',
  type: 'MARKET',
  quantity: 1,
  leverage: 5,
  takeProfit: 105,
  context: { reasonOfEntry: 'TEST', marketRegime: 'TRENDING_BULL' }
};
engine.executeOrder(noSlIntent, null, 100);
pos = engine.getPositions().find(p => p.symbol === 'NOSLUSDT')!;
assert(pos.stopLoss !== undefined, 'default SL inserted when signal omitted it');
assert(pos.trailingStopActive === true, 'auto-trail configured off the guaranteed SL');
assert(pos.trailingStopPct === 0.81, `auto-trail 0.5R widened for R:R 10 (got ${pos.trailingStopPct})`);

// --- Stop-loss is guaranteed on EVERY trade by default ---
// Missing SL -> default 0.5% stop mirrored by side.
engine.executeOrder(
  { symbol: 'GUARDUSDT', side: 'BUY', type: 'MARKET', quantity: 1, leverage: 5, takeProfit: 101, context: { reasonOfEntry: 'TEST', marketRegime: 'TRENDING_BULL' } },
  null, 100
);
pos = engine.getPositions().find(p => p.symbol === 'GUARDUSDT')!;
assert(pos.stopLoss !== undefined && Math.abs(pos.stopLoss - 99.5) < 0.01, `default SL applied when missing (got ${pos.stopLoss})`);

// Razor-thin SL (0.05%) is widened to the 0.3% minimum so noise can't stop it.
engine.executeOrder(
  { symbol: 'THINUSDT', side: 'BUY', type: 'MARKET', quantity: 1, leverage: 5, stopLoss: 99.95, takeProfit: 101, context: { reasonOfEntry: 'TEST', marketRegime: 'TRENDING_BULL' } },
  null, 100
);
pos = engine.getPositions().find(p => p.symbol === 'THINUSDT')!;
assert(pos.stopLoss !== undefined && Math.abs(pos.stopLoss - 99.7) < 0.01, `razor-thin SL widened to 0.3% minimum (got ${pos.stopLoss})`);

// Wide SL untouched.
engine.executeOrder(
  { symbol: 'SLWIDEUSDT', side: 'BUY', type: 'MARKET', quantity: 1, leverage: 5, stopLoss: 98, takeProfit: 104, context: { reasonOfEntry: 'TEST', marketRegime: 'TRENDING_BULL' } },
  null, 100
);
pos = engine.getPositions().find(p => p.symbol === 'SLWIDEUSDT')!;
assert(Math.abs(pos.stopLoss! - 98) < 0.01, 'legitimate wide SL left untouched');

console.log('\n--- PaperTradingEngine Trailing Stop Test Suite Complete ---');
