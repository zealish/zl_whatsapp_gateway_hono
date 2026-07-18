import { z } from 'zod'

/**
 * WhatsApp JID format: user@s.whatsapp.net or group@g.us
 */
export const jidSchema = z
  .string()
  .min(1)
  .regex(
    /^[\d-]+(@s\.whatsapp\.net|@g\.us|@lid)$/,
    'Invalid JID format. Expected: number@s.whatsapp.net | number@g.us | number@lid'
  )

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
