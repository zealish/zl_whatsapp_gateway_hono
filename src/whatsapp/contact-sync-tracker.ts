import type pino from 'pino'

export interface PendingContactSync {
  syncId: string
  jid: string
  cutoffTimestamp: number
  createdAt: number
  synced: number
  oldestTimestamp?: number
}

export class ContactSyncTracker {
  private pending = new Map<string, PendingContactSync>()
  private logger: pino.Logger

  constructor(logger: pino.Logger) {
    this.logger = logger.child({ module: 'ContactSyncTracker' })
  }

  register(syncId: string, jid: string, cutoffTimestamp: number): void {
    this.pending.set(syncId, {
      syncId,
      jid,
      cutoffTimestamp,
      createdAt: Date.now(),
      synced: 0,
    })

    setTimeout(() => this.expire(syncId), 300_000)
  }

  get(syncId: string): PendingContactSync | undefined {
    return this.pending.get(syncId)
  }

  getByJid(jid: string): PendingContactSync | undefined {
    for (const sync of this.pending.values()) {
      if (sync.jid === jid) return sync
    }
    return undefined
  }

  hasPendingForJid(jid: string): boolean {
    return this.getByJid(jid) !== undefined
  }

  increment(syncId: string, count: number, oldestTimestamp?: number): void {
    const sync = this.pending.get(syncId)
    if (sync) {
      sync.synced += count
      if (oldestTimestamp !== undefined) {
        if (sync.oldestTimestamp === undefined || oldestTimestamp < sync.oldestTimestamp) {
          sync.oldestTimestamp = oldestTimestamp
        }
      }
    }
  }

  complete(syncId: string): PendingContactSync | undefined {
    const sync = this.pending.get(syncId)
    if (sync) {
      this.pending.delete(syncId)
    }
    return sync
  }

  private expire(syncId: string): void {
    const sync = this.pending.get(syncId)
    if (sync) {
      this.pending.delete(syncId)
      this.logger.warn({ syncId, jid: sync.jid }, 'Contact sync expired')
    }
  }
}
