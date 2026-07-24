import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type pino from 'pino'

// ── Public Types ──

export interface ContactEntry {
  phone: string
  name?: string
  notify?: string
  verifiedName?: string
}

export interface StoredContact extends ContactEntry {
  updatedAt: number
}

export interface ResolvedContact {
  wa_id: string
  profile: { name: string }
}

// ── Interface ──

export interface IContactStore {
  getByPhone(phone: string): StoredContact | null
  saveOrUpdate(entry: ContactEntry): void
  resolveContact(phone: string): ResolvedContact | null
}

// ── Implementation ──

/**
 * SQLite-backed contact store with LRU memory cache.
 *
 * Merge-on-update: never overwrites valid fields with empty values.
 * Display name priority: verifiedName → notify → name → phone.
 * LRU cache: Map-based, delete+reinsert on access for true LRU ordering.
 */
export class SQLiteContactStore implements IContactStore {
  private db: Database.Database
  private cache: Map<string, StoredContact>
  private maxCacheSize: number
  private logger: pino.Logger

  // Prepared statements
  private selectByPhone!: Database.Statement
  private upsertStmt!: Database.Statement

  constructor(dbPath: string, maxCacheSize: number, logger: pino.Logger) {
    mkdirSync(dirname(dbPath), { recursive: true })

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')

    this.cache = new Map()
    this.maxCacheSize = maxCacheSize
    this.logger = logger.child({ module: 'ContactStore' })

    this.createTables()
    this.prepareStatements()
  }

  /**
   * Lookup contact by phone number.
   * LRU first, then SQLite. Promotes on LRU hit.
   */
  getByPhone(phone: string): StoredContact | null {
    // LRU hit — promote and return
    const cached = this.cache.get(phone)
    if (cached) {
      this.cache.delete(phone)
      this.cache.set(phone, cached)
      return cached
    }

    // LRU miss — check SQLite
    const row = this.selectByPhone.get(phone) as StoredContact | undefined
    if (!row) return null

    // Insert into LRU cache
    this.cacheSet(phone, row)
    return row
  }

  /**
   * Save or update a contact.
   * Merge semantics: never overwrites valid fields with empty values.
   * Uses updated_at to skip stale updates.
   */
  saveOrUpdate(entry: ContactEntry): void {
    const now = Date.now()
    const existing = this.getByPhone(entry.phone)

    if (existing) {
      // Merge: only write incoming fields that are truthy
      // Never replace a better value with a weaker one
      const merged: StoredContact = {
        phone: entry.phone,
        name: this.pickBest(entry.name, existing.name),
        notify: this.pickBest(entry.notify, existing.notify),
        verifiedName: this.pickBest(entry.verifiedName, existing.verifiedName),
        updatedAt: now,
      }

      this.upsertStmt.run(
        merged.phone,
        merged.name ?? null,
        merged.notify ?? null,
        merged.verifiedName ?? null,
        merged.updatedAt
      )

      // Update LRU cache
      this.cache.delete(entry.phone)
      this.cacheSet(entry.phone, merged)

      this.logger.debug({ phone: entry.phone }, 'Contact updated (merged)')
    } else {
      // New contact
      const contact: StoredContact = {
        phone: entry.phone,
        name: entry.name || undefined,
        notify: entry.notify || undefined,
        verifiedName: entry.verifiedName || undefined,
        updatedAt: now,
      }

      this.upsertStmt.run(
        contact.phone,
        contact.name ?? null,
        contact.notify ?? null,
        contact.verifiedName ?? null,
        contact.updatedAt
      )

      this.cacheSet(entry.phone, contact)
      this.logger.debug({ phone: entry.phone }, 'Contact created')
    }
  }

  /**
   * Resolve a contact for webhook payload.
   * Returns null if phone is empty.
   * Always returns a name — falls back to phone number.
   */
  resolveContact(phone: string): ResolvedContact | null {
    if (!phone) return null

    const stored = this.getByPhone(phone)
    const name = this.bestDisplayName(stored, phone)

    return {
      wa_id: phone,
      profile: { name },
    }
  }

  close(): void {
    this.db.close()
  }

  // ── Private ──

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        phone TEXT PRIMARY KEY,
        name TEXT,
        notify TEXT,
        verified_name TEXT,
        updated_at INTEGER NOT NULL
      )
    `)
  }

  private prepareStatements(): void {
    this.selectByPhone = this.db.prepare(
      'SELECT phone, name, notify, verified_name AS verifiedName, updated_at AS updatedAt FROM contacts WHERE phone = ?'
    )

    this.upsertStmt = this.db.prepare(`
      INSERT INTO contacts (phone, name, notify, verified_name, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET
        name = CASE WHEN excluded.name IS NOT NULL AND excluded.name != '' THEN excluded.name ELSE contacts.name END,
        notify = CASE WHEN excluded.notify IS NOT NULL AND excluded.notify != '' THEN excluded.notify ELSE contacts.notify END,
        verified_name = CASE WHEN excluded.verified_name IS NOT NULL AND excluded.verified_name != '' THEN excluded.verified_name ELSE contacts.verified_name END,
        updated_at = CASE WHEN excluded.updated_at >= contacts.updated_at THEN excluded.updated_at ELSE contacts.updated_at END
    `)
  }

  /**
   * Determine the best display name from stored contact metadata.
   * Priority: verifiedName → notify → name → phone
   */
  private bestDisplayName(contact: StoredContact | null, phone: string): string {
    return contact?.verifiedName || contact?.notify || contact?.name || phone
  }

  /**
   * Pick the best value between incoming and existing.
   * Returns the incoming value only if it's truthy; otherwise keeps existing.
   */
  private pickBest(incoming: string | undefined, existing: string | undefined): string | undefined {
    if (incoming && incoming.trim()) return incoming
    return existing
  }

  /**
   * Insert into LRU cache with eviction.
   */
  private cacheSet(phone: string, contact: StoredContact): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) this.cache.delete(oldestKey)
    }
    this.cache.set(phone, contact)
  }
}
