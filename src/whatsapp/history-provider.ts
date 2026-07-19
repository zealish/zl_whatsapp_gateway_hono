import { AppError } from '../lib/errors.js'

/**
 * Interface for history synchronization providers.
 * Designed for future extension (e.g., fetchMessageHistory).
 */
export interface HistoryProvider {
  /**
   * Perform initial history sync after pairing.
   * Triggered automatically on connection open.
   */
  syncInitial(): Promise<void>

  /**
   * Fetch older messages on demand.
   * Not yet implemented — throws NotImplementedError.
   *
   * Future flow:
   *   Consumer → Gateway API → fetchMessageHistory() → WhatsApp → messaging-history.set → Queue → Webhook
   */
  fetchOlder(before: Date): Promise<void>
}

/**
 * Default implementation that throws for unimplemented methods.
 */
export class DefaultHistoryProvider implements HistoryProvider {
  async syncInitial(): Promise<void> {
    // Initial sync is handled by HistorySyncHandler via Baileys events.
    // No explicit action needed here.
  }

  async fetchOlder(_before: Date): Promise<void> {
    throw new AppError(
      'fetchMessageHistory is not yet implemented',
      501,
      'NOT_IMPLEMENTED'
    )
  }
}
