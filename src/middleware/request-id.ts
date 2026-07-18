import { createMiddleware } from 'hono/factory'
import { randomUUID } from 'node:crypto'
import type { AppVariables } from '../types/context.js'

export function requestIdMiddleware() {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const requestId = c.req.header('X-Request-Id') ?? randomUUID()
    c.set('requestId', requestId)
    c.header('X-Request-Id', requestId)
    await next()
  })
}
