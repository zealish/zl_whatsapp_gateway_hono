import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import QRCode from 'qrcode'
import { createSessionSchema } from '../schemas/session.js'
import { sessionIdSchema } from '../schemas/common.js'
import { successResponse } from '../lib/response.js'
import { ValidationError } from '../lib/errors.js'
import type { SessionManager } from '../services/session-manager.js'
import type { IWhatsAppService } from '../types/whatsapp.js'

export function createSessionRoutes(
  sessionManager: SessionManager,
  whatsappService: IWhatsAppService
): Hono {
  const routes = new Hono()

  // POST /session — Create a new session
  routes.post('/', zValidator('json', createSessionSchema), async (c) => {
    const body = c.req.valid('json')
    const info = sessionManager.createSession(body.id)
    return c.json(successResponse(info), 201)
  })

  // GET /session — List all sessions
  routes.get('/', (c) => {
    const sessions = sessionManager.listSessions()
    return c.json(successResponse(sessions))
  })

  // POST /session/:id/connect — Start WA connection (QR flow)
  routes.post('/:id/connect', async (c) => {
    const id = c.req.param('id')
    validateSessionId(id)
    const info = await whatsappService.connect(id)
    return c.json(successResponse(info))
  })

  // GET /session/:id/status — Get session status
  routes.get('/:id/status', (c) => {
    const id = c.req.param('id')
    validateSessionId(id)
    const info = whatsappService.getStatus(id)
    return c.json(successResponse(info))
  })

  // GET /session/:id/qr — Get QR code
  routes.get('/:id/qr', async (c) => {
    const id = c.req.param('id')
    validateSessionId(id)
    const format = c.req.query('format') ?? 'png'

    const session = sessionManager.getSessionOrThrow(id)
    const qr = session.connectionManager.getQr()

    if (!qr) {
      return c.json(
        {
          success: false,
          error: {
            code: 'QR_NOT_AVAILABLE',
            message: 'No QR code available. Call POST /session/:id/connect first.',
          },
        },
        404
      )
    }

    if (format === 'base64') {
      const qrBase64 = await QRCode.toDataURL(qr)
      return c.json(successResponse({ qr: qrBase64 }))
    }

    // Default: PNG image
    const qrBuffer = await QRCode.toBuffer(qr, { type: 'png', width: 400 })
    return new Response(new Uint8Array(qrBuffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache',
      },
    })
  })

  // DELETE /session/:id — Destroy session
  routes.delete('/:id', async (c) => {
    const id = c.req.param('id')
    validateSessionId(id)
    await sessionManager.destroySession(id)
    return c.json(successResponse({ deleted: true }))
  })

  return routes
}

function validateSessionId(id: string): void {
  const result = sessionIdSchema.safeParse(id)
  if (!result.success) {
    throw new ValidationError('Invalid session ID', result.error.format())
  }
}
