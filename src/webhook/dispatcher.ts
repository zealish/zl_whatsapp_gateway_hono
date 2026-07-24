import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type pino from 'pino'
import type { GatewayEventEnvelope, WebhookConfig } from './types.js'
import type { QueueDB } from './queue-db.js'
import { WebhookQueue } from './queue.js'
import { createEnvelope } from './event-envelope.js'
import { resolveEventName } from './subscription-resolver.js'
import type { WebhookEvent } from '../schemas/webhook.js'
import type { LidMappingStore } from '../whatsapp/lid-mapping.js'
import { resolveIdentifiersDeep } from '../whatsapp/identifier-resolver.js'
import { v7 as uuidv7 } from 'uuid'

// ── Pending Resolution Queue ──

interface PendingEvent {
  sessionId: string
  canonicalEvent: string
  payload: unknown
  options?: { historySessionId?: string; historySync?: boolean }
  unresolvedLids: string[]
  createdAt: number
}

/**
 * In-memory queue for events with unresolved LID identifiers.
 * Events are held until the LID → phone mapping becomes available,
 * then replayed in their original order.
 *
 * Not persisted — lost on restart (recovered by history sync).
 */
class PendingResolutionQueue {
  /** LID → queued events waiting for that LID to be resolved */
  private waiting = new Map<string, PendingEvent[]>()
  private retentionMs: number
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  private logger: pino.Logger

  constructor(retentionMs: number, logger: pino.Logger) {
    this.retentionMs = retentionMs
    this.logger = logger.child({ module: 'PendingResolutionQueue' })
  }

  enqueue(event: PendingEvent): void {
    for (const lid of event.unresolvedLids) {
      const queue = this.waiting.get(lid) ?? []
      queue.push(event)
      this.waiting.set(lid, queue)
    }
    this.logger.debug(
      { unresolvedLids: event.unresolvedLids, event: event.canonicalEvent },
      'Event queued pending LID resolution'
    )
  }

  /**
   * Get all unique events waiting for any of the given LIDs.
   * Deduplicates by createdAt + canonicalEvent (same event may wait for multiple LIDs).
   * Returns events in FIFO order.
   */
  drainForLids(lids: string[]): PendingEvent[] {
    const seen = new Set<number>()
    const events: PendingEvent[] = []

    for (const lid of lids) {
      const queue = this.waiting.get(lid)
      if (!queue) continue

      for (const event of queue) {
        if (!seen.has(event.createdAt)) {
          seen.add(event.createdAt)
          events.push(event)
        }
      }

      this.waiting.delete(lid)
    }

    // Also clean up any other LID entries for these events
    for (const event of events) {
      for (const lid of event.unresolvedLids) {
        if (!lids.includes(lid)) {
          const queue = this.waiting.get(lid)
          if (queue) {
            const filtered = queue.filter((e) => e.createdAt !== event.createdAt)
            if (filtered.length === 0) {
              this.waiting.delete(lid)
            } else {
              this.waiting.set(lid, filtered)
            }
          }
        }
      }
    }

    // Sort by createdAt to preserve FIFO
    events.sort((a, b) => a.createdAt - b.createdAt)
    return events
  }

  /**
   * Get all LID keys that have pending events.
   */
  allLids(): string[] {
    return Array.from(this.waiting.keys())
  }

  /**
   * Peek at events for a specific LID without draining them.
   */
  peekForLid(lid: string): PendingEvent[] {
    return this.waiting.get(lid) ?? []
  }

  /**
   * Remove events older than retentionMs.
   * Returns expired events so they can be moved to DLQ.
   */
  cleanup(): PendingEvent[] {
    const now = Date.now()
    const expired: PendingEvent[] = []
    const seen = new Set<number>()

    for (const [lid, queue] of this.waiting) {
      const retained: PendingEvent[] = []
      for (const event of queue) {
        if (now - event.createdAt > this.retentionMs) {
          if (!seen.has(event.createdAt)) {
            seen.add(event.createdAt)
            expired.push(event)
          }
        } else {
          retained.push(event)
        }
      }
      if (retained.length === 0) {
        this.waiting.delete(lid)
      } else {
        this.waiting.set(lid, retained)
      }
    }

    return expired
  }

  startCleanup(): void {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => {
      const expired = this.cleanup()
      if (expired.length > 0) {
        this.logger.warn(
          { count: expired.length },
          'Pending resolution events expired — moving to DLQ'
        )
      }
    }, 60_000) // every 60s
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  get size(): number {
    let count = 0
    for (const queue of this.waiting.values()) {
      count += queue.length
    }
    return count
  }
}

// ── Webhook Dispatcher ──

/**
 * Manages webhook configs per session and dispatches payloads via WebhookQueue.
 * Uses canonical event names internally and resolves to legacy names
 * at subscription time for backward compatibility.
 *
 * Resolution safety net:
 * - Runs resolveIdentifiersDeep() on every payload before dispatch
 * - If session not yet synced: holds events with unresolved LIDs entirely
 * - If session synced but LID still unresolved: dispatches with stripped identifiers + queues for replay
 * - Replays queued events when LID mapping becomes available
 */
export class WebhookDispatcher {
  private webhookDir: string
  private queue: WebhookQueue
  private db: QueueDB
  private logger: pino.Logger
  private lidMapping: LidMappingStore | null
  private pendingQueue: PendingResolutionQueue
  private syncedSessions = new Set<string>()
  private lidResolvers = new Map<string, (lid: string) => Promise<string | null>>()

  constructor(
    webhookDir: string,
    db: QueueDB,
    queue: WebhookQueue,
    logger: pino.Logger,
    lidMapping?: LidMappingStore | null,
    pendingRetentionMs?: number
  ) {
    this.webhookDir = webhookDir
    this.db = db
    this.queue = queue
    this.lidMapping = lidMapping ?? null
    this.logger = logger.child({ module: 'WebhookDispatcher' })

    this.pendingQueue = new PendingResolutionQueue(
      pendingRetentionMs ?? 86_400_000, // 24h default
      this.logger
    )
  }

  /**
   * Register a per-session LID resolver (backed by Baileys adapter).
   * Used as a fallback when LidMappingStore doesn't have the mapping.
   */
  registerLidResolver(sessionId: string, resolver: (lid: string) => Promise<string | null>): void {
    this.lidResolvers.set(sessionId, resolver)
  }

  /**
   * Unregister a session's LID resolver (on disconnect/destroy).
   */
  unregisterLidResolver(sessionId: string): void {
    this.lidResolvers.delete(sessionId)
    this.syncedSessions.delete(sessionId)
  }

  async init(): Promise<void> {
    await mkdir(this.webhookDir, { recursive: true })

    // Wire LID mapping events to replay pending events
    if (this.lidMapping) {
      this.lidMapping.on('mapping:added', (phone: string, lidKey: string) => {
        this.replayPendingForLid(lidKey)
      })
    }

    // Start periodic cleanup of pending queue
    this.pendingQueue.startCleanup()
  }

  // ── Config CRUD ──

  async getConfig(sessionId: string): Promise<WebhookConfig | null> {
    const filePath = this.configPath(sessionId)
    if (!existsSync(filePath)) return null
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as WebhookConfig
  }

  async setConfig(
    sessionId: string,
    url: string,
    secret?: string,
    events?: WebhookEvent[]
  ): Promise<WebhookConfig> {
    const config: WebhookConfig = {
      url,
      secret,
      events,
      createdAt: Date.now(),
    }
    await writeFile(
      this.configPath(sessionId),
      JSON.stringify(config, null, 2),
      'utf-8'
    )
    this.logger.info({ sessionId, url }, 'Webhook config saved')
    return config
  }

  async deleteConfig(sessionId: string): Promise<boolean> {
    const filePath = this.configPath(sessionId)
    if (!existsSync(filePath)) return false
    await unlink(filePath)
    this.logger.info({ sessionId }, 'Webhook config deleted')
    return true
  }

  // ── Dispatch ──

  /**
   * Dispatch a canonical event to a session's webhook.
   * Handles subscription resolution (canonical vs legacy names),
   * sequencing, signing, identifier resolution safety net, and enqueueing.
   */
  async dispatch(
    sessionId: string,
    canonicalEvent: string,
    payload: unknown,
    options?: { historySessionId?: string; historySync?: boolean }
  ): Promise<void> {
    const config = await this.getConfig(sessionId)
    if (!config) {
      this.logger.debug({ sessionId }, 'No webhook configured, skipping')
      return
    }

    // Resolve which event name to deliver based on consumer's subscriptions
    const deliverAs = resolveEventName(canonicalEvent, config.events)
    if (!deliverAs) {
      this.logger.debug(
        { sessionId, canonicalEvent },
        'Event not in subscription filter, skipping'
      )
      return
    }

    // ── Identifier Resolution Safety Net (non-blocking) ──
    let result = resolveIdentifiersDeep(payload, this.lidMapping)
    payload = result.payload

    // If unresolved LIDs remain, try Baileys resolver as fallback
    if (!result.resolved) {
      const lidResolver = this.lidResolvers.get(sessionId)
      if (lidResolver) {
        const resolved = await this.tryResolveLids(result.unresolvedLids, lidResolver)
        if (resolved) {
          // Re-resolve with updated mapping
          result = resolveIdentifiersDeep(payload, this.lidMapping)
          payload = result.payload
        }
      }
    }

    if (!result.resolved) {
      // Has unresolved LIDs — queue for replay when mapping becomes available
      this.pendingQueue.enqueue({
        sessionId,
        canonicalEvent,
        payload: result.payload, // original payload (before stripping), for re-resolution on replay
        options,
        unresolvedLids: result.unresolvedLids,
        createdAt: Date.now(),
      })

      if (!this.syncedSessions.has(sessionId)) {
        // Session not yet synced — HOLD event entirely (don't send empty identifiers)
        this.logger.debug(
          { unresolvedLids: result.unresolvedLids, event: canonicalEvent },
          'Event held — session not yet synced, awaiting LID mapping'
        )
        return
      }

      // Session already synced but LID still unresolved — dispatch with stripped identifiers
      // (will replay with full resolution when mapping arrives)
      this.logger.debug(
        { unresolvedLids: result.unresolvedLids, event: canonicalEvent },
        'Event has unresolved LIDs — queued for replay, dispatching with stripped identifiers'
      )
    }

    // Get next sequence number for this pipeline (independent counters)
    const pipeline = options?.historySync ? 'history' : 'realtime'
    const sequence = this.db.nextSequenceForPipeline(sessionId, pipeline)

    // Create envelope with canonical event name
    const envelope = createEnvelope(
      sessionId,
      deliverAs,
      payload,
      sequence,
      options?.historySessionId,
      options?.historySync
    )

    // Sign if secret is configured
    const finalEnvelope = config.secret
      ? await this.signEnvelope(envelope, config.secret)
      : envelope

    this.queue.enqueue({
      id: uuidv7(),
      instanceId: sessionId,
      sequence,
      webhookUrl: config.url,
      payload: finalEnvelope,
    })
  }

  /**
   * Dispatch multiple payloads as a single batched event.
   * Used by history sync for large datasets.
   */
  async dispatchBatch(
    sessionId: string,
    canonicalEvent: string,
    items: unknown[],
    options?: { historySessionId?: string; historySync?: boolean }
  ): Promise<void> {
    if (items.length === 0) return
    await this.dispatch(sessionId, canonicalEvent, items, options)
  }

  get queueInstance(): WebhookQueue {
    return this.queue
  }

  /**
   * Mark a session as history-synced. Called when messaging-history.set delivers contacts.
   * This means the LID mapping is now populated for this session.
   * Replays all pending events that were held during the sync phase.
   */
  markHistorySynced(sessionId: string): void {
    this.syncedSessions.add(sessionId)
    this.logger.info({ sessionId }, 'Session marked as history-synced — replaying pending events')
    this.replayPendingForSession(sessionId)
  }

  /**
   * Gracefully stop pending queue cleanup timer.
   */
  destroy(): void {
    this.pendingQueue.stopCleanup()
  }

  // ── Private: LID Resolution ──

  /**
   * Try to resolve unresolved LIDs via the Baileys adapter.
   * If successful, feeds the mapping to LidMappingStore.
   * Returns true if any LID was resolved.
   */
  private async tryResolveLids(
    unresolvedLids: string[],
    resolver: (lid: string) => Promise<string | null>
  ): Promise<boolean> {
    if (!this.lidMapping) return false

    let anyResolved = false

    for (const lid of unresolvedLids) {
      try {
        const phone = await resolver(lid)
        if (phone) {
          this.lidMapping.addMapping(lid, phone)
          this.logger.info({ lid, phone }, 'LID resolved via Baileys fallback')
          anyResolved = true
        }
      } catch (err) {
        this.logger.debug({ err, lid }, 'Baileys LID resolution failed')
      }
    }

    return anyResolved
  }

  // ── Private: Replay ──

  /**
   * Replay all events that were waiting for the given LID.
   * Called when LidMappingStore emits 'mapping:added'.
   */
  private replayPendingForLid(lidKey: string): void {
    const events = this.pendingQueue.drainForLids([lidKey])
    if (events.length === 0) return

    this.logger.info(
      { lid: lidKey, count: events.length },
      'Replaying pending events after LID mapping resolved'
    )

    for (const event of events) {
      // Re-dispatch — this time the mapping should be available
      this.dispatch(
        event.sessionId,
        event.canonicalEvent,
        event.payload,
        event.options
      ).catch((err) => {
        this.logger.error(
          { err, event: event.canonicalEvent },
          'Failed to replay pending event'
        )
      })
    }
  }

  /**
   * Replay all pending events for a session after history sync completes.
   * Events were held because LID mappings weren't available yet.
   * Now that contacts are synced, the mappings should exist.
   */
  private replayPendingForSession(sessionId: string): void {
    // Drain ALL pending events for this session (across all LIDs)
    const allLids = this.pendingQueue.allLids()
    const sessionLids = allLids.filter(lid => {
      const events = this.pendingQueue.peekForLid(lid)
      return events.some(e => e.sessionId === sessionId)
    })

    if (sessionLids.length === 0) {
      this.logger.debug({ sessionId }, 'No pending events to replay after sync')
      return
    }

    const events = this.pendingQueue.drainForLids(sessionLids)
    const sessionEvents = events.filter(e => e.sessionId === sessionId)

    this.logger.info(
      { sessionId, count: sessionEvents.length },
      'Replaying pending events after history sync'
    )

    // Sort by createdAt to preserve order
    sessionEvents.sort((a, b) => a.createdAt - b.createdAt)

    for (const event of sessionEvents) {
      this.dispatch(
        event.sessionId,
        event.canonicalEvent,
        event.payload,
        event.options
      ).catch((err) => {
        this.logger.error(
          { err, event: event.canonicalEvent },
          'Failed to replay pending event after sync'
        )
      })
    }
  }

  // ── Helpers ──

  private configPath(sessionId: string): string {
    return join(this.webhookDir, `${sessionId}.json`)
  }

  private async signEnvelope(
    envelope: GatewayEventEnvelope,
    secret: string
  ): Promise<GatewayEventEnvelope & { signature: string }> {
    const { createHmac } = await import('node:crypto')
    const body = JSON.stringify(envelope)
    const signature = createHmac('sha256', secret).update(body).digest('hex')
    return { ...envelope, signature }
  }
}
