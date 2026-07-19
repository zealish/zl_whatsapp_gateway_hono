import 'dotenv/config'
import { serve } from '@hono/node-server'
import { config } from './config.js'
import { createLogger } from './lib/logger.js'
import { Container, DI } from './di/container.js'
import { QueueDB } from './webhook/queue-db.js'
import { WebhookQueue } from './webhook/queue.js'
import { WebhookDispatcher } from './webhook/dispatcher.js'
import { SessionManager } from './services/session-manager.js'
import { WhatsAppService } from './services/whatsapp-service.js'
import { createApp } from './app.js'

// ── Bootstrap ──

const container = new Container()

// Register config
container.register(DI.Config, () => config)

// Register logger
container.register(DI.Logger, () => createLogger(config))

// Register SQLite queue database (persistent)
container.register(DI.QueueDB, () => {
  return new QueueDB(config.DB_PATH)
})

// Register webhook queue (SQLite-backed)
container.register(DI.WebhookQueue, () => {
  const logger = container.resolve<ReturnType<typeof createLogger>>(DI.Logger)
  const db = container.resolve<QueueDB>(DI.QueueDB)
  return new WebhookQueue(db, config.WEBHOOK_MAX_RETRIES, logger)
})

// Register webhook dispatcher
container.register(DI.WebhookDispatcher, () => {
  const logger = container.resolve<ReturnType<typeof createLogger>>(DI.Logger)
  const db = container.resolve<QueueDB>(DI.QueueDB)
  const queue = container.resolve<WebhookQueue>(DI.WebhookQueue)
  return new WebhookDispatcher(config.WEBHOOK_DIR, db, queue, logger)
})

// Register session manager
container.register(DI.SessionManager, () => {
  const logger = container.resolve<ReturnType<typeof createLogger>>(DI.Logger)
  const webhookDispatcher = container.resolve<WebhookDispatcher>(DI.WebhookDispatcher)
  return new SessionManager(config.SESSIONS_DIR, webhookDispatcher, logger, {
    messages: config.WEBHOOK_BATCH_MESSAGES,
    contacts: config.WEBHOOK_BATCH_CONTACTS,
    chats: config.WEBHOOK_BATCH_CHATS,
  })
})

// Register WhatsApp service
container.register(DI.WhatsAppService, () => {
  const logger = container.resolve<ReturnType<typeof createLogger>>(DI.Logger)
  const sessionManager = container.resolve<SessionManager>(DI.SessionManager)
  return new WhatsAppService(sessionManager, logger)
})

// ── Start ──

async function main(): Promise<void> {
  const logger = container.resolve<ReturnType<typeof createLogger>>(DI.Logger)
  const webhookDispatcher = container.resolve<WebhookDispatcher>(DI.WebhookDispatcher)
  const webhookQueue = container.resolve<WebhookQueue>(DI.WebhookQueue)
  const sessionManager = container.resolve<SessionManager>(DI.SessionManager)

  // Initialize webhook storage
  await webhookDispatcher.init()

  // Start the persistent queue processing loop
  webhookQueue.start()

  // Restore sessions from disk and auto-connect
  const restoredIds = await sessionManager.restore(true)
  if (restoredIds.length > 0) {
    logger.info({ sessions: restoredIds }, 'Restored sessions from disk')
  }

  // Create Hono app
  const app = createApp(container)

  // Start HTTP server
  const server = serve(
    {
      fetch: app.fetch,
      port: config.PORT,
      hostname: config.HOST,
    },
    (info) => {
      logger.info(
        { port: info.port, host: config.HOST },
        `Server running at http://${config.HOST}:${info.port}`
      )
      if (config.DOCS_ENABLED) {
        logger.info(`Swagger UI: http://localhost:${info.port}/docs`)
      }
    }
  )

  // ── Graceful shutdown ──
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal')

    // Stop queue processing
    webhookQueue.stop()

    // Close SQLite database
    const db = container.resolve<QueueDB>(DI.QueueDB)
    db.close()

    // Disconnect all WhatsApp sessions
    await sessionManager.disconnectAll().catch((err) => {
      logger.error({ err }, 'Error disconnecting sessions')
    })

    // Close HTTP server
    server.close((err) => {
      if (err) {
        logger.error({ err }, 'Error closing server')
        process.exit(1)
      }
      logger.info('Server closed')
      process.exit(0)
    })

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout')
      process.exit(1)
    }, 10_000).unref()
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception')
    process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection')
    process.exit(1)
  })
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
