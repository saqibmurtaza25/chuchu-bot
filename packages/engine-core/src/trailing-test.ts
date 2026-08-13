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

console.log('\n--- PaperTradingEngine Trailing Stop Test Suite Complete ---');
