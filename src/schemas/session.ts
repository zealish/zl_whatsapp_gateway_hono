import { z } from 'zod'
import { sessionIdSchema } from './common.js'

export const createSessionSchema = z.object({
  id: sessionIdSchema.optional().describe('Custom session ID (auto-generated if omitted)'),
})

export const sessionIdParamSchema = z.object({
  id: sessionIdSchema,
})

export type CreateSessionBody = z.infer<typeof createSessionSchema>
