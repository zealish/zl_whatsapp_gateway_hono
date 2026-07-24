import type pino from 'pino'
import type {
  IWhatsAppService,
  SessionInfo,
  SendMessageResult,
  ContactInfo,
  GroupInfo,
  GroupParticipant,
} from '../types/whatsapp.js'
import type { SessionManager } from './session-manager.js'
import { NotFoundError } from '../lib/errors.js'
import { recipientToJid, phoneToJid, extractPhoneFromJid } from '../whatsapp/normalizers.js'

/**
 * Implements IWhatsAppService.
 * Delegates to SessionManager → ConnectionManager → BaileysAdapter.
 * Routes depend on this interface, never on Baileys directly.
 *
 * Input conversion: recipient → JID (behind the scenes)
 * Output conversion: JID → bare phone (for API responses)
 */
export class WhatsAppService implements IWhatsAppService {
  private sessionManager: SessionManager
  private logger: pino.Logger

  constructor(sessionManager: SessionManager, logger: pino.Logger) {
    this.sessionManager = sessionManager
    this.logger = logger.child({ module: 'WhatsAppService' })
  }

  // ── Response sanitization helpers ──

  /** Convert JID fields in ContactInfo to bare phone */
  private sanitizeContact(contact: ContactInfo | null): ContactInfo | null {
    if (!contact) return null
    return {
      ...contact,
      jid: contact.jid.endsWith('@g.us') ? contact.jid : extractPhoneFromJid(contact.jid),
    }
  }

  /** Convert JID fields in GroupInfo to sanitized form */
  private sanitizeGroup(group: GroupInfo | null): GroupInfo | null {
    if (!group) return null
    return {
      ...group,
      // Group JID stays as @g.us
      // Owner JID → bare phone if personal
      owner: group.owner ? extractPhoneFromJid(group.owner) : undefined,
    }
  }

  /** Convert JID fields in GroupParticipant */
  private sanitizeParticipant(p: GroupParticipant): GroupParticipant {
    return {
      ...p,
      jid: p.jid.endsWith('@g.us') ? p.jid : extractPhoneFromJid(p.jid),
    }
  }

  /** Sanitize array of GroupInfo */
  private sanitizeGroups(groups: GroupInfo[]): GroupInfo[] {
    return groups.map((g) => this.sanitizeGroup(g)!)
  }

  async connect(sessionId: string): Promise<SessionInfo> {
    return this.sessionManager.connectSession(sessionId)
  }

  async disconnect(sessionId: string): Promise<void> {
    return this.sessionManager.disconnectSession(sessionId)
  }

  getStatus(sessionId: string): SessionInfo {
    return this.sessionManager.getStatus(sessionId)
  }

  async sendMessage(
    sessionId: string,
    recipient: string,
    content: object,
    options?: { quoted?: object }
  ): Promise<SendMessageResult> {
    const jid = recipientToJid(recipient)
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.sendMessage(jid, content, options)
  }

  async getContact(
    sessionId: string,
    recipient: string
  ): Promise<ContactInfo | null> {
    const jid = recipientToJid(recipient)
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    const contact = await session.connectionManager.adapter.getContact(jid)
    return this.sanitizeContact(contact)
  }

  async getGroup(sessionId: string, jid: string): Promise<GroupInfo | null> {
    // Group JID (@g.us) is accepted as-is
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    const group = await session.connectionManager.adapter.getGroupMetadata(jid)
    return this.sanitizeGroup(group)
  }

  getMessage(sessionId: string, recipient: string, msgId: string): object | undefined {
    const jid = recipientToJid(recipient)
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.getMessage(jid, msgId)
  }

  async downloadMedia(sessionId: string, recipient: string, msgId: string): Promise<Buffer> {
    const jid = recipientToJid(recipient)
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.downloadMedia(jid, msgId)
  }

  async downloadMediaByMessageId(sessionId: string, msgId: string): Promise<{ buffer: Buffer; mimetype?: string; fileName?: string }> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.downloadMediaByMessageId(msgId)
  }

  // ── Group operations ──

  async createGroup(sessionId: string, subject: string, participants: string[]): Promise<GroupInfo> {
    // Convert participant phone numbers to JIDs
    const participantJids = participants.map((p) => phoneToJid(p))
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    const group = await session.connectionManager.adapter.createGroup(subject, participantJids)
    return this.sanitizeGroup(group)!
  }

  async leaveGroup(sessionId: string, jid: string): Promise<void> {
    // Group JID (@g.us) is accepted as-is
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.leaveGroup(jid)
  }

  async updateGroupSubject(sessionId: string, jid: string, subject: string): Promise<void> {
    // Group JID (@g.us) is accepted as-is
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.updateGroupSubject(jid, subject)
  }

  async updateGroupDescription(sessionId: string, jid: string, description: string): Promise<void> {
    // Group JID (@g.us) is accepted as-is
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.updateGroupDescription(jid, description)
  }

  async addParticipants(sessionId: string, jid: string, participants: string[]): Promise<void> {
    // Group JID (@g.us) is accepted as-is; convert participant phone numbers to JIDs
    const participantJids = participants.map((p) => phoneToJid(p))
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.addParticipants(jid, participantJids)
  }

  async removeParticipants(sessionId: string, jid: string, participants: string[]): Promise<void> {
    // Group JID (@g.us) is accepted as-is; convert participant phone numbers to JIDs
    const participantJids = participants.map((p) => phoneToJid(p))
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.removeParticipants(jid, participantJids)
  }

  async promoteParticipants(sessionId: string, jid: string, participants: string[]): Promise<void> {
    // Group JID (@g.us) is accepted as-is; convert participant phone numbers to JIDs
    const participantJids = participants.map((p) => phoneToJid(p))
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.promoteParticipants(jid, participantJids)
  }

  async demoteParticipants(sessionId: string, jid: string, participants: string[]): Promise<void> {
    // Group JID (@g.us) is accepted as-is; convert participant phone numbers to JIDs
    const participantJids = participants.map((p) => phoneToJid(p))
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.demoteParticipants(jid, participantJids)
  }

  async getGroupInviteCode(sessionId: string, jid: string): Promise<string> {
    // Group JID (@g.us) is accepted as-is
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.getGroupInviteCode(jid)
  }

  async revokeGroupInviteCode(sessionId: string, jid: string): Promise<string> {
    // Group JID (@g.us) is accepted as-is
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.revokeGroupInviteCode(jid)
  }

  async joinGroupByInviteCode(sessionId: string, code: string): Promise<GroupInfo> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    const group = await session.connectionManager.adapter.joinGroupByInviteCode(code)
    return this.sanitizeGroup(group)!
  }

  async getGroupInfoByInviteCode(sessionId: string, code: string): Promise<GroupInfo | null> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    const group = await session.connectionManager.adapter.getGroupInfoByInviteCode(code)
    return this.sanitizeGroup(group)
  }

  async updateGroupSettings(
    sessionId: string,
    jid: string,
    setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked'
  ): Promise<void> {
    // Group JID (@g.us) is accepted as-is
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.updateGroupSettings(jid, setting)
  }

  async getAllGroups(sessionId: string): Promise<GroupInfo[]> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    const groups = await session.connectionManager.adapter.getAllGroups()
    return this.sanitizeGroups(groups)
  }
}
