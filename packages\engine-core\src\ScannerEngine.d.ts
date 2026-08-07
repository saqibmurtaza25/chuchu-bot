import { AggregatedSymbolState } from '@athena/shared';
export interface ScannerCriteria {
    minHunterScore?: number;
    minImbalanceRatio?: number;
    minVolumeZScore?: number;
    maxResults?: number;
}
/**
 * ScannerEngine
 * High-frequency parallel scanning engine across multi-symbol states.
 */
export declare class ScannerEngine {
    /**
     * Scans and ranks tracked symbols against dynamic filtering criteria
     */
    scan(symbolStates: Map<string, AggregatedSymbolState>, criteria?: ScannerCriteria): AggregatedSymbolState[];
}
//# sourceMappingURL=ScannerEngine.d.ts.map