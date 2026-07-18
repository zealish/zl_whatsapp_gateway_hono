import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  sendSchema,
  editMessageSchema,
  deleteMessageSchema,
} from '../schemas/message.js'
import { successResponse } from '../lib/response.js'
import { resolveMedia } from '../lib/media.js'
import { AppError } from '../lib/errors.js'
import type { IWhatsAppService } from '../types/whatsapp.js'

/**
 * Message routes.
 * POST   /session/:id/send     — generic send (text, image, video, audio, etc.)
 * PATCH  /session/:id/message  — edit a sent message
 * DELETE /session/:id/message  — delete a sent message
 */
export function createMessageRoutes(whatsappService: IWhatsAppService): Hono {
  const routes = new Hono()

  // ── POST /session/:id/send — Generic send ──
  routes.post('/:id/send', zValidator('json', sendSchema), async (c) => {
    const sessionId = c.req.param('id')
    const body = c.req.valid('json')
    const content = await buildMessageContent(body, whatsappService, sessionId)
    const result = await whatsappService.sendMessage(sessionId, body.to, content)
    return c.json(successResponse(result), 201)
  })

  // ── PATCH /session/:id/message — Edit message ──
  routes.patch('/:id/message', zValidator('json', editMessageSchema), async (c) => {
    const sessionId = c.req.param('id')
    const { to, messageId, text } = c.req.valid('json')
    const result = await whatsappService.sendMessage(sessionId, to, {
      edit: { remoteJid: to, id: messageId, fromMe: true },
      text,
    })
    return c.json(successResponse(result))
  })

  // ── DELETE /session/:id/message — Delete message ──
  routes.delete('/:id/message', zValidator('json', deleteMessageSchema), async (c) => {
    const sessionId = c.req.param('id')
    const { to, messageId } = c.req.valid('json')
    const result = await whatsappService.sendMessage(sessionId, to, {
      delete: { remoteJid: to, id: messageId, fromMe: true },
    })
    return c.json(successResponse(result))
  })

  return routes
}

// ── Content builder: transforms validated body → Baileys content object ──

async function buildMessageContent(
  body: Record<string, unknown>,
  whatsappService?: IWhatsAppService,
  sessionId?: string
): Promise<object> {
  switch (body.type) {
    case 'text': {
      const content: Record<string, unknown> = { text: body.text as string }
      if (Array.isArray(body.mentions) && body.mentions.length > 0) {
        content.mentions = body.mentions as string[]
      }
      if (typeof body.quotedMessageId === 'string') {
        // Quoting requires the full message object from the store.
        // The route handler passes this through; the adapter's sendMessage
        // supports the `quoted` option if provided.
        // For now, we rely on the webhook event data containing message keys.
      }
      return content
    }

    case 'image': {
      const media = await resolveMedia({ url: body.url as string, base64: body.base64 as string })
      return {
        image: media,
        caption: body.caption as string | undefined,
        mimetype: (body.mimetype as string) || 'image/jpeg',
      }
    }

    case 'video': {
      const media = await resolveMedia({ url: body.url as string, base64: body.base64 as string })
      const content: Record<string, unknown> = {
        video: media,
        mimetype: (body.mimetype as string) || 'video/mp4',
      }
      if (body.caption) content.caption = body.caption
      if (body.gifPlayback) content.gifPlayback = true
      return content
    }

    case 'audio': {
      const media = await resolveMedia({ url: body.url as string, base64: body.base64 as string })
      return {
        audio: media,
        mimetype: (body.mimetype as string) || 'audio/mpeg',
        ptt: !!body.ptt,
      }
    }

    case 'sticker': {
      const media = await resolveMedia({ url: body.url as string, base64: body.base64 as string })
      return { sticker: media }
    }

    case 'document': {
      const media = await resolveMedia({ url: body.url as string, base64: body.base64 as string })
      const content: Record<string, unknown> = {
        document: media,
        fileName: (body.filename as string) || 'file',
        mimetype: (body.mimetype as string) || 'application/pdf',
      }
      if (body.caption) content.caption = body.caption
      return content
    }

    case 'location': {
      return {
        location: {
          degreesLatitude: body.latitude,
          degreesLongitude: body.longitude,
          live: !!body.live,
        },
      }
    }

    case 'contact': {
      const name = body.contactName as string
      const number = (body.contactNumber as string).replace(/[^0-9+]/g, '')
      const vcard =
        'BEGIN:VCARD\n' +
        'VERSION:3.0\n' +
        `FN:${name}\n` +
        `TEL;type=CELL;waid=${number}:+${number}\n` +
        'END:VCARD'
      return {
        contacts: {
          displayName: name,
          contacts: [{ vcard }],
        },
      }
    }

    case 'reaction': {
      return {
        react: {
          text: body.emoji as string,
          key: {
            remoteJid: body.to as string,
            id: body.messageId as string,
          },
        },
      }
    }

    case 'poll': {
      return {
        poll: {
          name: body.name as string,
          values: body.options as string[],
          selectableCount: (body.selectableCount as number) || 1,
        },
      }
    }

    case 'forward': {
      if (!whatsappService || !sessionId) {
        throw new AppError('Forward requires active session context', 500, 'INTERNAL_ERROR')
      }
      const msg = whatsappService.getMessage(
        sessionId,
        body.fromJid as string,
        body.messageId as string
      )
      if (!msg) {
        throw new AppError(
          'Original message not found in store. Only recently received/sent messages can be forwarded.',
          404,
          'MESSAGE_NOT_FOUND'
        )
      }
      return { forward: msg, force: true }
    }

    // ── Interactive Messages (disabled — Baileys v7 doesn't support sending) ──

    case 'buttons':
    case 'list':
    case 'cta_url':
      throw new AppError(
        `Message type "${body.type}" is not yet supported. ` +
          'Baileys v7 does not support sending interactive messages (buttons, list, cta_url). ' +
          'Track progress: https://github.com/WhiskeySockets/Baileys',
        501,
        'NOT_IMPLEMENTED'
      )

    default:
      throw new AppError(`Unsupported message type: ${body.type}`, 400, 'INVALID_MESSAGE_TYPE')
  }
}
