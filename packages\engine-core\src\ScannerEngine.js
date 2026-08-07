"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScannerEngine = void 0;
/**
 * ScannerEngine
 * High-frequency parallel scanning engine across multi-symbol states.
 */
class ScannerEngine {
    /**
     * Scans and ranks tracked symbols against dynamic filtering criteria
     */
    scan(symbolStates, criteria = {}) {
        const { minHunterScore = 40, minImbalanceRatio = 0.20, minVolumeZScore = 1.0, maxResults = 20 } = criteria;
        const candidates = [];
        for (const state of symbolStates.values()) {
            const hunter = state.hunter;
            const micro = state.microstructure;
            if (!hunter || !micro)
                continue;
            const hunterPass = hunter.hunterScore >= minHunterScore || hunter.volumeZScore >= minVolumeZScore;
            const microPass = Math.abs(micro.orderbookImbalance) >= minImbalanceRatio || Math.abs(micro.weightedImbalance) >= minImbalanceRatio;
            if (hunterPass || microPass) {
                candidates.push(state);
            }
        }
        // Rank candidates by composite activity (Hunter Score + Imbalance magnitude)
        candidates.sort((a, b) => {
            const scoreA = (a.hunter?.hunterScore || 0) + Math.abs(a.microstructure?.orderbookImbalance || 0) * 50;
            const scoreB = (b.hunter?.hunterScore || 0) + Math.abs(b.microstructure?.orderbookImbalance || 0) * 50;
            return scoreB - scoreA;
        });
        return candidates.slice(0, maxResults);
    }
}
exports.ScannerEngine = ScannerEngine;
//# sourceMappingURL=ScannerEngine.js.map