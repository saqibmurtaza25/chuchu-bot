import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { AutoTradeConfig, PaperPosition, PaperTrade } from '@chuchu/shared';

/**
 * Paper-state persistence. Writes the paper trading engine state (balance,
 * open positions, full trade history + auto-trade config) to a JSON file so
 * the bot continues from where it left off after a restart. Nothing resets
 * unless the user explicitly hits /api/v1/reset.
 *
 * File location: env CHUCHU_STATE_FILE, default ./chuchu-state.json
 */
export interface PersistedPaperState {
  version: number;
  savedAt: number;
  balance: number;
  positions: PaperPosition[];
  trades: PaperTrade[];
  autoTradeConfig?: Partial<AutoTradeConfig>;
}

export class StatePersistence {
  private filePath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingData: PersistedPaperState | null = null;

  constructor(filePath?: string) {
    this.filePath = filePath || process.env.CHUCHU_STATE_FILE || './chuchu-state.json';
  }

  public getFilePath(): string {
    return this.filePath;
  }

  public load(): PersistedPaperState | null {
    try {
      if (!existsSync(this.filePath)) return null;
      const raw = readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(raw) as PersistedPaperState;
      if (!data || typeof data !== 'object') return null;
      return data;
    } catch (err) {
      console.error(`StatePersistence: failed to load ${this.filePath}:`, err);
      return null;
    }
  }

  public hasStateFile(): boolean {
    return existsSync(this.filePath);
  }

  /**
   * Debounced save (300ms) so high-frequency trade activity doesn't hammer
   * the disk. Called on every state-changing event.
   */
  public save(state: PersistedPaperState): void {
    this.pendingData = state;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const data = this.pendingData;
      this.pendingData = null;
      if (!data) return;
      try {
        mkdirSync(dirname(this.filePath) || '.', { recursive: true });
        writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
      } catch (err) {
        console.error(`StatePersistence: failed to save ${this.filePath}:`, err);
      }
    }, 300);
  }
}
