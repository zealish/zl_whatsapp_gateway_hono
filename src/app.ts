import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { pinoLogger } from 'hono-pino'
import type pino from 'pino'
import type { Config } from './config.js'
import type { Container } from './di/container.js'
import { DI } from './di/container.js'
import { apiKeyMiddleware } from './middleware/api-key.js'
import { requestIdMiddleware } from './middleware/request-id.js'
import { errorHandler } from './middleware/error-handler.js'
import { createSessionRoutes } from './routes/session.js'
import { createMessageRoutes } from './routes/message.js'
import { createContactRoutes } from './routes/contact.js'
import { createGroupRoutes } from './routes/group.js'
import { createWebhookConfigRoutes } from './routes/webhook-config.js'
import { createDocsRoutes } from './routes/docs.js'
import health from './routes/health.js'
import type { SessionManager } from './services/session-manager.js'
import type { IWhatsAppService } from './types/whatsapp.js'
import type { WebhookDispatcher } from './webhook/dispatcher.js'

export function createApp(container: Container): Hono {
  const config = container.resolve<Config>(DI.Config)
  const logger = container.resolve<pino.Logger>(DI.Logger)
  const sessionManager = container.resolve<SessionManager>(DI.SessionManager)
  const whatsappService = container.resolve<IWhatsAppService>(DI.WhatsAppService)
  const webhookDispatcher = container.resolve<WebhookDispatcher>(DI.WebhookDispatcher)

  const app = new Hono()

  // ── Global middleware ──
  app.use('*', secureHeaders())
  app.use('*', cors())
  app.use('*', requestIdMiddleware())
  app.use('*', pinoLogger({ pino: logger }))

  // ── Public routes (no auth) ──
  app.route('/health', health)

  // ── Docs (public if enabled) ──
  if (config.DOCS_ENABLED) {
    app.route('/docs', createDocsRoutes())
  }

  // ── Protected routes (API key required) ──
  app.use('/session/*', apiKeyMiddleware(config.API_KEY))

  app.route('/session', createSessionRoutes(sessionManager, whatsappService))
  app.route('/session', createMessageRoutes(whatsappService))
  app.route('/session', createContactRoutes(whatsappService))
  app.route('/session', createGroupRoutes(whatsappService))
  app.route('/session', createWebhookConfigRoutes(webhookDispatcher))

  // ── Error handler (must be last) ──
  app.onError(errorHandler)

  // ── 404 fallback ──
  app.notFound((c) => {
    return c.json(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: `Route ${c.req.method} ${c.req.path} not found` },
      },
      404
    )
  })

  logger.info('App initialized')
  return app
}
