import { CandleOHLCV, DiscoveredCoin, HeatCandidate, HeatZone } from '@athena/shared';
import { IndicatorEngine } from './IndicatorEngine';

/**
 * HeatHunterEngine — Stage 2
 * Filters discovered coins through RSI heat zones and WMR(200) confirmation gate.
 *
 * Heat Zone Thresholds:
 *   OVERBOUGHT      → RSI  > 75
 *   NEAR_OVERBOUGHT → RSI 70–75
 *   OVERSOLD        → RSI  < 25
 *   NEAR_OVERSOLD   → RSI 25–30
 *
 * WMR(200) Gate:
 *   Oversold  candidates need WMR < -60  to confirm
 *   Overbought candidates need WMR > -40 to confirm
 */
export class HeatHunterEngine {
  private indicatorEngine = new IndicatorEngine();

  /** Classify RSI into a HeatZone label */
  public classifyHeatZone(rsi: number): HeatZone {
    if (rsi > 75) return 'OVERBOUGHT';
    if (rsi >= 70) return 'NEAR_OVERBOUGHT';
    if (rsi < 25) return 'OVERSOLD';
    if (rsi <= 30) return 'NEAR_OVERSOLD';
    return 'NEUTRAL';
  }

  /**
   * WMR(200) gate:
   *   Oversold zone   → WMR must be < -60 (bearish momentum confirmation)
   *   Overbought zone → WMR must be > -40 (bullish momentum confirmation)
   */
  public checkWMRGate(heatZone: HeatZone, wmr200: number): boolean {
    if (heatZone === 'OVERSOLD' || heatZone === 'NEAR_OVERSOLD') {
      return wmr200 < -60;
    }
    if (heatZone === 'OVERBOUGHT' || heatZone === 'NEAR_OVERBOUGHT') {
      return wmr200 > -40;
    }
    return false;
  }

  /**
   * Evaluate a single coin against heat zone filters.
   * Returns null if coin does not fall into any heat zone.
   */
  public evaluateCoin(
    discovered: DiscoveredCoin,
    candles: CandleOHLCV[]
  ): HeatCandidate | null {
    if (candles.length < 5) return null;

    // Aggregate 1m candles to 5m for RSI
    const candles5m = this.indicatorEngine.aggregateCandles(candles, 5);
    const closes5m = candles5m.map(c => c.close);
    const rsiValues = this.indicatorEngine.calculateRSI(closes5m, 14);
    const rsi5m = parseFloat((rsiValues[rsiValues.length - 1] || 50).toFixed(1));

    // WMR(200) on raw 1m candles
    const wmrValues = this.indicatorEngine.calculateWilliamsR(candles, Math.min(200, candles.length));
    const wmr200 = parseFloat((wmrValues[wmrValues.length - 1] ?? -50).toFixed(1));

    const heatZone = this.classifyHeatZone(rsi5m);
    if (heatZone === 'NEUTRAL') return null;

    const heatConfirmed = this.checkWMRGate(heatZone, wmr200);

    return {
      ...discovered,
      heatZone,
      rsi5m,
      wmr200,
      heatConfirmed
    };
  }

  /**
   * Filter discovered coins through heat zone analysis.
   * candleProvider: supplies 1m candle history for a given symbol.
   * Returns heat candidates sorted by zone severity.
   */
  public async filter(
    discovered: DiscoveredCoin[],
    candleProvider: (symbol: string) => CandleOHLCV[]
  ): Promise<HeatCandidate[]> {
    const heatCandidates: HeatCandidate[] = [];

    for (const coin of discovered) {
      const candles = candleProvider(coin.symbol);
      const candidate = this.evaluateCoin(coin, candles);
      if (candidate) {
        heatCandidates.push(candidate);
      }
    }

    // Sort: extreme zones first
    const zoneOrder: HeatZone[] = ['OVERBOUGHT', 'OVERSOLD', 'NEAR_OVERBOUGHT', 'NEAR_OVERSOLD'];
    heatCandidates.sort(
      (a, b) => zoneOrder.indexOf(a.heatZone) - zoneOrder.indexOf(b.heatZone)
    );

    return heatCandidates;
  }
}
