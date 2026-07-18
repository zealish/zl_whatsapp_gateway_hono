import { createMiddleware } from 'hono/factory'
import { UnauthorizedError } from '../lib/errors.js'
import type { AppVariables } from '../types/context.js'

export function apiKeyMiddleware(validApiKey: string) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const apiKey = c.req.header('X-API-Key')

    if (!apiKey) {
      throw new UnauthorizedError('Missing X-API-Key header')
    }

    if (apiKey !== validApiKey) {
      throw new UnauthorizedError('Invalid API key')
    }

    await next()
  })
}
