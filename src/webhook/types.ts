import type { WebhookEvent } from '../schemas/webhook.js'

export interface GatewayEventEnvelope {
  eventId: string
  instanceId: string
  sequence: number
  historySessionId?: string
  event: string
  timestamp: number
  payload: unknown
}

export interface WebhookConfig {
  url: string
  secret?: string
  events?: WebhookEvent[]
  createdAt: number
}

export interface WebhookDelivery {
  id: string
  instanceId: string
  sequence: number
  webhookUrl: string
  payload: GatewayEventEnvelope
  attempts: number
  nextRetryAt: number
  createdAt: number
}

export interface PendingDelivery {
  id: string
  instance_id: string
  sequence: number
  webhook_url: string
  payload: string // JSON string
  attempts: number
  next_retry_at: number
  created_at: number
  status: string
}
