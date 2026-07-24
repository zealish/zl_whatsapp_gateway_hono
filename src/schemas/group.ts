import { z } from 'zod'
import { phoneNumberSchema } from './common.js'

export const createGroupSchema = z.object({
  subject: z.string().min(1).max(256).describe('Group name'),
  participants: z.array(phoneNumberSchema).min(1).max(1024).describe('Participant phone numbers (e.g. ["6281234567890"])'),
})

export const updateGroupSubjectSchema = z.object({
  subject: z.string().min(1).max(256).describe('New group name'),
})

export const updateGroupDescriptionSchema = z.object({
  description: z.string().max(2048).describe('New group description'),
})

export const groupParticipantsSchema = z.object({
  participants: z.array(phoneNumberSchema).min(1).max(128).describe('Participant phone numbers (e.g. ["6281234567890"])'),
})

export const updateGroupSettingsSchema = z.object({
  setting: z
    .enum(['announcement', 'not_announcement', 'locked', 'unlocked'])
    .describe(
      'announcement: only admins send; not_announcement: everyone sends; ' +
        'locked: only admins edit info; unlocked: everyone edits info'
    ),
})

// ── Type exports ──

export type CreateGroupBody = z.infer<typeof createGroupSchema>
export type UpdateGroupSubjectBody = z.infer<typeof updateGroupSubjectSchema>
export type UpdateGroupDescriptionBody = z.infer<typeof updateGroupDescriptionSchema>
export type GroupParticipantsBody = z.infer<typeof groupParticipantsSchema>
export type UpdateGroupSettingsBody = z.infer<typeof updateGroupSettingsSchema>
