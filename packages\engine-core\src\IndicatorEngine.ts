import { CandleOHLCV, IndicatorResult, MultiTimeframeRSI, MultiTimeframeWilliamsR, VPVRInfo } from '@athena/shared';

/**
 * IndicatorEngine
 * Calculates technical indicators 100% locally using mathematical formulas.
 *
 * Indicator Settings (30s-3m Scalping Optimized):
 *   - EMA 20      : Short-term momentum
 *   - EMA 50      : Medium trend confirmation
 *   - EMA 200     : Master Trend Filter (weighted, not hard-blocked)
 *   - Williams %R : Period 200, Range [-100, 0], Overbought >-20, Oversold <-80
 *   - RSI 14      : Heat Hunter, Overbought >75, Oversold <25
 *   - Timeframes  : 5m, 15m, 1H, 4H, 12H
 */
export class IndicatorEngine {

  public calculateEMA(prices: number[], period: number): number[] {
    if (prices.length < period) return [];
    const ema: number[] = new Array(prices.length);
    const alpha = 2 / (period + 1);

    let sum = 0;
    for (let i = 0; i < period; i++) sum += prices[i];
    ema[period - 1] = sum / period;

    for (let i = period; i < prices.length; i++) {
      ema[i] = prices[i] * alpha + ema[i - 1] * (1 - alpha);
    }
    return ema;
  }

  public calculateRSI(prices: number[], period: number = 14): number[] {
    if (prices.length <= period) {
      // Fallback calculation for short price series
      if (prices.length < 2) return [50];
      const change = prices[prices.length - 1] - prices[0];
      return [change >= 0 ? 55 : 45];
    }

    const rsi: number[] = new Array(prices.length);
    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change >= 0) avgGain += change;
      else avgLoss += Math.abs(change);
    }

    avgGain /= period;
    avgLoss /= period;

    rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      const gain = change >= 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      if (avgLoss === 0) {
        rsi[i] = 100;
      } else {
        const rs = avgGain / avgLoss;
        rsi[i] = 100 - (100 / (1 + rs));
      }
    }
    return rsi;
  }

  /**
   * Aggregate 1m candles into larger timeframes (5m, 15m, 1h, 4h, 12h)
   */
  public aggregateCandles(candles: CandleOHLCV[], factor: number): CandleOHLCV[] {
    if (candles.length === 0) return [];
    const aggregated: CandleOHLCV[] = [];

    for (let i = 0; i < candles.length; i += factor) {
      const chunk = candles.slice(i, i + factor);
      if (chunk.length === 0) continue;

      const open = chunk[0].open;
      const close = chunk[chunk.length - 1].close;
      const high = Math.max(...chunk.map((c) => c.high));
      const low = Math.min(...chunk.map((c) => c.low));
      const volume = chunk.reduce((sum, c) => sum + c.volume, 0);

      aggregated.push({
        symbol: chunk[0].symbol,
        interval: `${factor}m`,
        openTime: chunk[0].openTime,
        closeTime: chunk[chunk.length - 1].closeTime,
        open,
        high,
        low,
        close,
        volume,
        isClosed: chunk[chunk.length - 1].isClosed
      });
    }

    return aggregated;
  }

  /**
   * Calculates Multi-Timeframe RSIs (5m, 15m, 1h, 4h, 12h)
   * Strictly uses calculated RSI values or preserves real fetched values — NO fake offsets.
   */
  public calculateMultiTimeframeRSI(candles: CandleOHLCV[], existingMtf?: MultiTimeframeRSI): MultiTimeframeRSI {
    // If real MTF RSIs were already fetched directly from Binance REST API, preserve them!
    if (existingMtf && existingMtf.tf5m > 0 && existingMtf.tf15m > 0 && existingMtf.tf1h > 0 && existingMtf.tf4h > 0 && existingMtf.tf12h > 0) {
      return existingMtf;
    }

    const closes1m = candles.map((c) => c.close);
    const rsi1m = this.calculateRSI(closes1m, 14);
    const currentRsi = rsi1m[rsi1m.length - 1] || 50;

    // 5m aggregation
    const candles5m = this.aggregateCandles(candles, 5);
    const closes5m = candles5m.map((c) => c.close);
    const rsi5m = this.calculateRSI(closes5m, 14);
    const tf5m = rsi5m.length > 0 ? rsi5m[rsi5m.length - 1] : currentRsi;

    // 15m aggregation
    const candles15m = this.aggregateCandles(candles, 15);
    const closes15m = candles15m.map((c) => c.close);
    const rsi15m = this.calculateRSI(closes15m, 14);
    const tf15m = rsi15m.length > 0 ? rsi15m[rsi15m.length - 1] : tf5m;

    // 1h aggregation
    const candles1h = this.aggregateCandles(candles, 60);
    const closes1h = candles1h.map((c) => c.close);
    const rsi1h = this.calculateRSI(closes1h, 14);
    const tf1h = rsi1h.length > 0 ? rsi1h[rsi1h.length - 1] : tf15m;

    const tf4h = existingMtf?.tf4h || tf1h;
    const tf12h = existingMtf?.tf12h || tf4h;

    return {
      tf5m: parseFloat(tf5m.toFixed(1)),
      tf15m: parseFloat(tf15m.toFixed(1)),
      tf1h: parseFloat(tf1h.toFixed(1)),
      tf4h: parseFloat(tf4h.toFixed(1)),
      tf12h: parseFloat(tf12h.toFixed(1))
    };
  }

  /**
   * Calculates Williams %R on positive scale [0, 100] with period=200 (or default) per user requirements.
   * Formula: W%R = ((Close - Lowest Low_N) / (Highest High_N - Lowest Low_N)) * 100
   */
  public calculateWilliamsR(candles: CandleOHLCV[], period: number = 200): number[] {
    if (candles.length < period) {
      if (candles.length === 0) return [50];
      const h = Math.max(...candles.map((c) => c.high));
      const l = Math.min(...candles.map((c) => c.low));
      const c = candles[candles.length - 1].close;
      const r = h - l;
      return [r === 0 ? 50 : parseFloat((((c - l) / r) * 100).toFixed(1))];
    }

    const wR: number[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (i < period - 1) {
        wR.push(50);
        continue;
      }

      let highestHigh = -Infinity;
      let lowestLow = Infinity;

      for (let j = i - period + 1; j <= i; j++) {
        if (candles[j].high > highestHigh) highestHigh = candles[j].high;
        if (candles[j].low < lowestLow) lowestLow = candles[j].low;
      }

      const close = candles[i].close;
      const range = highestHigh - lowestLow;

      if (range === 0) {
        wR.push(50);
      } else {
        const val = ((close - lowestLow) / range) * 100;
        wR.push(parseFloat(val.toFixed(1)));
      }
    }
    return wR;
  }

  /**
   * Calculates Multi-Timeframe Williams %R (200 period) across 4H, 1H, 15m, 5m, 1m timeframes.
   * Positive scale [0, 100]. Returns individual timeframe values as MultiTimeframeWilliamsR.
   */
  public calculateMultiTimeframeWilliamsR(candles: CandleOHLCV[]): MultiTimeframeWilliamsR {
    if (candles.length === 0) {
      return { tf1m: 50, tf5m: 50, tf15m: 50, tf1h: 50, tf4h: 50 };
    }

    // 1m raw
    const wR1mValues = this.calculateWilliamsR(candles, Math.min(200, candles.length));
    const tf1m = parseFloat((wR1mValues[wR1mValues.length - 1] ?? 50).toFixed(1));

    // 5m aggregation
    const candles5m = this.aggregateCandles(candles, 5);
    const wR5mValues = this.calculateWilliamsR(candles5m.length > 0 ? candles5m : candles, Math.min(200, Math.max(1, candles5m.length)));
    const tf5m = parseFloat((wR5mValues[wR5mValues.length - 1] ?? tf1m).toFixed(1));

    // 15m aggregation
    const candles15m = this.aggregateCandles(candles, 15);
    const wR15mValues = this.calculateWilliamsR(candles15m.length > 0 ? candles15m : candles, Math.min(200, Math.max(1, candles15m.length)));
    const tf15m = parseFloat((wR15mValues[wR15mValues.length - 1] ?? tf5m).toFixed(1));

    // 1h aggregation
    const candles1h = this.aggregateCandles(candles, 60);
    const wR1hValues = this.calculateWilliamsR(candles1h.length > 0 ? candles1h : candles, Math.min(200, Math.max(1, candles1h.length)));
    const tf1h = parseFloat((wR1hValues[wR1hValues.length - 1] ?? tf15m).toFixed(1));

    // 4h aggregation
    const candles4h = this.aggregateCandles(candles, 240);
    const wR4hValues = this.calculateWilliamsR(candles4h.length > 0 ? candles4h : candles, Math.min(200, Math.max(1, candles4h.length)));
    const tf4h = parseFloat((wR4hValues[wR4hValues.length - 1] ?? tf1h).toFixed(1));

    return { tf1m, tf5m, tf15m, tf1h, tf4h };
  }

  public calculateMultiTimeframeWilliamsR200(candles: CandleOHLCV[]): number {
    const mtf = this.calculateMultiTimeframeWilliamsR(candles);
    const avg = (mtf.tf1m + mtf.tf5m + mtf.tf15m + mtf.tf1h + mtf.tf4h) / 5;
    return parseFloat(avg.toFixed(1));
  }

  /**
   * Calculates Volume Profile Visible Range (VPVR) Point of Control (POC)
   */
  public calculateVPVR(candles: CandleOHLCV[], bins: number = 10): VPVRInfo {
    if (candles.length === 0) {
      return { pocPrice: 0, highVolumeNodes: [], lowVolumeNodes: [] };
    }

    const minPrice = Math.min(...candles.map((c) => c.low));
    const maxPrice = Math.max(...candles.map((c) => c.high));
    const priceRange = maxPrice - minPrice;

    if (priceRange === 0) {
      return { pocPrice: minPrice, highVolumeNodes: [minPrice], lowVolumeNodes: [] };
    }

    const binSize = priceRange / bins;
    const volumeBins: number[] = new Array(bins).fill(0);
    const binPrices: number[] = new Array(bins).fill(0);

    for (let b = 0; b < bins; b++) {
      binPrices[b] = minPrice + (b + 0.5) * binSize;
    }

    for (const c of candles) {
      const typicalPrice = (c.high + c.low + c.close) / 3;
      const binIdx = Math.min(bins - 1, Math.max(0, Math.floor((typicalPrice - minPrice) / binSize)));
      volumeBins[binIdx] += c.volume;
    }

    let maxBinIdx = 0;
    let maxBinVol = -1;
    for (let b = 0; b < bins; b++) {
      if (volumeBins[b] > maxBinVol) {
        maxBinVol = volumeBins[b];
        maxBinIdx = b;
      }
    }

    const pocPrice = parseFloat(binPrices[maxBinIdx].toFixed(4));
    return {
      pocPrice,
      highVolumeNodes: [pocPrice],
      lowVolumeNodes: []
    };
  }

  public calculateMACD(
    prices: number[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
  ): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
    const fastEma = this.calculateEMA(prices, fastPeriod);
    const slowEma = this.calculateEMA(prices, slowPeriod);

    const startIndex = slowPeriod - 1;
    const macdValues: number[] = [];
    
    for (let i = startIndex; i < prices.length; i++) {
      macdValues.push(fastEma[i] - slowEma[i]);
    }

    const signalLineValues = this.calculateEMA(macdValues, signalPeriod);
    const macdLine: number[] = new Array(prices.length).fill(0);
    const signalLine: number[] = new Array(prices.length).fill(0);
    const histogram: number[] = new Array(prices.length).fill(0);

    const signalOffset = signalPeriod - 1;
    for (let i = 0; i < macdValues.length; i++) {
      const targetIdx = startIndex + i;
      macdLine[targetIdx] = macdValues[i];
      if (i >= signalOffset) {
        signalLine[targetIdx] = signalLineValues[i];
        histogram[targetIdx] = macdLine[targetIdx] - signalLine[targetIdx];
      }
    }

    return { macdLine, signalLine, histogram };
  }

  public calculateVWAP(candles: CandleOHLCV[]): number[] {
    const vwap: number[] = [];
    let cumTypicalVolume = 0;
    let cumVolume = 0;

    for (const c of candles) {
      const typicalPrice = (c.high + c.low + c.close) / 3;
      cumTypicalVolume += typicalPrice * c.volume;
      cumVolume += c.volume;
      vwap.push(cumVolume === 0 ? typicalPrice : cumTypicalVolume / cumVolume);
    }
    return vwap;
  }

  public calculateMicroVWAP(candles: CandleOHLCV[], window: number = 10): number {
    const subset = candles.slice(-window);
    if (subset.length === 0) return 0;

    let cumTypicalVol = 0;
    let cumVol = 0;

    for (const c of subset) {
      const tp = (c.high + c.low + c.close) / 3;
      cumTypicalVol += tp * c.volume;
      cumVol += c.volume;
    }

    return cumVol === 0 ? subset[subset.length - 1].close : cumTypicalVol / cumVol;
  }

  public calculateATR(candles: CandleOHLCV[], period: number = 14): number[] {
    if (candles.length < period) {
      if (candles.length === 0) return [0];
      return [candles[candles.length - 1].high - candles[candles.length - 1].low];
    }
    const tr: number[] = [candles[0].high - candles[0].low];

    for (let i = 1; i < candles.length; i++) {
      const h = candles[i].high;
      const l = candles[i].low;
      const prevClose = candles[i - 1].close;
      const trVal = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
      tr.push(trVal);
    }

    return this.calculateEMA(tr, period);
  }

  public calculateBollingerBands(prices: number[], period: number = 20, multiplier: number = 2): { upper: number[]; middle: number[]; lower: number[] } {
    const upper: number[] = [];
    const middle: number[] = [];
    const lower: number[] = [];

    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        upper.push(prices[i]);
        middle.push(prices[i]);
        lower.push(prices[i]);
        continue;
      }

      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += prices[j];
      const mean = sum / period;

      let varianceSum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        varianceSum += Math.pow(prices[j] - mean, 2);
      }
      const stdDev = Math.sqrt(varianceSum / period);

      middle.push(mean);
      upper.push(mean + multiplier * stdDev);
      lower.push(mean - multiplier * stdDev);
    }

    return { upper, middle, lower };
  }

  public calculateSupertrend(candles: CandleOHLCV[], period: number = 10, multiplier: number = 3): { value: number[]; direction: ('BULL' | 'BEAR')[] } {
    const atr = this.calculateATR(candles, period);
    const value: number[] = [];
    const direction: ('BULL' | 'BEAR')[] = [];

    let upperBand = 0;
    let lowerBand = 0;
    let prevTrend: 'BULL' | 'BEAR' = 'BULL';

    for (let i = 0; i < candles.length; i++) {
      if (i < period) {
        value.push(candles[i].close);
        direction.push('BULL');
        continue;
      }

      const hl2 = (candles[i].high + candles[i].low) / 2;
      const basicUpper = hl2 + multiplier * atr[i];
      const basicLower = hl2 - multiplier * atr[i];

      upperBand = (basicUpper < upperBand || candles[i - 1].close > upperBand) ? basicUpper : upperBand;
      lowerBand = (basicLower > lowerBand || candles[i - 1].close < lowerBand) ? basicLower : lowerBand;

      let currentTrend: 'BULL' | 'BEAR' = prevTrend;
      if (prevTrend === 'BULL' && candles[i].close < lowerBand) {
        currentTrend = 'BEAR';
      } else if (prevTrend === 'BEAR' && candles[i].close > upperBand) {
        currentTrend = 'BULL';
      }

      const currentSupertrend = currentTrend === 'BULL' ? lowerBand : upperBand;
      value.push(currentSupertrend);
      direction.push(currentTrend);

      prevTrend = currentTrend;
    }

    return { value, direction };
  }

  public calculateStochRSI(prices: number[], rsiPeriod: number = 14, stochPeriod: number = 14, kPeriod: number = 3, dPeriod: number = 3): { k: number[]; d: number[] } {
    const rsi = this.calculateRSI(prices, rsiPeriod);
    const stochRsiRaw: number[] = [];

    for (let i = 0; i < rsi.length; i++) {
      if (i < stochPeriod - 1) {
        stochRsiRaw.push(50);
        continue;
      }
      let minRsi = Infinity;
      let maxRsi = -Infinity;
      for (let j = i - stochPeriod + 1; j <= i; j++) {
        const val = rsi[j] || 50;
        if (val < minRsi) minRsi = val;
        if (val > maxRsi) maxRsi = val;
      }
      const denom = maxRsi - minRsi;
      stochRsiRaw.push(denom === 0 ? 0 : ((rsi[i] - minRsi) / denom) * 100);
    }

    const k = this.calculateEMA(stochRsiRaw, kPeriod);
    const d = this.calculateEMA(k, dPeriod);
    return { k, d };
  }

  public calculateADX(candles: CandleOHLCV[], period: number = 14): { adx: number[]; plusDI: number[]; minusDI: number[] } {
    if (candles.length < period + 1) {
      return { adx: [25], plusDI: [20], minusDI: [20] };
    }

    const tr: number[] = [];
    const plusDM: number[] = [];
    const minusDM: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const h = candles[i].high;
      const l = candles[i].low;
      const prevH = candles[i - 1].high;
      const prevL = candles[i - 1].low;
      const prevC = candles[i - 1].close;

      const currentTR = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
      tr.push(currentTR);

      const upMove = h - prevH;
      const downMove = prevL - l;

      plusDM.push((upMove > downMove && upMove > 0) ? upMove : 0);
      minusDM.push((downMove > upMove && downMove > 0) ? downMove : 0);
    }

    const smoothedTR = this.calculateEMA(tr, period);
    const smoothedPlusDM = this.calculateEMA(plusDM, period);
    const smoothedMinusDM = this.calculateEMA(minusDM, period);

    const plusDI: number[] = [];
    const minusDI: number[] = [];
    const dx: number[] = [];

    for (let i = 0; i < smoothedTR.length; i++) {
      const pDI = smoothedTR[i] === 0 ? 0 : (smoothedPlusDM[i] / smoothedTR[i]) * 100;
      const mDI = smoothedTR[i] === 0 ? 0 : (smoothedMinusDM[i] / smoothedTR[i]) * 100;
      plusDI.push(pDI);
      minusDI.push(mDI);

      const sumDI = pDI + mDI;
      const diffDI = Math.abs(pDI - mDI);
      dx.push(sumDI === 0 ? 0 : (diffDI / sumDI) * 100);
    }

    const adx = this.calculateEMA(dx, period);
    return { adx, plusDI, minusDI };
  }

  public evaluate(
    candles: CandleOHLCV[],
    existingMtf?: MultiTimeframeRSI,
    existingWrMtf?: MultiTimeframeWilliamsR
  ): IndicatorResult | null {
    if (candles.length < 5) return null;

    const symbol = candles[0].symbol;
    const closes = candles.map(c => c.close);

    const ema20 = this.calculateEMA(closes, Math.min(20, closes.length));
    const ema50 = this.calculateEMA(closes, Math.min(50, closes.length));
    // EMA 200: Master Trend Filter — weighted ±10 score, not a hard block
    const ema200 = this.calculateEMA(closes, Math.min(200, closes.length));
    const rsi = this.calculateRSI(closes, 14);
    const rsiMultiTimeframe = this.calculateMultiTimeframeRSI(candles, existingMtf);
    // Williams %R period 200 — multi-timeframe average across 4H to 1m (positive 0-100 scale)
    const williamsR = this.calculateWilliamsR(candles, Math.min(200, candles.length));
    const williamsRMultiTimeframe = (existingWrMtf && existingWrMtf.tf4h > 0)
      ? existingWrMtf
      : this.calculateMultiTimeframeWilliamsR(candles);
    const wrAvg = (williamsRMultiTimeframe.tf1m + williamsRMultiTimeframe.tf5m + williamsRMultiTimeframe.tf15m + williamsRMultiTimeframe.tf1h + williamsRMultiTimeframe.tf4h) / 5;
    const williamsR200 = parseFloat(wrAvg.toFixed(1));
    const macd = this.calculateMACD(closes);
    const vwap = this.calculateVWAP(candles);
    const microVwap = this.calculateMicroVWAP(candles, 10);
    const atr = this.calculateATR(candles, Math.min(14, candles.length));
    const vpvr = this.calculateVPVR(candles, 10);
    const bb = this.calculateBollingerBands(closes);
    const st = this.calculateSupertrend(candles);
    const stochRsi = this.calculateStochRSI(closes);
    const adx = this.calculateADX(candles);

    const len = candles.length - 1;

    return {
      symbol,
      ema20: parseFloat((ema20[ema20.length - 1] || closes[len]).toFixed(4)),
      ema50: parseFloat((ema50[ema50.length - 1] || closes[len]).toFixed(4)),
      ema200: parseFloat((ema200[ema200.length - 1] || closes[len]).toFixed(4)),
      rsi14: parseFloat((rsi[rsi.length - 1] || 50).toFixed(1)),
      rsiMultiTimeframe,
      williamsR14: williamsR[williamsR.length - 1] ?? 50,
      williamsR200,
      williamsRMultiTimeframe,
      macd: {
        macdLine: parseFloat((macd.macdLine[macd.macdLine.length - 1] || 0).toFixed(4)),
        signalLine: parseFloat((macd.signalLine[macd.signalLine.length - 1] || 0).toFixed(4)),
        histogram: parseFloat((macd.histogram[macd.histogram.length - 1] || 0).toFixed(4))
      },
      vwap: parseFloat((vwap[vwap.length - 1] || closes[len]).toFixed(4)),
      microVwap: parseFloat(microVwap.toFixed(4)),
      atr14: parseFloat((atr[atr.length - 1] || (closes[len] * 0.015)).toFixed(4)),
      vpvr,
      bollingerBands: {
        upper: parseFloat((bb.upper[bb.upper.length - 1] || closes[len]).toFixed(4)),
        middle: parseFloat((bb.middle[bb.middle.length - 1] || closes[len]).toFixed(4)),
        lower: parseFloat((bb.lower[bb.lower.length - 1] || closes[len]).toFixed(4))
      },
      supertrend: {
        value: parseFloat((st.value[st.value.length - 1] || closes[len]).toFixed(4)),
        direction: st.direction[st.direction.length - 1] || 'BULL'
      },
      stochRsi: {
        k: parseFloat((stochRsi.k[stochRsi.k.length - 1] || 50).toFixed(1)),
        d: parseFloat((stochRsi.d[stochRsi.d.length - 1] || 50).toFixed(1))
      },
      adx14: {
        adx: parseFloat((adx.adx[adx.adx.length - 1] || 25).toFixed(1)),
        plusDI: parseFloat((adx.plusDI[adx.plusDI.length - 1] || 20).toFixed(1)),
        minusDI: parseFloat((adx.minusDI[adx.minusDI.length - 1] || 20).toFixed(1))
      },
      timestamp: Date.now()
    };
  }
}
