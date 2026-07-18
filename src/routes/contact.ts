import { Hono } from 'hono'
import { successResponse } from '../lib/response.js'
import { NotFoundError } from '../lib/errors.js'
import type { IWhatsAppService } from '../types/whatsapp.js'

export function createContactRoutes(whatsappService: IWhatsAppService): Hono {
  const routes = new Hono()

  // GET /session/:id/contact/:jid
  routes.get('/:id/contact/:jid', async (c) => {
    const sessionId = c.req.param('id')
    const jid = c.req.param('jid')

    const contact = await whatsappService.getContact(sessionId, jid)
    if (!contact) {
      throw new NotFoundError('Contact', jid)
    }

    return c.json(successResponse(contact))
  })

  return routes
}
