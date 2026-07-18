import type pino from 'pino'
import type { WebhookDelivery } from './types.js'

/**
 * In-memory retry queue with exponential backoff.
 * Not persistent — deliveries lost on restart (acceptable for gateway).
 */
export class WebhookQueue {
  private queue: WebhookDelivery[] = []
  private processing = false
  private maxRetries: number
  private baseDelayMs: number
  private logger: pino.Logger

  constructor(maxRetries: number, baseDelayMs: number, logger: pino.Logger) {
    this.maxRetries = maxRetries
    this.baseDelayMs = baseDelayMs
    this.logger = logger.child({ module: 'WebhookQueue' })
  }

  enqueue(delivery: WebhookDelivery): void {
    this.queue.push(delivery)
    this.logger.debug(
      { deliveryId: delivery.id, url: delivery.webhookUrl },
      'Enqueued webhook delivery'
    )
    this.processNext()
  }

  get size(): number {
    return this.queue.length
  }

  private async processNext(): Promise<void> {
    if (this.processing) return
    this.processing = true

    while (this.queue.length > 0) {
      const delivery = this.queue.shift()!
      const now = Date.now()

      if (delivery.nextRetryAt > now) {
        // Not ready yet, re-enqueue
        this.queue.push(delivery)
        await this.sleep(delivery.nextRetryAt - now)
        continue
      }

      try {
        await this.executeDelivery(delivery)
      } catch (err) {
        this.logger.error(
          { err, deliveryId: delivery.id },
          'Delivery execution failed'
        )
      }
    }

    this.processing = false
  }

  private async executeDelivery(delivery: WebhookDelivery): Promise<void> {
    const { webhookUrl, payload, id } = delivery

    try {
      const body = JSON.stringify(payload)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': payload.event,
        'X-Webhook-Session': payload.sessionId,
        'X-Delivery-Id': id,
      }

      // If payload was signed by dispatcher, include signature header
      if (typeof delivery.payload.signature === 'string') {
        headers['X-Webhook-Signature'] = `sha256=${delivery.payload.signature}`
      }

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      this.logger.debug(
        { deliveryId: id, status: res.status },
        'Webhook delivered'
      )
    } catch (err) {
      delivery.attempts++

      if (delivery.attempts < this.maxRetries) {
        const delay = this.baseDelayMs * 2 ** (delivery.attempts - 1)
        delivery.nextRetryAt = Date.now() + delay

        this.queue.push(delivery)
        this.logger.warn(
          { err, deliveryId: id, attempt: delivery.attempts, nextRetryMs: delay },
          'Webhook delivery failed, scheduling retry'
        )
      } else {
        this.logger.error(
          { err, deliveryId: id, attempts: delivery.attempts },
          'Webhook delivery permanently failed'
        )
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
