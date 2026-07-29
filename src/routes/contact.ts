import { Hono } from 'hono'
import { successResponse } from '../lib/response.js'
import { NotFoundError } from '../lib/errors.js'
import type { IWhatsAppService } from '../types/whatsapp.js'
import { recipientToJid } from '../whatsapp/normalizers.js'

export function createContactRoutes(whatsappService: IWhatsAppService): Hono {
  const routes = new Hono()

  // GET /session/:id/contact/:recipient
  // Accepts: phone number (e.g. 6281234567890) or group JID (e.g. 120363...@g.us)
  routes.get('/:id/contact/:recipient', async (c) => {
    const sessionId = c.req.param('id')
    const recipient = c.req.param('recipient')

    // Convert recipient to JID (phone → @s.whatsapp.net, @g.us → passthrough)
    const jid = recipientToJid(recipient)

    const contact = await whatsappService.getContact(sessionId, jid)
    if (!contact) {
      throw new NotFoundError('Contact', recipient)
    }

    return c.json(successResponse(contact))
  })

  // POST /session/:id/contact/:recipient/history
  // Manually sync 3-month message history for a specific contact
  routes.post('/:id/contact/:recipient/history', async (c) => {
    const sessionId = c.req.param('id')
    const recipient = c.req.param('recipient')

    const result = await whatsappService.syncContactHistory(sessionId, recipient, { monthsAgo: 3 })

    return c.json(
      successResponse({
        syncId: result.syncId,
        status: 'pending',
      }),
      202
    )
  })

  return routes
}
