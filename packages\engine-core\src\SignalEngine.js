"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalEngine = void 0;
/**
 * SignalEngine
 * Multi-factor decision matrix optimized for 30-second to 3-minute high-frequency scalping.
 * Computes AI Score strictly from real indicator metrics and matches reasons matrix.
 */
class SignalEngine {
    evaluate(symbol, lastPrice, indicators, microstructure, regime) {
        let scoreSum = 0;
        let weightSum = 0;
        const reasons = [];
        // 1. Multi-Timeframe RSI & Scalp Momentum (Weight: 0.35)
        if (indicators) {
            const trendWeight = 0.35;
            weightSum += trendWeight;
            let trendScore = 0;
            const mt = indicators.rsiMultiTimeframe;
            if (mt) {
                reasons.push(`RSI 5m=${mt.tf5m} | 15m=${mt.tf15m} | 1H=${mt.tf1h}`);
                if (mt.tf5m > 60 && mt.tf15m > 55) {
                    trendScore += 0.5;
                    reasons.push(`Bullish RSI Momentum Impulse (5m ${mt.tf5m})`);
                }
                else if (mt.tf5m < 40 && mt.tf15m < 45) {
                    trendScore -= 0.5;
                    reasons.push(`Bearish RSI Momentum Breakdown (5m ${mt.tf5m})`);
                }
            }
            if (indicators.williamsR14 !== undefined) {
                reasons.push(`WMR 14=${indicators.williamsR14}`);
                if (indicators.williamsR14 > -30) {
                    trendScore += 0.3;
                }
                else if (indicators.williamsR14 < -70) {
                    trendScore -= 0.3;
                }
            }
            if (indicators.microVwap && lastPrice > indicators.microVwap) {
                trendScore += 0.2;
                reasons.push(`Price Above Micro-VWAP ($${indicators.microVwap.toFixed(2)})`);
            }
            else if (indicators.microVwap && lastPrice < indicators.microVwap) {
                trendScore -= 0.2;
                reasons.push(`Price Below Micro-VWAP ($${indicators.microVwap.toFixed(2)})`);
            }
            scoreSum += trendScore * trendWeight;
        }
        // 2. Orderbook Buyers & CVD Factor (Weight: 0.35)
        if (microstructure) {
            const microWeight = 0.35;
            weightSum += microWeight;
            const buyerPct = microstructure.orderbookBuyerPct || 50;
            reasons.push(`Orderbook Buyers ${buyerPct.toFixed(0)}% / Sellers ${(100 - buyerPct).toFixed(0)}%`);
            let microScore = (buyerPct - 50) / 50; // [-1, +1]
            const cvdMb = (microstructure.cvd / 1_000_000).toFixed(1);
            if (microstructure.cvd !== 0) {
                reasons.push(`CVD Delta ${microstructure.cvd >= 0 ? `+$${cvdMb}M` : `-$${Math.abs(Number(cvdMb))}M`}`);
            }
            if (microstructure.sweepDetected) {
                microScore += buyerPct >= 50 ? 0.3 : -0.3;
                reasons.push('Liquidity Sweep Impulse Confirmed');
            }
            if (microstructure.whaleActivity) {
                reasons.push('Whale Aggressive Order Execution Detected');
            }
            if (microstructure.spoofingProbabilityPct > 15) {
                reasons.push(`Spoofing Risk ${microstructure.spoofingProbabilityPct}%`);
            }
            scoreSum += Math.max(-1, Math.min(1, microScore)) * microWeight;
        }
        // 3. Market Regime Factor (Weight: 0.30)
        if (regime) {
            const regimeWeight = 0.30;
            weightSum += regimeWeight;
            let regimeScore = 0;
            if (regime.regime === 'TRENDING_BULL') {
                regimeScore = +0.8;
                reasons.push(`Trending Bull Regime (Hurst H=${regime.hurstExponent})`);
            }
            else if (regime.regime === 'TRENDING_BEAR') {
                regimeScore = -0.8;
                reasons.push(`Trending Bear Regime (Hurst H=${regime.hurstExponent})`);
            }
            else if (regime.regime === 'VOLATILITY_EXPANSION') {
                regimeScore = +0.5;
                reasons.push(`Volatility Expansion Surge (${regime.volatilityRatio}x)`);
            }
            scoreSum += regimeScore * regimeWeight;
        }
        const compositeScore = weightSum === 0 ? 0 : Math.max(-1.0, Math.min(1.0, scoreSum / weightSum));
        let signal = 'NEUTRAL';
        if (compositeScore >= 0.40)
            signal = 'BUY';
        else if (compositeScore <= -0.40)
            signal = 'SELL';
        if (reasons.length === 0) {
            reasons.push('Consolidating Market Structure');
        }
        const atr = indicators?.atr14 || lastPrice * 0.008;
        let stopLoss = lastPrice;
        let takeProfit = lastPrice;
        if (signal === 'BUY') {
            stopLoss = parseFloat((lastPrice - 1.0 * atr).toFixed(4));
            takeProfit = parseFloat((lastPrice + 2.5 * atr).toFixed(4));
        }
        else if (signal === 'SELL') {
            stopLoss = parseFloat((lastPrice + 1.0 * atr).toFixed(4));
            takeProfit = parseFloat((lastPrice - 2.5 * atr).toFixed(4));
        }
        const confidence = Math.round(Math.abs(compositeScore) * 100);
        return {
            symbol,
            signal,
            compositeScore: parseFloat(compositeScore.toFixed(3)),
            confidence,
            entryPrice: lastPrice,
            stopLoss,
            takeProfit,
            riskRewardRatio: 2.5,
            timeframe: '30s-3m SCALP',
            reasons,
            timestamp: Date.now()
        };
    }
}
exports.SignalEngine = SignalEngine;
//# sourceMappingURL=SignalEngine.js.map