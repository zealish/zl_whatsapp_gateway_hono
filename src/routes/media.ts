import { Hono } from 'hono'
import { AppError } from '../lib/errors.js'
import type { IWhatsAppService } from '../types/whatsapp.js'

/**
 * Media download routes.
 * GET /session/:id/messages/:messageId/media — download media binary
 */
export function createMediaRoutes(whatsappService: IWhatsAppService): Hono {
  const routes = new Hono()

  // ── GET /session/:id/messages/:messageId/media — Download media ──
  routes.get('/:id/messages/:messageId/media', async (c) => {
    const sessionId = c.req.param('id')
    const messageId = c.req.param('messageId')

    if (!messageId) {
      throw new AppError('messageId is required', 400, 'VALIDATION_ERROR')
    }

    const { buffer, mimetype, fileName } = await whatsappService.downloadMediaByMessageId(
      sessionId,
      messageId,
    )

    const contentType = mimetype ?? 'application/octet-stream'
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
    }

    if (fileName) {
      headers['Content-Disposition'] = `inline; filename="${fileName}"`
    }

    return c.body(new Uint8Array(buffer), 200, headers)
  })

  return routes
}
