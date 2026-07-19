import type { Chat, Contact } from 'baileys'
import type { WAMessage, WAMessageUpdate } from 'baileys'

/**
 * Normalized chat payload for gateway consumers.
 */
export interface NormalizedChat {
  jid: string
  name?: string
  unreadCount?: number
  lastMessageTimestamp?: number
  archived?: boolean
  pinned?: boolean
  muted?: boolean
  ephemeral?: boolean
  isGroup: boolean
  lastMessageRecvTimestamp?: number
}

/**
 * Normalized contact payload for gateway consumers.
 */
export interface NormalizedContact {
  jid: string
  lid?: string
  phoneNumber?: string
  name?: string
  notify?: string
  username?: string
  verifiedName?: string
  imgUrl?: string | null
  status?: string
}

/**
 * Normalized message payload for gateway consumers.
 */
export interface NormalizedMessage {
  key: {
    remoteJid?: string | null
    id?: string | null
    fromMe?: boolean | null
    participant?: string | null
  }
  chatJid: string
  fromMe: boolean
  sender?: string
  pushName?: string
  messageTimestamp?: number | null
  messageType?: string
  content: unknown
}

/**
 * Normalized message update payload.
 */
export interface NormalizedMessageUpdate {
  key: {
    remoteJid?: string | null
    id?: string | null
    fromMe?: boolean | null
    participant?: string | null
  }
  update: {
    message?: unknown
    status?: number
    messageStubType?: number
    keyUpdate?: unknown
  }
}

/**
 * Normalize a Baileys Chat to gateway format.
 * Strips raw protobuf fields, extracts useful metadata.
 */
export function normalizeChat(raw: Chat): NormalizedChat {
  const jid = raw.id ?? ''
  return {
    jid,
    name: raw.name ?? undefined,
    unreadCount: raw.unreadCount ?? undefined,
    lastMessageTimestamp: toNumber(raw.lastMsgTimestamp),
    archived: raw.archived ?? undefined,
    pinned: raw.pinned != null ? true : undefined,
    muted: raw.muteEndTime != null && toNumber(raw.muteEndTime)! > Date.now() / 1000 ? true : undefined,
    ephemeral: raw.ephemeralExpiration != null,
    isGroup: jid.endsWith('@g.us'),
    lastMessageRecvTimestamp: raw.lastMessageRecvTimestamp ?? undefined,
  }
}

/**
 * Normalize a Baileys Contact to gateway format.
 */
export function normalizeContact(raw: Contact): NormalizedContact {
  return {
    jid: raw.id ?? '',
    lid: raw.lid ?? undefined,
    phoneNumber: raw.phoneNumber ?? undefined,
    name: raw.name ?? undefined,
    notify: raw.notify ?? undefined,
    username: raw.username ?? undefined,
    verifiedName: raw.verifiedName ?? undefined,
    imgUrl: raw.imgUrl ?? undefined,
    status: raw.status ?? undefined,
  }
}

/**
 * Normalize a Baileys WAMessage to gateway format.
 * Extracts message content type and key fields.
 */
export function normalizeMessage(raw: WAMessage): NormalizedMessage {
  const key = raw.key ?? {}
  const message = raw.message
  const messageType = message ? Object.keys(message)[0] : undefined

  return {
    key: {
      remoteJid: key.remoteJid,
      id: key.id,
      fromMe: key.fromMe,
      participant: key.participant,
    },
    chatJid: key.remoteJid ?? '',
    fromMe: key.fromMe ?? false,
    sender: key.participant ?? key.remoteJid ?? undefined,
    pushName: raw.pushName ?? undefined,
    messageTimestamp: toNumber(raw.messageTimestamp),
    messageType,
    content: extractContent(message),
  }
}

/**
 * Normalize a WAMessageUpdate to gateway format.
 */
export function normalizeMessageUpdate(raw: WAMessageUpdate): NormalizedMessageUpdate {
  const key = raw.key ?? {}
  return {
    key: {
      remoteJid: key.remoteJid,
      id: key.id,
      fromMe: key.fromMe,
      participant: key.participant,
    },
    update: {
      message: raw.update?.message,
      status: raw.update?.status != null ? Number(raw.update.status) : undefined,
      messageStubType: raw.update?.messageStubType != null ? Number(raw.update.messageStubType) : undefined,
    },
  }
}

/**
 * Extract meaningful content from a proto.Message.
 * Returns the first message type with its data.
 */
function extractContent(message: unknown): unknown {
  if (!message || typeof message !== 'object') return null
  const msg = message as Record<string, unknown>

  // Extract the first key as the message type
  const keys = Object.keys(msg)
  if (keys.length === 0) return null

  const type = keys[0]
  const content = msg[type]

  // For extended text, extract the text field
  if (type === 'extendedTextMessage' && typeof content === 'object' && content !== null) {
    return { type, text: (content as any).text ?? null }
  }

  // For conversation (plain text)
  if (type === 'conversation') {
    return { type, text: content }
  }

  // For image/video/audio/document/sticker — return type and presence indicator
  if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(type)) {
    return { type, hasMedia: true }
  }

  // Default: return type only
  return { type }
}

/**
 * Normalize a realtime upsert message (messages.upsert).
 * Similar to normalizeMessage but matches the realtime payload shape.
 */
export function normalizeUpsertMessage(raw: WAMessage): NormalizedMessage {
  return normalizeMessage(raw)
}

/**
 * Normalize a group-participants.update event.
 */
export function normalizeGroupParticipantsUpdate(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const data = raw as any
  return {
    groupJid: data?.id,
    author: data?.author,
    action: data?.action,
    participants: (data?.participants ?? []).map((p: any) => ({
      jid: typeof p === 'string' ? p : p?.id,
      admin: typeof p === 'string' ? null : p?.admin ?? null,
    })),
  }
}

/**
 * Convert Long | number | null | undefined to number.
 */
function toNumber(val: unknown): number | undefined {
  if (val == null) return undefined
  if (typeof val === 'number') return val
  if (typeof val === 'object' && 'toNumber' in (val as any)) {
    return (val as any).toNumber()
  }
  return Number(val)
}
