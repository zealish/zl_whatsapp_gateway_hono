import type { WAMessage } from 'baileys'

/**
 * Strip Baileys multi-device suffix from JID.
 * "6281234567890:0@s.whatsapp.net" → "6281234567890@s.whatsapp.net"
 * "120363...@g.us:0" → "120363...@g.us"
 */
function stripDeviceSuffix(jid: string): string {
  const atIndex = jid.indexOf('@')
  if (atIndex === -1) return jid
  const localPart = jid.substring(0, atIndex)
  const domain = jid.substring(atIndex)
  const colonIndex = localPart.indexOf(':')
  if (colonIndex === -1) return jid
  return localPart.substring(0, colonIndex) + domain
}

/**
 * In-memory message store for offline retry / message lookup.
 * NOT persistent — lost on process restart (acceptable for gateway).
 * Keeps the last N messages per chat to bound memory usage.
 *
 * Normalizes JIDs by stripping multi-device suffixes (`:N`) so lookups
 * work regardless of the device the message was sent from/to.
 */
export class MessageStore {
  private store = new Map<string, Map<string, WAMessage>>()
  private maxPerChat: number

  constructor(maxPerChat = 500) {
    this.maxPerChat = maxPerChat
  }

  /**
   * Store a message. Keys: remoteJid (chat) + message id.
   * Normalizes JID by stripping device suffix.
   * Evicts oldest messages if the per-chat limit is exceeded.
   */
  set(jid: string, msg: WAMessage): void {
    if (!jid || !msg.key?.id) return

    const normalizedJid = stripDeviceSuffix(jid)
    let chat = this.store.get(normalizedJid)
    if (!chat) {
      chat = new Map()
      this.store.set(normalizedJid, chat)
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
   * Normalizes JID by stripping device suffix.
   */
  get(jid: string, msgId: string): WAMessage | undefined {
    const normalizedJid = stripDeviceSuffix(jid)
    const found = this.store.get(normalizedJid)?.get(msgId)
    // DEBUG: log if not found
    if (!found) {
      console.debug(`MessageStore.get: ${normalizedJid} ${msgId} NOT FOUND`)
      console.debug(`Available keys: ${Array.from(this.store.keys()).join(', ')}`)
      for (const [storeJid, chat] of this.store) {
        console.debug(`Store[${storeJid}] has ${chat.size} messages`)
      }
    }
    return found
  }

  /**
   * Retrieve a stored message from any chat by message key.
   * Used by Baileys' getMessage callback for retry / decrypt.
   * Normalizes JID by stripping device suffix.
   */
  getByKey(key: { remoteJid?: string | null; id?: string | null }): WAMessage | undefined {
    if (!key.remoteJid || !key.id) return undefined
    return this.get(key.remoteJid, key.id)
  }

  /**
   * Find a message by ID across all chats.
   * Returns the message and the chat JID it belongs to, or undefined.
   * O(chats) scan — acceptable at 500 msgs/chat × N chats scale.
   */
  getByMessageId(msgId: string): { jid: string; message: WAMessage } | undefined {
    for (const [jid, chat] of this.store) {
      const msg = chat.get(msgId)
      if (msg) return { jid, message: msg }
    }
    return undefined
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

  /**
   * Get the oldest message in a specific chat.
   * Uses insertion order - first message in Map is the oldest.
   * Returns undefined if no messages for the chat.
   */
  getOldestMessage(jid: string): WAMessage | undefined {
    const normalizedJid = stripDeviceSuffix(jid)
    const chat = this.store.get(normalizedJid)
    if (!chat?.size) return undefined
    return chat.values().next().value
  }
}
