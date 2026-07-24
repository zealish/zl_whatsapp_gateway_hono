import { z } from 'zod'

/**
 * Recipient identifier: bare phone number (personal) or @g.us JID (group).
 * - Digits only (8-15 chars) → personal contact (will be converted to @s.whatsapp.net server-side)
 * - Ends with @g.us → group JID (passthrough)
 * - Ends with @s.whatsapp.net → backward compat (accepted, stripped internally)
 */
export const recipientSchema = z
  .string()
  .min(1)
  .refine(
    (v) =>
      /^\d{8,15}$/.test(v) || /^[\d-]+(@s\.whatsapp\.net|@g\.us)$/.test(v),
    'Invalid recipient. Use bare phone number (e.g. 6281234567890) or group JID (e.g. 120363...@g.us)'
  )

/** @deprecated Use recipientSchema for new code */
export const jidSchema = recipientSchema // backward compat alias

export const sessionIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Session ID must be alphanumeric with - or _')

export const phoneNumberSchema = z
  .string()
  .min(8)
  .max(15)
  .regex(/^\d+$/, 'Phone number must be digits only (E.164 without +)')

export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
})
