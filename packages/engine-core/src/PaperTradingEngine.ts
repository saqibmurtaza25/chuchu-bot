import { DepthSnapshot, PaperOrderIntent, PaperPosition, PaperStats, PaperTrade } from '@chuchu/shared';
import { ScreenerConfig } from './ScreenerConfig';

/**
 * PaperTradingEngine
 * Realistic virtual matching engine operating against live L2 orderbook depth.
 * Matches real Binance USDT-M futures as closely as possible:
 *   - Taker 0.05% / Maker 0.02% fee schedule (VIP 0)
 *   - Dynamic slippage from the actual L2 orderbook
 *   - Pro-rated funding rate accrual (8h funding intervals, real funding rate)
 *   - Liquidation math based on real leverage
 *   - Round-trip stats (net of fees + funding) for 500-trade win-rate evaluation
 */
export class PaperTradingEngine {
  private balance: number;
  private positions: Map<string, PaperPosition> = new Map();
  private trades: PaperTrade[] = [];
  private takerFeeRate = 0.0005; // 0.05% real Binance taker (VIP 0)
  private makerFeeRate = 0.0002; // 0.02% real Binance maker (VIP 0)
  private static readonly MAINTENANCE_MARGIN_PCT = 0.5; // ~0.5% isolated maintenance buffer
  private static readonly FUNDING_INTERVAL_HOURS = 8;
  private static readonly FUNDING_ACCRUAL_MIN_MS = 60 * 60 * 1000; // apply at most hourly
  private trailingStopEnabled = true;
  private trailingActivationPct = 40; // % of distance entry→TP that must be gained before trail arms
  private trailingDistancePct = 0.6; // trail distance as % of entry price

  constructor(initialBalance?: number) {
    this.balance = initialBalance !== undefined ? initialBalance : ScreenerConfig.autoTrade.initialBalance;
  }

  public setTrailingConfig(enabled: boolean, activationPct: number, distancePct: number): void {
    this.trailingStopEnabled = enabled;
    if (activationPct > 0 && activationPct < 100) this.trailingActivationPct = activationPct;
    if (distancePct > 0) this.trailingDistancePct = distancePct;
  }

  /**
   * Enables a per-position trailing stop via the open-trade manager.
   * Trails purely off the favorable peak price — no TP required.
   */
  public enableTrailing(symbol: string, distancePct: number, activationPct: number = 0): PaperPosition | null {
    const pos = this.positions.get(symbol);
    if (!pos) return null;
    const pct = parseFloat(String(distancePct));
    if (!isFinite(pct) || pct <= 0 || pct > 5) return null;
    pos.trailingStopPct = pct;
    pos.trailActivationPct = isFinite(activationPct) && activationPct > 0 ? Math.min(activationPct, 50) : 0;
    pos.trailingStopActive = true;
    pos.trailActivated = false;
    pos.trailingStop = undefined;
    pos.peakPrice = pos.markPrice || pos.entryPrice;
    pos.trailUpdatedAt = Date.now();
    return pos;
  }

  /** Adjusts the trailing distance on a live position and re-ratchets immediately. */
  public updateTrailing(symbol: string, distancePct: number): PaperPosition | null {
    const pos = this.positions.get(symbol);
    if (!pos || !pos.trailingStopActive) return null;
    const pct = parseFloat(String(distancePct));
    if (!isFinite(pct) || pct <= 0 || pct > 5) return null;
    pos.trailingStopPct = pct;
    if (pos.trailActivated) {
      const trailStop = pos.side === 'LONG'
        ? (pos.peakPrice || pos.markPrice) * (1 - pct / 100)
        : (pos.peakPrice || pos.markPrice) * (1 + pct / 100);
      pos.trailingStop = parseFloat(trailStop.toFixed(4));
      pos.trailUpdatedAt = Date.now();
    }
    return pos;
  }

  /** Turns off the trailing stop; the position falls back to its plain stop-loss. */
  public disableTrailing(symbol: string): PaperPosition | null {
    const pos = this.positions.get(symbol);
    if (!pos) return null;
    pos.trailingStopActive = false;
    pos.trailingStop = undefined;
    pos.trailActivated = false;
    pos.trailUpdatedAt = Date.now();
    return pos;
  }

  /**
   * Auto-configures the trailing stop on a freshly opened position using the
   * standard R:R (risk:reward) scheme:
   *   R    = |entry − SL| as % of entry (the initial risk)
   *   arm  = after +1R favorable move
   *   trail = 0.5R behind the peak, widened slightly for higher R:R setups so
   *           winners get room to run.
   * Applies on every new position that carries a stop-loss (needs R to exist)
   * while trailing is globally enabled. The user can still tweak or disable it
   * per-position from the open-trade manager.
   */
  private autoConfigureTrailing(pos: PaperPosition): void {
    if (!this.trailingStopEnabled) return;
    const entry = pos.entryPrice;
    const sl = pos.stopLoss;
    if (entry <= 0 || sl === undefined || sl === entry) return;

    const slPct = (Math.abs(sl - entry) / entry) * 100;
    if (slPct < 0.05) return;

    const tp = pos.takeProfit;
    let trailDistance: number;
    let activation: number;

    if (tp !== undefined && tp !== entry) {
      const tpPct = (Math.abs(tp - entry) / entry) * 100;
      const rr = slPct > 0 ? tpPct / slPct : 1;
      trailDistance = Math.min(2.0, Math.max(0.15, slPct * 0.5 * (0.75 + rr * 0.25)));
      activation = Math.min(3.0, Math.max(0.1, slPct));
    } else {
      trailDistance = Math.min(2.0, Math.max(0.15, slPct * 0.5));
      activation = Math.min(3.0, Math.max(0.1, slPct * 0.75));
    }

    pos.trailingStopActive = true;
    pos.trailingStopPct = parseFloat(trailDistance.toFixed(2));
    pos.trailActivationPct = parseFloat(activation.toFixed(2));
    pos.peakPrice = pos.entryPrice;
    pos.trailUpdatedAt = Date.now();
  }

  public getBalance(): number {
    return this.balance;
  }

  public reset(initialBalance: number = 100): void {
    this.balance = initialBalance;
    this.positions.clear();
    this.trades = [];
  }

  /**
   * Clears ONLY the trade history. Balance and open positions are untouched —
   * used when the user wants to start analysis fresh without losing their
   * running demo balance or any open trades.
   */
  public resetHistory(): void {
    this.trades = [];
  }

  /**
   * Resets ONLY the demo balance. Trade history and open positions are kept,
   * so past trades remain available for analysis.
   */
  public resetBalance(initialBalance: number = 100): void {
    this.balance = initialBalance;
  }

  public getPositions(): PaperPosition[] {
    return Array.from(this.positions.values());
  }

  public getTradeHistory(): PaperTrade[] {
    return this.trades;
  }

  public getClosedTrades(): PaperTrade[] {
    return this.trades.filter(t => t.exitReason && t.pnl !== undefined);
  }

  /**
   * Reconstructs the round-trip origin (entry price + open time) on closing
   * records that were persisted before those fields were recorded. Scans the
   * history in chronological order: each entry order seeds the symbol's open
   * state, and each close without an origin picks it up. Safe to run any time.
   */
  public backfillRoundTripOrigins(): void {
    const openBySymbol = new Map<string, { price: number; openedAt: number }>();
    for (const trade of this.trades) {
      if (trade.pnl === undefined) {
        openBySymbol.set(trade.symbol, { price: trade.fillPrice, openedAt: trade.timestamp });
      } else if (trade.openPrice === undefined || trade.openedAt === undefined) {
        const origin = openBySymbol.get(trade.symbol);
        if (origin) {
          trade.openPrice = origin.price;
          trade.openedAt = origin.openedAt;
        }
      }
    }
  }

  /**
   * Full engine state snapshot — used to persist paper balance, open positions
   * and full trade history to disk so nothing resets on restart.
   */
  public getStateSnapshot(): { balance: number; positions: PaperPosition[]; trades: PaperTrade[] } {
    return {
      balance: this.balance,
      positions: this.getPositions(),
      trades: this.trades
    };
  }

  public restoreState(snapshot: { balance: number; positions: PaperPosition[]; trades: PaperTrade[] }): void {
    if (!snapshot) return;
    if (typeof snapshot.balance === 'number' && isFinite(snapshot.balance)) {
      this.balance = snapshot.balance;
    }
    if (Array.isArray(snapshot.trades)) {
      this.trades = snapshot.trades;
    }
    if (Array.isArray(snapshot.positions)) {
      this.positions.clear();
      for (const p of snapshot.positions) {
        if (p && p.symbol) this.positions.set(p.symbol, p);
      }
    }
    this.backfillRoundTripOrigins();
  }

  /**
   * Full round-trip stats — the exact numbers used to judge the strategy after
   * 500 trades. PnL is net of entry + exit fees and funding.
   */
  public getStats(): PaperStats {
    const closed = this.getClosedTrades();
    let wins = 0;
    let losses = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalFees = 0;
    let totalFunding = 0;
    let netPnl = 0;
    let peakEquity = this.balance;
    let maxDrawdown = 0;
    let runningEquity = this.balance;

    for (const t of closed) {
      const pnl = t.pnl || 0;
      const fee = t.fee || 0;
      const funding = t.fundingPaid || 0;
      netPnl += pnl;
      totalFees += fee;
      totalFunding += funding;
      if (pnl > 0) {
        wins++;
        grossProfit += pnl;
      } else {
        losses++;
        grossLoss += Math.abs(pnl);
      }
      runningEquity += pnl;
      if (runningEquity > peakEquity) peakEquity = runningEquity;
      const dd = peakEquity - runningEquity;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    const totalTrades = closed.length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? grossProfit : 0) : grossProfit / grossLoss;
    const avgWin = wins > 0 ? grossProfit / wins : 0;
    const avgLoss = losses > 0 ? grossLoss / losses : 0;
    const expectancy = totalTrades > 0 ? netPnl / totalTrades : 0;

    return {
      totalTrades,
      wins,
      losses,
      winRate: parseFloat(winRate.toFixed(2)),
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      grossLoss: parseFloat(grossLoss.toFixed(2)),
      avgWin: parseFloat(avgWin.toFixed(2)),
      avgLoss: parseFloat(avgLoss.toFixed(2)),
      expectancy: parseFloat(expectancy.toFixed(2)),
      totalFees: parseFloat(totalFees.toFixed(2)),
      totalFunding: parseFloat(totalFunding.toFixed(2)),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
      netPnl: parseFloat(netPnl.toFixed(2)),
      balance: parseFloat(this.balance.toFixed(2)),
      tradesToTarget: Math.max(0, 500 - totalTrades)
    };
  }

  /**
   * Executes paper order intent against live L2 depth snapshot to compute exact
   * depth fill price & slippage, with real Binance fees.
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
      const leverage = intent.leverage || 1;
      const isLong = trade.side === 'BUY';

      // EVERY trade gets a stop-loss by default. Signals normally provide one,
      // but this guarantees it regardless of entry path:
      //   - missing/degenerate SL  -> default 0.5% stop (side-mirrored)
      //   - razor-thin ATR stop    -> widened to a 0.3% minimum so market noise
      //     cannot stop the trade out (the -$11 "unfair" losses came from
      //     positions that either had no SL or an ATR stop thinner than noise).
      const DEFAULT_SL_PCT = 0.5;
      const MIN_SL_PCT = 0.3;
      let stopLoss = intent.stopLoss;
      if (stopLoss === undefined || !isFinite(stopLoss) || stopLoss === trade.fillPrice) {
        stopLoss = trade.fillPrice * (1 + (isLong ? -1 : 1) * (DEFAULT_SL_PCT / 100));
      } else {
        const distPct = (Math.abs(stopLoss - trade.fillPrice) / trade.fillPrice) * 100;
        if (distPct < MIN_SL_PCT) {
          stopLoss = trade.fillPrice * (1 + (isLong ? -1 : 1) * (MIN_SL_PCT / 100));
        }
      }
      stopLoss = parseFloat(stopLoss.toFixed(4));

      const newPos: PaperPosition = {
        symbol: trade.symbol,
        side: isLong ? 'LONG' : 'SHORT',
        quantity: trade.quantity,
        entryPrice: trade.fillPrice,
        markPrice: trade.fillPrice,
        unrealizedPnL: 0,
        realizedPnL: 0,
        margin: (trade.fillPrice * trade.quantity) / leverage,
        stopLoss,
        takeProfit: intent.takeProfit,
        leverage,
        liquidationPrice: this.calculateLiquidationPrice(isLong ? 'LONG' : 'SHORT', trade.fillPrice, leverage),
        fundingPaid: 0,
        entryFee: trade.fee,
        exitFee: 0,
        openedAt: Date.now(),
        context: intent.context
      };
      this.autoConfigureTrailing(newPos);
      this.positions.set(trade.symbol, newPos);
      return;
    }

    const isSameSide = (existing.side === 'LONG' && trade.side === 'BUY') || (existing.side === 'SHORT' && trade.side === 'SELL');

    if (isSameSide) {
      // Adding to position (Weighted average entry price)
      const totalQty = existing.quantity + trade.quantity;
      const weightedEntry = (existing.entryPrice * existing.quantity + trade.fillPrice * trade.quantity) / totalQty;
      const lev = existing.leverage || 1;
      existing.quantity = totalQty;
      existing.entryPrice = parseFloat(weightedEntry.toFixed(4));
      existing.margin = (existing.entryPrice * totalQty) / lev;
      existing.entryFee = (existing.entryFee || 0) + trade.fee;
      existing.liquidationPrice = this.calculateLiquidationPrice(existing.side, existing.entryPrice, lev);
    } else {
      // Closing / Reducing position
      const closeQty = Math.min(existing.quantity, trade.quantity);
      let pnl = 0;
      if (existing.side === 'LONG') {
        pnl = (trade.fillPrice - existing.entryPrice) * closeQty;
      } else {
        pnl = (existing.entryPrice - trade.fillPrice) * closeQty;
      }

      const entryFeeShare = closeQty === existing.quantity ? (existing.entryFee || 0) : 0;
      const fundingShare = closeQty === existing.quantity ? (existing.fundingPaid || 0) : 0;

      this.balance += pnl;
      existing.realizedPnL += pnl;
      existing.quantity -= closeQty;
      existing.exitFee = (existing.exitFee || 0) + trade.fee;

      // Net round-trip PnL = raw PnL - entry fees - exit fees - funding
      const netPnl = pnl - entryFeeShare - trade.fee - fundingShare;
      trade.pnl = parseFloat(netPnl.toFixed(4));
      trade.fundingPaid = parseFloat(fundingShare.toFixed(4));

      // Staple the round-trip origin onto the closing order so the history
      // table can show OPEN → CLOSE price and the UTC open→close window.
      trade.openPrice = existing.entryPrice;
      trade.openedAt = existing.openedAt;

      // Determine Exit Reason if not explicitly provided
      if (!trade.exitReason) {
        trade.exitReason = 'MANUAL'; // Default to manual unless it was an auto close
      }

      if (existing.quantity <= 0) {
        existing.closedAt = Date.now();
        this.positions.delete(trade.symbol);
      } else {
        const lev = existing.leverage || 1;
        existing.margin = (existing.entryPrice * existing.quantity) / lev;
      }
    }
  }

  private calculateLiquidationPrice(side: 'LONG' | 'SHORT', entryPrice: number, leverage: number): number {
    if (leverage <= 0) return side === 'LONG' ? 0 : Infinity;
    const buffer = 1 - (PaperTradingEngine.MAINTENANCE_MARGIN_PCT / 100);
    const movePct = (1 / leverage) * buffer;
    if (side === 'LONG') {
      return parseFloat((entryPrice * (1 - movePct)).toFixed(4));
    }
    return parseFloat((entryPrice * (1 + movePct)).toFixed(4));
  }

  /**
   * Per-position trailing stop. Tracks the favorable peak price since entry,
   * arms after `trailActivationPct` favorable move (0 = immediate), then
   * ratchets the stop behind the peak and never loosens it.
   */
  private updatePerPositionTrailing(pos: PaperPosition, markPrice: number): number | undefined {
    const pct = pos.trailingStopPct!;
    if (pos.peakPrice === undefined) pos.peakPrice = markPrice;
    if (pos.side === 'LONG') {
      if (markPrice > pos.peakPrice) pos.peakPrice = markPrice;
    } else {
      if (markPrice < pos.peakPrice) pos.peakPrice = markPrice;
    }

    const activationPct = pos.trailActivationPct || 0;
    if (!pos.trailActivated) {
      const threshold = activationPct > 0
        ? pos.entryPrice * (1 + (pos.side === 'LONG' ? 1 : -1) * (activationPct / 100))
        : pos.entryPrice;
      const armed = pos.side === 'LONG' ? markPrice >= threshold : markPrice <= threshold;
      if (!armed) return pos.stopLoss;
      pos.trailActivated = true;
      pos.trailUpdatedAt = Date.now();
    }

    const trailStop = pos.side === 'LONG'
      ? pos.peakPrice! * (1 - pct / 100)
      : pos.peakPrice! * (1 + pct / 100);
    if (pos.trailingStop === undefined) {
      pos.trailingStop = parseFloat(trailStop.toFixed(4));
      pos.trailUpdatedAt = Date.now();
    } else if (pos.side === 'LONG' && trailStop > pos.trailingStop) {
      pos.trailingStop = parseFloat(trailStop.toFixed(4));
      pos.trailUpdatedAt = Date.now();
    } else if (pos.side === 'SHORT' && trailStop < pos.trailingStop) {
      pos.trailingStop = parseFloat(trailStop.toFixed(4));
      pos.trailUpdatedAt = Date.now();
    }
    return pos.trailingStop;
  }

  /**
   * Updates mark prices for open positions to calculate unrealized PnL, accrue
   * pro-rated funding, and monitor auto TP/SL + liquidation.
   */
  public updateMarkPrice(symbol: string, markPrice: number, fundingRate?: number): PaperTrade | null {
    const pos = this.positions.get(symbol);
    if (!pos) return null;

    pos.markPrice = markPrice;
    if (pos.side === 'LONG') {
      pos.unrealizedPnL = parseFloat(((markPrice - pos.entryPrice) * pos.quantity).toFixed(4));
    } else {
      pos.unrealizedPnL = parseFloat(((pos.entryPrice - markPrice) * pos.quantity).toFixed(4));
    }

    // Accrue real funding rate pro-rated over the 8h funding interval (max hourly)
    const now = Date.now();
    const lastFundingAt = pos.lastFundingAccrualAt || pos.openedAt || now;
    if (fundingRate !== undefined && fundingRate !== 0) {
      const notional = pos.entryPrice * pos.quantity;
      const hoursElapsed = (now - lastFundingAt) / (60 * 60 * 1000);
      if (hoursElapsed >= 1) {
        const fundingPayment = notional * fundingRate * (hoursElapsed / PaperTradingEngine.FUNDING_INTERVAL_HOURS);
        pos.fundingPaid = (pos.fundingPaid || 0) + fundingPayment;
        pos.lastFundingAccrualAt = now; // reset accrual window
        this.balance -= fundingPayment; // funding paid/received is cash flow
      }
    }

    // Liquidation check (before TP/SL — liquidation takes priority like a real exchange)
    let triggerClose = false;
    let exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'LIQUIDATION' | 'TRAILING_STOP' | undefined;

    const liq = pos.liquidationPrice;
    if (liq !== undefined) {
      if (pos.side === 'LONG' && markPrice <= liq) {
        triggerClose = true;
        exitReason = 'LIQUIDATION';
      } else if (pos.side === 'SHORT' && markPrice >= liq) {
        triggerClose = true;
        exitReason = 'LIQUIDATION';
      }
    }

    // Trailing stop (smart-profit lock):
    //  - Per-position trailing (set via the open-trade manager) takes priority.
    //    It trails off the favorable peak price and needs no TP.
    //  - Otherwise the default global template arms at activationPct of the
    //    entry→TP distance, then ratchets the stop behind price.
    const tp = pos.takeProfit;
    let activeStop = pos.stopLoss;
    if (!triggerClose && pos.trailingStopActive && pos.trailingStopPct !== undefined && pos.trailingStopPct > 0) {
      activeStop = this.updatePerPositionTrailing(pos, markPrice);
    } else if (!triggerClose && this.trailingStopEnabled && tp !== undefined) {
      const tpDistance = Math.abs(tp - pos.entryPrice);
      const activationThreshold = pos.entryPrice + (pos.side === 'LONG' ? 1 : -1) * tpDistance * (this.trailingActivationPct / 100);
      const gained = pos.side === 'LONG' ? markPrice >= activationThreshold : markPrice <= activationThreshold;
      if (gained) {
        pos.trailActivated = true;
        const trailStop = pos.side === 'LONG'
          ? markPrice * (1 - this.trailingDistancePct / 100)
          : markPrice * (1 + this.trailingDistancePct / 100);
        if (pos.trailingStop === undefined) {
          pos.trailingStop = parseFloat(trailStop.toFixed(4));
        } else if (pos.side === 'LONG' && trailStop > pos.trailingStop) {
          pos.trailingStop = parseFloat(trailStop.toFixed(4));
        } else if (pos.side === 'SHORT' && trailStop < pos.trailingStop) {
          pos.trailingStop = parseFloat(trailStop.toFixed(4));
        }
      }
      if (pos.trailActivated) activeStop = pos.trailingStop;
    }

    if (!triggerClose && pos.side === 'LONG') {
      if (activeStop && markPrice <= activeStop) {
        triggerClose = true;
        exitReason = pos.trailActivated ? 'TRAILING_STOP' : 'STOP_LOSS';
      }
      if (pos.takeProfit && markPrice >= pos.takeProfit) {
        triggerClose = true;
        exitReason = 'TAKE_PROFIT';
      }
    } else if (!triggerClose && pos.side === 'SHORT') {
      if (activeStop && markPrice >= activeStop) {
        triggerClose = true;
        exitReason = pos.trailActivated ? 'TRAILING_STOP' : 'STOP_LOSS';
      }
      if (pos.takeProfit && markPrice <= pos.takeProfit) {
        triggerClose = true;
        exitReason = 'TAKE_PROFIT';
      }
    }

    if (triggerClose) {
      const closePrice = exitReason === 'LIQUIDATION' && liq !== undefined ? liq : markPrice;
      const closeIntent: PaperOrderIntent = {
        symbol,
        side: pos.side === 'LONG' ? 'SELL' : 'BUY',
        type: 'MARKET',
        quantity: pos.quantity
      };
      // Match closing trade using live price (liquidation fills at the liq price)
      const closingTrade = this.executeOrder(closeIntent, null, closePrice);
      closingTrade.exitReason = exitReason;
      return closingTrade;
    }

    return null;
  }
}
