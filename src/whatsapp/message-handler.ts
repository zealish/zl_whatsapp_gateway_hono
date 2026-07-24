import type pino from 'pino'
import type { IBaileysAdapter } from '../types/whatsapp.js'
import type { WebhookDispatcher } from '../webhook/dispatcher.js'
import { HistorySyncHandler, type BatchConfig } from './history-sync-handler.js'
import type { ContactResolver } from './contact-resolver.js'
import type { ContactEntry } from './contact-store.js'
import type { LidMappingStore } from './lid-mapping.js'
import {
  normalizeUpsertMessage,
  normalizeMessageUpdate,
  normalizeGroupParticipantsUpdate,
  normalizeReaction,
  normalizeMessageDelete,
  normalizeReceiptUpdate,
  normalizeGroup,
  extractPhoneFromJid,
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
 * History events are processed independently by HistorySyncHandler.
 * Realtime events are dispatched immediately — never blocked by history sync.
 * Normalizes all payloads before dispatching.
 */
export class MessageHandler {
  private adapter: IBaileysAdapter
  private dispatcher: WebhookDispatcher
  private sessionId: string
  private logger: pino.Logger
  private historySyncHandler: HistorySyncHandler
  private contactResolver: ContactResolver
  private lidMapping: LidMappingStore | null

  constructor(
    sessionId: string,
    adapter: IBaileysAdapter,
    dispatcher: WebhookDispatcher,
    batchConfig: BatchConfig,
    contactResolver: ContactResolver,
    logger: pino.Logger,
    lidMapping?: LidMappingStore | null,
    onSyncComplete?: () => void
  ) {
    this.sessionId = sessionId
    this.adapter = adapter
    this.dispatcher = dispatcher
    this.contactResolver = contactResolver
    this.lidMapping = lidMapping ?? null
    this.logger = logger.child({ module: 'MessageHandler', sessionId })

    this.historySyncHandler = new HistorySyncHandler(
      sessionId,
      dispatcher,
      batchConfig,
      contactResolver,
      logger,
      this.lidMapping,
      onSyncComplete
    )
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

    // ── Realtime events (always immediate, never blocked by history sync) ──
    const realtimeEvents = [
      'messages.upsert',
      'messages.update',
      'messages.delete',
      'messages.reaction',
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

    // ── Contact events → store-only (no webhook) ──
    this.adapter.on('contacts.upsert', (data: unknown) => {
      this.syncContactsFromBaileys(data as any[])
    })
    this.adapter.on('contacts.update', (data: unknown) => {
      this.syncContactsFromBaileys(data as any[])
    })

    // ── LID mapping updates from Baileys (store-only, no webhook) ──
    this.adapter.on('lid-mapping.update', (data: unknown) => {
      const mapping = data as any
      if (this.lidMapping && mapping?.pn && mapping?.lid) {
        this.lidMapping.addMapping(mapping.lid, mapping.pn)
        this.logger.debug(
          { lid: mapping.lid, phone: mapping.pn },
          'LID mapping updated from Baileys event'
        )
      }
    })

    this.logger.info('MessageHandler attached to adapter events')
  }

  detach(): void {
    this.logger.info('MessageHandler detached')
  }

  private handleRealtimeEvent(baileysEvent: string, args: unknown[]): void {
    // Map to canonical event name
    const canonicalEvent = EVENT_MAP[baileysEvent]
    if (!canonicalEvent) {
      this.logger.debug({ baileysEvent }, 'Unknown event, skipping')
      return
    }

    // Normalize and dispatch immediately (never blocked by history sync)
    try {
      const payload = this.normalizeEvent(baileysEvent, args)

      this.dispatcher
        .dispatch(this.sessionId, canonicalEvent, payload, { historySync: false })
        .catch((err) => {
          this.logger.error({ err, event: canonicalEvent }, 'Webhook dispatch failed')
        })
      this.logger.debug({ baileysEvent, canonicalEvent }, '[Realtime] %s -> webhook queued', canonicalEvent)
    } catch (err) {
      this.logger.error({ err, event: baileysEvent }, 'Failed to normalize event')
    }
  }

  private normalizeEvent(baileysEvent: string, args: unknown[]): unknown {
    // messages.upsert → normalize each message, resolve contacts
    if (baileysEvent === 'messages.upsert') {
      const upsert = args[0] as any
      // Debug: log raw view-once messages to understand Baileys delivery
      for (const raw of upsert?.messages ?? []) {
        if (!raw?.message) {
          this.logger.warn({ key: raw?.key, messageProto: Object.keys(raw?.message ?? {}), rawKeys: Object.keys(raw ?? {}) }, '[DEBUG] Raw message with null .message')
        }
      }
      const messages = (upsert?.messages ?? []).map((msg: any) =>
        normalizeUpsertMessage(msg, this.lidMapping)
      )
      const contacts = this.contactResolver.resolveUniqueContacts(messages)

      return {
        type: upsert?.type,
        messages,
        ...(contacts.length > 0 && { contacts }),
      }
    }

    // messages.update → normalize each update
    if (baileysEvent === 'messages.update') {
      const updates = args[0] as any[]
      // Debug: log updates that contain message content
      for (const u of updates ?? []) {
        if (u?.update?.message) {
          this.logger.warn({ key: u?.key, updateKeys: Object.keys(u?.update ?? {}) }, '[DEBUG] messages.update HAS message content')
        }
      }
      return (updates ?? []).map((u: any) => normalizeMessageUpdate(u, this.lidMapping))
    }

    // messages.delete → normalize
    if (baileysEvent === 'messages.delete') {
      return normalizeMessageDelete(args[0], this.lidMapping)
    }

    // messages.reaction → normalize
    if (baileysEvent === 'messages.reaction') {
      return normalizeReaction(args[0], this.lidMapping)
    }

    // groups.upsert / groups.update → normalize (group JID preserved, participants resolved)
    if (baileysEvent === 'groups.upsert' || baileysEvent === 'groups.update') {
      return normalizeGroup(args[0], this.lidMapping)
    }

    // group-participants.update → normalize
    if (baileysEvent === 'group-participants.update') {
      return normalizeGroupParticipantsUpdate(args[0], this.lidMapping)
    }

    // message-receipt.update → normalize
    if (baileysEvent === 'message-receipt.update') {
      return normalizeReceiptUpdate(args[0], this.lidMapping)
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

  /**
   * Parse Baileys contact data and sync to store.
   * Used by contacts.upsert and contacts.update (store-only, no webhook).
   * Also feeds LID ↔ Phone mapping for JID normalization.
   */
  private syncContactsFromBaileys(rawContacts: unknown): void {
    if (!Array.isArray(rawContacts)) return

    for (const raw of rawContacts) {
      const c = raw as any
      const jid: string | undefined = c?.id
      if (!jid) continue

      const phone = extractPhoneFromJid(jid)
      if (!phone) continue

      // Feed LID ↔ Phone mapping if contact has lid field
      if (this.lidMapping && c?.lid && jid.endsWith('@s.whatsapp.net')) {
        this.lidMapping.addMapping(c.lid, phone)
      }

      const entry: ContactEntry = {
        phone,
        name: c?.name || undefined,
        notify: c?.notify || undefined,
        verifiedName: c?.verifiedName || undefined,
      }

      this.contactResolver.syncContact(entry)
    }

    this.logger.debug({ count: rawContacts.length }, 'Contacts synced to store')
  }
}
