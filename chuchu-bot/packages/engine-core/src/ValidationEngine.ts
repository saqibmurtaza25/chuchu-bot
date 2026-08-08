import { MarketTick, DepthSnapshot, CandleOHLCV } from '@chuchu/shared';

/**
 * ValidationEngine
 * Responsible for input sanitization, price bound guards, price jump anomaly detection,
 * and stream latency filtering.
 */
export class ValidationEngine {
  private lastPrices: Map<string, number> = new Map();
  private maxPriceJumpThreshold = 0.15; // 15% single tick jump limit
  private minPrice = 0.00000001;
  private maxPrice = 1_000_000;
  private maxAllowedLatencyMs = 5000;

  /**
   * Sanitizes and validates incoming market ticks.
   * Rejects ticks with invalid prices, extreme price jumps, or excessive network latency.
   */
  public validateTick(tick: MarketTick): { valid: boolean; reason?: string } {
    if (!tick || !tick.symbol || typeof tick.price !== 'number' || typeof tick.quantity !== 'number') {
      return { valid: false, reason: 'Malformed tick payload schema' };
    }

    if (tick.price < this.minPrice || tick.price > this.maxPrice) {
      return { valid: false, reason: `Price ${tick.price} out of sanity bounds` };
    }

    if (tick.quantity <= 0) {
      return { valid: false, reason: `Quantity ${tick.quantity} must be positive` };
    }

    const now = Date.now();
    if (tick.timestamp && Math.abs(now - tick.timestamp) > this.maxAllowedLatencyMs) {
      return { valid: false, reason: `Stale tick timestamp latency exceed ${this.maxAllowedLatencyMs}ms` };
    }

    // Price jump anomaly detection
    const previousPrice = this.lastPrices.get(tick.symbol);
    if (previousPrice !== undefined) {
      const priceChangePct = Math.abs(tick.price - previousPrice) / previousPrice;
      if (priceChangePct > this.maxPriceJumpThreshold) {
        return { valid: false, reason: `Abnormal price jump detected: ${(priceChangePct * 100).toFixed(2)}%` };
      }
    }

    this.lastPrices.set(tick.symbol, tick.price);
    return { valid: true };
  }

  /**
   * Sanitizes depth snapshot.
   */
  public validateDepth(depth: DepthSnapshot): { valid: boolean; reason?: string } {
    if (!depth || !depth.symbol || !Array.isArray(depth.bids) || !Array.isArray(depth.asks)) {
      return { valid: false, reason: 'Malformed depth snapshot payload schema' };
    }

    if (depth.bids.length === 0 || depth.asks.length === 0) {
      return { valid: false, reason: 'Empty bid or ask depth levels' };
    }

    // Best bid must be lower than best ask (no crossed orderbook)
    const bestBid = depth.bids[0].price;
    const bestAsk = depth.asks[0].price;
    if (bestBid >= bestAsk) {
      return { valid: false, reason: `Crossed orderbook detected: Best Bid ${bestBid} >= Best Ask ${bestAsk}` };
    }

    return { valid: true };
  }

  /**
   * Sanitizes OHLCV candle.
   */
  public validateCandle(candle: CandleOHLCV): { valid: boolean; reason?: string } {
    if (!candle || !candle.symbol || candle.high < candle.low) {
      return { valid: false, reason: 'Invalid candle OHLC properties' };
    }
    if (candle.open < candle.low || candle.open > candle.high) {
      return { valid: false, reason: 'Candle open price outside High/Low range' };
    }
    if (candle.close < candle.low || candle.close > candle.high) {
      return { valid: false, reason: 'Candle close price outside High/Low range' };
    }
    return { valid: true };
  }
}
