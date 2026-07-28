import { EventEmitter } from 'node:events'
import makeWASocket, {
  DisconnectReason,
  Browsers,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
} from 'baileys'
import type {
  WASocket,
  AuthenticationState,
  Contact,
  GroupMetadata,
} from 'baileys'

import type pino from 'pino'
import type {
  IBaileysAdapter,
  ConnectionState,
  SendMessageResult,
  ContactInfo,
  GroupInfo,
} from '../types/whatsapp.js'
import { useFileAuthState } from './auth-state.js'
import { MessageStore } from './message-store.js'
import { AppError } from '../lib/errors.js'

const MEDIA_TYPES = new Set([
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'documentMessage',
  'stickerMessage',
])

function getMediaType(msg: { message?: any | null }): string | undefined {
  const inner = msg.message
  if (!inner) return undefined
  return Object.keys(inner)[0]
}

/**
 * Wraps Baileys WASocket behind IBaileysAdapter.
 * This is the ONLY file that imports 'baileys' directly.
 */
export class BaileysAdapter extends EventEmitter implements IBaileysAdapter {
  private socket: WASocket | null = null
  private connectionState: ConnectionState = 'close'
  private qr: string | null = null
  private sessionDir: string
  private logger: pino.Logger
  private authState: AuthenticationState | null = null
  private saveCreds: (() => Promise<void>) | null = null
  private messageStore = new MessageStore()

  constructor(sessionDir: string, logger: pino.Logger) {
    super()
    this.sessionDir = sessionDir
    this.logger = logger.child({ module: 'BaileysAdapter' })
  }

  /**
   * Connect to WhatsApp.
   * Creates socket, starts QR flow. Scan the QR from your phone to link.
   */
  async connect(): Promise<void> {
    if (this.socket) {
      this.logger.warn('Socket already exists, disconnecting first')
      await this.disconnect()
    }

    const { state, saveCreds } = await useFileAuthState(this.sessionDir)
    this.authState = state
    this.saveCreds = saveCreds

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger),
      },
      logger: this.logger as any,
      browser: Browsers.macOS('WhatsApp Gateway'),
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
      getMessage: async (key) => this.messageStore.getByKey(key)?.message ?? undefined,
    })

    this.socket = sock
    this.connectionState = 'connecting'

    // ── Credential updates ──
    sock.ev.on('creds.update', async () => {
      if (this.saveCreds) {
        await this.saveCreds()
      }
    })

    // ── Store incoming messages for retry / getMessage ──
    sock.ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.remoteJid) {
          this.messageStore.set(msg.key.remoteJid, msg)
          // Also store under remoteJidAlt (phone JID) when present, so lookups
          // via phone number work even if remoteJid is a LID
          if (msg.key.remoteJidAlt) {
            this.messageStore.set(msg.key.remoteJidAlt, msg)
          }
        }
      }
    })

    // ── Connection state changes ──
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        this.qr = qr
        this.connectionState = 'connecting'
        this.emit('qr', qr)
        this.logger.info('QR code received')
      }

      if (connection === 'open') {
        this.connectionState = 'open'
        this.qr = null
        this.emit('connection.open')
        this.logger.info('Connection established')

        // Set device presence to online
        sock.sendPresenceUpdate('available').catch((err) => {
          this.logger.warn({ err }, 'Failed to set presence to online')
        })
      }

      if (connection === 'close') {
        this.connectionState = 'close'
        const statusCode =
          (lastDisconnect?.error as any)?.output?.statusCode ??
          (lastDisconnect?.error as any)?.statusCode ?? 0

        this.emit('connection.close', { statusCode })
        this.logger.warn({ statusCode }, 'Connection closed')

        if (statusCode === DisconnectReason.loggedOut) {
          this.emit('loggedOut')
          this.logger.warn('Session logged out')
        }
      }
    })

    // ── Forward all WA events ──
    const eventsToForward = [
      'messaging-history.set',
      'messaging-history.status',
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
      'creds.update',
      'lid-mapping.update',
    ] as const

    for (const event of eventsToForward) {
      sock.ev.on(event as any, (...args: unknown[]) => {
        this.emit(event, ...args)
      })
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.ev.removeAllListeners('connection.update')
      this.socket.ev.removeAllListeners('creds.update')
      this.socket.ev.removeAllListeners('messages.upsert')
      this.socket.end(new Error('Manual disconnect'))
      this.socket = null
    }
    this.connectionState = 'close'
    this.qr = null
    this.authState = null
    this.saveCreds = null
    this.logger.info('Disconnected')
  }

  async sendMessage(jid: string, content: object, options?: { quoted?: object }): Promise<SendMessageResult> {
    this.assertConnected()
    this.socket!.sendPresenceUpdate('composing', jid).catch(() => {})
    // Log content for debugging PTT audio messages
    const contentAny = content as any
    if (contentAny?.audio || contentAny?.ptt) {
      console.log('[ADAPTER-SEND] content keys:', Object.keys(contentAny), 'ptt:', contentAny.ptt, 'seconds:', contentAny.seconds, 'mimetype:', contentAny.mimetype, 'audio type:', typeof contentAny.audio, 'audio isBuffer:', Buffer.isBuffer(contentAny.audio))
    }
    try {
      const msg = await this.socket!.sendMessage(jid, content as any, options as any)
      if (!msg) {
        throw new AppError('Failed to send message', 500, 'SEND_FAILED')
      }
      // Log sent message proto for PTT debugging
      if (msg.message?.audioMessage) {
        const am = msg.message.audioMessage
        console.log('[ADAPTER-SENT] audioMessage ptt:', am.ptt, 'seconds:', am.seconds, 'mimetype:', am.mimetype, 'fileLength:', am.fileLength?.toString?.())
      }
      // Store sent message so it can be quoted/forwarded later
      if (msg.key.remoteJid) {
        this.messageStore.set(msg.key.remoteJid, msg)
        // Also store under remoteJidAlt (phone JID) when present, so lookups
        // via phone number work even if remoteJid is a LID
        if (msg.key.remoteJidAlt) {
          this.messageStore.set(msg.key.remoteJidAlt, msg)
        }
      }
      return {
        id: msg.key.id ?? '',
        timestamp: Date.now(),
        status: 'sent',
      }
    } finally {
      this.socket!.sendPresenceUpdate('paused', jid).catch(() => {})
    }
  }

  async getContact(jid: string): Promise<ContactInfo | null> {
    this.assertConnected()
    const contact: Contact | undefined =
      this.socket!.user?.id === jid
        ? { id: jid, name: this.socket!.user?.name }
        : undefined

    if (!contact) {
      return {
        jid,
        name: undefined,
        pushName: undefined,
        isGroup: jid.endsWith('@g.us'),
      }
    }

    return {
      jid,
      name: contact.name,
      pushName: contact.name,
      isGroup: jid.endsWith('@g.us'),
    }
  }

  async getGroupMetadata(jid: string): Promise<GroupInfo | null> {
    this.assertConnected()
    try {
      const meta: GroupMetadata = await this.socket!.groupMetadata(jid)
      return this.mapGroupInfo(meta)
    } catch {
      return null
    }
  }

  // ── Group operations ──

  async createGroup(subject: string, participants: string[]): Promise<GroupInfo> {
    this.assertConnected()
    const result = await this.socket!.groupCreate(subject, participants)
    return this.mapGroupInfo(result)
  }

  async leaveGroup(jid: string): Promise<void> {
    this.assertConnected()
    await this.socket!.groupLeave(jid)
  }

  async updateGroupSubject(jid: string, subject: string): Promise<void> {
    this.assertConnected()
    await this.socket!.groupUpdateSubject(jid, subject)
  }

  async updateGroupDescription(jid: string, description: string): Promise<void> {
    this.assertConnected()
    await this.socket!.groupUpdateDescription(jid, description)
  }

  async addParticipants(jid: string, participants: string[]): Promise<void> {
    this.assertConnected()
    await this.socket!.groupParticipantsUpdate(jid, participants, 'add')
  }

  async removeParticipants(jid: string, participants: string[]): Promise<void> {
    this.assertConnected()
    await this.socket!.groupParticipantsUpdate(jid, participants, 'remove')
  }

  async promoteParticipants(jid: string, participants: string[]): Promise<void> {
    this.assertConnected()
    await this.socket!.groupParticipantsUpdate(jid, participants, 'promote')
  }

  async demoteParticipants(jid: string, participants: string[]): Promise<void> {
    this.assertConnected()
    await this.socket!.groupParticipantsUpdate(jid, participants, 'demote')
  }

  async getGroupInviteCode(jid: string): Promise<string> {
    this.assertConnected()
    const code = await this.socket!.groupInviteCode(jid)
    if (!code) throw new AppError('Failed to get invite code', 500, 'INVITE_CODE_FAILED')
    return code
  }

  async revokeGroupInviteCode(jid: string): Promise<string> {
    this.assertConnected()
    const code = await this.socket!.groupRevokeInvite(jid)
    if (!code) throw new AppError('Failed to revoke invite code', 500, 'REVOKE_FAILED')
    return code
  }

  async joinGroupByInviteCode(code: string): Promise<GroupInfo> {
    this.assertConnected()
    const result = await this.socket!.groupAcceptInvite(code)
    if (!result) throw new AppError('Failed to join group via invite code', 500, 'JOIN_FAILED')
    const meta = await this.socket!.groupMetadata(result)
    return this.mapGroupInfo(meta)
  }

  async getGroupInfoByInviteCode(code: string): Promise<GroupInfo | null> {
    this.assertConnected()
    try {
      const meta = await this.socket!.groupGetInviteInfo(code)
      return meta ? this.mapGroupInfo(meta) : null
    } catch {
      return null
    }
  }

  async updateGroupSettings(
    jid: string,
    setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked'
  ): Promise<void> {
    this.assertConnected()
    await this.socket!.groupSettingUpdate(jid, setting)
  }

  async getAllGroups(): Promise<GroupInfo[]> {
    this.assertConnected()
    const groups = await this.socket!.groupFetchAllParticipating()
    return Object.values(groups).map((meta) => this.mapGroupInfo(meta))
  }

  getPushName(): string | undefined {
    return this.socket?.user?.name ?? undefined
  }

  getMessage(jid: string, msgId: string): object | undefined {
    return this.messageStore.get(jid, msgId)
      ?? this.messageStore.getByMessageId(msgId)?.message
      ?? undefined
  }

  async downloadMedia(jid: string, msgId: string): Promise<Buffer> {
    this.assertConnected()
    const msg = this.messageStore.get(jid, msgId)
    if (!msg) {
      throw new AppError('Message not found in store', 404, 'NOT_FOUND')
    }

    const mediaType = getMediaType(msg)
    if (!mediaType || !MEDIA_TYPES.has(mediaType)) {
      throw new AppError(`Message is not a media message (type: ${mediaType ?? 'none'})`, 400, 'VALIDATION_ERROR')
    }

    try {
      return await downloadMediaMessage(msg, 'buffer', {}, {
        reuploadRequest: (m) => this.socket!.updateMediaMessage(m),
        logger: this.logger as any,
      })
    } catch (err: any) {
      const statusCode = err?.statusCode ?? err?.output?.statusCode ?? 500
      if (statusCode === 400) {
        throw new AppError('Message is not a media message', 400, 'VALIDATION_ERROR')
      }
      this.logger.error({ err, msgId, mediaType, cause: err?.cause?.message, code: err?.code }, 'Media download failed')
      throw new AppError(
        `Failed to download media for message ${msgId}: ${err?.message}${err?.cause?.message ? ` (cause: ${err.cause.message})` : ''}`,
        500,
        'INTERNAL_ERROR',
      )
    }
  }

  async downloadMediaByMessageId(msgId: string): Promise<{ buffer: Buffer; mimetype?: string; fileName?: string }> {
    this.assertConnected()
    const found = this.messageStore.getByMessageId(msgId)
    if (!found) {
      throw new AppError('Message not found in store', 404, 'NOT_FOUND')
    }
    const { message: msg } = found

    const mediaType = getMediaType(msg)
    if (!mediaType || !MEDIA_TYPES.has(mediaType)) {
      throw new AppError(`Message is not a media message (type: ${mediaType ?? 'none'})`, 400, 'VALIDATION_ERROR')
    }

    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
        reuploadRequest: (m) => this.socket!.updateMediaMessage(m),
        logger: this.logger as any,
      })

      // Extract mimetype and fileName from the raw message proto
      const inner = msg.message
      const type = inner ? Object.keys(inner)[0] : undefined
      const media = type ? (inner as any)?.[type] : undefined
      const mimetype: string | undefined = media?.mimetype ?? undefined
      const fileName: string | undefined = media?.fileName ?? media?.title ?? undefined

      return { buffer, mimetype, fileName }
    } catch (err: any) {
      const statusCode = err?.statusCode ?? err?.output?.statusCode ?? 500
      if (statusCode === 400) {
        throw new AppError('Message is not a media message', 400, 'VALIDATION_ERROR')
      }
      this.logger.error({ err, msgId, mediaType, cause: err?.cause?.message, code: err?.code }, 'Media download failed')
      throw new AppError(
        `Failed to download media for message ${msgId}: ${err?.message}${err?.cause?.message ? ` (cause: ${err.cause.message})` : ''}`,
        500,
        'INTERNAL_ERROR',
      )
    }
  }

  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  getQr(): string | null {
    return this.qr
  }

  /**
   * Resolve a @lid JID to a phone number.
   * Uses sock.onWhatsApp() as fallback — Baileys internally resolves LID→PN.
   *
   * @param lid - The @lid JID (e.g. "121131029766161@lid")
   * @returns Phone number string (e.g. "6281234567890") or null if unresolvable
   */
  async resolveLidToPhone(lid: string): Promise<string | null> {
    this.assertSocketReady()

    try {
      // onWhatsApp expects phone numbers, but Baileys 7.x also handles @lid internally
      // It returns [{ exists: boolean, jid: string }] where jid is the resolved PN JID
      const results = await this.socket!.onWhatsApp(lid)
      if (results && results.length > 0 && results[0].exists) {
        const resolvedJid = results[0].jid
        // Extract phone number from the resolved JID
        const atIndex = resolvedJid.indexOf('@')
        if (atIndex > 0) {
          const localPart = resolvedJid.substring(0, atIndex)
          const colonIndex = localPart.indexOf(':')
          return colonIndex > 0 ? localPart.substring(0, colonIndex) : localPart
        }
      }
    } catch (err) {
      this.logger.debug({ err, lid }, 'Failed to resolve LID via onWhatsApp')
    }

    return null
  }

  /** Map Baileys GroupMetadata to our GroupInfo interface */
  private mapGroupInfo(meta: GroupMetadata): GroupInfo {
    return {
      jid: meta.id,
      subject: meta.subject,
      description: meta.desc ?? undefined,
      owner: meta.owner ?? undefined,
      participantCount: meta.participants.length,
      creation: meta.creation ?? undefined,
      announce: meta.announce ?? undefined,
      restrict: meta.restrict ?? undefined,
      ephemeral: meta.ephemeralDuration != null,
    }
  }

  /** Socket exists and is connected (open or connecting) */
  private assertSocketReady(): void {
    if (!this.socket) {
      throw new AppError(
        'WhatsApp session is not connected. Call POST /session/:id/connect first.',
        503,
        'SERVICE_UNAVAILABLE',
      )
    }
  }

  /** Socket exists AND is fully authenticated (open) */
  private assertConnected(): void {
    this.assertSocketReady()
    if (this.connectionState !== 'open') {
      throw new AppError(
        'WhatsApp session is connecting but not yet authenticated',
        503,
        'SERVICE_UNAVAILABLE',
      )
    }
  }
}
