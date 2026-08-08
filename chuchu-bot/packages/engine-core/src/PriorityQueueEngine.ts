import {
  HeatCandidate,
  PrioritizedCandidate,
  DiscoveryPriority,
  AggregatedSymbolState
} from '@chuchu/shared';

/**
 * Priority Scoring System:
 * P1 ⭐⭐⭐⭐⭐ — RSI Heat Zone (OVERBOUGHT or OVERSOLD)
 * P2 ⭐⭐⭐⭐  — Top Gainer
 * P3 ⭐⭐⭐⭐  — Top Loser
 * P4 ⭐⭐⭐   — 24h High Volume
 * P5 ⭐⭐⭐   — New Listing
 * P6 ⭐⭐    — User Watchlist
 *
 * Additional score modifiers:
 *   +10 WMR gate confirmed
 *   +5  Multiple tags (compound interest)
 *   +5  Near Overbought/Oversold
 */

interface PriorityDefinition {
  priority: DiscoveryPriority;
  stars: string;
  label: string;
  baseScore: number;
}

const PRIORITY_DEFINITIONS: PriorityDefinition[] = [
  { priority: 1, stars: '⭐⭐⭐⭐⭐', label: 'RSI Heat Zone',   baseScore: 100 },
  { priority: 2, stars: '⭐⭐⭐⭐',  label: 'Top Gainer',      baseScore: 80  },
  { priority: 3, stars: '⭐⭐⭐⭐',  label: 'Top Loser',       baseScore: 80  },
  { priority: 4, stars: '⭐⭐⭐',   label: '24h High Volume', baseScore: 60  },
  { priority: 5, stars: '⭐⭐⭐',   label: 'New Listing',     baseScore: 60  },
  { priority: 6, stars: '⭐⭐',    label: 'User Watchlist',  baseScore: 40  },
];

/**
 * PriorityQueueEngine — Stage 4
 * Assigns P1–P6 priority labels and composite scores to HeatCandidate list.
 * Sorts output by composite score descending.
 * Merges full AggregatedSymbolState into final candidates.
 * Filters to only signal-qualified coins (BUY or SELL signal).
 */
export class PriorityQueueEngine {

  private getPriorityDef(candidate: HeatCandidate): PriorityDefinition {
    // P1: RSI extreme heat zones
    if (candidate.heatZone === 'OVERBOUGHT' || candidate.heatZone === 'OVERSOLD') {
      return PRIORITY_DEFINITIONS[0];
    }
    // P2: Top Gainer
    if (candidate.tags.includes('TOP_GAINER')) {
      return PRIORITY_DEFINITIONS[1];
    }
    // P3: Top Loser
    if (candidate.tags.includes('TOP_LOSER')) {
      return PRIORITY_DEFINITIONS[2];
    }
    // P4: High Volume
    if (candidate.tags.includes('HIGH_VOLUME') || candidate.tags.includes('HIGH_VOLUME_CHANGE')) {
      return PRIORITY_DEFINITIONS[3];
    }
    // P5: New Listing
    if (candidate.tags.includes('NEW_LISTING')) {
      return PRIORITY_DEFINITIONS[4];
    }
    // P6: Watchlist fallback
    return PRIORITY_DEFINITIONS[5];
  }

  private computeCompositeScore(candidate: HeatCandidate, baseDef: PriorityDefinition): number {
    let score = baseDef.baseScore;

    // WMR gate confirmation bonus
    if (candidate.heatConfirmed) score += 10;

    // Multiple tags compound bonus
    if (candidate.tags.length > 1) score += 5;

    // Near heat zone (slightly lower than extreme)
    if (candidate.heatZone === 'NEAR_OVERBOUGHT' || candidate.heatZone === 'NEAR_OVERSOLD') {
      score += 5;
    }

    // Volume spike boost
    if (candidate.tags.includes('HIGH_VOLUME_CHANGE')) score += 8;

    // New listing recency bonus
    if (candidate.listingAgeDays !== undefined && candidate.listingAgeDays <= 3) {
      score += 12;
    }

    return score;
  }

  /**
   * Process heat candidates into prioritized, scored, signal-filtered results.
   * stateProvider: returns current AggregatedSymbolState for a symbol.
   * onlyWithSignal: if true, only include BUY/SELL signal coins in output.
   */
  public process(
    heatCandidates: HeatCandidate[],
    stateProvider: (symbol: string) => AggregatedSymbolState | undefined,
    onlyWithSignal: boolean = false
  ): PrioritizedCandidate[] {

    const prioritized: PrioritizedCandidate[] = [];

    for (const candidate of heatCandidates) {
      const state = stateProvider(candidate.symbol);
      const def = this.getPriorityDef(candidate);
      const compositeScore = this.computeCompositeScore(candidate, def);

      // If onlyWithSignal: skip coins without BUY/SELL signal
      if (onlyWithSignal && state?.signal?.signal === 'NEUTRAL') continue;

      prioritized.push({
        ...candidate,
        priority: def.priority,
        priorityStars: def.stars,
        priorityLabel: def.label,
        compositeScore,
        state
      });
    }

    // Sort by composite score descending, then priority ascending
    prioritized.sort((a, b) => {
      if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
      return a.priority - b.priority;
    });

    return prioritized;
  }
}
