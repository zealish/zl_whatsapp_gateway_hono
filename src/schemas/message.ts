import { z } from 'zod'
import { recipientSchema, phoneNumberSchema } from './common.js'

// ── Shared helpers ──

const toField = { to: recipientSchema.describe('Recipient: phone number (e.g. 6281234567890) or group JID (e.g. 120363...@g.us)') }

const mediaFields = {
  url: z.string().url().optional().describe('Media URL'),
  base64: z.string().optional().describe('Base64-encoded media data'),
}

const mediaRefinement = {
  message: 'Either url or base64 must be provided',
}

// ── Individual type schemas ──

const sendTextBody = z.object({
  type: z.literal('text'),
  ...toField,
  text: z.string().min(1).max(65536).describe('Message text'),
  quotedMessageId: z.string().optional().describe('Message ID to quote'),
  mentions: z.array(phoneNumberSchema).optional().describe('Phone numbers to @mention (e.g. ["6281234567890"])'),
})

const sendImageBody = z
  .object({
    type: z.literal('image'),
    ...toField,
    ...mediaFields,
    caption: z.string().max(1024).optional().describe('Image caption'),
    mimetype: z.string().default('image/jpeg').describe('MIME type'),
    viewOnce: z.boolean().optional().describe('Send as view-once media'),
  })
  .refine((d) => d.url || d.base64, mediaRefinement)

const sendVideoBody = z
  .object({
    type: z.literal('video'),
    ...toField,
    ...mediaFields,
    caption: z.string().max(1024).optional().describe('Video caption'),
    mimetype: z.string().default('video/mp4').describe('MIME type'),
    gifPlayback: z.boolean().optional().describe('Send as GIF'),
    viewOnce: z.boolean().optional().describe('Send as view-once media'),
  })
  .refine((d) => d.url || d.base64, mediaRefinement)

const sendAudioBody = z
  .object({
    type: z.literal('audio'),
    ...toField,
    ...mediaFields,
    mimetype: z.string().default('audio/mpeg').describe('MIME type'),
    ptt: z.boolean().default(false).describe('Push-to-talk (voice note)'),
    seconds: z.number().min(0).optional().describe('Audio duration in seconds'),
    viewOnce: z.boolean().optional().describe('Send as view-once media'),
  })
  .refine((d) => d.url || d.base64, mediaRefinement)

const sendStickerBody = z
  .object({
    type: z.literal('sticker'),
    ...toField,
    ...mediaFields,
    mimetype: z.string().default('image/webp').describe('MIME type'),
  })
  .refine((d) => d.url || d.base64, mediaRefinement)

const sendDocumentBody = z
  .object({
    type: z.literal('document'),
    ...toField,
    ...mediaFields,
    filename: z.string().optional().describe('Document filename'),
    mimetype: z.string().default('application/pdf').describe('MIME type'),
    caption: z.string().max(1024).optional().describe('Document caption'),
  })
  .refine((d) => d.url || d.base64, mediaRefinement)

const sendLocationBody = z.object({
  type: z.literal('location'),
  ...toField,
  latitude: z.number().min(-90).max(90).describe('Latitude'),
  longitude: z.number().min(-180).max(180).describe('Longitude'),
  live: z.boolean().optional().describe('Send as live location'),
})

const sendContactBody = z.object({
  type: z.literal('contact'),
  ...toField,
  contactName: z.string().min(1).max(256).describe('Contact display name'),
  contactNumber: z.string().min(8).max(20).describe('Contact phone number'),
})

const sendReactionBody = z.object({
  type: z.literal('reaction'),
  ...toField,
  emoji: z.string().max(16).describe('Emoji to react with (empty string to remove)'),
  messageId: z.string().min(1).describe('Message ID to react to'),
})

const sendPollBody = z.object({
  type: z.literal('poll'),
  ...toField,
  name: z.string().min(1).max(256).describe('Poll question'),
  options: z.array(z.string().min(1).max(128)).min(2).max(12).describe('Poll options'),
  selectableCount: z.number().min(1).default(1).describe('Number of selectable options'),
})

const sendForwardBody = z.object({
  type: z.literal('forward'),
  ...toField,
  fromJid: recipientSchema.describe('Chat JID containing the message (phone number or group JID)'),
  messageId: z.string().min(1).describe('Message ID to forward'),
})

// ── Interactive Messages ──

const sendButtonsBody = z.object({
  type: z.literal('buttons'),
  ...toField,
  body: z.string().min(1).max(1024).describe('Message body text'),
  footer: z.string().max(64).optional().describe('Footer text'),
  header: z.string().max(64).optional().describe('Header title'),
  buttons: z
    .array(
      z.object({
        id: z.string().min(1).max(256).describe('Button ID (returned when clicked)'),
        displayText: z.string().min(1).max(256).describe('Button display text'),
      })
    )
    .min(1)
    .max(3)
    .describe('Quick reply buttons (max 3)'),
})

const sendListRowSchema = z.object({
  id: z.string().min(1).max(256).describe('Row ID (returned when selected)'),
  title: z.string().min(1).max(256).describe('Row title'),
  description: z.string().max(72).optional().describe('Row description'),
})

const sendListSectionSchema = z.object({
  title: z.string().min(1).max(256).describe('Section title'),
  rows: z.array(sendListRowSchema).min(1).describe('Rows in this section'),
})

const sendListBody = z.object({
  type: z.literal('list'),
  ...toField,
  title: z.string().min(1).max(256).describe('List message title'),
  body: z.string().max(1024).optional().describe('List message body text'),
  footer: z.string().max(64).optional().describe('Footer text'),
  buttonText: z.string().min(1).max(20).describe('Button text that opens the list'),
  sections: z.array(sendListSectionSchema).min(1).describe('List sections'),
})

const sendCtaUrlBody = z.object({
  type: z.literal('cta_url'),
  ...toField,
  body: z.string().min(1).max(1024).describe('Message body text'),
  footer: z.string().max(64).optional().describe('Footer text'),
  header: z.string().max(64).optional().describe('Header title'),
  buttons: z
    .array(
      z.object({
        displayText: z.string().min(1).max(256).describe('Button display text'),
        url: z.string().url().describe('URL to open when button is clicked'),
      })
    )
    .min(1)
    .max(1)
    .describe('CTA URL button (exactly 1)'),
})

// ── Discriminated union: all send types ──
// Note: ZodEffects (from .refine()) cannot be used directly in discriminatedUnion.
// We use .or() chaining for the refined types, but discriminatedUnion requires
// raw ZodObject types. So we use a custom approach: validate type first, then
// validate the full body.

// For discriminatedUnion to work, all members must be ZodObject (not ZodEffects).
// The media types use .refine() which wraps them in ZodEffects.
// Solution: use z.union() which accepts ZodEffects.

export const sendSchema = z.union([
  sendTextBody,
  sendImageBody,
  sendVideoBody,
  sendAudioBody,
  sendStickerBody,
  sendDocumentBody,
  sendLocationBody,
  sendContactBody,
  sendReactionBody,
  sendPollBody,
  sendForwardBody,
  sendButtonsBody,
  sendListBody,
  sendCtaUrlBody,
])

// ── Edit message ──

export const editMessageSchema = z.object({
  to: recipientSchema.describe('Chat containing the message (phone number or group JID)'),
  messageId: z.string().min(1).describe('Message ID to edit'),
  text: z.string().min(1).max(65536).describe('New text content'),
})

// ── Delete message ──

export const deleteMessageSchema = z.object({
  to: recipientSchema.describe('Chat containing the message (phone number or group JID)'),
  messageId: z.string().min(1).describe('Message ID to delete'),
})

// ── Type exports ──

export type SendBody = z.infer<typeof sendSchema>
export type EditMessageBody = z.infer<typeof editMessageSchema>
export type DeleteMessageBody = z.infer<typeof deleteMessageSchema>
