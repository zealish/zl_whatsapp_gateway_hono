import type pino from 'pino'
import type { IBaileysAdapter } from '../types/whatsapp.js'
import type { WebhookDispatcher } from '../webhook/dispatcher.js'
import type { WebhookEvent } from '../schemas/webhook.js'

/**
 * Wires Baileys adapter events to WebhookDispatcher.
 * Normalizes WA events into a common payload shape before dispatching.
 */
export class MessageHandler {
  private adapter: IBaileysAdapter
  private dispatcher: WebhookDispatcher
  private sessionId: string
  private logger: pino.Logger

  constructor(
    sessionId: string,
    adapter: IBaileysAdapter,
    dispatcher: WebhookDispatcher,
    logger: pino.Logger
  ) {
    this.sessionId = sessionId
    this.adapter = adapter
    this.dispatcher = dispatcher
    this.logger = logger.child({ module: 'MessageHandler', sessionId })
  }

  attach(): void {
    const events: WebhookEvent[] = [
      'messages.upsert',
      'messages.update',
      'messages.delete',
      'messages.reaction',
      'contacts.upsert',
      'contacts.update',
      'groups.upsert',
      'groups.update',
      'group-participants.update',
      'connection.update',
      'creds.update',
      'message-receipt.update',
      'blocklist.set',
      'blocklist.update',
      'call',
    ]

    for (const event of events) {
      this.adapter.on(event, (...args: unknown[]) => {
        this.handleEvent(event, args)
      })
    }

    this.logger.info('MessageHandler attached to adapter events')
  }

  detach(): void {
    // Events are cleaned up when adapter.disconnect() is called
    this.logger.info('MessageHandler detached')
  }

  private handleEvent(event: string, args: unknown[]): void {
    try {
      const payload = this.normalizeEvent(event, args)

      this.dispatcher.dispatch(this.sessionId, {
        event: event as WebhookEvent,
        sessionId: this.sessionId,
        data: payload,
        timestamp: Date.now(),
      }).catch((err) => {
        this.logger.error({ err, event }, 'Webhook dispatch failed')
      })
    } catch (err) {
      this.logger.error({ err, event }, 'Failed to normalize event')
    }
  }

  private normalizeEvent(event: string, args: unknown[]): unknown {
    // For messages.upsert, extract useful fields
    if (event === 'messages.upsert') {
      const upsert = args[0] as any
      return {
        type: upsert?.type,
        messages: (upsert?.messages ?? []).map((msg: any) => ({
          key: msg.key,
          message: msg.message,
          messageTimestamp: msg.messageTimestamp,
          pushName: msg.pushName,
          participant: msg.participant,
        })),
      }
    }

    // For connection.update
    if (event === 'connection.update') {
      const update = args[0] as any
      return {
        connection: update?.connection,
        hasQr: !!update?.qr,
        lastDisconnect: update?.lastDisconnect
          ? {
              statusCode:
                update.lastDisconnect?.error?.output?.statusCode ??
                update.lastDisconnect?.error?.statusCode,
            }
          : undefined,
      }
    }

    // For group-participants.update
    if (event === 'group-participants.update') {
      const update = args[0] as any
      return {
        groupJid: update?.id,
        action: update?.action,
        participants: update?.participants,
      }
    }

    // For everything else, pass through
    return args[0] ?? null
  }
}
