"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaperTradingEngine = void 0;
/**
 * PaperTradingEngine
 * Deterministic virtual order matching engine operating against live L2 orderbook depth.
 * Implements dynamic slippage math and Binance VIP 0 Maker/Taker fee schedules.
 */
class PaperTradingEngine {
    balance = 100_000; // Starting $100k USDT paper balance
    positions = new Map();
    trades = [];
    takerFeeRate = 0.0004; // 0.04% Taker fee
    makerFeeRate = 0.0002; // 0.02% Maker fee
    getBalance() {
        return this.balance;
    }
    getPositions() {
        return Array.from(this.positions.values());
    }
    getTradeHistory() {
        return this.trades;
    }
    /**
     * Executes paper order intent against live L2 depth snapshot to compute exact depth fill price & slippage
     */
    executeOrder(intent, depthSnapshot, lastPrice = 0) {
        let fillPrice = lastPrice;
        let slippagePct = 0;
        // Evaluate depth slippage if depth snapshot is available
        if (depthSnapshot && intent.type === 'MARKET') {
            const levels = intent.side === 'BUY' ? depthSnapshot.asks : depthSnapshot.bids;
            if (levels.length > 0) {
                let remainingQty = intent.quantity;
                let totalCost = 0;
                for (const level of levels) {
                    const filledQty = Math.min(remainingQty, level.quantity);
                    totalCost += filledQty * level.price;
                    remainingQty -= filledQty;
                    if (remainingQty <= 0)
                        break;
                }
                if (remainingQty < intent.quantity) {
                    const filledAmount = intent.quantity - remainingQty;
                    fillPrice = totalCost / filledAmount;
                    const topOfBookPrice = levels[0].price;
                    slippagePct = Math.abs(fillPrice - topOfBookPrice) / topOfBookPrice * 100;
                }
            }
        }
        const feeRate = intent.type === 'MARKET' ? this.takerFeeRate : this.makerFeeRate;
        const notional = fillPrice * intent.quantity;
        const fee = notional * feeRate;
        // Deduct fee from paper balance
        this.balance -= fee;
        const trade = {
            tradeId: `TRADE_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            orderId: `ORDER_${Date.now()}`,
            symbol: intent.symbol,
            side: intent.side,
            fillPrice: parseFloat(fillPrice.toFixed(4)),
            quantity: intent.quantity,
            slippagePct: parseFloat(slippagePct.toFixed(3)),
            fee: parseFloat(fee.toFixed(4)),
            timestamp: Date.now()
        };
        this.updatePosition(trade);
        this.trades.push(trade);
        return trade;
    }
    /**
     * Position lifecycle management (Long/Short position opening/closing and Realized PnL update)
     */
    updatePosition(trade) {
        const existing = this.positions.get(trade.symbol);
        if (!existing) {
            // Open new position
            const newPos = {
                symbol: trade.symbol,
                side: trade.side === 'BUY' ? 'LONG' : 'SHORT',
                quantity: trade.quantity,
                entryPrice: trade.fillPrice,
                markPrice: trade.fillPrice,
                unrealizedPnL: 0,
                realizedPnL: 0,
                margin: trade.fillPrice * trade.quantity
            };
            this.positions.set(trade.symbol, newPos);
            return;
        }
        const isSameSide = (existing.side === 'LONG' && trade.side === 'BUY') || (existing.side === 'SHORT' && trade.side === 'SELL');
        if (isSameSide) {
            // Adding to position (Weighted average entry price)
            const totalQty = existing.quantity + trade.quantity;
            const weightedEntry = (existing.entryPrice * existing.quantity + trade.fillPrice * trade.quantity) / totalQty;
            existing.quantity = totalQty;
            existing.entryPrice = parseFloat(weightedEntry.toFixed(4));
            existing.margin = existing.entryPrice * totalQty;
        }
        else {
            // Closing / Reducing position
            const closeQty = Math.min(existing.quantity, trade.quantity);
            let pnl = 0;
            if (existing.side === 'LONG') {
                pnl = (trade.fillPrice - existing.entryPrice) * closeQty;
            }
            else {
                pnl = (existing.entryPrice - trade.fillPrice) * closeQty;
            }
            this.balance += pnl;
            existing.realizedPnL += pnl;
            existing.quantity -= closeQty;
            if (existing.quantity <= 0) {
                this.positions.delete(trade.symbol);
            }
            else {
                existing.margin = existing.entryPrice * existing.quantity;
            }
        }
    }
    /**
     * Updates mark prices for open positions to calculate unrealized PnL
     */
    updateMarkPrice(symbol, markPrice) {
        const pos = this.positions.get(symbol);
        if (!pos)
            return;
        pos.markPrice = markPrice;
        if (pos.side === 'LONG') {
            pos.unrealizedPnL = parseFloat(((markPrice - pos.entryPrice) * pos.quantity).toFixed(4));
        }
        else {
            pos.unrealizedPnL = parseFloat(((pos.entryPrice - markPrice) * pos.quantity).toFixed(4));
        }
    }
}
exports.PaperTradingEngine = PaperTradingEngine;
//# sourceMappingURL=PaperTradingEngine.js.map