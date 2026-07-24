import Database from 'better-sqlite3'
import { EventEmitter } from 'node:events'
import type pino from 'pino'

/**
 * Bidirectional LID ↔ Phone mapping store.
 *
 * Maintains an in-memory LRU cache backed by SQLite for persistence.
 * Used to resolve @lid JIDs to @s.whatsapp.net JIDs so consumers
 * always see consistent identifiers for the same contact.
 *
 * Data sources:
 * - contacts.upsert / contacts.update events (Baileys Contact has id + lid)
 * - messaging-history.set contacts (same data)
 *
 * Thread-safe: SQLite WAL mode, in-memory LRU for hot path.
 */
export class LidMappingStore extends EventEmitter {
  private db: Database.Database
  private lidToPhone: Map<string, string>
  private phoneToLid: Map<string, string>
  private maxCacheSize: number
  private logger: pino.Logger

  // Prepared statements
  private selectByLid!: Database.Statement
  private selectByPhone!: Database.Statement
  private upsertStmt!: Database.Statement

  constructor(dbPath: string, maxCacheSize: number, logger: pino.Logger) {
    super()
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')

    this.lidToPhone = new Map()
    this.phoneToLid = new Map()
    this.maxCacheSize = maxCacheSize
    this.logger = logger.child({ module: 'LidMappingStore' })

    this.createTables()
    this.prepareStatements()
    this.warmCache()
  }

  /**
   * Add a LID ↔ Phone mapping.
   * Both directions are stored. Deduplicates silently.
   *
   * @param lid - The @lid JID (e.g. "1234567890@lid")
   * @param phone - The phone number (e.g. "6281234567890")
   */
  addMapping(lid: string, phone: string): void {
    if (!lid || !phone) return

    // Normalize: strip @lid suffix if present for storage key
    const lidKey = lid.includes('@') ? lid : `${lid}@lid`

    // Skip if mapping already exists and is identical
    const existing = this.lidToPhone.get(lidKey)
    if (existing === phone) return

    // Upsert to SQLite
    this.upsertStmt.run(lidKey, phone)

    // Update in-memory cache
    this.lidToPhone.set(lidKey, phone)
    this.phoneToLid.set(phone, lidKey)

    this.logger.debug({ lid: lidKey, phone }, 'LID mapping added')

    // Emit event so pending resolution queue can replay queued events
    this.emit('mapping:added', phone, lidKey)
  }

  /**
   * Resolve a @lid JID to a @s.whatsapp.net JID.
   * Returns the canonical JID if resolved, or null if unknown.
   */
  resolveLid(lid: string): string | null {
    const phone = this.lidToPhone.get(lid)
    if (phone) return `${phone}@s.whatsapp.net`

    // Check SQLite
    const row = this.selectByLid.get(lid) as { phone: string } | undefined
    if (row) {
      this.lidToPhone.set(lid, row.phone)
      return `${row.phone}@s.whatsapp.net`
    }

    return null
  }

  /**
   * Get the LID for a phone number.
   * Returns the @lid JID if known, or null.
   */
  getLidForPhone(phone: string): string | null {
    const lid = this.phoneToLid.get(phone)
    if (lid) return lid

    const row = this.selectByPhone.get(phone) as { lid: string } | undefined
    if (row) {
      this.phoneToLid.set(phone, row.lid)
      return row.lid
    }

    return null
  }

  close(): void {
    this.db.close()
  }

  // ── Private ──

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lid_mapping (
        lid TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lid_mapping_phone ON lid_mapping(phone);
    `)
  }

  private prepareStatements(): void {
    this.selectByLid = this.db.prepare(
      'SELECT phone FROM lid_mapping WHERE lid = ?'
    )

    this.selectByPhone = this.db.prepare(
      'SELECT lid FROM lid_mapping WHERE phone = ?'
    )

    this.upsertStmt = this.db.prepare(`
      INSERT INTO lid_mapping (lid, phone, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(lid) DO UPDATE SET
        phone = excluded.phone,
        updated_at = excluded.updated_at
    `)
  }

  /**
   * Warm the in-memory cache from SQLite on startup.
   * Loads up to maxCacheSize most recent mappings.
   */
  private warmCache(): void {
    const rows = this.db
      .prepare(
        'SELECT lid, phone FROM lid_mapping ORDER BY updated_at DESC LIMIT ?'
      )
      .all(this.maxCacheSize) as Array<{ lid: string; phone: string }>

    for (const row of rows) {
      this.lidToPhone.set(row.lid, row.phone)
      this.phoneToLid.set(row.phone, row.lid)
    }

    if (rows.length > 0) {
      this.logger.debug({ count: rows.length }, 'LID mapping cache warmed')
    }
  }
}
