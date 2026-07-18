import type { Context } from 'hono'
import type pino from 'pino'

export interface AppVariables {
  logger: pino.Logger
  requestId: string
}

export type AppContext = Context<{
  Variables: AppVariables
}>
