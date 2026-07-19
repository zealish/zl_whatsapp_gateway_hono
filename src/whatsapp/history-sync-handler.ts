import type pino from 'pino'
import type { Chat, Contact } from 'baileys'
import type { WAMessage } from 'baileys'
import type { WebhookDispatcher } from '../webhook/dispatcher.js'
import {
  normalizeChat,
  normalizeContact,
  normalizeMessage,
} from './normalizers.js'

export type SyncState = 'idle' | 'syncing' | 'finished'

export interface BatchConfig {
  messages: number
  contacts: number
  chats: number
}

interface BufferedEvent {
  event: string
  args: unknown[]
}

/**
 * Manages the initial history synchronization lifecycle per instance.
 *
 * States:
 *   idle → syncing → finished
 *
 * During 'syncing':
 *   - Incoming Baileys history events are normalized and batched.
 *   - Realtime events are buffered (not delivered).
 *   - On isLatest=true or all sync types complete, buffer is drained.
 *
 * After 'finished':
 *   - All events pass through immediately.
 */
export class HistorySyncHandler {
  private state: SyncState = 'idle'
  private historySessionId: string | null = null
  private realtimeBuffer: BufferedEvent[] = []
  private progress: number = 0
  private instanceId: string
  private dispatcher: WebhookDispatcher
  private batchConfig: BatchConfig
  private logger: pino.Logger

  constructor(
    instanceId: string,
    dispatcher: WebhookDispatcher,
    batchConfig: BatchConfig,
    logger: pino.Logger
  ) {
    this.instanceId = instanceId
    this.dispatcher = dispatcher
    this.batchConfig = batchConfig
    this.logger = logger.child({ module: 'HistorySyncHandler', instanceId })
  }

  /**
   * Called when connection opens. Begins the sync state machine.
   */
  startSync(): void {
    if (this.state === 'finished') {
      // Reconnection: reset state
      this.reset()
    }
    this.state = 'syncing'
    this.historySessionId = crypto.randomUUID()
    this.progress = 0
    this.realtimeBuffer = []
    this.logger.info(
      { historySessionId: this.historySessionId },
      'History sync started'
    )
  }

  /**
   * Handle a Baileys messaging-history.set event.
   * Normalizes chats, contacts, messages and dispatches in batches.
   */
  handleHistorySet(data: {
    chats: Chat[]
    contacts: Contact[]
    messages: WAMessage[]
    isLatest?: boolean
    progress?: number | null
    syncType?: unknown
    chunkOrder?: number | null
    peerDataRequestSessionId?: string | null
  }): void {
    if (this.state !== 'syncing') {
      this.logger.warn(
        { state: this.state },
        'Received history.set while not in syncing state, starting sync'
      )
      this.startSync()
    }

    const { chats, contacts, messages, isLatest, progress } = data

    // Normalize and dispatch chats in batches
    if (chats?.length > 0) {
      const normalized = chats.map(normalizeChat)
      this.dispatchBatched('chats.sync', normalized, this.batchConfig.chats)
      this.logger.debug({ count: chats.length }, 'Processed history chats')
    }

    // Normalize and dispatch contacts in batches
    if (contacts?.length > 0) {
      const normalized = contacts.map(normalizeContact)
      this.dispatchBatched('contacts.sync', normalized, this.batchConfig.contacts)
      this.logger.debug({ count: contacts.length }, 'Processed history contacts')
    }

    // Normalize and dispatch messages in batches
    if (messages?.length > 0) {
      const normalized = messages.map(normalizeMessage)
      this.dispatchBatched('messages.sync', normalized, this.batchConfig.messages)
      this.logger.debug({ count: messages.length }, 'Processed history messages')
    }

    // Update and emit progress
    if (progress != null && progress !== this.progress) {
      this.progress = progress
      this.dispatcher
        .dispatch(this.instanceId, 'history.progress', { progress }, this.historySessionId!)
        .catch((err) => this.logger.error({ err }, 'Failed to dispatch history.progress'))
      this.logger.info({ progress }, 'History sync progress')
    }

    // Check if sync is complete
    if (isLatest === true) {
      this.completeSync()
    }
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
      'History sync status update'
    )

    // If status is complete and explicit (server confirmed), we could optionally
    // transition to finished even without isLatest. For now, we rely on isLatest.
  }

  /**
   * Buffer a realtime event if sync is in progress.
   * Returns true if the event was buffered, false if it should be processed immediately.
   */
  bufferRealtimeEvent(event: string, args: unknown[]): boolean {
    if (this.state !== 'syncing') {
      return false
    }
    this.realtimeBuffer.push({ event, args })
    this.logger.debug(
      { event, bufferSize: this.realtimeBuffer.length },
      'Buffered realtime event during history sync'
    )
    return true
  }

  /**
   * Get the current sync state.
   */
  getState(): SyncState {
    return this.state
  }

  /**
   * Get the current history session ID.
   */
  getHistorySessionId(): string | null {
    return this.historySessionId
  }

  /**
   * Dispatch items in batches of the given size.
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
          this.historySessionId!
        )
        .catch((err) =>
          this.logger.error({ err, event, batchStart: i }, 'Failed to dispatch batch')
        )
    }
  }

  /**
   * Complete the sync: emit history.finished, then drain the buffer.
   */
  private completeSync(): void {
    this.logger.info(
      { bufferSize: this.realtimeBuffer.length },
      'History sync completing'
    )

    this.dispatcher
      .dispatch(
        this.instanceId,
        'history.finished',
        {},
        this.historySessionId!
      )
      .catch((err) => this.logger.error({ err }, 'Failed to dispatch history.finished'))

    this.logger.info('History sync completed')

    // Transition to finished before draining buffer
    // so buffered events are processed as normal realtime events
    this.state = 'finished'

    // Store buffer reference and clear before draining
    // (draining may trigger new events)
    const buffer = [...this.realtimeBuffer]
    this.realtimeBuffer = []

    // Notify that buffer should be drained
    // The caller (MessageHandler) will process these events
    this.drainCallback?.(buffer)
  }

  /**
   * Callback set by MessageHandler to receive buffered events on completion.
   */
  drainCallback: ((events: BufferedEvent[]) => void) | null = null

  /**
   * Reset handler state for reconnection.
   */
  private reset(): void {
    this.state = 'idle'
    this.historySessionId = null
    this.realtimeBuffer = []
    this.progress = 0
  }
}
