import { randomUUID } from 'node:crypto'
import { readdir, rm, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type pino from 'pino'
import type { SessionInfo, IWhatsAppService } from '../types/whatsapp.js'
import type { WebhookDispatcher } from '../webhook/dispatcher.js'
import type { ContactResolver } from '../whatsapp/contact-resolver.js'
import type { LidMappingStore } from '../whatsapp/lid-mapping.js'
import { ConnectionManager } from '../whatsapp/connection-manager.js'
import { MessageHandler } from '../whatsapp/message-handler.js'
import type { BatchConfig } from '../whatsapp/history-sync-handler.js'
import { ConflictError, NotFoundError } from '../lib/errors.js'

interface Session {
  connectionManager: ConnectionManager
  messageHandler: MessageHandler
}

/**
 * Registry of all active sessions.
 * Manages creation, lookup, destruction, and auto-restore on boot.
 */
export class SessionManager {
  private sessions = new Map<string, Session>()
  private sessionsDir: string
  private webhookDispatcher: WebhookDispatcher
  private contactResolver: ContactResolver
  private lidMapping: LidMappingStore | null
  private batchConfig: BatchConfig
  private logger: pino.Logger

  constructor(
    sessionsDir: string,
    webhookDispatcher: WebhookDispatcher,
    contactResolver: ContactResolver,
    logger: pino.Logger,
    batchConfig?: BatchConfig,
    lidMapping?: LidMappingStore | null
  ) {
    this.sessionsDir = sessionsDir
    this.webhookDispatcher = webhookDispatcher
    this.contactResolver = contactResolver
    this.lidMapping = lidMapping ?? null
    this.logger = logger.child({ module: 'SessionManager' })
    this.batchConfig = batchConfig ?? {
      messages: 250,
      chats: 200,
    }
  }

  /**
   * Restore sessions from disk on startup.
   * When autoConnect is true, each restored session is also connected.
   */
  async restore(autoConnect = false): Promise<string[]> {
    await mkdir(this.sessionsDir, { recursive: true })

    if (!existsSync(this.sessionsDir)) {
      return []
    }

    const entries = await readdir(this.sessionsDir, { withFileTypes: true })
    const restoredIds: string[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const sessionId = entry.name

      // Only restore if creds.json exists
      const credsPath = join(this.sessionsDir, sessionId, 'creds.json')
      if (!existsSync(credsPath)) continue

      try {
        this.registerSession(sessionId)
        restoredIds.push(sessionId)
        this.logger.info({ sessionId }, 'Session restored from disk')
      } catch (err) {
        this.logger.error({ err, sessionId }, 'Failed to restore session')
      }
    }

    // Auto-connect all restored sessions
    if (autoConnect) {
      for (const sessionId of restoredIds) {
        try {
          await this.connectSession(sessionId)
          this.logger.info({ sessionId }, 'Session auto-connected on startup')
        } catch (err) {
          this.logger.error({ err, sessionId }, 'Failed to auto-connect session')
        }
      }
    }

    return restoredIds
  }

  createSession(customId?: string): SessionInfo {
    const id = customId ?? randomUUID()

    if (this.sessions.has(id)) {
      throw new ConflictError(`Session '${id}' already exists`)
    }

    this.registerSession(id)
    this.logger.info({ sessionId: id }, 'Session created')

    return {
      id,
      state: 'close',
    }
  }

  async connectSession(sessionId: string): Promise<SessionInfo> {
    const session = this.getSessionOrThrow(sessionId)
    const sessionDir = join(this.sessionsDir, sessionId)
    await mkdir(sessionDir, { recursive: true })

    const info = await session.connectionManager.connect()

    // Register LID resolver (Baileys adapter) for this session
    this.webhookDispatcher.registerLidResolver(
      sessionId,
      (lid: string) => session.connectionManager.adapter.resolveLidToPhone(lid)
    )

    // Attach message handler after connect
    session.messageHandler.attach()

    return info
  }

  async disconnectSession(sessionId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId)
    session.messageHandler.detach()
    this.webhookDispatcher.unregisterLidResolver(sessionId)
    await session.connectionManager.disconnect()
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new NotFoundError('Session', sessionId)
    }

    session.messageHandler.detach()
    this.webhookDispatcher.unregisterLidResolver(sessionId)
    await session.connectionManager.disconnect()
    this.sessions.delete(sessionId)

    // Delete auth files
    const sessionDir = join(this.sessionsDir, sessionId)
    if (existsSync(sessionDir)) {
      await rm(sessionDir, { recursive: true, force: true })
    }

    // Delete webhook config
    await this.webhookDispatcher.deleteConfig(sessionId).catch(() => {})

    this.logger.info({ sessionId }, 'Session destroyed')
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)
  }

  getSessionOrThrow(sessionId: string): Session {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new NotFoundError('Session', sessionId)
    }
    return session
  }

  getStatus(sessionId: string): SessionInfo {
    const session = this.getSessionOrThrow(sessionId)
    return session.connectionManager.getStatus()
  }

  listSessions(): SessionInfo[] {
    const result: SessionInfo[] = []
    for (const [id, session] of this.sessions) {
      result.push(session.connectionManager.getStatus())
    }
    return result
  }

  async disconnectAll(): Promise<void> {
    const promises: Promise<void>[] = []
    for (const [id, session] of this.sessions) {
      session.messageHandler.detach()
      promises.push(
        session.connectionManager.disconnect().catch((err) => {
          this.logger.error({ err, sessionId: id }, 'Failed to disconnect session')
        })
      )
    }
    await Promise.allSettled(promises)
    this.logger.info('All sessions disconnected')
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  get size(): number {
    return this.sessions.size
  }

  private registerSession(sessionId: string): void {
    const sessionDir = join(this.sessionsDir, sessionId)

    const connectionManager = new ConnectionManager(
      sessionId,
      sessionDir,
      this.logger
    )

    const messageHandler = new MessageHandler(
      sessionId,
      connectionManager.adapter,
      this.webhookDispatcher,
      this.batchConfig,
      this.contactResolver,
      this.logger,
      this.lidMapping,
      () => this.webhookDispatcher.markHistorySynced(sessionId)
    )

    this.sessions.set(sessionId, { connectionManager, messageHandler })
  }
}
