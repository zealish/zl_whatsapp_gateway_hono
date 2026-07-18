import { z } from 'zod'

export const webhookEventSchema = z.enum([
  'messages.upsert',
  'messages.update',
  'messages.delete',
  'messages.reaction',
  'contacts.upsert',
  'contacts.update',
  'groups.upsert',
  'groups.update',
  'group-participants.update',
  'connection.update',
  'creds.update',
  'message-receipt.update',
  'blocklist.set',
  'blocklist.update',
  'call',
])

export const createWebhookSchema = z.object({
  url: z.string().url('Must be a valid URL').describe('Webhook endpoint URL'),
  secret: z
    .string()
    .min(16)
    .max(256)
    .optional()
    .describe('HMAC-SHA256 signing secret (auto-generated if omitted)'),
  events: z
    .array(webhookEventSchema)
    .min(1)
    .optional()
    .describe('Events to subscribe to (all if omitted)'),
})

export type CreateWebhookBody = z.infer<typeof createWebhookSchema>
export type WebhookEvent = z.infer<typeof webhookEventSchema>
