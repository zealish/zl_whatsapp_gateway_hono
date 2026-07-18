import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createWebhookSchema } from '../schemas/webhook.js'
import { successResponse } from '../lib/response.js'
import { NotFoundError } from '../lib/errors.js'
import type { WebhookDispatcher } from '../webhook/dispatcher.js'

export function createWebhookConfigRoutes(
  webhookDispatcher: WebhookDispatcher
): Hono {
  const routes = new Hono()

  // POST /session/:id/webhook — Register webhook
  routes.post('/:id/webhook', zValidator('json', createWebhookSchema), async (c) => {
    const sessionId = c.req.param('id')
    const { url, secret, events } = c.req.valid('json')

    const config = await webhookDispatcher.setConfig(
      sessionId,
      url,
      secret,
      events
    )
    return c.json(successResponse(config), 201)
  })

  // GET /session/:id/webhook — Get webhook config
  routes.get('/:id/webhook', async (c) => {
    const sessionId = c.req.param('id')
    const config = await webhookDispatcher.getConfig(sessionId)
    if (!config) {
      throw new NotFoundError('Webhook config', sessionId)
    }
    return c.json(successResponse(config))
  })

  // DELETE /session/:id/webhook — Remove webhook
  routes.delete('/:id/webhook', async (c) => {
    const sessionId = c.req.param('id')
    const deleted = await webhookDispatcher.deleteConfig(sessionId)
    if (!deleted) {
      throw new NotFoundError('Webhook config', sessionId)
    }
    return c.json(successResponse({ deleted: true }))
  })

  return routes
}
