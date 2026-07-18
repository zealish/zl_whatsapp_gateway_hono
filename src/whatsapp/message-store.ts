import type { WAMessage } from 'baileys'

/**
 * In-memory message store for offline retry / message lookup.
 * NOT persistent — lost on process restart (acceptable for gateway).
 * Keeps the last N messages per chat to bound memory usage.
 */
export class MessageStore {
  private store = new Map<string, Map<string, WAMessage>>()
  private maxPerChat: number

  constructor(maxPerChat = 500) {
    this.maxPerChat = maxPerChat
  }

  /**
   * Store a message. Keys: remoteJid (chat) + message id.
   * Evicts oldest messages if the per-chat limit is exceeded.
   */
  set(jid: string, msg: WAMessage): void {
    if (!jid || !msg.key?.id) return

    let chat = this.store.get(jid)
    if (!chat) {
      chat = new Map()
      this.store.set(jid, chat)
    }

    chat.set(msg.key.id, msg)

    // Evict oldest if over limit
    if (chat.size > this.maxPerChat) {
      const oldestKey = chat.keys().next().value
      if (oldestKey) chat.delete(oldestKey)
    }
  }

  /**
   * Retrieve a stored message by chat JID and message ID.
   */
  get(jid: string, msgId: string): WAMessage | undefined {
    return this.store.get(jid)?.get(msgId)
  }

  /**
   * Retrieve a stored message from any chat by message key.
   * Used by Baileys' getMessage callback for retry / decrypt.
   */
  getByKey(key: { remoteJid?: string | null; id?: string | null }): WAMessage | undefined {
    if (!key.remoteJid || !key.id) return undefined
    return this.get(key.remoteJid, key.id)
  }

  /**
   * Number of chats tracked.
   */
  get chatCount(): number {
    return this.store.size
  }

  /**
   * Total messages stored across all chats.
   */
  get messageCount(): number {
    let count = 0
    for (const chat of this.store.values()) {
      count += chat.size
    }
    return count
  }
}
