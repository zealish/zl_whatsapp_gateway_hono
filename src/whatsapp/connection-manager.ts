import type pino from 'pino'
import type { IBaileysAdapter, SessionInfo } from '../types/whatsapp.js'
import { BaileysAdapter } from './baileys-adapter.js'
import { DisconnectReason } from 'baileys'

/**
 * Manages a single WhatsApp session lifecycle:
 * connect, reconnect, QR, disconnect.
 */
export class ConnectionManager {
  readonly sessionId: string
  readonly adapter: IBaileysAdapter

  private logger: pino.Logger
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private eventsRegistered = false

  constructor(sessionId: string, sessionDir: string, logger: pino.Logger) {
    this.sessionId = sessionId
    this.logger = logger.child({ module: 'ConnectionManager', sessionId })
    this.adapter = new BaileysAdapter(sessionDir, logger)
  }

  async connect(): Promise<SessionInfo> {
    this.reconnectAttempts = 0

    // Register event handlers once
    if (!this.eventsRegistered) {
      this.eventsRegistered = true
      this.adapter.on('connection.close', (data: unknown) => {
        const { statusCode } = data as { statusCode: number }
        this.handleDisconnect(statusCode)
      })

      this.adapter.on('connection.open', () => {
        this.reconnectAttempts = 0
      })
    }

    await this.adapter.connect()
    return this.getStatus()
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.reconnectAttempts = this.maxReconnectAttempts // prevent reconnect
    await this.adapter.disconnect()
  }

  getStatus(): SessionInfo {
    return {
      id: this.sessionId,
      state: this.adapter.getConnectionState(),
      pushName: this.adapter.getPushName(),
      qr: this.adapter.getQr(),
    }
  }

  getQr(): string | null {
    return this.adapter.getQr()
  }

  private handleDisconnect(statusCode: number): void {
    if (statusCode === DisconnectReason.loggedOut) {
      this.logger.warn('Session logged out, will not reconnect')
      return
    }

    if (statusCode === DisconnectReason.forbidden) {
      this.logger.warn({ statusCode }, 'Session forbidden, will not reconnect')
      return
    }

    // Stop reconnect on non-recoverable 4xx errors (e.g. 405 Method Not Allowed)
    // These indicate corrupted auth state that cannot be recovered by retrying
    if (statusCode >= 400 && statusCode < 500 && statusCode !== DisconnectReason.connectionLost) {
      this.logger.warn({ statusCode }, 'Non-recoverable client error, will not reconnect')
      return
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.warn(
        { attempts: this.reconnectAttempts },
        'Max reconnect attempts reached'
      )
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000)

    this.logger.info(
      { attempt: this.reconnectAttempts, delayMs: delay },
      'Scheduling reconnect'
    )

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.adapter.connect()
      } catch (err) {
        this.logger.error({ err }, 'Reconnect failed')
        this.handleDisconnect(0)
      }
    }, delay)
  }
}
