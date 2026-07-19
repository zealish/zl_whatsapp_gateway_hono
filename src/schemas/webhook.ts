import { z } from 'zod'

// ── Canonical (new) event names ──
export const canonicalEventSchema = z.enum([
  'messages.created',
  'messages.updated',
  'messages.deleted',
  'messages.reaction',
  'contacts.updated',
  'contacts.sync',
  'groups.updated',
  'group-participants.updated',
  'receipts.updated',
  'connection.update',
  'blocklist.set',
  'blocklist.updated',
  'call',
  // History sync events
  'chats.sync',
  'messages.sync',
  'history.progress',
  'history.finished',
])

// ── Legacy (deprecated) Baileys event names ──
export const legacyEventSchema = z.enum([
  'messages.upsert',
  'messages.update',
  'messages.delete',
  'contacts.upsert',
  'contacts.update',
  'groups.upsert',
  'groups.update',
  'group-participants.update',
  'message-receipt.update',
  'blocklist.update',
  'creds.update',
])

// ── Combined: consumers can subscribe to either canonical or legacy names ──
export const webhookEventSchema = z.union([
  canonicalEventSchema,
  legacyEventSchema,
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
export type CanonicalEvent = z.infer<typeof canonicalEventSchema>
export type LegacyEvent = z.infer<typeof legacyEventSchema>
