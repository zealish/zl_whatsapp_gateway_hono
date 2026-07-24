import type pino from 'pino'
import type { NormalizedMessage } from './normalizers.js'
import { extractPhoneFromJid, normalizeJid } from './normalizers.js'
import type { IContactStore, ContactEntry, ResolvedContact } from './contact-store.js'
import type { LidMappingStore } from './lid-mapping.js'

/**
 * Pure orchestration layer for contact resolution.
 *
 * Responsibilities:
 * - Extract phone from JID
 * - Filter unsupported JIDs (groups, status, newsletter, broadcast)
 * - Orchestrate message contact resolution
 * - Orchestrate metadata synchronization
 * - Build webhook contact payload
 *
 * No merge logic, no persistence, no display-name rules.
 * All business rules live in IContactStore.
 */
export class ContactResolver {
  private store: IContactStore
  private lidMapping: LidMappingStore | null
  private logger: pino.Logger

  constructor(store: IContactStore, logger: pino.Logger, lidMapping?: LidMappingStore | null) {
    this.store = store
    this.lidMapping = lidMapping ?? null
    this.logger = logger.child({ module: 'ContactResolver' })
  }

  /**
   * Resolve contact for a single message.
   * Returns null for unsupported JIDs (groups, status, newsletter, broadcast).
   * Saves new contacts with pushName as initial name.
   */
  resolveForMessage(jid: string, pushName?: string): ResolvedContact | null {
    // Reject unresolved @lid — the number is NOT a phone number, it's a LID identifier
    if (isRawLid(jid)) {
      this.logger.debug({ jid }, 'Skipping contact for unresolved @lid')
      return null
    }

    // Normalize JID (strips @s.whatsapp.net → bare phone)
    const normalizedJid = normalizeJid(jid, this.lidMapping)
    const phone = extractPhoneFromJid(normalizedJid)

    // Skip unsupported JID types
    if (!this.isPersonalJid(normalizedJid) || !phone) {
      return null
    }

    // Check store (LRU → SQLite)
    const existing = this.store.getByPhone(phone)

    if (!existing) {
      // New contact — save with pushName as initial name
      if (pushName) {
        this.store.saveOrUpdate({ phone, name: pushName })
      }
    } else if (pushName && (!existing.name || existing.name === phone)) {
      // Existing contact with no name — enrich with pushName
      this.store.saveOrUpdate({ phone, name: pushName })
    }

    return this.store.resolveContact(phone)
  }

  /**
   * Resolve contacts for all unique senders in a batch of messages.
   * Deduplicates by normalized JID (phone).
   */
  resolveUniqueContacts(messages: NormalizedMessage[]): ResolvedContact[] {
    const seen = new Set<string>()
    const contacts: ResolvedContact[] = []

    for (const msg of messages) {
      // Use sender JID (participant or remoteJid) — already normalized by normalizers
      const jid = msg.sender || msg.chatJid
      if (!jid) continue

      // Deduplicate by extracting phone from normalized JID (bare phone)
      const phone = extractPhoneFromJid(jid)
      if (!phone || seen.has(phone)) continue
      seen.add(phone)

      const resolved = this.resolveForMessage(jid, msg.pushName)
      if (resolved) {
        contacts.push(resolved)
      }
    }

    return contacts
  }

  /**
   * Sync contact metadata from contacts.upsert, contacts.update, or history sync.
   * Pure delegation to store — no business logic here.
   */
  syncContact(entry: ContactEntry): void {
    this.store.saveOrUpdate(entry)
  }

  // ── Private ──

  /**
   * Check if JID is a personal chat (not group, status, newsletter, broadcast).
   * Accepts bare phone numbers (no @ suffix) and @s.whatsapp.net.
   * Note: @lid is rejected earlier by isRawLid() before this check.
   */
  private isPersonalJid(jid: string): boolean {
    if (!jid) return false

    // Bare phone number (no @) — always personal
    if (!jid.includes('@')) return true

    // Has @ suffix — check what kind (only @s.whatsapp.net is personal)
    return (
      jid.endsWith('@s.whatsapp.net') &&
      !jid.startsWith('status@') &&
      !jid.includes('newsletter') &&
      !jid.includes('broadcast')
    )
  }
}

/**
 * Check if a raw JID is an @lid (not a real phone number).
 * @lid JIDs contain a LID identifier, not a phone number.
 * If the LID was resolvable, normalizeJid would have returned a bare phone.
 * So a raw @lid means the mapping doesn't exist yet.
 */
function isRawLid(jid: string | null | undefined): boolean {
  return !!jid && jid.endsWith('@lid')
}
