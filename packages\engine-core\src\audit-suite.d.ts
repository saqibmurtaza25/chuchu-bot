export interface AuditReportResults {
    timestamp: string;
    mathematicalAccuracy: {
        test: string;
        status: 'PASS' | 'FAIL';
        errorMargin: number;
    }[];
    performanceLatencyMs: {
        avgLatency: number;
        maxLatency: number;
        passLatencyTarget: boolean;
    };
    memoryStressTest: {
        initialMemoryMb: number;
        finalMemoryMb: number;
        memoryDeltaMb: number;
        leakDetected: boolean;
    };
    resiliencyTest: {
        sequenceVerification: boolean;
        rateLimitRefillOk: boolean;
    };
}
export declare function runFullAudit(): AuditReportResults;
//# sourceMappingURL=audit-suite.d.ts.map