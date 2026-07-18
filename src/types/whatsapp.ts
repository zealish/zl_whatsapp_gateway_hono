// ── Connection ──

export type ConnectionState = 'connecting' | 'open' | 'close'

// ── Session ──

export interface SessionInfo {
  id: string
  state: ConnectionState
  pushName?: string
  qr?: string | null
}

// ── Messages ──

export interface SendMessageResult {
  id: string
  timestamp: number
  status: 'sent' | 'queued' | 'failed'
}

// ── Contacts ──

export interface ContactInfo {
  jid: string
  name?: string
  pushName?: string
  isGroup: boolean
}

// ── Groups ──

export interface GroupInfo {
  jid: string
  subject: string
  description?: string
  owner?: string
  participantCount: number
  creation?: number
  announce?: boolean
  restrict?: boolean
  ephemeral?: boolean
}

export interface GroupParticipant {
  jid: string
  admin: 'admin' | 'superadmin' | null
}

// ── Baileys Adapter Interface ──
// Only whatsapp/ files implement this. Routes never see it.

export interface IBaileysAdapter {
  connect(): Promise<void>
  disconnect(): Promise<void>
  sendMessage(jid: string, content: object): Promise<SendMessageResult>
  getContact(jid: string): Promise<ContactInfo | null>
  getGroupMetadata(jid: string): Promise<GroupInfo | null>
  getPushName(): string | undefined
  getMessage(jid: string, msgId: string): object | undefined
  getConnectionState(): ConnectionState
  getQr(): string | null

  // Group operations
  createGroup(subject: string, participants: string[]): Promise<GroupInfo>
  leaveGroup(jid: string): Promise<void>
  updateGroupSubject(jid: string, subject: string): Promise<void>
  updateGroupDescription(jid: string, description: string): Promise<void>
  addParticipants(jid: string, participants: string[]): Promise<void>
  removeParticipants(jid: string, participants: string[]): Promise<void>
  promoteParticipants(jid: string, participants: string[]): Promise<void>
  demoteParticipants(jid: string, participants: string[]): Promise<void>
  getGroupInviteCode(jid: string): Promise<string>
  revokeGroupInviteCode(jid: string): Promise<string>
  joinGroupByInviteCode(code: string): Promise<GroupInfo>
  getGroupInfoByInviteCode(code: string): Promise<GroupInfo | null>
  updateGroupSettings(
    jid: string,
    setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked'
  ): Promise<void>
  getAllGroups(): Promise<GroupInfo[]>

  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void
}

// ── WhatsApp Service Interface ──
// Routes depend on this, never on Baileys directly.

export interface IWhatsAppService {
  connect(sessionId: string): Promise<SessionInfo>
  disconnect(sessionId: string): Promise<void>
  getStatus(sessionId: string): SessionInfo
  sendMessage(
    sessionId: string,
    jid: string,
    content: object
  ): Promise<SendMessageResult>
  getContact(sessionId: string, jid: string): Promise<ContactInfo | null>
  getGroup(sessionId: string, jid: string): Promise<GroupInfo | null>
  getMessage(sessionId: string, jid: string, msgId: string): object | undefined

  // Group operations
  createGroup(sessionId: string, subject: string, participants: string[]): Promise<GroupInfo>
  leaveGroup(sessionId: string, jid: string): Promise<void>
  updateGroupSubject(sessionId: string, jid: string, subject: string): Promise<void>
  updateGroupDescription(sessionId: string, jid: string, description: string): Promise<void>
  addParticipants(sessionId: string, jid: string, participants: string[]): Promise<void>
  removeParticipants(sessionId: string, jid: string, participants: string[]): Promise<void>
  promoteParticipants(sessionId: string, jid: string, participants: string[]): Promise<void>
  demoteParticipants(sessionId: string, jid: string, participants: string[]): Promise<void>
  getGroupInviteCode(sessionId: string, jid: string): Promise<string>
  revokeGroupInviteCode(sessionId: string, jid: string): Promise<string>
  joinGroupByInviteCode(sessionId: string, code: string): Promise<GroupInfo>
  getGroupInfoByInviteCode(sessionId: string, code: string): Promise<GroupInfo | null>
  updateGroupSettings(
    sessionId: string,
    jid: string,
    setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked'
  ): Promise<void>
  getAllGroups(sessionId: string): Promise<GroupInfo[]>
}
