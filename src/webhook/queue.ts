import type pino from 'pino'
import type { GatewayEventEnvelope, PendingDelivery } from './types.js'
import type { QueueDB } from './queue-db.js'

/**
 * SQLite-backed persistent webhook delivery queue.
 * Processes deliveries per-instance in sequence order.
 * Cross-instance deliveries run in parallel.
 */
export class WebhookQueue {
  private db: QueueDB
  private logger: pino.Logger
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private processing = new Set<string>() // instance IDs currently being processed
  private maxRetries: number
  private retrySchedule = [10_000, 30_000, 60_000, 300_000, 900_000]

  constructor(db: QueueDB, maxRetries: number, logger: pino.Logger) {
    this.db = db
    this.maxRetries = maxRetries
    this.logger = logger.child({ module: 'WebhookQueue' })
  }

  enqueue(delivery: {
    id: string
    instanceId: string
    sequence: number
    webhookUrl: string
    payload: GatewayEventEnvelope
  }): void {
    this.db.enqueue({
      ...delivery,
      attempts: 0,
      nextRetryAt: Date.now(),
      createdAt: Date.now(),
    })
    this.logger.debug(
      { deliveryId: delivery.id, instanceId: delivery.instanceId, sequence: delivery.sequence },
      'Enqueued webhook delivery'
    )
    // Trigger immediate processing
    this.processReady()
  }

  get size(): number {
    const rows = this.db.dequeueReady()
    return rows.length
  }

  start(): void {
    if (this.pollTimer) return
    this.pollTimer = setInterval(() => this.processReady(), 1_000)
    this.logger.info('Webhook queue polling started')
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.logger.info('Webhook queue polling stopped')
  }

  private async processReady(): Promise<void> {
    const ready = this.db.dequeueReady()
    if (ready.length === 0) return

    // Group by instance for ordered processing
    const byInstance = new Map<string, PendingDelivery[]>()
    for (const delivery of ready) {
      const group = byInstance.get(delivery.instance_id) ?? []
      group.push(delivery)
      byInstance.set(delivery.instance_id, group)
    }

    // Process each instance group in parallel, but within instance: sequential
    const promises: Promise<void>[] = []
    for (const [instanceId, deliveries] of byInstance) {
      if (this.processing.has(instanceId)) continue
      this.processing.add(instanceId)
      promises.push(
        this.processInstanceDeliveries(instanceId, deliveries).finally(() => {
          this.processing.delete(instanceId)
        })
      )
    }

    await Promise.allSettled(promises)
  }

  private async processInstanceDeliveries(
    instanceId: string,
    deliveries: PendingDelivery[]
  ): Promise<void> {
    // Sort by sequence to ensure ordering
    deliveries.sort((a, b) => a.sequence - b.sequence)

    for (const delivery of deliveries) {
      try {
        await this.executeDelivery(delivery)
      } catch (err) {
        this.logger.error(
          { err, deliveryId: delivery.id, instanceId },
          'Delivery execution error'
        )
      }
    }
  }

  private async executeDelivery(delivery: PendingDelivery): Promise<void> {
    const payload = JSON.parse(delivery.payload) as GatewayEventEnvelope

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Instance-Id': delivery.instance_id,
        'X-Event': payload.event,
        'X-Timestamp': String(payload.timestamp),
        'X-Sequence': String(delivery.sequence),
        'X-Delivery-Id': payload.eventId,
      }

      // Include signature if present in payload
      if (typeof (payload as any).signature === 'string') {
        headers['X-Signature'] = `sha256=${(payload as any).signature}`
      }

      const res = await fetch(delivery.webhook_url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      })

      if (res.status === 200 || res.status === 201 || res.status === 202) {
        this.db.markDelivered(delivery.id)
        this.logger.debug(
          { deliveryId: delivery.id, status: res.status, instanceId: delivery.instance_id },
          'Webhook delivered'
        )
        return
      }

      // Non-2xx → retry
      throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      const newAttempts = delivery.attempts + 1
      const errorMsg = err instanceof Error ? err.message : String(err)

      if (newAttempts >= this.maxRetries) {
        // Move to DLQ
        this.db.moveToDLQ(delivery.id, errorMsg)
        this.logger.error(
          { deliveryId: delivery.id, attempts: newAttempts, error: errorMsg },
          'Webhook delivery permanently failed — moved to DLQ'
        )
        return
      }

      // Schedule retry
      const delay = this.computeNextRetry(newAttempts)
      this.db.markFailed(delivery.id, newAttempts, Date.now() + delay)
      this.logger.warn(
        { deliveryId: delivery.id, attempt: newAttempts, nextRetryMs: delay, error: errorMsg },
        'Webhook delivery failed, scheduling retry'
      )
    }
  }

  private computeNextRetry(attempt: number): number {
    const index = Math.min(attempt - 1, this.retrySchedule.length - 1)
    return this.retrySchedule[index]
  }
}
