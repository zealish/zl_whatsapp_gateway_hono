import type pino from 'pino'
import type { Chat, Contact } from 'baileys'
import type { WAMessage } from 'baileys'
import type { WebhookDispatcher } from '../webhook/dispatcher.js'
import type { ContactResolver } from './contact-resolver.js'
import type { LidMappingStore } from './lid-mapping.js'
import {
  normalizeChat,
  normalizeMessage,
  extractPhoneFromJid,
} from './normalizers.js'

/**
 * Informational phase of history sync.
 * Never affects dispatch logic — purely for observability.
 */
export type SyncPhase = 'idle' | 'history' | 'completed'

export interface BatchConfig {
  messages: number
  chats: number
}

/**
 * Manages the initial history synchronization lifecycle per instance.
 *
 * History events are dispatched directly to WebhookQueue as a background
 * pipeline — they NEVER block realtime events.
 *
 * Phases:
 *   idle → history → completed
 *
 * This state is informational only. Realtime events are processed
 * independently by MessageHandler without any coordination.
 */
export class HistorySyncHandler {
  private phase: SyncPhase = 'idle'
  private historySessionId: string | null = null
  private progress: number = 0
  private instanceId: string
  private dispatcher: WebhookDispatcher
  private batchConfig: BatchConfig
  private contactResolver: ContactResolver
  private lidMapping: LidMappingStore | null
  private onSyncComplete?: () => void
  private syncNotified = false
  private syncTimeout: ReturnType<typeof setTimeout> | null = null
  private logger: pino.Logger

  constructor(
    instanceId: string,
    dispatcher: WebhookDispatcher,
    batchConfig: BatchConfig,
    contactResolver: ContactResolver,
    logger: pino.Logger,
    lidMapping?: LidMappingStore | null,
    onSyncComplete?: () => void
  ) {
    this.instanceId = instanceId
    this.dispatcher = dispatcher
    this.batchConfig = batchConfig
    this.contactResolver = contactResolver
    this.lidMapping = lidMapping ?? null
    this.onSyncComplete = onSyncComplete
    this.logger = logger.child({ module: 'HistorySyncHandler', instanceId })
  }

  /**
   * Called when connection opens. Begins the history sync phase.
   * Sets a safety timeout — if no history.set arrives within 60s,
   * mark session as synced anyway (no history to sync).
   */
  startSync(): void {
    if (this.phase === 'completed') {
      // Reconnection: reset state
      this.reset()
    }
    this.phase = 'history'
    this.historySessionId = crypto.randomUUID()
    this.progress = 0
    this.logger.info(
      { historySessionId: this.historySessionId },
      '[History] Sync started'
    )

    // Safety timeout: if messaging-history.set never fires, mark synced after 60s
    this.syncTimeout = setTimeout(() => {
      if (!this.syncNotified) {
        this.logger.warn('[History] Sync timeout — no history.set received, marking synced')
        this.notifySyncComplete()
      }
    }, 60_000)
  }

  /**
   * Handle a Baileys messaging-history.set event.
   * Normalizes chats, contacts, messages and dispatches in batches.
   * All dispatches go directly to WebhookQueue — no buffering.
   */
  handleHistorySet(data: {
    chats: Chat[]
    contacts: Contact[]
    messages: WAMessage[]
    lidPnMappings?: Array<{ pn: string; lid: string }>
    isLatest?: boolean
    progress?: number | null
    syncType?: unknown
    chunkOrder?: number | null
    peerDataRequestSessionId?: string | null
  }): void {
    if (this.phase !== 'history') {
      this.logger.warn(
        { phase: this.phase },
        'Received history.set while not in history phase, starting sync'
      )
      this.startSync()
    }

    const { chats, contacts, messages, isLatest, progress } = data
    const lidPnMappings = data.lidPnMappings

    // Process LID → PN mappings from history sync (highest priority source)
    if (lidPnMappings && lidPnMappings.length > 0 && this.lidMapping) {
      for (const mapping of lidPnMappings) {
        if (mapping.lid && mapping.pn) {
          this.lidMapping.addMapping(mapping.lid, mapping.pn)
        }
      }
      this.logger.debug(
        { count: lidPnMappings.length },
        '[History] Processed %d LID→PN mappings',
        lidPnMappings.length
      )
    }

    // Normalize and dispatch chats in batches
    if (chats?.length > 0) {
      const normalized: unknown[] = []
      for (const c of chats) {
        try {
          normalized.push(normalizeChat(c, this.lidMapping))
        } catch (err) {
          this.logger.warn({ err, chatId: c.id }, '[History] Failed to normalize chat, skipping')
        }
      }
      if (normalized.length > 0) {
        this.dispatchBatched('chats.sync', normalized, this.batchConfig.chats)
      }
      this.logger.debug({ count: chats.length }, '[History] Enqueued %d chats', chats.length)
    }

    // Sync contacts to local store AND feed LID mapping (no webhook dispatch)
    if (contacts?.length > 0) {
      for (const c of contacts) {
        try {
          const phone = extractPhoneFromJid(c.id ?? '')
          if (!phone) continue

          // Feed LID ↔ Phone mapping if contact has lid field
          if (this.lidMapping && c.lid && c.id?.endsWith('@s.whatsapp.net')) {
            this.lidMapping.addMapping(c.lid, phone)
          }

          this.contactResolver.syncContact({
            phone,
            name: c.name || undefined,
            notify: c.notify || undefined,
            verifiedName: c.verifiedName || undefined,
          })
        } catch (err) {
          this.logger.warn({ err, contactId: c.id }, '[History] Failed to sync contact, skipping')
        }
      }
      this.logger.debug({ count: contacts.length }, '[History] Synced %d contacts to store', contacts.length)

      // Fast path: contacts synced, LID mappings now available
      this.notifySyncComplete()
    }

    // Normalize and dispatch messages in batches
    if (messages?.length > 0) {
      const normalized: unknown[] = []
      for (const m of messages) {
        try {
          normalized.push(normalizeMessage(m, this.lidMapping))
        } catch (err) {
          this.logger.warn({ err, key: m.key }, '[History] Failed to normalize message, skipping')
        }
      }
      if (normalized.length > 0) {
        this.dispatchBatched('messages.sync', normalized, this.batchConfig.messages)
      }
      this.logger.debug({ count: messages.length }, '[History] Enqueued %d messages', messages.length)
    }

    // Update and emit progress
    if (progress != null && progress !== this.progress) {
      this.progress = progress
      this.dispatcher
        .dispatch(this.instanceId, 'history.progress', { progress }, {
          historySessionId: this.historySessionId!,
          historySync: true,
        })
        .catch((err) => this.logger.error({ err }, 'Failed to dispatch history.progress'))
      this.logger.info({ progress }, 'History Progress: %d%%', progress)
    }

    // Check if sync is complete
    if (isLatest === true) {
      this.completeSync()
    }

    // Guaranteed fallback: ensure session is marked as synced even if no contacts were in this batch
    this.notifySyncComplete()
  }

  /**
   * Handle a Baileys messaging-history.status event.
   * Signals completion or pause of a specific sync type.
   */
  handleHistoryStatus(data: {
    syncType: unknown
    status: 'complete' | 'paused'
    explicit: boolean
  }): void {
    this.logger.info(
      { syncType: data.syncType, status: data.status, explicit: data.explicit },
      '[History] Sync status update'
    )
  }

  /**
   * Get the current sync phase (informational only).
   */
  getSyncPhase(): SyncPhase {
    return this.phase
  }

  /**
   * Get the current history session ID.
   */
  getHistorySessionId(): string | null {
    return this.historySessionId
  }

  /**
   * Dispatch items in batches of the given size.
   * All items go directly to WebhookQueue with historySync: true.
   */
  private dispatchBatched(
    event: string,
    items: unknown[],
    batchSize: number
  ): void {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      this.dispatcher
        .dispatchBatch(
          this.instanceId,
          event,
          batch,
          { historySessionId: this.historySessionId!, historySync: true }
        )
        .catch((err) =>
          this.logger.error({ err, event, batchStart: i }, 'Failed to dispatch history batch')
        )
    }
  }

  /**
   * Complete the sync: emit history.finished and transition phase.
   * No buffer drain — realtime events were never blocked.
   */
  private completeSync(): void {
    this.dispatcher
      .dispatch(
        this.instanceId,
        'history.finished',
        {},
        { historySessionId: this.historySessionId!, historySync: true }
      )
      .catch((err) => this.logger.error({ err }, 'Failed to dispatch history.finished'))

    this.phase = 'completed'
    this.logger.info('[History] Finished')

    // Ultimate fallback: ensure session is marked as synced
    this.notifySyncComplete()
  }

  /**
   * Reset handler state for reconnection.
   */
  private reset(): void {
    this.phase = 'idle'
    this.historySessionId = null
    this.progress = 0
    this.syncNotified = false
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
      this.syncTimeout = null
    }
  }

  /**
   * Fire onSyncComplete callback once. Idempotent — safe to call multiple times.
   * Called from:
   * - After contacts synced (fast path, mappings available immediately)
   * - End of every handleHistorySet (guaranteed fallback)
   * - completeSync() (ultimate fallback)
   */
  private notifySyncComplete(): void {
    if (this.syncNotified || !this.onSyncComplete) return
    this.syncNotified = true
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
      this.syncTimeout = null
    }
    this.onSyncComplete()
    this.logger.info('[History] Sync complete — dispatcher notified')
  }
}
