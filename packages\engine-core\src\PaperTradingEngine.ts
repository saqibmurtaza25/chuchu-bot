import { DepthSnapshot, PaperOrderIntent, PaperPosition, PaperTrade } from '@athena/shared';
import { ScreenerConfig } from './ScreenerConfig';

/**
 * PaperTradingEngine
 * Deterministic virtual order matching engine operating against live L2 orderbook depth.
 * Implements dynamic slippage math, VIP 0 fee schedules, and real-time TP/SL management.
 */
export class PaperTradingEngine {
  private balance: number;
  private positions: Map<string, PaperPosition> = new Map();
  private trades: PaperTrade[] = [];
  private takerFeeRate = 0.0004; // 0.04% Taker fee
  private makerFeeRate = 0.0002; // 0.02% Maker fee

  constructor(initialBalance?: number) {
    this.balance = initialBalance !== undefined ? initialBalance : ScreenerConfig.autoTrade.initialBalance;
  }

  public getBalance(): number {
    return this.balance;
  }

  public reset(initialBalance: number = 100): void {
    this.balance = initialBalance;
    this.positions.clear();
    this.trades = [];
  }

  public getPositions(): PaperPosition[] {
    return Array.from(this.positions.values());
  }

  public getTradeHistory(): PaperTrade[] {
    return this.trades;
  }

  /**
   * Executes paper order intent against live L2 depth snapshot to compute exact depth fill price & slippage
   */
  public executeOrder(intent: PaperOrderIntent, depthSnapshot?: DepthSnapshot | null, lastPrice: number = 0): PaperTrade {
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
          if (remainingQty <= 0) break;
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

    const trade: PaperTrade = {
      tradeId: `TRADE_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      orderId: `ORDER_${Date.now()}`,
      symbol: intent.symbol,
      side: intent.side,
      fillPrice: parseFloat(fillPrice.toFixed(4)),
      quantity: intent.quantity,
      slippagePct: parseFloat(slippagePct.toFixed(3)),
      fee: parseFloat(fee.toFixed(4)),
      timestamp: Date.now(),
      context: intent.context
    };

    this.updatePosition(trade, intent);
    this.trades.push(trade);
    return trade;
  }

  /**
   * Position lifecycle management (Long/Short position opening/closing and Realized PnL update)
   */
  private updatePosition(trade: PaperTrade, intent: PaperOrderIntent): void {
    const existing = this.positions.get(trade.symbol);

    if (!existing) {
      // Open new position
      const newPos: PaperPosition = {
        symbol: trade.symbol,
        side: trade.side === 'BUY' ? 'LONG' : 'SHORT',
        quantity: trade.quantity,
        entryPrice: trade.fillPrice,
        markPrice: trade.fillPrice,
        unrealizedPnL: 0,
        realizedPnL: 0,
        margin: trade.fillPrice * trade.quantity,
        stopLoss: intent.stopLoss,
        takeProfit: intent.takeProfit,
        context: intent.context
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
    } else {
      // Closing / Reducing position
      const closeQty = Math.min(existing.quantity, trade.quantity);
      let pnl = 0;
      if (existing.side === 'LONG') {
        pnl = (trade.fillPrice - existing.entryPrice) * closeQty;
      } else {
        pnl = (existing.entryPrice - trade.fillPrice) * closeQty;
      }

      this.balance += pnl;
      existing.realizedPnL += pnl;
      existing.quantity -= closeQty;
      trade.pnl = pnl; // Record PnL on the closing trade

      // Determine Exit Reason if not explicitly provided
      if (!trade.exitReason) {
        trade.exitReason = 'MANUAL'; // Default to manual unless it was an auto close
      }

      if (existing.quantity <= 0) {
        this.positions.delete(trade.symbol);
      } else {
        existing.margin = existing.entryPrice * existing.quantity;
      }
    }
  }

  /**
   * Updates mark prices for open positions to calculate unrealized PnL and monitor auto TP/SL
   */
  public updateMarkPrice(symbol: string, markPrice: number): PaperTrade | null {
    const pos = this.positions.get(symbol);
    if (!pos) return null;

    pos.markPrice = markPrice;
    if (pos.side === 'LONG') {
      pos.unrealizedPnL = parseFloat(((markPrice - pos.entryPrice) * pos.quantity).toFixed(4));
    } else {
      pos.unrealizedPnL = parseFloat(((pos.entryPrice - markPrice) * pos.quantity).toFixed(4));
    }

    // Evaluate Auto Take Profit (TP) and Stop Loss (SL) triggers
    let triggerClose = false;
    let exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | undefined;

    if (pos.side === 'LONG') {
      if (pos.stopLoss && markPrice <= pos.stopLoss) {
        triggerClose = true;
        exitReason = 'STOP_LOSS';
      }
      if (pos.takeProfit && markPrice >= pos.takeProfit) {
        triggerClose = true;
        exitReason = 'TAKE_PROFIT';
      }
    } else {
      if (pos.stopLoss && markPrice >= pos.stopLoss) {
        triggerClose = true;
        exitReason = 'STOP_LOSS';
      }
      if (pos.takeProfit && markPrice <= pos.takeProfit) {
        triggerClose = true;
        exitReason = 'TAKE_PROFIT';
      }
    }

    if (triggerClose) {
      const closeIntent: PaperOrderIntent = {
        symbol,
        side: pos.side === 'LONG' ? 'SELL' : 'BUY',
        type: 'MARKET',
        quantity: pos.quantity
      };
      // Match closing trade using live price
      const closingTrade = this.executeOrder(closeIntent, null, markPrice);
      closingTrade.exitReason = exitReason;
      return closingTrade;
    }

    return null;
  }
}
