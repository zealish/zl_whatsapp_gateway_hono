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
import { createDLQRoutes } from './routes/dlq.js'
import { createMediaRoutes } from './routes/media.js'
import { createApiDocsRoutes } from './routes/api-docs.js'
import { createDocsRoutes } from './docs/routes.js'
import health from './routes/health.js'
import type { SessionManager } from './services/session-manager.js'
import type { IWhatsAppService } from './types/whatsapp.js'
import type { WebhookDispatcher } from './webhook/dispatcher.js'
import type { QueueDB } from './webhook/queue-db.js'

export function createApp(container: Container): Hono {
  const config = container.resolve<Config>(DI.Config)
  const logger = container.resolve<pino.Logger>(DI.Logger)
  const sessionManager = container.resolve<SessionManager>(DI.SessionManager)
  const whatsappService = container.resolve<IWhatsAppService>(DI.WhatsAppService)
  const webhookDispatcher = container.resolve<WebhookDispatcher>(DI.WebhookDispatcher)
  const queueDB = container.resolve<QueueDB>(DI.QueueDB)

  const app = new Hono()
  const api = new Hono()

  // ── Global middleware (root level) ──
  app.use('*', secureHeaders())
  app.use('*', cors())

  // ── API-level middleware ──
  api.use('*', requestIdMiddleware())
  api.use('*', pinoLogger({ pino: logger }))

  // ── Public routes (no auth) ──
  api.route('/health', health)

  // ── API Reference - Swagger (public if enabled) ──
  if (config.DOCS_ENABLED) {
    api.route('/reference', createApiDocsRoutes(config))
  }

  // ── Protected routes (API key required) ──
  api.use('/session/*', apiKeyMiddleware(config.API_KEY))

  api.route('/session', createSessionRoutes(sessionManager, whatsappService))
  api.route('/session', createMessageRoutes(whatsappService))
  api.route('/session', createMediaRoutes(whatsappService))
  api.route('/session', createContactRoutes(whatsappService))
  api.route('/session', createGroupRoutes(whatsappService))
  api.route('/session', createWebhookConfigRoutes(webhookDispatcher))

  // ── DLQ routes (protected) ──
  api.use('/dlq/*', apiKeyMiddleware(config.API_KEY))
  api.route('/dlq', createDLQRoutes(queueDB))

  // ── Error handler ──
  api.onError(errorHandler)

  // ── 404 fallback ──
  api.notFound((c) => {
    return c.json(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: `Route ${c.req.method} ${c.req.path} not found` },
      },
      404
    )
  })

  // ── Documentation (public, outside BASE_URL) ──
  if (config.DOCS_ENABLED) {
    app.route('/', createDocsRoutes())
  }

  // ── Mount API under BASE_URL ──
  app.route(config.BASE_URL, api)

  // ── Root-level 404 for anything outside BASE_URL ──
  app.notFound((c) => {
    return c.json(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: `Route ${c.req.method} ${c.req.path} not found` },
      },
      404
    )
  })

  logger.info({ baseUrl: config.BASE_URL }, 'App initialized')
  return app
}
