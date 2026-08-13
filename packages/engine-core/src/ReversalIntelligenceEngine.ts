import {
  CandleOHLCV,
  MicrostructureState,
  ReversalDirection,
  ReversalIntelResult,
  ReversalLayerConfidence,
  TimeframeReversalIntel
} from '@chuchu/shared';
import { IndicatorEngine } from './IndicatorEngine';

interface TfConfig {
  timeframe: string;
  /** bars forward used to measure whether the reversal materialised */
  horizonBars: number;
  /** higher timeframes carry more weight when forming the consensus */
  weight: number;
}

/**
 * Higher-timeframe → micro progression. 30s is intentionally absent:
 * it is not a Binance/Bybit kline interval, so 1m is the fastest real timeframe.
 */
const TF_CONFIGS: TfConfig[] = [
  { timeframe: '1d', horizonBars: 3, weight: 3.0 },
  { timeframe: '12h', horizonBars: 2, weight: 2.5 },
  { timeframe: '4h', horizonBars: 2, weight: 2.0 },
  { timeframe: '2h', horizonBars: 3, weight: 1.6 },
  { timeframe: '1h', horizonBars: 3, weight: 1.4 },
  { timeframe: '30m', horizonBars: 4, weight: 1.2 },
  { timeframe: '15m', horizonBars: 4, weight: 1.1 },
  { timeframe: '5m', horizonBars: 6, weight: 1.0 },
  { timeframe: '3m', horizonBars: 10, weight: 0.9 },
  { timeframe: '1m', horizonBars: 15, weight: 0.8 }
];

const OVERBOUGHT_WR = 80;
const OVERSOLD_WR = 20;

const WR200_LIMIT = 200;
const RSI_PERIOD = 14;
const MIN_SAMPLES = 4;

export class ReversalIntelligenceEngine {
  private indicatorEngine = new IndicatorEngine();

  /**
   * Analyzes MTF klines + orderflow into a reversal-evidence score.
   * `tfKlines` is keyed by Binance-style timeframe ('1m','5m',...,'1d').
   * Missing timeframes are simply skipped — the engine works with what it has.
   */
  public analyze(
    symbol: string,
    tfKlines: Record<string, CandleOHLCV[]>,
    micro?: MicrostructureState,
    price?: number
  ): ReversalIntelResult {
    const tfResults: TimeframeReversalIntel[] = [];

    for (const cfg of TF_CONFIGS) {
      const klines = tfKlines[cfg.timeframe];
      if (!klines || klines.length < 50) continue;
      const tf = this.analyzeTimeframe(cfg, klines);
      if (tf) tfResults.push(tf);
    }

    // ── Consensus from timeframe extremes ─────────────────────────────
    let bullWeight = 0;
    let bearWeight = 0;
    let totalExtremeWeight = 0;
    for (const tf of tfResults) {
      if (tf.direction === 'NEUTRAL') continue;
      totalExtremeWeight += cfgWeight(tf.timeframe);
      const p = tf.historicalReversalPct / 100;
      if (tf.direction === 'BULLISH') bullWeight += cfgWeight(tf.timeframe) * p;
      else bearWeight += cfgWeight(tf.timeframe) * p;
    }

    let bullishProbability = 50;
    let bearishProbability = 50;
    let consensusDirection: ReversalDirection = 'NEUTRAL';
    if (totalExtremeWeight > 0) {
      bullishProbability = (bullWeight / totalExtremeWeight) * 100;
      bearishProbability = (bearWeight / totalExtremeWeight) * 100;
    }
    const lean = bullishProbability - bearishProbability;
    if (Math.abs(lean) < 6) consensusDirection = 'NEUTRAL';
    else consensusDirection = lean > 0 ? 'BULLISH' : 'BEARISH';
    const uncertainPct = Math.max(0, Math.min(100, 100 - bullishProbability - bearishProbability));

    // ── Confirmation layers ──────────────────────────────────────────
    const layers = this.buildLayers(tfResults, micro, price, consensusDirection);

    const avgLayer = layers.length ? layers.reduce((s, l) => s + l.score, 0) / layers.length : 50;
    const dominant = Math.max(bullishProbability, bearishProbability);
    const overallScore = Math.round(Math.min(100, 0.7 * dominant + 0.3 * avgLayer));

    const expectedHorizon = this.expectedHorizon(tfResults);
    const summary = this.buildSummary(symbol, consensusDirection, overallScore, expectedHorizon, bullishProbability, bearishProbability, tfResults);

    return {
      symbol,
      overallScore,
      bullishProbability: Math.round(bullishProbability),
      bearishProbability: Math.round(bearishProbability),
      uncertainPct: Math.round(uncertainPct),
      timeframes: tfResults,
      layers,
      consensusDirection,
      expectedHorizon,
      summary,
      computedAt: Date.now()
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Per-timeframe historical reversal statistics
  // ─────────────────────────────────────────────────────────────────────
  private analyzeTimeframe(cfg: TfConfig, klines: CandleOHLCV[]): TimeframeReversalIntel | null {
    const closes = klines.map(c => c.close);
    const period = Math.min(WR200_LIMIT, klines.length);
    const rsiSeries = this.indicatorEngine.calculateRSI(closes, RSI_PERIOD);
    const wrSeries = this.indicatorEngine.calculateWilliamsR(klines, period);

    const rsiNow = rsiSeries[rsiSeries.length - 1];
    const wrNow = wrSeries[wrSeries.length - 1];

    if (!isFinite(rsiNow) || !isFinite(wrNow)) return null;

    const extreme: TimeframeReversalIntel['extreme'] = wrNow >= OVERBOUGHT_WR
      ? 'OVERBOUGHT'
      : wrNow <= OVERSOLD_WR
        ? 'OVERSOLD'
        : 'NEUTRAL';

    const direction: ReversalDirection = extreme === 'OVERBOUGHT' ? 'BEARISH' : extreme === 'OVERSOLD' ? 'BULLISH' : 'NEUTRAL';

    let historicalReversalPct = 50;
    let samples = 0;

    if (extreme !== 'NEUTRAL') {
      // Comparable historical setups: W%R200 within ±10 of current and RSI14
      // within ±15. Widen the RSI band once if too few samples exist.
      let match = this.measureHistoricalReversal(closes, wrSeries, rsiSeries, wrNow, rsiNow, 10, 15, cfg.horizonBars, direction);
      if (match.samples < MIN_SAMPLES) {
        match = this.measureHistoricalReversal(closes, wrSeries, rsiSeries, wrNow, rsiNow, 12, 25, cfg.horizonBars, direction);
      }
      historicalReversalPct = match.samples > 0 ? match.reversalPct : 50;
      samples = match.samples;
    }

    return {
      timeframe: cfg.timeframe,
      rsi14: parseFloat(rsiNow.toFixed(1)),
      wr200: parseFloat(wrNow.toFixed(1)),
      extreme,
      historicalReversalPct: parseFloat(historicalReversalPct.toFixed(0)),
      samples,
      direction
    };
  }

  private measureHistoricalReversal(
    closes: number[],
    wrSeries: number[],
    rsiSeries: number[],
    wrNow: number,
    rsiNow: number,
    wrBand: number,
    rsiBand: number,
    horizonBars: number,
    direction: ReversalDirection
  ): { reversalPct: number; samples: number } {
    const n = wrSeries.length;
    let favorable = 0;
    let samples = 0;

    for (let i = 0; i < n - horizonBars - 1; i++) {
      const wr = wrSeries[i];
      const rsi = rsiSeries[i];
      if (!isFinite(wr) || !isFinite(rsi)) continue;
      if (Math.abs(wr - wrNow) > wrBand) continue;
      if (Math.abs(rsi - rsiNow) > rsiBand) continue;
      if (wr < OVERBOUGHT_WR && wr > OVERSOLD_WR) continue; // only comparable extreme situations

      if (closes[i + horizonBars] === undefined || closes[i] === undefined) continue;
      const forwardReturn = (closes[i + horizonBars] - closes[i]) / closes[i];
      if (!isFinite(forwardReturn)) continue;

      samples++;
      const reversed = direction === 'BEARISH' ? forwardReturn < 0 : forwardReturn > 0;
      if (reversed) favorable++;
    }

    return {
      reversalPct: samples > 0 ? (favorable / samples) * 100 : 50,
      samples
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Confirmation layers
  // ─────────────────────────────────────────────────────────────────────
  private buildLayers(
    tfResults: TimeframeReversalIntel[],
    micro?: MicrostructureState,
    price?: number,
    consensusDirection: ReversalDirection = 'NEUTRAL'
  ): ReversalLayerConfidence[] {
    const layers: ReversalLayerConfidence[] = [];

    const htf = tfResults.filter(t => ['1d', '12h', '4h', '2h'].includes(t.timeframe));
    const mid = tfResults.filter(t => ['1h', '30m', '15m'].includes(t.timeframe));
    const microTf = tfResults.filter(t => ['5m', '3m', '1m'].includes(t.timeframe));
    const extremes = tfResults.filter(t => t.direction !== 'NEUTRAL');

    layers.push({ layer: 'HTF_ALIGNMENT', score: this.alignmentScore(htf, consensusDirection) });
    layers.push({ layer: 'MID_TF_ALIGNMENT', score: this.alignmentScore(mid, consensusDirection) });
    layers.push({ layer: 'MICRO_TF_ALIGNMENT', score: this.alignmentScore(microTf, consensusDirection) });
    layers.push({ layer: 'WR200_EDGE', score: this.avgEdgeScore(extremes) });
    layers.push({ layer: 'RSI_EDGE', score: this.rsiEdgeScore(extremes) });

    const cvd = micro?.cvd ?? 0;
    const buyerPct = micro?.orderbookBuyerPct ?? 50;
    const whale = micro?.whaleActivity ?? false;
    const poc = this.pocFromVpvr(micro as any);

    layers.push({ layer: 'CVD', score: consensusDirection === 'BULLISH' ? (cvd > 0 ? 70 : 40) : consensusDirection === 'BEARISH' ? (cvd < 0 ? 70 : 40) : 50 });
    layers.push({ layer: 'ORDERBOOK', score: consensusDirection === 'BEARISH' ? 100 - buyerPct : buyerPct });
    layers.push({ layer: 'WHALE', score: whale ? 75 : 50 });
    layers.push({ layer: 'VPVR', score: this.vpvrScore(poc, price, consensusDirection) });

    return layers;
  }

  private alignmentScore(tfs: TimeframeReversalIntel[], consensusDirection: ReversalDirection): number {
    const extremes = tfs.filter(t => t.direction !== 'NEUTRAL');
    if (extremes.length === 0) return 50;
    const agreeing = extremes.filter(t => t.direction === consensusDirection).length;
    return Math.round((agreeing / extremes.length) * 100);
  }

  private avgEdgeScore(extremes: TimeframeReversalIntel[]): number {
    if (extremes.length === 0) return 50;
    return Math.round(extremes.reduce((s, t) => s + t.historicalReversalPct, 0) / extremes.length);
  }

  private rsiEdgeScore(extremes: TimeframeReversalIntel[]): number {
    const rsiExtreme = extremes.filter(t => t.rsi14 > 70 || t.rsi14 < 30);
    if (rsiExtreme.length === 0) return 50;
    return Math.round(rsiExtreme.reduce((s, t) => s + t.historicalReversalPct, 0) / rsiExtreme.length);
  }

  private vpvrScore(poc: number | null, price?: number, consensusDirection: ReversalDirection = 'NEUTRAL'): number {
    if (poc === null || !price || price <= 0) return 50;
    const above = price > poc;
    if (consensusDirection === 'BULLISH') return above ? 68 : 42;
    if (consensusDirection === 'BEARISH') return above ? 42 : 68;
    return 50;
  }

  private pocFromVpvr(micro: any): number | null {
    // If VPVR POC is provided via microstructure, use it; otherwise null.
    return micro && typeof micro.pocPrice === 'number' ? micro.pocPrice : null;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Horizon + summary
  // ─────────────────────────────────────────────────────────────────────
  private expectedHorizon(tfResults: TimeframeReversalIntel[]): string {
    const edgeOf = (tfs: string[]) => {
      const rows = tfResults.filter(t => tfs.includes(t.timeframe) && t.direction !== 'NEUTRAL');
      if (rows.length === 0) return -1;
      return rows.reduce((s, t) => s + t.historicalReversalPct, 0) / rows.length;
    };
    const microEdge = edgeOf(['5m', '3m', '1m']);
    const midEdge = edgeOf(['1h', '30m', '15m']);
    const htfEdge = edgeOf(['1d', '12h', '4h', '2h']);
    if (htfEdge >= Math.max(microEdge, midEdge)) return '15m-1h';
    if (midEdge >= microEdge) return '5m-15m';
    return '30s-5m';
  }

  private buildSummary(
    symbol: string,
    consensusDirection: ReversalDirection,
    overallScore: number,
    horizon: string,
    bull: number,
    bear: number,
    tfResults: TimeframeReversalIntel[]
  ): string {
    if (consensusDirection === 'NEUTRAL') {
      return `${symbol}: no clean MTF reversal consensus (bull ${bull.toFixed(0)}% / bear ${bear.toFixed(0)}%) — W%R extremes alone not enough, waiting for orderflow confirmation.`;
    }
    const keyTfs = tfResults.filter(t => t.direction === consensusDirection && t.historicalReversalPct >= 55)
      .slice(0, 4).map(t => t.timeframe).join(', ');
    return `${symbol}: ${consensusDirection} reversal thesis ${overallScore}/100 — ${keyTfs || 'mixed TFs'} show historical edge, expected horizon ${horizon}.`;
  }
}

function cfgWeight(timeframe: string): number {
  return TF_CONFIGS.find(c => c.timeframe === timeframe)?.weight || 1;
}
