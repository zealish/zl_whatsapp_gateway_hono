import { randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type pino from 'pino'
import type { WebhookPayload, WebhookConfig } from './types.js'
import { WebhookQueue } from './queue.js'
import type { WebhookEvent } from '../schemas/webhook.js'

/**
 * Manages webhook configs per session and dispatches payloads via WebhookQueue.
 */
export class WebhookDispatcher {
  private webhookDir: string
  private queue: WebhookQueue
  private logger: pino.Logger

  constructor(
    webhookDir: string,
    maxRetries: number,
    retryDelayMs: number,
    logger: pino.Logger
  ) {
    this.webhookDir = webhookDir
    this.logger = logger.child({ module: 'WebhookDispatcher' })
    this.queue = new WebhookQueue(maxRetries, retryDelayMs, this.logger)
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

  async dispatch(sessionId: string, payload: WebhookPayload): Promise<void> {
    const config = await this.getConfig(sessionId)
    if (!config) {
      this.logger.debug({ sessionId }, 'No webhook configured, skipping')
      return
    }

    // Filter by subscribed events
    if (config.events && config.events.length > 0) {
      if (!config.events.includes(payload.event)) {
        return
      }
    }

    // Sign payload if secret is set
    const signedPayload = config.secret
      ? await this.signPayload(payload, config.secret)
      : payload

    this.queue.enqueue({
      id: randomUUID(),
      webhookUrl: config.url,
      payload: signedPayload as WebhookPayload,
      attempts: 0,
      nextRetryAt: Date.now(),
    })
  }

  // ── Helpers ──

  private configPath(sessionId: string): string {
    return join(this.webhookDir, `${sessionId}.json`)
  }

  private async signPayload(
    payload: WebhookPayload,
    secret: string
  ): Promise<WebhookPayload & { signature: string }> {
    const { createHmac } = await import('node:crypto')
    const body = JSON.stringify(payload)
    const signature = createHmac('sha256', secret).update(body).digest('hex')
    return { ...payload, signature }
  }
}
