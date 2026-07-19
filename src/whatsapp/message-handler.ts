import type pino from 'pino'
import type { IBaileysAdapter } from '../types/whatsapp.js'
import type { WebhookDispatcher } from '../webhook/dispatcher.js'
import { HistorySyncHandler, type BatchConfig } from './history-sync-handler.js'
import {
  normalizeUpsertMessage,
  normalizeMessageUpdate,
  normalizeGroupParticipantsUpdate,
} from './normalizers.js'

/**
 * Baileys event → Canonical gateway event mapping.
 * Internal events always use canonical names.
 * Legacy names are resolved at subscription time by the dispatcher.
 */
const EVENT_MAP: Record<string, string> = {
  'messages.upsert': 'messages.created',
  'messages.update': 'messages.updated',
  'messages.delete': 'messages.deleted',
  'messages.reaction': 'messages.reaction',
  'contacts.upsert': 'contacts.updated',
  'contacts.update': 'contacts.updated',
  'groups.upsert': 'groups.updated',
  'groups.update': 'groups.updated',
  'group-participants.update': 'group-participants.updated',
  'message-receipt.update': 'receipts.updated',
  'blocklist.set': 'blocklist.set',
  'blocklist.update': 'blocklist.updated',
  'connection.update': 'connection.update',
  'call': 'call',
}

/**
 * Wires Baileys adapter events to WebhookDispatcher.
 * Routes events through HistorySyncHandler for sync buffering.
 * Normalizes all payloads before dispatching.
 */
export class MessageHandler {
  private adapter: IBaileysAdapter
  private dispatcher: WebhookDispatcher
  private sessionId: string
  private logger: pino.Logger
  private historySyncHandler: HistorySyncHandler

  constructor(
    sessionId: string,
    adapter: IBaileysAdapter,
    dispatcher: WebhookDispatcher,
    batchConfig: BatchConfig,
    logger: pino.Logger
  ) {
    this.sessionId = sessionId
    this.adapter = adapter
    this.dispatcher = dispatcher
    this.logger = logger.child({ module: 'MessageHandler', sessionId })

    this.historySyncHandler = new HistorySyncHandler(
      sessionId,
      dispatcher,
      batchConfig,
      logger
    )

    // When history sync completes, drain buffered realtime events
    this.historySyncHandler.drainCallback = (events) => {
      for (const { event, args } of events) {
        this.handleRealtimeEvent(event, args)
      }
    }
  }

  attach(): void {
    // ── History sync events ──
    this.adapter.on('messaging-history.set', (data: unknown) => {
      this.historySyncHandler.handleHistorySet(data as any)
    })

    this.adapter.on('messaging-history.status', (data: unknown) => {
      this.historySyncHandler.handleHistoryStatus(data as any)
    })

    // ── Connection open → start history sync ──
    this.adapter.on('connection.open', () => {
      this.historySyncHandler.startSync()
    })

    // ── Realtime events (buffered during sync, immediate after) ──
    const realtimeEvents = [
      'messages.upsert',
      'messages.update',
      'messages.delete',
      'messages.reaction',
      'contacts.upsert',
      'contacts.update',
      'groups.upsert',
      'groups.update',
      'group-participants.update',
      'message-receipt.update',
      'blocklist.set',
      'blocklist.update',
      'call',
      'connection.update',
    ]

    for (const event of realtimeEvents) {
      this.adapter.on(event, (...args: unknown[]) => {
        this.handleRealtimeEvent(event, args)
      })
    }

    this.logger.info('MessageHandler attached to adapter events')
  }

  detach(): void {
    this.logger.info('MessageHandler detached')
  }

  private handleRealtimeEvent(baileysEvent: string, args: unknown[]): void {
    // If sync is in progress, buffer the event
    if (this.historySyncHandler.bufferRealtimeEvent(baileysEvent, args)) {
      return
    }

    // Map to canonical event name
    const canonicalEvent = EVENT_MAP[baileysEvent]
    if (!canonicalEvent) {
      this.logger.debug({ baileysEvent }, 'Unknown event, skipping')
      return
    }

    // Normalize and dispatch
    try {
      const payload = this.normalizeEvent(baileysEvent, args)

      this.dispatcher
        .dispatch(this.sessionId, canonicalEvent, payload)
        .catch((err) => {
          this.logger.error({ err, event: canonicalEvent }, 'Webhook dispatch failed')
        })
    } catch (err) {
      this.logger.error({ err, event: baileysEvent }, 'Failed to normalize event')
    }
  }

  private normalizeEvent(baileysEvent: string, args: unknown[]): unknown {
    // messages.upsert → normalize each message
    if (baileysEvent === 'messages.upsert') {
      const upsert = args[0] as any
      return {
        type: upsert?.type,
        messages: (upsert?.messages ?? []).map((msg: any) =>
          normalizeUpsertMessage(msg)
        ),
      }
    }

    // messages.update → normalize each update
    if (baileysEvent === 'messages.update') {
      const updates = args[0] as any[]
      return (updates ?? []).map((u: any) => normalizeMessageUpdate(u))
    }

    // messages.delete
    if (baileysEvent === 'messages.delete') {
      return args[0] // Already structured: { keys } or { jid, all: true }
    }

    // messages.reaction
    if (baileysEvent === 'messages.reaction') {
      return args[0] // Array of { key, reaction }
    }

    // contacts.upsert / contacts.update → pass through (already arrays)
    if (baileysEvent === 'contacts.upsert' || baileysEvent === 'contacts.update') {
      return args[0]
    }

    // groups.upsert / groups.update → pass through
    if (baileysEvent === 'groups.upsert' || baileysEvent === 'groups.update') {
      return args[0]
    }

    // group-participants.update → normalize
    if (baileysEvent === 'group-participants.update') {
      return normalizeGroupParticipantsUpdate(args[0])
    }

    // message-receipt.update
    if (baileysEvent === 'message-receipt.update') {
      return args[0]
    }

    // connection.update → normalize
    if (baileysEvent === 'connection.update') {
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

    // blocklist, call, etc. → pass through
    return args[0] ?? null
  }
}
