import { AnalyticsMetrics, PaperTrade } from '@athena/shared';

/**
 * AnalyticsEngine
 * Evaluates mathematical risk & performance metrics on paper trade history.
 * Formulas: Sharpe Ratio, Sortino Ratio, Max Drawdown, Profit Factor, Win Rate, Expectancy.
 */
export class AnalyticsEngine {

  /**
   * Evaluates complete analytics metrics for a set of completed paper trades
   */
  public evaluate(trades: PaperTrade[], initialBalance: number = 100_000): AnalyticsMetrics {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        maxDrawdown: 0,
        totalRealizedPnL: 0,
        expectancy: 0
      };
    }

    let winningTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalRealizedPnL = 0;
    const returns: number[] = [];
    const downsideReturns: number[] = [];

    // Track equity curve for Max Drawdown
    let currentEquity = initialBalance;
    let peakEquity = initialBalance;
    let maxDrawdown = 0;

    for (const trade of trades) {
      const pnl = trade.side === 'SELL' ? (trade.fillPrice * trade.quantity - trade.fee) : (-trade.fee);
      totalRealizedPnL += pnl;
      currentEquity += pnl;

      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }
      const drawdown = (peakEquity - currentEquity) / peakEquity * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      const tradeReturn = pnl / initialBalance;
      returns.push(tradeReturn);

      if (pnl > 0) {
        winningTrades++;
        grossProfit += pnl;
      } else {
        grossLoss += Math.abs(pnl);
        downsideReturns.push(tradeReturn);
      }
    }

    const winRate = (winningTrades / trades.length) * 100;
    const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;

    // Sharpe Ratio calculation (Risk-free rate = 0%)
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    let varianceSum = 0;
    for (const r of returns) {
      varianceSum += Math.pow(r - meanReturn, 2);
    }
    const stdDev = Math.sqrt(varianceSum / returns.length);
    const sharpeRatio = stdDev === 0 ? 0 : (meanReturn / stdDev) * Math.sqrt(365); // Annualized

    // Sortino Ratio calculation
    let downsideVarianceSum = 0;
    for (const r of downsideReturns) {
      downsideVarianceSum += Math.pow(r, 2);
    }
    const downsideStdDev = Math.sqrt(downsideVarianceSum / returns.length);
    const sortinoRatio = downsideStdDev === 0 ? 0 : (meanReturn / downsideStdDev) * Math.sqrt(365);

    // Trade Expectancy = (Win Rate * Avg Win) - (Loss Rate * Avg Loss)
    const avgWin = winningTrades === 0 ? 0 : grossProfit / winningTrades;
    const avgLoss = (trades.length - winningTrades) === 0 ? 0 : grossLoss / (trades.length - winningTrades);
    const winProb = winningTrades / trades.length;
    const lossProb = 1 - winProb;
    const expectancy = (winProb * avgWin) - (lossProb * avgLoss);

    return {
      totalTrades: trades.length,
      winRate: parseFloat(winRate.toFixed(2)),
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
      sortinoRatio: parseFloat(sortinoRatio.toFixed(2)),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
      totalRealizedPnL: parseFloat(totalRealizedPnL.toFixed(2)),
      expectancy: parseFloat(expectancy.toFixed(2))
    };
  }
}
