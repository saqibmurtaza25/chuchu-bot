"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderbookEngine = void 0;
/**
 * OrderbookEngine
 * Processes L2 Depth snapshots to analyze orderbook microstructure:
 * Imbalance (OBI), Buyer %, USD CVD, Icebergs, Spoofing Probability %, and Sweeps.
 */
class OrderbookEngine {
    depthHistory = new Map();
    cvdMap = new Map();
    maxHistoryLength = 20;
    calculateImbalance(bids, asks) {
        let totalBid = 0;
        let totalAsk = 0;
        for (const b of bids)
            totalBid += b.quantity;
        for (const a of asks)
            totalAsk += a.quantity;
        const denominator = totalBid + totalAsk;
        if (denominator === 0)
            return { obi: 0, totalBid: 0, totalAsk: 0, buyerPct: 50 };
        const obi = (totalBid - totalAsk) / denominator;
        const buyerPct = parseFloat(((totalBid / denominator) * 100).toFixed(1));
        return { obi, totalBid, totalAsk, buyerPct };
    }
    calculateWeightedImbalance(bids, asks, lambda = 50) {
        if (bids.length === 0 || asks.length === 0)
            return 0;
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
    detectSpoofing(symbol, currentDepth) {
        const history = this.depthHistory.get(symbol);
        if (!history || history.length < 3)
            return 0;
        const prevDepth = history[history.length - 1];
        const prevBids = prevDepth.bids;
        const currBids = currentDepth.bids;
        let spoofScore = 0;
        if (prevBids.length > 0 && currBids.length > 0) {
            const prevTopVol = prevBids[0].quantity;
            const currTopVol = currBids[0].quantity;
            const volDelta = prevTopVol - currTopVol;
            if (volDelta > 5.0 && (currentDepth.timestamp - prevDepth.timestamp) < 500) {
                spoofScore = Math.min(100, (volDelta / prevTopVol) * 100);
            }
        }
        return parseFloat(spoofScore.toFixed(1));
    }
    updateCVD(tick) {
        let currentCvd = this.cvdMap.get(tick.symbol) || 0;
        // Buyer is taker => +USD Notional, Seller is taker => -USD Notional
        const notional = tick.price * tick.quantity;
        const delta = tick.isBuyerMaker ? -notional : +notional;
        currentCvd += delta;
        this.cvdMap.set(tick.symbol, currentCvd);
        return currentCvd;
    }
    evaluate(depth, recentTicks = []) {
        const symbol = depth.symbol;
        let history = this.depthHistory.get(symbol);
        if (!history) {
            history = [];
            this.depthHistory.set(symbol, history);
        }
        history.push(depth);
        if (history.length > this.maxHistoryLength)
            history.shift();
        const { obi, totalBid, totalAsk, buyerPct } = this.calculateImbalance(depth.bids, depth.asks);
        const weightedImbalance = this.calculateWeightedImbalance(depth.bids, depth.asks);
        const spoofingProbabilityPct = this.detectSpoofing(symbol, depth);
        let cvd = this.cvdMap.get(symbol) || 0;
        if (recentTicks.length > 0) {
            const lastTick = recentTicks[recentTicks.length - 1];
            cvd = this.updateCVD(lastTick);
        }
        let tickVelocity = 0;
        if (recentTicks.length >= 2) {
            const timeSpanMs = Math.max(100, recentTicks[recentTicks.length - 1].timestamp - recentTicks[0].timestamp);
            tickVelocity = parseFloat(((recentTicks.length / timeSpanMs) * 1000).toFixed(1));
        }
        let whaleActivity = false;
        if (recentTicks.length > 0) {
            for (const t of recentTicks.slice(-5)) {
                if (t.price * t.quantity >= 50_000) {
                    whaleActivity = true;
                    break;
                }
            }
        }
        let icebergDetected = false;
        if (recentTicks.length > 0 && depth.bids.length > 0) {
            const topBidVol = depth.bids[0].quantity;
            const executedVol = recentTicks.reduce((acc, t) => acc + t.quantity, 0);
            if (topBidVol > 0 && (executedVol / topBidVol) >= 3.0) {
                icebergDetected = true;
            }
        }
        let sweepDetected = false;
        if (recentTicks.length >= 5) {
            const totalVol = recentTicks.reduce((acc, t) => acc + t.quantity, 0);
            if (totalVol > 20.0) {
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
            tickVelocity,
            whaleActivity,
            icebergDetected,
            spoofingProbabilityPct,
            sweepDetected,
            timestamp: Date.now()
        };
    }
}
exports.OrderbookEngine = OrderbookEngine;
//# sourceMappingURL=OrderbookEngine.js.map