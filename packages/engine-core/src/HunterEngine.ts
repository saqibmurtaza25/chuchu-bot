import { CandleOHLCV, HunterState, MultiTimeframeRSI, MultiTimeframeWilliamsR } from '@chuchu/shared';
import { ScreenerConfig } from './ScreenerConfig';

/**
 * HunterEngine — Stage 1
 * Calculates weighted multi-timeframe RSI and Williams %R momentum score (0-100).
 */
export class HunterEngine {

  /**
   * Evaluates weighted momentum score across 5m, 15m, 1H, and 4H timeframes.
   */
  public evaluate(
    symbol: string,
    mtfRsi?: MultiTimeframeRSI | null,
    mtfWr?: MultiTimeframeWilliamsR | null
  ): HunterState {
    if (!mtfRsi || !mtfWr) {
      return {
        symbol,
        volumeZScore: 0,
        volatilityExpansionRatio: 1.0,
        hunterScore: 0,
        timestamp: Date.now()
      };
    }

    const { timeframeWeights, extremeRsi, extremeWmr } = ScreenerConfig.hunter;

    const calcTimeframeScore = (rsi: number, wmr: number, isShort: boolean, maxPoints: number) => {
      let rsiPts = 0;
      let wmrPts = 0;

      if (isShort) { // Overbought (SHORT)
        if (rsi >= extremeRsi.overbought) {
          rsiPts = maxPoints / 2;
        } else if (rsi > extremeRsi.neutral) {
          rsiPts = ((rsi - extremeRsi.neutral) / (extremeRsi.overbought - extremeRsi.neutral)) * (maxPoints / 2);
        }

        if (wmr >= extremeWmr.overbought) {
          wmrPts = maxPoints / 2;
        } else if (wmr > extremeWmr.neutral) {
          wmrPts = ((wmr - extremeWmr.neutral) / (extremeWmr.overbought - extremeWmr.neutral)) * (maxPoints / 2);
        }
      } else { // Oversold (LONG)
        if (rsi <= extremeRsi.oversold) {
          rsiPts = maxPoints / 2;
        } else if (rsi < extremeRsi.neutral) {
          rsiPts = ((extremeRsi.neutral - rsi) / (extremeRsi.neutral - extremeRsi.oversold)) * (maxPoints / 2);
        }

        if (wmr <= extremeWmr.oversold) {
          wmrPts = maxPoints / 2;
        } else if (wmr < extremeWmr.neutral) {
          wmrPts = ((extremeWmr.neutral - wmr) / (extremeWmr.neutral - extremeWmr.oversold)) * (maxPoints / 2);
        }
      }

      return rsiPts + wmrPts;
    };

    // Calculate score for SHORT setup (overbought momentum)
    const shortScore = 
      calcTimeframeScore(mtfRsi.tf5m, mtfWr.tf5m, true, timeframeWeights.tf5m) +
      calcTimeframeScore(mtfRsi.tf15m, mtfWr.tf15m, true, timeframeWeights.tf15m) +
      calcTimeframeScore(mtfRsi.tf1h, mtfWr.tf1h, true, timeframeWeights.tf1h) +
      calcTimeframeScore(mtfRsi.tf4h, mtfWr.tf4h, true, timeframeWeights.tf4h);

    // Calculate score for LONG setup (oversold momentum)
    const longScore = 
      calcTimeframeScore(mtfRsi.tf5m, mtfWr.tf5m, false, timeframeWeights.tf5m) +
      calcTimeframeScore(mtfRsi.tf15m, mtfWr.tf15m, false, timeframeWeights.tf15m) +
      calcTimeframeScore(mtfRsi.tf1h, mtfWr.tf1h, false, timeframeWeights.tf1h) +
      calcTimeframeScore(mtfRsi.tf4h, mtfWr.tf4h, false, timeframeWeights.tf4h);

    const hunterScore = Math.min(100, Math.max(0, Math.round(Math.max(shortScore, longScore))));

    return {
      symbol,
      volumeZScore: 0,
      volatilityExpansionRatio: 1.0,
      hunterScore,
      timestamp: Date.now()
    };
  }
}
