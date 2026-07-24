import type { Chat, Contact } from 'baileys'
import type { WAMessage, WAMessageUpdate } from 'baileys'
import { extractMessageContent } from 'baileys'
import type { LidMappingStore } from './lid-mapping.js'
import { resolveIdentifier } from './identifier-resolver.js'
import { AppError } from '../lib/errors.js'

/**
 * Valid country codes for phone number normalization.
 * Used to detect if a number already has a country code prefix.
 */
const VALID_COUNTRY_CODES = new Set([
  '1', '62', '44', '91', '86', '81', '82', '65', '60', '66', '84',
  '855', '856', '880', '977', '94', '95', '63', '92', '61', '49',
  '33', '39', '34', '55', '52', '54', '56', '57', '58', '51', '20',
  '234', '254', '27', '212', '213', '216', '218', '220', '221', '233',
  '255', '256', '260', '263', '264', '265', '266', '267', '268', '269',
])

/**
 * Normalize a phone number to international format.
 *
 * Rules:
 * - Strip all non-digit characters
 * - If 14-15 digits and doesn't start with valid country code → it's a LID, return as-is
 * - Leading '0' → replace with '62' (Indonesia)
 * - Already has valid country code → keep as-is
 * - 9-13 digits without country code → prefix with '62'
 * - Output: pure digits, no '+' prefix
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return ''

  // Strip all non-digit characters
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''

  // Check if it looks like a LID (14-15 digits, no valid country code)
  if (digits.length >= 14 && digits.length <= 15) {
    const hasValidPrefix = Array.from(VALID_COUNTRY_CODES).some(cc => digits.startsWith(cc))
    if (!hasValidPrefix) return digits // LID, return as-is
  }

  // Leading '0' → Indonesia prefix
  if (digits.startsWith('0')) {
    return '62' + digits.substring(1)
  }

  // Already has valid country code
  for (const cc of VALID_COUNTRY_CODES) {
    if (digits.startsWith(cc) && digits.length > cc.length) {
      return digits
    }
  }

  // 9-13 digits without country code → prefix with '62'
  if (digits.length >= 9 && digits.length <= 13) {
    return '62' + digits
  }

  // Return as-is for anything else
  return digits
}

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
 *
 * Public API contract:
 * - `jid` is always the canonical bare phone number for personal chats
 * - Groups remain as @g.us
 * - No @lid or @s.whatsapp.net ever appears
 */
export interface NormalizedContact {
  jid: string
  name?: string
  pushName?: string
  businessName?: string
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
 * Normalized reaction payload.
 */
export interface NormalizedReaction {
  key: {
    remoteJid?: string | null
    id?: string | null
    fromMe?: boolean | null
    participant?: string | null
  }
  reaction: {
    text?: string
    key?: {
      remoteJid?: string | null
      id?: string | null
    }
    senderTimestampMs?: number | null
  }
}

/**
 * Normalized message delete payload.
 */
export interface NormalizedMessageDelete {
  keys?: Array<{
    remoteJid?: string | null
    id?: string | null
    fromMe?: boolean | null
    participant?: string | null
  }>
  jid?: string
  all?: boolean
}

/**
 * Normalize a WhatsApp JID to a bare phone number for personal chats.
 *
 * Cascading resolution:
 * 1. altJid (e.g. key.remoteJidAlt from Baileys) — already a phone JID
 * 2. LidMappingStore — in-memory + SQLite mapping
 * 3. Return original (unresolved)
 *
 * @param jid - Raw JID from Baileys (may be @lid)
 * @param lidMapping - Optional LID mapping store for resolution
 * @param altJid - Optional alternate JID (e.g. remoteJidAlt) that may contain the phone JID
 * @returns Bare phone number, @g.us JID, or original if unresolvable
 */
export function normalizeJid(jid: string | null | undefined, lidMapping?: LidMappingStore | null, altJid?: string | null): string {
  // If the primary JID is a @lid, try the alt JID first
  if (jid && jid.endsWith('@lid') && altJid) {
    const resolvedAlt = resolveIdentifier(altJid, lidMapping)
    if (resolvedAlt && !resolvedAlt.endsWith('@lid')) {
      return resolvedAlt
    }
  }

  return resolveIdentifier(jid, lidMapping)
}

/**
 * Normalize a Baileys Chat to gateway format.
 * Strips raw protobuf fields, extracts useful metadata.
 */
export function normalizeChat(raw: Chat, lidMapping?: LidMappingStore | null): NormalizedChat {
  const jid = normalizeJid(raw.id, lidMapping)
  return {
    jid,
    name: raw.name ?? undefined,
    unreadCount: raw.unreadCount ?? undefined,
    lastMessageTimestamp: normalizeTimestamp(raw.lastMsgTimestamp),
    archived: raw.archived ?? undefined,
    pinned: raw.pinned != null ? true : undefined,
    muted: raw.muteEndTime != null && (normalizeTimestamp(raw.muteEndTime) ?? 0) > Date.now() ? true : undefined,
    ephemeral: raw.ephemeralExpiration != null,
    isGroup: jid.endsWith('@g.us'),
    lastMessageRecvTimestamp: raw.lastMessageRecvTimestamp ?? undefined,
  }
}

/**
 * Normalize a Baileys Contact to gateway format.
 *
 * Public contract:
 * - `jid` is the bare phone number
 * - `name` is the best available display name
 * - `pushName` is the WhatsApp push name
 * - `businessName` is the WhatsApp Business name
 * - No `lid`, `phoneNumber`, or `notify` fields
 */
export function normalizeContact(raw: Contact, lidMapping?: LidMappingStore | null): NormalizedContact {
  const jid = normalizeJid(raw.id, lidMapping)
  const name = pickBestName(raw.name, raw.notify, raw.verifiedName, jid)
  return {
    jid,
    name,
    pushName: raw.notify ?? undefined,
    businessName: raw.verifiedName ?? undefined,
    verifiedName: raw.verifiedName ?? undefined,
    imgUrl: raw.imgUrl ?? undefined,
    status: raw.status ?? undefined,
  }
}

/**
 * Normalize a Baileys WAMessage to gateway format.
 * Extracts message content type and key fields.
 */
export function normalizeMessage(raw: WAMessage, lidMapping?: LidMappingStore | null): NormalizedMessage {
  const key = raw.key ?? {}
  const message = raw.message
  const remoteJid = normalizeJid(key.remoteJid, lidMapping, key.remoteJidAlt)
  const participant = normalizeJid(key.participant, lidMapping, (key as any).participantAlt)

  // Baileys delivers view-once messages with key.isViewOnce=true but message=null
  // (content already consumed). Detect via key flag and return privacy stub.
  if ((key as any).isViewOnce) {
    return {
      key: { remoteJid, id: key.id, fromMe: key.fromMe, participant: participant || undefined },
      chatJid: remoteJid,
      fromMe: key.fromMe ?? false,
      sender: participant || remoteJid || undefined,
      pushName: raw.pushName ?? undefined,
      messageTimestamp: normalizeTimestamp(raw.messageTimestamp),
      messageType: 'viewOnceMessage',
      content: { type: 'viewOnceMessage', viewOnce: true },
    }
  }

  const messageType = message ? Object.keys(message)[0] : undefined

  return {
    key: {
      remoteJid,
      id: key.id,
      fromMe: key.fromMe,
      participant: participant || undefined,
    },
    chatJid: remoteJid,
    fromMe: key.fromMe ?? false,
    sender: participant || remoteJid || undefined,
    pushName: raw.pushName ?? undefined,
    messageTimestamp: normalizeTimestamp(raw.messageTimestamp),
    messageType,
    content: extractContent(message, lidMapping),
  }
}

/**
 * Normalize a WAMessageUpdate to gateway format.
 */
export function normalizeMessageUpdate(raw: WAMessageUpdate, lidMapping?: LidMappingStore | null): NormalizedMessageUpdate {
  const key = raw.key ?? {}
  return {
    key: {
      remoteJid: normalizeJid(key.remoteJid, lidMapping, (key as any).remoteJidAlt),
      id: key.id,
      fromMe: key.fromMe,
      participant: normalizeJid(key.participant, lidMapping, (key as any).participantAlt) || undefined,
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
 * Unwraps ephemeral/viewOnce wrappers, extracts metadata per message type.
 */
/**
 * Extract reply/mention context from a Baileys message content object.
 *
 * Baileys attaches `contextInfo` to most message types (text, media,
 * location, etc.) containing:
 * - `stanzaId`    — gateway message ID of the quoted message
 * - `participant` — sender JID of the quoted message
 * - `quotedMessage` — the original message content being replied to
 * - `mentionedJid` — array of JIDs mentioned in the message
 *
 * Returns undefined if no context info exists.
 */
function extractContextInfo(c: Record<string, unknown>, lidMapping?: LidMappingStore | null): Record<string, unknown> | undefined {
  const ctx = c.contextInfo as Record<string, unknown> | undefined
  if (!ctx) return undefined

  const result: Record<string, unknown> = {}

  // ── Quoted (replied-to) message ──
  const qm = ctx.quotedMessage as Record<string, unknown> | undefined
  if (qm) {
    const qmKeys = Object.keys(qm)
    if (qmKeys.length > 0) {
      const qmType = qmKeys[0]
      const qmContent = qm[qmType]
      const quotedText = typeof qmContent === 'string'
        ? qmContent
        : (qmContent as Record<string, unknown> | undefined)?.text
          ?? (qmContent as Record<string, unknown> | undefined)?.caption
          ?? null

      result.quotedMessage = {
        id: ctx.stanzaId as string | undefined,
        participant: ctx.participant
          ? normalizeJid(ctx.participant as string, lidMapping)
          : undefined,
        type: qmType,
        text: quotedText,
      }
    }
  }

  // ── Mentions ──
  const mentionedJid = ctx.mentionedJid
  if (Array.isArray(mentionedJid) && mentionedJid.length > 0) {
    result.mentions = mentionedJid.map((jid: string) => extractPhoneFromJid(jid))
  }

  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * Detect if a raw WA message contains a viewOnce wrapper at any nesting depth.
 * Handles: viewOnceMessage, viewOnceMessageV2, viewOnceMessageV2Extension,
 * and nested inside ephemeralMessage.
 */
function detectViewOnceWrapper(msg: Record<string, unknown>, depth = 0): boolean {
  if (!msg || typeof msg !== 'object' || depth > 5) return false
  if (msg.viewOnceMessage || msg.viewOnceMessageV2 || msg.viewOnceMessageV2Extension) return true
  // Recurse into ephemeralMessage / documentWithCaptionMessage wrappers
  const wrapper = msg.ephemeralMessage || msg.documentWithCaptionMessage
  if (wrapper && typeof wrapper === 'object') {
    const inner = (wrapper as Record<string, unknown>).message
    if (inner && typeof inner === 'object') {
      return detectViewOnceWrapper(inner as Record<string, unknown>, depth + 1)
    }
  }
  return false
}

function extractContent(message: unknown, lidMapping?: LidMappingStore | null): unknown {
  if (!message || typeof message !== 'object') return null

  // Detect viewOnce wrapper BEFORE unwrapping — extractMessageContent strips it,
  // and the inner message may not have viewOnce: true in the decoded protobuf.
  // Must check recursively because viewOnce can be nested inside ephemeralMessage.
  const raw = message as Record<string, unknown>
  const isViewOnce = detectViewOnceWrapper(raw)

  // View-once: return stripped payload — no media content, only the flag.
  // Consumers (Odoo) render a privacy message instead of the media.
  if (isViewOnce) {
    return { type: 'viewOnceMessage', viewOnce: true }
  }

  // Unwrap ephemeral / viewOnce / edited wrappers to get the real inner message
  const unwrapped = extractMessageContent(message as any)
  if (!unwrapped || typeof unwrapped !== 'object') return null

  const msg = unwrapped as Record<string, unknown>
  const keys = Object.keys(msg)
  if (keys.length === 0) return null

  const type = keys[0]
  const content = msg[type]

  if (!content || typeof content !== 'object') {
    // Primitive content (e.g. conversation string)
    if (type === 'conversation') return { type, text: content }
    return { type }
  }

  const c = content as Record<string, unknown>

  switch (type) {
    // ── Text ──
    case 'conversation':
      return { type, text: content }

    case 'extendedTextMessage':
      return { type, text: c.text ?? null, ...extractContextInfo(c, lidMapping) }

    // ── Media ──
    case 'imageMessage':
      return {
        type,
        hasMedia: true,
        caption: c.caption ?? undefined,
        mimetype: c.mimetype ?? undefined,
        fileLength: toNumber(c.fileLength),
        width: c.width ?? undefined,
        height: c.height ?? undefined,
        ...extractContextInfo(c, lidMapping),
      }

    case 'videoMessage':
    case 'ptvMessage':
      return {
        type,
        hasMedia: true,
        caption: c.caption ?? undefined,
        mimetype: c.mimetype ?? undefined,
        fileLength: toNumber(c.fileLength),
        width: c.width ?? undefined,
        height: c.height ?? undefined,
        seconds: c.seconds ?? undefined,
        gifPlayback: c.gifPlayback ?? undefined,
        ...extractContextInfo(c, lidMapping),
      }

    case 'audioMessage':
      return {
        type,
        hasMedia: true,
        mimetype: c.mimetype ?? undefined,
        fileLength: toNumber(c.fileLength),
        seconds: c.seconds ?? undefined,
        ptt: c.ptt ?? undefined,
        ...extractContextInfo(c, lidMapping),
      }

    case 'documentMessage':
      return {
        type,
        hasMedia: true,
        caption: c.caption ?? undefined,
        fileName: c.fileName ?? c.title ?? undefined,
        mimetype: c.mimetype ?? undefined,
        fileLength: toNumber(c.fileLength),
        pageCount: c.pageCount ?? undefined,
        ...extractContextInfo(c, lidMapping),
      }

    case 'stickerMessage':
      return {
        type,
        hasMedia: true,
        mimetype: c.mimetype ?? undefined,
        fileLength: toNumber(c.fileLength),
        width: c.width ?? undefined,
        height: c.height ?? undefined,
        isAnimated: c.isAnimated ?? undefined,
        ...extractContextInfo(c, lidMapping),
      }

    // ── Location ──
    case 'locationMessage':
      return {
        type,
        latitude: c.degreesLatitude ?? undefined,
        longitude: c.degreesLongitude ?? undefined,
        name: c.name ?? undefined,
        address: c.address ?? undefined,
        isLive: c.isLive ?? undefined,
        speedInMps: c.speedInMps ?? undefined,
        accuracyInMeters: c.accuracyInMeters ?? undefined,
        ...extractContextInfo(c, lidMapping),
      }

    // ── Contacts ──
    case 'contactMessage':
      return {
        type,
        displayName: c.displayName ?? undefined,
        ...extractContextInfo(c, lidMapping),
      }

    case 'contactsArrayMessage':
      return {
        type,
        displayName: c.displayName ?? undefined,
        contacts: Array.isArray(c.contacts)
          ? (c.contacts as any[]).map((ct) => ({
              displayName: ct?.displayName ?? undefined,
            }))
          : [],
        ...extractContextInfo(c, lidMapping),
      }

    // ── Polls ──
    case 'pollCreationMessage':
    case 'pollCreationMessageV2':
    case 'pollCreationMessageV3':
    case 'pollCreationMessageV5':
      return {
        type,
        name: c.name ?? undefined,
        options: Array.isArray(c.options)
          ? (c.options as any[]).map((o) => (typeof o === 'string' ? o : o?.name ?? o?.optionName ?? ''))
          : [],
        selectableOptionsCount: c.selectableOptionsCount ?? undefined,
        ...extractContextInfo(c, lidMapping),
      }

    // ── Reactions ──
    case 'reactionMessage': {
      const reactionKey = c.key as Record<string, unknown> | undefined
      return {
        type,
        text: c.text ?? undefined,
        key: reactionKey
          ? {
              remoteJid: normalizeJid(reactionKey.remoteJid as string, lidMapping),
              id: reactionKey.id ?? undefined,
            }
          : undefined,
      }
    }

    // ── Group invite ──
    case 'groupInviteMessage':
      return {
        type,
        groupJid: c.groupJid ?? undefined, // already @g.us, preserved
        inviteCode: c.inviteCode ?? undefined,
        inviteExpiration: toNumber(c.inviteExpiration),
        caption: c.caption ?? undefined,
        ...extractContextInfo(c, lidMapping),
      }

    // ── Default ──
    default:
      return { type }
  }
}

/**
 * Normalize a realtime upsert message (messages.upsert).
 * Similar to normalizeMessage but matches the realtime payload shape.
 */
export function normalizeUpsertMessage(raw: WAMessage, lidMapping?: LidMappingStore | null): NormalizedMessage {
  return normalizeMessage(raw, lidMapping)
}

/**
 * Normalize a group-participants.update event.
 * Group JID (@g.us) is preserved. Participants are resolved to bare phones.
 */
export function normalizeGroupParticipantsUpdate(raw: unknown, lidMapping?: LidMappingStore | null): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const data = raw as any

  // authorPn is provided by Baileys 7.x for group events
  const authorPn = data?.authorPn
  const author = authorPn
    ? normalizeJid(authorPn, lidMapping)
    : normalizeJid(data?.author, lidMapping)

  return {
    groupJid: data?.id, // @g.us preserved
    author,
    action: data?.action,
    participants: (data?.participants ?? []).map((p: any) => ({
      jid: normalizeJid(typeof p === 'string' ? p : p?.id, lidMapping),
      admin: typeof p === 'string' ? null : p?.admin ?? null,
    })),
  }
}

/**
 * Normalize a messages.reaction event.
 * All personal JIDs are resolved to bare phone numbers.
 */
export function normalizeReaction(raw: unknown, lidMapping?: LidMappingStore | null): unknown {
  if (!raw || typeof raw !== 'object') return raw

  // Baileys reaction event: array of { key, reaction }
  if (Array.isArray(raw)) {
    return raw.map((item) => normalizeSingleReaction(item, lidMapping))
  }

  return normalizeSingleReaction(raw, lidMapping)
}

function normalizeSingleReaction(raw: unknown, lidMapping?: LidMappingStore | null): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const data = raw as any
  const key = data.key ?? {}
  const reaction = data.reaction ?? {}

  return {
    key: {
      remoteJid: normalizeJid(key.remoteJid, lidMapping, key.remoteJidAlt),
      id: key.id ?? undefined,
      fromMe: key.fromMe ?? false,
      participant: normalizeJid(key.participant, lidMapping, key.participantAlt) || undefined,
    },
    reaction: {
      text: reaction.text ?? undefined,
      key: reaction.key
        ? {
            remoteJid: normalizeJid(reaction.key.remoteJid, lidMapping),
            id: reaction.key.id ?? undefined,
          }
        : undefined,
      senderTimestampMs: reaction.senderTimestampMs ?? undefined,
    },
  }
}

/**
 * Normalize a messages.delete event.
 * All personal JIDs are resolved to bare phone numbers.
 * Supports both { keys: [...] } and { jid, all: true } variants.
 */
export function normalizeMessageDelete(raw: unknown, lidMapping?: LidMappingStore | null): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const data = raw as any

  // Variant 1: { keys: [{ remoteJid, id, fromMe, participant }] }
  if (Array.isArray(data.keys)) {
    return {
      keys: data.keys.map((k: any) => ({
        remoteJid: normalizeJid(k.remoteJid, lidMapping, k.remoteJidAlt),
        id: k.id ?? undefined,
        fromMe: k.fromMe ?? false,
        participant: normalizeJid(k.participant, lidMapping, k.participantAlt) || undefined,
      })),
    }
  }

  // Variant 2: { jid, all: true }
  if (data.jid) {
    return {
      jid: normalizeJid(data.jid, lidMapping),
      all: data.all ?? false,
    }
  }

  return raw
}

/**
 * Normalize a message-receipt.update event.
 * All personal JIDs are resolved to bare phone numbers.
 */
export function normalizeReceiptUpdate(raw: unknown, lidMapping?: LidMappingStore | null): unknown {
  if (!raw || typeof raw !== 'object') return raw

  // Baileys receipt event: array of { key, receipt }
  if (Array.isArray(raw)) {
    return raw.map((item) => normalizeSingleReceipt(item, lidMapping))
  }

  return normalizeSingleReceipt(raw, lidMapping)
}

function normalizeSingleReceipt(raw: unknown, lidMapping?: LidMappingStore | null): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const data = raw as any
  const key = data.key ?? {}
  const receipt = data.receipt ?? {}

  return {
    key: {
      remoteJid: normalizeJid(key.remoteJid, lidMapping, key.remoteJidAlt),
      id: key.id ?? undefined,
      fromMe: key.fromMe ?? false,
      participant: normalizeJid(key.participant, lidMapping, key.participantAlt) || undefined,
    },
    receipt: {
      ...receipt,
      // Resolve senderParticipant if present
      ...(receipt.senderParticipant && {
        senderParticipant: normalizeJid(receipt.senderParticipant, lidMapping),
      }),
    },
  }
}

/**
 * Normalize a groups.upsert / groups.update event.
 * Group JID (@g.us) is preserved. Participant JIDs are resolved to bare phones.
 */
export function normalizeGroup(raw: unknown, lidMapping?: LidMappingStore | null): unknown {
  if (!raw || typeof raw !== 'object') return raw

  // Baileys groups.upsert: array of Group objects
  if (Array.isArray(raw)) {
    return raw.map((g) => normalizeSingleGroup(g, lidMapping))
  }

  return normalizeSingleGroup(raw, lidMapping)
}

function normalizeSingleGroup(raw: unknown, lidMapping?: LidMappingStore | null): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const data = raw as any

  return {
    ...data,
    // Group JID preserved as @g.us
    id: data.id,
    // Resolve participant JIDs if present
    ...(Array.isArray(data.participants) && {
      participants: data.participants.map((p: any) => ({
        ...p,
        id: normalizeJid(p.id, lidMapping),
      })),
    }),
  }
}

/**
 * Extract phone number from a WhatsApp JID.
 * Handles device suffixes and @lid format.
 *
 * 6281234567890@s.whatsapp.net → 6281234567890
 * 6281234567890:0@s.whatsapp.net → 6281234567890
 * 1234567890@lid → 1234567890
 */
export function extractPhoneFromJid(jid: string): string {
  const atIndex = jid.indexOf('@')
  if (atIndex === -1) return jid

  const localPart = jid.substring(0, atIndex)
  // Strip device suffix: "6281234567890:0" → "6281234567890"
  const colonIndex = localPart.indexOf(':')
  return colonIndex > 0 ? localPart.substring(0, colonIndex) : localPart
}

/**
 * Pick the best display name from available sources.
 * Priority: name > notify > verifiedName > fallback
 */
function pickBestName(
  name?: string | null,
  notify?: string | null,
  verifiedName?: string | null,
  fallback?: string
): string | undefined {
  return name || notify || verifiedName || fallback || undefined
}

/**
 * Convert bare phone number to WhatsApp JID.
 * '6281234567890' → '6281234567890@s.whatsapp.net'
 * Already a JID → passthrough.
 */
export function phoneToJid(phone: string): string {
  if (!phone) return phone
  if (phone.endsWith('@s.whatsapp.net') || phone.endsWith('@g.us') || phone.endsWith('@lid')) {
    return phone
  }
  // Normalize phone first (handle 0xxx, country codes)
  const normalized = normalizePhoneNumber(phone)
  return `${normalized}@s.whatsapp.net`
}

/**
 * Convert API recipient identifier to JID for Baileys.
 * - Bare phone → @s.whatsapp.net
 * - @g.us → passthrough (groups)
 * - @s.whatsapp.net → passthrough (backward compat)
 * - @lid → throw error (unresolved LID not accepted)
 */
export function recipientToJid(recipient: string): string {
  if (!recipient) {
    throw new AppError('Recipient is required', 400, 'INVALID_RECIPIENT')
  }
  if (recipient.endsWith('@lid')) {
    throw new AppError(
      'LID identifiers are not accepted. Use a bare phone number (e.g. 6281234567890).',
      400,
      'INVALID_RECIPIENT'
    )
  }
  if (recipient.endsWith('@g.us')) return recipient
  if (recipient.endsWith('@s.whatsapp.net')) return recipient
  // Bare phone number → convert
  return phoneToJid(recipient)
}

/**
 * Convert Long | bigint | number | null | undefined to number.
 */
function toNumber(val: unknown): number | undefined {
  if (val == null) return undefined
  if (typeof val === 'number') return val
  if (typeof val === 'bigint') return Number(val)
  if (typeof val === 'object' && 'toNumber' in (val as any)) {
    return (val as any).toNumber()
  }
  return Number(val)
}

/**
 * Normalize a Baileys timestamp to JavaScript milliseconds.
 *
 * Type-aware: prefers explicit handling over threshold heuristics.
 * - Protobuf Long (has .toNumber()): Baileys convention is seconds → convert to ms.
 * - bigint: check magnitude; if < 1e12 treat as seconds.
 * - number: if < 1e12 treat as seconds, otherwise milliseconds.
 * - Rejects NaN, Infinity, non-positive values.
 *
 * Returns milliseconds or undefined (never throws).
 */
export function normalizeTimestamp(value: unknown): number | undefined {
  // Nullish up front
  if (value == null) return undefined

  // Baileys protobuf timestamps are represented as Long values in Unix seconds.
  // They are always converted to JavaScript milliseconds.
  if (typeof value === 'object' && 'toNumber' in (value as any)) {
    const num = (value as any).toNumber()
    if (typeof num !== 'number' || !Number.isFinite(num) || num <= 0) return undefined
    return num * 1000
  }

  // bigint
  if (typeof value === 'bigint') {
    if (value <= 0n) return undefined
    const num = Number(value)
    if (!Number.isFinite(num)) return undefined
    return num < 1_000_000_000_000 ? num * 1000 : num
  }

  // number
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return undefined
    return value < 1_000_000_000_000 ? value * 1000 : value
  }

  // Unknown type — not a recognized timestamp format
  return undefined
}
