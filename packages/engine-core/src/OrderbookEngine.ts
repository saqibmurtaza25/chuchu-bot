import { DepthSnapshot, MicrostructureState, MarketTick } from '@chuchu/shared';

/**
 * OrderbookEngine
 * Processes L2 Depth snapshots to analyze orderbook microstructure:
 * Imbalance (OBI), Buyer %, USD CVD, Icebergs, Spoofing Probability %, and Sweeps.
 */
export class OrderbookEngine {
  private depthHistory: Map<string, DepthSnapshot[]> = new Map();
  private cvdMap: Map<string, number> = new Map();
  private cvdTrades: Map<string, { price: number; qty: number; ts: number; buyerMaker: boolean }[]> = new Map();
  private static readonly CVD_WINDOW_MS = 60_000; // 60s rolling CVD delta
  private maxHistoryLength = 20;

  public calculateImbalance(bids: { price: number; quantity: number }[], asks: { price: number; quantity: number }[]): { obi: number; totalBid: number; totalAsk: number; buyerPct: number } {
    let totalBid = 0;
    let totalAsk = 0;

    for (const b of bids) totalBid += b.quantity;
    for (const a of asks) totalAsk += a.quantity;

    const denominator = totalBid + totalAsk;
    if (denominator === 0) return { obi: 0, totalBid: 0, totalAsk: 0, buyerPct: 50 };

    const obi = (totalBid - totalAsk) / denominator;
    const buyerPct = parseFloat(((totalBid / denominator) * 100).toFixed(1));
    return { obi, totalBid, totalAsk, buyerPct };
  }

  public calculateWeightedImbalance(
    bids: { price: number; quantity: number }[],
    asks: { price: number; quantity: number }[],
    lambda: number = 50
  ): number {
    if (bids.length === 0 || asks.length === 0) return 0;

    const midPrice = (bids[0].price + asks[0].price) / 2;
    let weightedBid = 0;
    let weightedAsk = 0;

    for (const b of bids) {
      const distance = Math.abs(b.price - midPrice) / midPrice;
      const weight = Math.exp(-lambda * distance);
      weightedBid += b.quantity * weight;
    }

    for (const a of asks) {
      const distance = Math.abs(a.price - midPrice) / midPrice;
      const weight = Math.exp(-lambda * distance);
      weightedAsk += a.quantity * weight;
    }

    const denominator = weightedBid + weightedAsk;
    return denominator === 0 ? 0 : (weightedBid - weightedAsk) / denominator;
  }

  /**
   * Detects rapid orderbook cancellations (spoofing probability score).
   * Analyzes depth cancellations on top 5 bid/ask levels across snapshots.
   */
  public detectSpoofing(symbol: string, currentDepth: DepthSnapshot): number {
    const history = this.depthHistory.get(symbol);
    if (!history || history.length < 2) {
      // Baseline spoofing probability derived from orderbook imbalance skew
      const bidVol = currentDepth.bids.slice(0, 5).reduce((acc, b) => acc + b.quantity * b.price, 0);
      const askVol = currentDepth.asks.slice(0, 5).reduce((acc, a) => acc + a.quantity * a.price, 0);
      const ratio = Math.abs(bidVol - askVol) / Math.max(1, bidVol + askVol);
      return parseFloat((ratio * 35).toFixed(1));
    }

    const prevDepth = history[history.length - 2];
    let spoofScore = 0;

    // Check bid side cancellation
    if (prevDepth.bids.length > 0 && currentDepth.bids.length > 0) {
      const prevBidSum = prevDepth.bids.slice(0, 3).reduce((a, b) => a + b.quantity, 0);
      const currBidSum = currentDepth.bids.slice(0, 3).reduce((a, b) => a + b.quantity, 0);
      if (prevBidSum > currBidSum) {
        const cancelPct = ((prevBidSum - currBidSum) / prevBidSum) * 100;
        if (cancelPct > 15) spoofScore += cancelPct * 0.4;
      }
    }

    // Check ask side cancellation
    if (prevDepth.asks.length > 0 && currentDepth.asks.length > 0) {
      const prevAskSum = prevDepth.asks.slice(0, 3).reduce((a, b) => a + b.quantity, 0);
      const currAskSum = currentDepth.asks.slice(0, 3).reduce((a, b) => a + b.quantity, 0);
      if (prevAskSum > currAskSum) {
        const cancelPct = ((prevAskSum - currAskSum) / prevAskSum) * 100;
        if (cancelPct > 15) spoofScore += cancelPct * 0.4;
      }
    }

    return parseFloat(Math.min(100, Math.max(0, spoofScore)).toFixed(1));
  }

  /**
   * Rolling 60s Cumulative Volume Delta (USD notional).
   * Called ONCE per aggTrade tick — never double-counted.
   */
  public updateCVD(tick: MarketTick): number {
    let trades = this.cvdTrades.get(tick.symbol);
    if (!trades) {
      trades = [];
      this.cvdTrades.set(tick.symbol, trades);
    }
    trades.push({ price: tick.price, qty: tick.quantity, ts: tick.timestamp || Date.now(), buyerMaker: tick.isBuyerMaker });

    // Prune trades older than the rolling window
    const cutoff = Date.now() - OrderbookEngine.CVD_WINDOW_MS;
    while (trades.length > 0 && trades[0].ts < cutoff) trades.shift();

    let delta = 0;
    for (const t of trades) {
      const notional = t.price * t.qty;
      delta += t.buyerMaker ? -notional : +notional;
    }
    // Signed 60s Cumulative Volume Delta (aggressive buys +, aggressive sells -)
    this.cvdMap.set(tick.symbol, delta);
    return delta;
  }

  public getCVD(symbol: string): number {
    // Re-prune so stale trades age out even between ticks
    const trades = this.cvdTrades.get(symbol);
    if (trades && trades.length > 0) {
      const cutoff = Date.now() - OrderbookEngine.CVD_WINDOW_MS;
      while (trades.length > 0 && trades[0].ts < cutoff) trades.shift();
    }
    return this.cvdMap.get(symbol) || 0;
  }

  /**
   * CVD delta over the last `windowMs` — used for the superfast per-second rate.
   */
  public getCVDWindow(symbol: string, windowMs: number): { delta: number; elapsedMs: number } {
    const trades = this.cvdTrades.get(symbol);
    if (!trades || trades.length === 0) return { delta: 0, elapsedMs: 0 };
    const now = Date.now();
    const cutoff = now - windowMs;
    let delta = 0;
    let elapsedMs = now - trades[0].ts;
    for (const t of trades) {
      if (t.ts < cutoff) continue;
      const notional = t.price * t.qty;
      delta += t.buyerMaker ? -notional : +notional;
    }
    return { delta, elapsedMs };
  }

  public evaluate(depth: DepthSnapshot, recentTicks: MarketTick[] = []): MicrostructureState {
    const symbol = depth.symbol;

    let history = this.depthHistory.get(symbol);
    if (!history) {
      history = [];
      this.depthHistory.set(symbol, history);
    }
    history.push(depth);
    if (history.length > this.maxHistoryLength) history.shift();

    const { obi, totalBid, totalAsk, buyerPct } = this.calculateImbalance(depth.bids, depth.asks);
    const weightedImbalance = this.calculateWeightedImbalance(depth.bids, depth.asks);
    const spoofingProbabilityPct = this.detectSpoofing(symbol, depth);

    const cvd = this.getCVD(symbol);

    // Per-second CVD velocity (5s window) — superfast live reading
    const { delta: cvdDelta5s, elapsedMs } = this.getCVDWindow(symbol, 5000);
    const cvdPerSec = elapsedMs > 0 ? parseFloat((cvdDelta5s / (elapsedMs / 1000)).toFixed(1)) : 0;

    let tickVelocity = 0;
    if (recentTicks.length >= 2) {
      const timeSpanMs = Math.max(100, recentTicks[recentTicks.length - 1].timestamp - recentTicks[0].timestamp);
      tickVelocity = parseFloat(((recentTicks.length / timeSpanMs) * 1000).toFixed(1));
    }

    // Whale Activity: Triggered by large single order in book (> $50k notional), executed trade >= $25k, or high orderbook depth
    let whaleActivity = false;
    const topBidNotional = depth.bids.length > 0 ? depth.bids[0].price * depth.bids[0].quantity : 0;
    const topAskNotional = depth.asks.length > 0 ? depth.asks[0].price * depth.asks[0].quantity : 0;
    const totalDepthNotional = (totalBid + totalAsk) * (depth.bids[0]?.price || 1);

    if (topBidNotional >= 50_000 || topAskNotional >= 50_000 || totalDepthNotional >= 250_000) {
      whaleActivity = true;
    } else if (recentTicks.length > 0) {
      for (const t of recentTicks.slice(-5)) {
        if (t.price * t.quantity >= 25_000) {
          whaleActivity = true;
          break;
        }
      }
    } else if (Math.abs(obi) > 0.25) {
      whaleActivity = true;
    }

    let icebergDetected = false;
    if (recentTicks.length > 0 && depth.bids.length > 0) {
      const topBidVol = depth.bids[0].quantity;
      const executedVol = recentTicks.reduce((acc, t) => acc + t.quantity, 0);
      if (topBidVol > 0 && (executedVol / topBidVol) >= 2.5) {
        icebergDetected = true;
      }
    }

    // Liquidity Sweeps: Triggered when orderbook imbalance skew (OBI > 0.25) or high tick velocity
    let sweepDetected = false;
    if (Math.abs(obi) > 0.25) {
      sweepDetected = true;
    } else if (recentTicks.length >= 3) {
      const totalVol = recentTicks.reduce((acc, t) => acc + t.quantity, 0);
      if (totalVol > 15.0) {
        sweepDetected = true;
      }
    }

    return {
      symbol,
      orderbookImbalance: parseFloat(Math.max(-1, Math.min(1, obi)).toFixed(3)),
      weightedImbalance: parseFloat(Math.max(-1, Math.min(1, weightedImbalance)).toFixed(3)),
      orderbookBuyerPct: buyerPct,
      totalBidDepth: parseFloat(totalBid.toFixed(2)),
      totalAskDepth: parseFloat(totalAsk.toFixed(2)),
      cvd: parseFloat(cvd.toFixed(2)),
      cvdDelta5s: parseFloat(cvdDelta5s.toFixed(2)),
      cvdPerSec,
      tickVelocity,
      whaleActivity,
      icebergDetected,
      spoofingProbabilityPct,
      sweepDetected,
      timestamp: Date.now()
    };
  }
}
