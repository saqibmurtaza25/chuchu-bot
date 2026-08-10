import { IndicatorResult, MicrostructureState, MarketRegimeState, SignalResult, SignalType, HunterState } from '@chuchu/shared';
import { ScreenerConfig } from './ScreenerConfig';

/**
 * SignalEngine - CHUCHU BOT v2.0 Decision Engine
 *
 * Implements AUTO Mode switching between Mean Reversion and Momentum Continuation.
 * Uses a modifier-based explainable pipeline to transform raw Hunter Score into Setup Quality.
 */
export class SignalEngine {

  public evaluate(
    symbol: string,
    lastPrice: number,
    indicators?: IndicatorResult | null,
    microstructure?: MicrostructureState | null,
    regime?: MarketRegimeState | null,
    hunter?: HunterState | null,
    minSetupQuality: number = 75,
    htfTrendFilter: boolean = false
  ): SignalResult {

    const reasons: string[] = [];
    const modifiers: { name: string; value: number }[] = [];

    const rawHunterScore = hunter?.hunterScore || 50;
    const rsi5m = indicators?.rsiMultiTimeframe?.tf5m || 50;

    // Default setup direction based on RSI momentum
    const isShortSetup = rsi5m > 50;

    // 1. Detect Signal Mode
    const isTrending = regime?.regime === 'TRENDING_BULL' || regime?.regime === 'TRENDING_BEAR';
    const modeName = isTrending ? 'MOMENTUM' : 'MEAN_REVERSION';
    reasons.push(`Execution Mode: ${modeName} (Regime=${regime?.regime || 'MEAN_REVERTING'})`);

    const config = ScreenerConfig.trendModifiers;

    // =================================================================
    // MODIFIER MODULES
    // =================================================================

    if (modeName === 'MEAN_REVERSION') {
      // ---- MEAN REVERSION MODIFIERS ----

      // ADX Trend Penalty (strong trend is a negative for reversion)
      const adx = regime?.adx || indicators?.adx14.adx || 15;
      let adxPenalty = 0;
      for (const tier of config.adxTiers) {
        if (adx >= (tier.min || 0) && adx <= (tier.max || 100)) {
          adxPenalty = tier.penalty;
          break;
        }
      }
      if (adxPenalty !== 0) {
        modifiers.push({ name: `Strong Trend Penalty (ADX=${adx.toFixed(1)})`, value: adxPenalty });
      }

      // EMA Trend Alignment Penalty (counter-trend entry is penalized)
      if (indicators) {
        const { ema20, ema50, ema200 } = indicators;
        const bullishAligned = ema20 > ema50 && ema50 > ema200;
        const bearishAligned = ema20 < ema50 && ema50 < ema200;

        if (isShortSetup && bullishAligned) {
          modifiers.push({ name: 'Bullish EMA Trend Alignment Penalty', value: config.emaAlignmentPenalty });
        } else if (!isShortSetup && bearishAligned) {
          modifiers.push({ name: 'Bearish EMA Trend Alignment Penalty', value: config.emaAlignmentPenalty });
        }
      }

      // Orderbook Imbalance Modifier (we want counter-volume to support rejection)
      if (microstructure) {
        const buyerPct = microstructure.orderbookBuyerPct || 50;
        if (isShortSetup) { // We want sellers to dominate (buyerPct < 50)
          if (buyerPct < 50) {
            const bonus = Math.round((50 - buyerPct) * 0.3);
            modifiers.push({ name: 'Seller Dominance OB Support', value: Math.min(config.orderbookImbalanceMaxBonus, bonus) });
          } else {
            modifiers.push({ name: 'Buyer Dominance OB Opposition Penalty', value: -10 });
          }
        } else { // We want buyers to dominate (buyerPct > 50)
          if (buyerPct > 50) {
            const bonus = Math.round((buyerPct - 50) * 0.3);
            modifiers.push({ name: 'Buyer Dominance OB Support', value: Math.min(config.orderbookImbalanceMaxBonus, bonus) });
          } else {
            modifiers.push({ name: 'Seller Dominance OB Opposition Penalty', value: -10 });
          }
        }
      }

      // CVD Flow Modifier (we want counter CVD pressure)
      if (microstructure && microstructure.cvd !== 0) {
        if (isShortSetup && microstructure.cvd < 0) {
          modifiers.push({ name: 'Negative CVD Flow Support', value: config.cvdBonus });
        } else if (!isShortSetup && microstructure.cvd > 0) {
          modifiers.push({ name: 'Positive CVD Flow Support', value: config.cvdBonus });
        }
      }

    } else {
      // ---- MOMENTUM / BREAKOUT MODIFIERS ----

      // Trend Strength Bonus (high ADX is positive for breakout)
      const adx = regime?.adx || indicators?.adx14.adx || 15;
      if (adx > 30) {
        modifiers.push({ name: 'Strong Trend Momentum Bonus', value: 20 });
      } else if (adx >= 22) {
        modifiers.push({ name: 'Moderate Trend Momentum Bonus', value: 10 });
      }

      // EMA Trend Alignment Bonus (aligning with breakout is positive)
      if (indicators) {
        const { ema20, ema50, ema200 } = indicators;
        const bullishAligned = ema20 > ema50 && ema50 > ema200;
        const bearishAligned = ema20 < ema50 && ema50 < ema200;

        if (!isShortSetup && bullishAligned) {
          modifiers.push({ name: 'Bullish EMA Trend Alignment Bonus', value: 10 });
        } else if (isShortSetup && bearishAligned) {
          modifiers.push({ name: 'Bearish EMA Trend Alignment Bonus', value: 10 });
        }
      }

      // Orderbook Imbalance Modifier (we want volume to follow breakout)
      if (microstructure) {
        const buyerPct = microstructure.orderbookBuyerPct || 50;
        if (!isShortSetup) { // Buying breakout -> we want buyers dominating
          if (buyerPct > 50) {
            const bonus = Math.round((buyerPct - 50) * 0.3);
            modifiers.push({ name: 'Buyer Dominance OB Support', value: Math.min(config.orderbookImbalanceMaxBonus, bonus) });
          }
        } else { // Selling breakdown -> we want sellers dominating
          if (buyerPct < 50) {
            const bonus = Math.round((50 - buyerPct) * 0.3);
            modifiers.push({ name: 'Seller Dominance OB Support', value: Math.min(config.orderbookImbalanceMaxBonus, bonus) });
          }
        }
      }

      // CVD Flow Modifier (we want CVD backing the breakout)
      if (microstructure && microstructure.cvd !== 0) {
        if (!isShortSetup && microstructure.cvd > 0) {
          modifiers.push({ name: 'Positive CVD Flow Support', value: config.cvdBonus });
        } else if (isShortSetup && microstructure.cvd < 0) {
          modifiers.push({ name: 'Negative CVD Flow Support', value: config.cvdBonus });
        }
      }

      // Volatility Expansion Breakout Bonus
      if (regime?.volatilityRatio && regime.volatilityRatio > 1.5) {
        modifiers.push({ name: 'Volatility Expansion Breakout Bonus', value: 10 });
      }
    }

    // Microstructure Sweep/Whale General Bonuses
    if (microstructure?.sweepDetected) {
      modifiers.push({ name: 'Liquidity Sweep Confirmation', value: 10 });
    }
    if (microstructure?.whaleActivity) {
      modifiers.push({ name: 'Whale Execution Support', value: 5 });
    }

    // =================================================================
    // SCORE SUMMATION & RESOLUTION
    // =================================================================

    const modifierSum = modifiers.reduce((sum, m) => sum + m.value, 0);
    const setupQuality = Math.min(100, Math.max(0, rawHunterScore + modifierSum));

    // Determine final signal action based on Setup Quality threshold
    let signal: SignalType = 'NEUTRAL';
    if (setupQuality >= minSetupQuality) {
      if (modeName === 'MEAN_REVERSION') {
        signal = isShortSetup ? 'SELL' : 'BUY';
      } else {
        signal = isShortSetup ? 'BUY' : 'SELL';
      }
    }

    // HTF (Higher-Timeframe) Trend Filter — hard gate that only allows entries
    // aligned with the 1h/4h RSI bias. Counter-trend scalps are the #1 cause of
    // low win rate, so this blocks them instead of just penalising them.
    if (htfTrendFilter && signal !== 'NEUTRAL') {
      const rsi1h = indicators?.rsiMultiTimeframe?.tf1h ?? 50;
      const rsi4h = indicators?.rsiMultiTimeframe?.tf4h ?? 50;
      const htfRsi = (rsi1h + rsi4h) / 2;
      if (signal === 'BUY' && htfRsi < 48) {
        signal = 'NEUTRAL';
        reasons.push(`HTF Filter: BUY blocked (1h/4h RSI ${htfRsi.toFixed(1)} < 48 — bearish bias)`);
      } else if (signal === 'SELL' && htfRsi > 52) {
        signal = 'NEUTRAL';
        reasons.push(`HTF Filter: SELL blocked (1h/4h RSI ${htfRsi.toFixed(1)} > 52 — bullish bias)`);
      }
    }

    // Log applied modifiers in reasons list
    for (const mod of modifiers) {
      reasons.push(`${mod.value >= 0 ? '+' : ''}${mod.value} ${mod.name}`);
    }
    if (reasons.length === 1) {
      reasons.push('Consolidating — Modifiers inactive');
    }

    // SL/TP calculations using ATR, Market Regime, and Liquidity
    const atr = indicators?.atr14 || lastPrice * 0.008;
    
    // Default multipliers
    let slMultiplier = 1.0;
    let tpMultiplier = 2.0;

    // Adjust based on Market Regime
    if (isTrending) {
      // Trending: Wider SL to absorb pullbacks, Bigger TP for runners
      slMultiplier = 1.5;
      tpMultiplier = 3.5;
    } else if (modeName === 'MEAN_REVERSION') {
      // Range/Mean-Reversion: Tighter SL, Smaller TP
      slMultiplier = 0.8;
      tpMultiplier = 1.5;
    }

    // Adjust based on Liquidity (Volume/Orderbook Depth)
    // If orderbook is thin (risk of slippage/spikes), widen SL slightly
    if (microstructure && microstructure.totalBidDepth + microstructure.totalAskDepth < 50000) {
       slMultiplier += 0.2;
    }

    let stopLoss = lastPrice;
    let takeProfit = lastPrice;

    if (signal === 'BUY') {
      stopLoss   = parseFloat((lastPrice - slMultiplier * atr).toFixed(4));
      takeProfit = parseFloat((lastPrice + tpMultiplier * atr).toFixed(4));
    } else if (signal === 'SELL') {
      stopLoss   = parseFloat((lastPrice + slMultiplier * atr).toFixed(4));
      takeProfit = parseFloat((lastPrice - tpMultiplier * atr).toFixed(4));
    }

    // Recalculate Risk Reward Ratio dynamically
    const riskRewardRatio = parseFloat((tpMultiplier / slMultiplier).toFixed(2));

    return {
      symbol,
      signal,
      compositeScore: parseFloat((setupQuality / 100).toFixed(3)),
      confidence: setupQuality, // Backwards compatible mapping to UI Confidence %
      hunterScore: rawHunterScore,
      setupQuality,
      entryPrice: lastPrice,
      stopLoss,
      takeProfit,
      riskRewardRatio,
      timeframe: '30s-3m SCALP',
      reasons,
      modifiers,
      timestamp: Date.now()
    };
  }
}
