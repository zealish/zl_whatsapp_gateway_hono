import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  createGroupSchema,
  updateGroupSubjectSchema,
  updateGroupDescriptionSchema,
  groupParticipantsSchema,
  updateGroupSettingsSchema,
} from '../schemas/group.js'
import { successResponse } from '../lib/response.js'
import { NotFoundError } from '../lib/errors.js'
import type { IWhatsAppService } from '../types/whatsapp.js'

/**
 * Group management routes.
 *
 * Static routes are registered BEFORE param routes to avoid shadowing.
 *
 * GET    /session/:id/group                        — list all groups
 * POST   /session/:id/group                        — create group
 * POST   /session/:id/group-invite/:code/join      — join via invite code
 * GET    /session/:id/group-invite/:code            — preview group by invite code
 * GET    /session/:id/group/:jid                    — get metadata
 * PATCH  /session/:id/group/:jid/subject            — update subject
 * PATCH  /session/:id/group/:jid/description        — update description
 * POST   /session/:id/group/:jid/participants/add    — add members
 * POST   /session/:id/group/:jid/participants/remove — remove members
 * POST   /session/:id/group/:jid/participants/promote — promote to admin
 * POST   /session/:id/group/:jid/participants/demote  — demote from admin
 * POST   /session/:id/group/:jid/leave              — leave group
 * GET    /session/:id/group/:jid/invite              — get invite code
 * POST   /session/:id/group/:jid/invite/revoke       — revoke invite code
 * PATCH  /session/:id/group/:jid/settings            — update settings
 */
export function createGroupRoutes(whatsappService: IWhatsAppService): Hono {
  const routes = new Hono()

  // ── GET /session/:id/group — List all groups ──
  routes.get('/:id/group', async (c) => {
    const sessionId = c.req.param('id')
    const groups = await whatsappService.getAllGroups(sessionId)
    return c.json(successResponse(groups))
  })

  // ── POST /session/:id/group — Create group ──
  routes.post('/:id/group', zValidator('json', createGroupSchema), async (c) => {
    const sessionId = c.req.param('id')
    const { subject, participants } = c.req.valid('json')
    const group = await whatsappService.createGroup(sessionId, subject, participants)
    return c.json(successResponse(group), 201)
  })

  // ── POST /session/:id/group-invite/:code/join — Join via invite code ──
  // Static path segment "group-invite" avoids conflict with /:id/group/:jid
  routes.post('/:id/group-invite/:code/join', async (c) => {
    const sessionId = c.req.param('id')
    const code = c.req.param('code')
    const group = await whatsappService.joinGroupByInviteCode(sessionId, code)
    return c.json(successResponse(group))
  })

  // ── GET /session/:id/group-invite/:code — Preview group by invite code ──
  routes.get('/:id/group-invite/:code', async (c) => {
    const sessionId = c.req.param('id')
    const code = c.req.param('code')
    const group = await whatsappService.getGroupInfoByInviteCode(sessionId, code)
    if (!group) {
      throw new NotFoundError('Group invite', code)
    }
    return c.json(successResponse(group))
  })

  // ── GET /session/:id/group/:jid — Get group metadata ──
  routes.get('/:id/group/:jid', async (c) => {
    const sessionId = c.req.param('id')
    const jid = c.req.param('jid')
    const group = await whatsappService.getGroup(sessionId, jid)
    if (!group) {
      throw new NotFoundError('Group', jid)
    }
    return c.json(successResponse(group))
  })

  // ── PATCH /session/:id/group/:jid/subject — Update group name ──
  routes.patch('/:id/group/:jid/subject', zValidator('json', updateGroupSubjectSchema), async (c) => {
    const sessionId = c.req.param('id')
    const jid = c.req.param('jid')
    const { subject } = c.req.valid('json')
    await whatsappService.updateGroupSubject(sessionId, jid, subject)
    return c.json(successResponse({ updated: true }))
  })

  // ── PATCH /session/:id/group/:jid/description — Update group description ──
  routes.patch('/:id/group/:jid/description', zValidator('json', updateGroupDescriptionSchema), async (c) => {
    const sessionId = c.req.param('id')
    const jid = c.req.param('jid')
    const { description } = c.req.valid('json')
    await whatsappService.updateGroupDescription(sessionId, jid, description)
    return c.json(successResponse({ updated: true }))
  })

  // ── POST /session/:id/group/:jid/participants/add — Add members ──
  routes.post('/:id/group/:jid/participants/add', zValidator('json', groupParticipantsSchema), async (c) => {
    const sessionId = c.req.param('id')
    const jid = c.req.param('jid')
    const { participants } = c.req.valid('json')
    await whatsappService.addParticipants(sessionId, jid, participants)
    return c.json(successResponse({ updated: true }))
  })

  // ── POST /session/:id/group/:jid/participants/remove — Remove members ──
  routes.post('/:id/group/:jid/participants/remove', zValidator('json', groupParticipantsSchema), async (c) => {
    const sessionId = c.req.param('id')
    const jid = c.req.param('jid')
    const { participants } = c.req.valid('json')
    await whatsappService.removeParticipants(sessionId, jid, participants)
    return c.json(successResponse({ updated: true }))
  })

  // ── POST /session/:id/group/:jid/participants/promote — Promote to admin ──
  routes.post('/:id/group/:jid/participants/promote', zValidator('json', groupParticipantsSchema), async (c) => {
    const sessionId = c.req.param('id')
    const jid = c.req.param('jid')
    const { participants } = c.req.valid('json')
    await whatsappService.promoteParticipants(sessionId, jid, participants)
    return c.json(successResponse({ updated: true }))
  })

  // ── POST /session/:id/group/:jid/participants/demote — Demote from admin ──
  routes.post('/:id/group/:jid/participants/demote', zValidator('json', groupParticipantsSchema), async (c) => {
    const sessionId = c.req.param('id')
    const jid = c.req.param('jid')
    const { participants } = c.req.valid('json')
    await whatsappService.demoteParticipants(sessionId, jid, participants)
    return c.json(successResponse({ updated: true }))
  })

  // ── POST /session/:id/group/:jid/leave — Leave group ──
  routes.post('/:id/group/:jid/leave', async (c) => {
    const sessionId = c.req.param('id')
    const jid = c.req.param('jid')
    await whatsappService.leaveGroup(sessionId, jid)
    return c.json(successResponse({ left: true }))
  })

  // ── GET /session/:id/group/:jid/invite — Get invite code ──
  routes.get('/:id/group/:jid/invite', async (c) => {
    const sessionId = c.req.param('id')
    const jid = c.req.param('jid')
    const code = await whatsappService.getGroupInviteCode(sessionId, jid)
    return c.json(successResponse({ code, inviteUrl: `https://chat.whatsapp.com/${code}` }))
  })

  // ── POST /session/:id/group/:jid/invite/revoke — Revoke invite code ──
  routes.post('/:id/group/:jid/invite/revoke', async (c) => {
    const sessionId = c.req.param('id')
    const jid = c.req.param('jid')
    const code = await whatsappService.revokeGroupInviteCode(sessionId, jid)
    return c.json(successResponse({ code, inviteUrl: `https://chat.whatsapp.com/${code}` }))
  })

  // ── PATCH /session/:id/group/:jid/settings — Update group settings ──
  routes.patch('/:id/group/:jid/settings', zValidator('json', updateGroupSettingsSchema), async (c) => {
    const sessionId = c.req.param('id')
    const jid = c.req.param('jid')
    const { setting } = c.req.valid('json')
    await whatsappService.updateGroupSettings(sessionId, jid, setting)
    return c.json(successResponse({ updated: true }))
  })

  return routes
}
