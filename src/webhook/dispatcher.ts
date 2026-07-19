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
import { v7 as uuidv7 } from 'uuid'

/**
 * Manages webhook configs per session and dispatches payloads via WebhookQueue.
 * Uses canonical event names internally and resolves to legacy names
 * at subscription time for backward compatibility.
 */
export class WebhookDispatcher {
  private webhookDir: string
  private queue: WebhookQueue
  private db: QueueDB
  private logger: pino.Logger

  constructor(
    webhookDir: string,
    db: QueueDB,
    queue: WebhookQueue,
    logger: pino.Logger
  ) {
    this.webhookDir = webhookDir
    this.db = db
    this.queue = queue
    this.logger = logger.child({ module: 'WebhookDispatcher' })
  }

  async init(): Promise<void> {
    await mkdir(this.webhookDir, { recursive: true })
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
   * sequencing, signing, and enqueueing.
   */
  async dispatch(
    sessionId: string,
    canonicalEvent: string,
    payload: unknown,
    historySessionId?: string
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

    // Get next sequence number for this instance
    const sequence = this.db.nextSequence(sessionId)

    // Create envelope with canonical event name
    const envelope = createEnvelope(
      sessionId,
      deliverAs,
      payload,
      sequence,
      historySessionId
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
    historySessionId?: string
  ): Promise<void> {
    if (items.length === 0) return
    await this.dispatch(sessionId, canonicalEvent, items, historySessionId)
  }

  get queueInstance(): WebhookQueue {
    return this.queue
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
