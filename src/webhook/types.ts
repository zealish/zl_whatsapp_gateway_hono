import type { WebhookEvent } from '../schemas/webhook.js'

export interface WebhookPayload {
  event: WebhookEvent
  sessionId: string
  data: unknown
  timestamp: number
  signature?: string
}

export interface WebhookConfig {
  url: string
  secret?: string
  events?: WebhookEvent[]
  createdAt: number
}

export interface WebhookDelivery {
  id: string
  webhookUrl: string
  payload: WebhookPayload
  attempts: number
  nextRetryAt: number
}
