import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { PendingDelivery, GatewayEventEnvelope } from './types.js'

/**
 * SQLite-backed persistent queue and DLQ.
 * Single database, multiple tables.
 */
export class QueueDB {
  private db: Database.Database

  // Prepared statements
  private insertDelivery!: Database.Statement
  private selectReady!: Database.Statement
  private markDeliveredStmt!: Database.Statement
  private markFailedStmt!: Database.Statement
  private moveToDLQStmt!: Database.Statement
  private deleteDeliveryStmt!: Database.Statement
  private selectDLQ!: Database.Statement
  private selectDLQById!: Database.Statement
  private insertFromDLQ!: Database.Statement
  private deleteDLQStmt!: Database.Statement
  private insertSequence!: Database.Statement
  private updateSequence!: Database.Statement
  private selectSequence!: Database.Statement

  constructor(dbPath: string) {
    // Ensure parent directory exists
    mkdirSync(dirname(dbPath), { recursive: true })

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')

    this.createTables()
    this.prepareStatements()
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        webhook_url TEXT NOT NULL,
        payload TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        next_retry_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        status TEXT DEFAULT 'pending'
      );

      CREATE INDEX IF NOT EXISTS idx_deliveries_pending
        ON deliveries(status, next_retry_at);

      CREATE INDEX IF NOT EXISTS idx_deliveries_instance_seq
        ON deliveries(instance_id, sequence);

      CREATE TABLE IF NOT EXISTS dead_letters (
        id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        webhook_url TEXT NOT NULL,
        payload TEXT NOT NULL,
        attempts INTEGER,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        failed_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sequences (
        instance_id TEXT PRIMARY KEY,
        seq INTEGER NOT NULL DEFAULT 0
      );
    `)
  }

  private prepareStatements(): void {
    this.insertDelivery = this.db.prepare(`
      INSERT INTO deliveries (id, instance_id, sequence, webhook_url, payload, attempts, next_retry_at, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `)

    this.selectReady = this.db.prepare(`
      SELECT * FROM deliveries
      WHERE status = 'pending' AND next_retry_at <= ?
      ORDER BY instance_id, sequence ASC
      LIMIT 100
    `)

    this.markDeliveredStmt = this.db.prepare(`
      UPDATE deliveries SET status = 'delivered' WHERE id = ?
    `)

    this.markFailedStmt = this.db.prepare(`
      UPDATE deliveries SET status = 'pending', attempts = ?, next_retry_at = ? WHERE id = ?
    `)

    this.moveToDLQStmt = this.db.prepare(`
      INSERT INTO dead_letters (id, instance_id, sequence, webhook_url, payload, attempts, last_error, created_at, failed_at)
      SELECT id, instance_id, sequence, webhook_url, payload, attempts, ?, created_at, ?
      FROM deliveries WHERE id = ?
    `)

    this.deleteDeliveryStmt = this.db.prepare(`
      DELETE FROM deliveries WHERE id = ?
    `)

    this.selectDLQ = this.db.prepare(`
      SELECT * FROM dead_letters ORDER BY failed_at DESC
    `)

    this.selectDLQById = this.db.prepare(`
      SELECT * FROM dead_letters WHERE instance_id = ? ORDER BY failed_at DESC
    `)

    this.insertFromDLQ = this.db.prepare(`
      INSERT INTO deliveries (id, instance_id, sequence, webhook_url, payload, attempts, next_retry_at, created_at, status)
      SELECT id, instance_id, sequence, webhook_url, payload, 0, ?, created_at, 'pending'
      FROM dead_letters WHERE id = ?
    `)

    this.deleteDLQStmt = this.db.prepare(`
      DELETE FROM dead_letters WHERE id = ?
    `)

    this.insertSequence = this.db.prepare(`
      INSERT INTO sequences (instance_id, seq) VALUES (?, 1)
      ON CONFLICT(instance_id) DO UPDATE SET seq = seq + 1
      RETURNING seq
    `)

    this.updateSequence = this.db.prepare(`
      UPDATE sequences SET seq = seq + 1 WHERE instance_id = ?
      RETURNING seq
    `)

    this.selectSequence = this.db.prepare(`
      SELECT seq FROM sequences WHERE instance_id = ?
    `)
  }

  enqueue(delivery: {
    id: string
    instanceId: string
    sequence: number
    webhookUrl: string
    payload: GatewayEventEnvelope
    attempts: number
    nextRetryAt: number
    createdAt: number
  }): void {
    this.insertDelivery.run(
      delivery.id,
      delivery.instanceId,
      delivery.sequence,
      delivery.webhookUrl,
      JSON.stringify(delivery.payload),
      delivery.attempts,
      delivery.nextRetryAt,
      delivery.createdAt
    )
  }

  dequeueReady(): PendingDelivery[] {
    const now = Date.now()
    return this.selectReady.all(now) as PendingDelivery[]
  }

  markDelivered(id: string): void {
    this.markDeliveredStmt.run(id)
    this.deleteDeliveryStmt.run(id)
  }

  markFailed(id: string, attempts: number, nextRetryAt: number): void {
    this.markFailedStmt.run(attempts, nextRetryAt, id)
  }

  moveToDLQ(id: string, error: string): void {
    const now = Date.now()
    this.moveToDLQStmt.run(error, now, id)
    this.deleteDeliveryStmt.run(id)
  }

  getDLQ(instanceId?: string): PendingDelivery[] {
    if (instanceId) {
      return this.selectDLQById.all(instanceId) as PendingDelivery[]
    }
    return this.selectDLQ.all() as PendingDelivery[]
  }

  replayDLQ(id: string): boolean {
    const row = this.selectDLQById.all(id) as PendingDelivery[]
    if (row.length === 0) {
      // Try by direct id
      const dlqRow = this.db.prepare('SELECT * FROM dead_letters WHERE id = ?').get(id) as PendingDelivery | undefined
      if (!dlqRow) return false
    }
    const now = Date.now()
    this.insertFromDLQ.run(now, id)
    this.deleteDLQStmt.run(id)
    return true
  }

  deleteDLQ(id: string): boolean {
    const result = this.deleteDLQStmt.run(id)
    return result.changes > 0
  }

  /**
   * Get and increment the sequence number for an instance.
   * Atomic: uses INSERT ... ON CONFLICT + UPDATE in a single statement.
   */
  nextSequence(instanceId: string): number {
    const row = this.insertSequence.get(instanceId) as { seq: number }
    return row.seq
  }

  /**
   * Get and increment the sequence number for an instance+pipeline.
   * Independent counters: history and realtime never share sequence space.
   * Atomic: uses INSERT ... ON CONFLICT + UPDATE in a single statement.
   */
  nextSequenceForPipeline(instanceId: string, pipeline: 'history' | 'realtime'): number {
    const key = `${instanceId}:${pipeline}`
    const row = this.insertSequence.get(key) as { seq: number }
    return row.seq
  }

  currentSequence(instanceId: string): number {
    const row = this.selectSequence.get(instanceId) as { seq: number } | undefined
    return row?.seq ?? 0
  }

  close(): void {
    this.db.close()
  }
}
