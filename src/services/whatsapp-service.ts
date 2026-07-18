import type pino from 'pino'
import type {
  IWhatsAppService,
  SessionInfo,
  SendMessageResult,
  ContactInfo,
  GroupInfo,
} from '../types/whatsapp.js'
import type { SessionManager } from './session-manager.js'
import { NotFoundError } from '../lib/errors.js'

/**
 * Implements IWhatsAppService.
 * Delegates to SessionManager → ConnectionManager → BaileysAdapter.
 * Routes depend on this interface, never on Baileys directly.
 */
export class WhatsAppService implements IWhatsAppService {
  private sessionManager: SessionManager
  private logger: pino.Logger

  constructor(sessionManager: SessionManager, logger: pino.Logger) {
    this.sessionManager = sessionManager
    this.logger = logger.child({ module: 'WhatsAppService' })
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
    jid: string,
    content: object
  ): Promise<SendMessageResult> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.sendMessage(jid, content)
  }

  async getContact(
    sessionId: string,
    jid: string
  ): Promise<ContactInfo | null> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.getContact(jid)
  }

  async getGroup(sessionId: string, jid: string): Promise<GroupInfo | null> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.getGroupMetadata(jid)
  }

  getMessage(sessionId: string, jid: string, msgId: string): object | undefined {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.getMessage(jid, msgId)
  }

  // ── Group operations ──

  async createGroup(sessionId: string, subject: string, participants: string[]): Promise<GroupInfo> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.createGroup(subject, participants)
  }

  async leaveGroup(sessionId: string, jid: string): Promise<void> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.leaveGroup(jid)
  }

  async updateGroupSubject(sessionId: string, jid: string, subject: string): Promise<void> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.updateGroupSubject(jid, subject)
  }

  async updateGroupDescription(sessionId: string, jid: string, description: string): Promise<void> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.updateGroupDescription(jid, description)
  }

  async addParticipants(sessionId: string, jid: string, participants: string[]): Promise<void> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.addParticipants(jid, participants)
  }

  async removeParticipants(sessionId: string, jid: string, participants: string[]): Promise<void> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.removeParticipants(jid, participants)
  }

  async promoteParticipants(sessionId: string, jid: string, participants: string[]): Promise<void> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.promoteParticipants(jid, participants)
  }

  async demoteParticipants(sessionId: string, jid: string, participants: string[]): Promise<void> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.demoteParticipants(jid, participants)
  }

  async getGroupInviteCode(sessionId: string, jid: string): Promise<string> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.getGroupInviteCode(jid)
  }

  async revokeGroupInviteCode(sessionId: string, jid: string): Promise<string> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.revokeGroupInviteCode(jid)
  }

  async joinGroupByInviteCode(sessionId: string, code: string): Promise<GroupInfo> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.joinGroupByInviteCode(code)
  }

  async getGroupInfoByInviteCode(sessionId: string, code: string): Promise<GroupInfo | null> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.getGroupInfoByInviteCode(code)
  }

  async updateGroupSettings(
    sessionId: string,
    jid: string,
    setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked'
  ): Promise<void> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.updateGroupSettings(jid, setting)
  }

  async getAllGroups(sessionId: string): Promise<GroupInfo[]> {
    const session = this.sessionManager.getSessionOrThrow(sessionId)
    return session.connectionManager.adapter.getAllGroups()
  }
}
