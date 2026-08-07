"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HunterEngine = void 0;
/**
 * HunterEngine
 * Identifies sudden volume surges, volatility expansions, and early gem/pump setups.
 */
class HunterEngine {
    /**
     * Evaluates volume surge and volatility expansion metrics for a candidate token
     */
    evaluate(candles) {
        if (candles.length < 20) {
            return {
                symbol: candles[0]?.symbol || 'UNKNOWN',
                volumeZScore: 0,
                volatilityExpansionRatio: 1.0,
                hunterScore: 0,
                timestamp: Date.now()
            };
        }
        const symbol = candles[0].symbol;
        const volumes = candles.map(c => c.volume);
        const currentVolume = volumes[volumes.length - 1];
        // Calculate Volume mean and std dev over 20 candles
        const windowVolumes = volumes.slice(-20);
        const meanVol = windowVolumes.reduce((sum, v) => sum + v, 0) / 20;
        let varianceSum = 0;
        for (const v of windowVolumes) {
            varianceSum += Math.pow(v - meanVol, 2);
        }
        const stdDevVol = Math.sqrt(varianceSum / 20);
        const volumeZScore = stdDevVol === 0 ? 0 : (currentVolume - meanVol) / stdDevVol;
        // Volatility Expansion Ratio (Fast 5-candle range / Slow 20-candle range)
        const recentRanges = candles.slice(-5).map(c => c.high - c.low);
        const fastRangeAvg = recentRanges.reduce((a, b) => a + b, 0) / 5;
        const olderRanges = candles.slice(-20).map(c => c.high - c.low);
        const slowRangeAvg = olderRanges.reduce((a, b) => a + b, 0) / 20;
        const volatilityExpansionRatio = slowRangeAvg === 0 ? 1.0 : fastRangeAvg / slowRangeAvg;
        // Hunter Score Formula: 40 * max(0, Z_V) + 40 * (R_vol - 1) + 20 * (price momentum)
        const zScoreContribution = Math.max(0, Math.min(4, volumeZScore)) * 12.5; // Max 50 points
        const volContribution = Math.max(0, Math.min(3, volatilityExpansionRatio - 1)) * 16.6; // Max 50 points
        const hunterScore = Math.min(100, Math.max(0, Math.round(zScoreContribution + volContribution)));
        return {
            symbol,
            volumeZScore: parseFloat(volumeZScore.toFixed(2)),
            volatilityExpansionRatio: parseFloat(volatilityExpansionRatio.toFixed(2)),
            hunterScore,
            timestamp: Date.now()
        };
    }
}
exports.HunterEngine = HunterEngine;
//# sourceMappingURL=HunterEngine.js.map