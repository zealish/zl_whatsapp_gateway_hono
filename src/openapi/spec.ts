/**
 * OpenAPI 3.1 spec for WhatsApp API Gateway.
 * Hand-written from the same Zod schemas used for validation.
 */

interface OpenApiSpecOptions {
  BASE_URL: string
}

export function createOpenApiSpec(config: OpenApiSpecOptions) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'WhatsApp API Gateway',
      version: '3.0.0',
      description:
        'REST API gateway for WhatsApp Web powered by Baileys and Hono. ' +
        'Manage sessions, send/receive messages, manage groups, configure webhooks.\n\n' +
        '**New in v3:** Initial history synchronization (contacts, chats, messages) via webhooks. ' +
        'Persistent SQLite-backed event queue with automatic retries and dead letter queue. ' +
        'Per-instance ordered delivery with idempotent event IDs.',
      contact: { name: 'API Support' },
      license: { name: 'MIT' },
    },
    servers: [
      { url: config.BASE_URL, description: 'Current server' },
    ],
  tags: [
    { name: 'Health', description: 'Health check' },
    { name: 'Session', description: 'WhatsApp session management' },
    { name: 'Message', description: 'Send, edit, and delete messages' },
    { name: 'Contact', description: 'Contact information' },
    { name: 'Group', description: 'Group management' },
    { name: 'Webhook', description: 'Webhook configuration' },
    { name: 'DLQ', description: 'Dead letter queue — inspect and replay failed webhook deliveries' },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey' as const,
        in: 'header' as const,
        name: 'X-API-Key',
        description: 'API key for authentication',
      },
    },
    schemas: {
      // ── Common ──
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', enum: [false] },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'NOT_FOUND' },
              message: { type: 'string', example: 'Resource not found' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['success', 'error'],
      },

      // ── Session ──
      SessionInfo: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'my-session' },
          state: { type: 'string', enum: ['connecting', 'open', 'close'], example: 'open' },
          pushName: { type: 'string', example: 'John Doe' },
          qr: { type: 'string', nullable: true, description: 'QR code string if connecting' },
        },
        required: ['id', 'state'],
      },
      CreateSessionRequest: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Custom session ID (auto-generated if omitted)', example: 'my-session', pattern: '^[a-zA-Z0-9_-]+$', maxLength: 64 },
        },
      },

      // ── Message ──
      SendMessageResult: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '3EB0C4A2B1F4' },
          timestamp: { type: 'number', example: 1719000000000 },
          status: { type: 'string', enum: ['sent', 'queued', 'failed'] },
        },
        required: ['id', 'timestamp', 'status'],
      },
      SendRequest: {
        oneOf: [
          { $ref: '#/components/schemas/SendTextRequest' },
          { $ref: '#/components/schemas/SendImageRequest' },
          { $ref: '#/components/schemas/SendVideoRequest' },
          { $ref: '#/components/schemas/SendAudioRequest' },
          { $ref: '#/components/schemas/SendStickerRequest' },
          { $ref: '#/components/schemas/SendDocumentRequest' },
          { $ref: '#/components/schemas/SendLocationRequest' },
          { $ref: '#/components/schemas/SendContactRequest' },
          { $ref: '#/components/schemas/SendReactionRequest' },
          { $ref: '#/components/schemas/SendPollRequest' },
          { $ref: '#/components/schemas/SendForwardRequest' },
          { $ref: '#/components/schemas/SendButtonsRequest' },
          { $ref: '#/components/schemas/SendListRequest' },
          { $ref: '#/components/schemas/SendCtaUrlRequest' },
        ],
        discriminator: {
          propertyName: 'type',
          mapping: {
            text: '#/components/schemas/SendTextRequest',
            image: '#/components/schemas/SendImageRequest',
            video: '#/components/schemas/SendVideoRequest',
            audio: '#/components/schemas/SendAudioRequest',
            sticker: '#/components/schemas/SendStickerRequest',
            document: '#/components/schemas/SendDocumentRequest',
            location: '#/components/schemas/SendLocationRequest',
            contact: '#/components/schemas/SendContactRequest',
            reaction: '#/components/schemas/SendReactionRequest',
            poll: '#/components/schemas/SendPollRequest',
            forward: '#/components/schemas/SendForwardRequest',
            buttons: '#/components/schemas/SendButtonsRequest',
            list: '#/components/schemas/SendListRequest',
            cta_url: '#/components/schemas/SendCtaUrlRequest',
          },
        },
      },
      SendTextRequest: {
        type: 'object',
        description: 'Send a plain text message with optional mentions and quote',
        properties: {
          type: { type: 'string', enum: ['text'], example: 'text' },
          to: { type: 'string', example: '6281234567890@s.whatsapp.net', description: 'Recipient JID' },
          text: { type: 'string', example: 'Hello! How are you doing today? 👋', description: 'Message text (max 65536 chars)' },
          quotedMessageId: { type: 'string', example: '3EB0C4A2B1F4E6D8', description: 'ID of message to quote (optional)' },
          mentions: {
            type: 'array',
            items: { type: 'string' },
            example: ['6289876543210@s.whatsapp.net'],
            description: 'JIDs to @mention in the message (optional)',
          },
        },
        required: ['type', 'to', 'text'],
      },
      SendImageRequest: {
        type: 'object',
        description: 'Send an image with optional caption',
        properties: {
          type: { type: 'string', enum: ['image'], example: 'image' },
          to: { type: 'string', example: '6281234567890@s.whatsapp.net' },
          url: { type: 'string', format: 'uri', example: 'https://example.com/photo.jpg', description: 'Image URL (use url OR base64)' },
          base64: { type: 'string', description: 'Base64-encoded image data (use url OR base64)' },
          caption: { type: 'string', example: 'Check out this beautiful sunset! 🌅', description: 'Image caption (max 1024 chars)' },
          mimetype: { type: 'string', example: 'image/jpeg', default: 'image/jpeg', description: 'MIME type' },
        },
        required: ['type', 'to'],
      },
      SendVideoRequest: {
        type: 'object',
        description: 'Send a video, optionally as GIF',
        properties: {
          type: { type: 'string', enum: ['video'], example: 'video' },
          to: { type: 'string', example: '6281234567890@s.whatsapp.net' },
          url: { type: 'string', format: 'uri', example: 'https://example.com/clip.mp4', description: 'Video URL (use url OR base64)' },
          base64: { type: 'string', description: 'Base64-encoded video data' },
          caption: { type: 'string', example: 'Watch this! 😂', description: 'Video caption' },
          mimetype: { type: 'string', example: 'video/mp4', default: 'video/mp4' },
          gifPlayback: { type: 'boolean', example: false, description: 'Send as GIF (no audio, auto-loop)' },
        },
        required: ['type', 'to'],
      },
      SendAudioRequest: {
        type: 'object',
        description: 'Send audio or a voice note',
        properties: {
          type: { type: 'string', enum: ['audio'], example: 'audio' },
          to: { type: 'string', example: '6281234567890@s.whatsapp.net' },
          url: { type: 'string', format: 'uri', example: 'https://example.com/song.mp3', description: 'Audio URL (use url OR base64)' },
          base64: { type: 'string', description: 'Base64-encoded audio data' },
          mimetype: { type: 'string', example: 'audio/mpeg', default: 'audio/mpeg' },
          ptt: { type: 'boolean', example: true, default: false, description: 'Push-to-talk: send as voice note (plays in chat bubble)' },
        },
        required: ['type', 'to'],
      },
      SendStickerRequest: {
        type: 'object',
        description: 'Send a sticker (WebP image)',
        properties: {
          type: { type: 'string', enum: ['sticker'], example: 'sticker' },
          to: { type: 'string', example: '6281234567890@s.whatsapp.net' },
          url: { type: 'string', format: 'uri', example: 'https://example.com/sticker.webp', description: 'Sticker URL (use url OR base64)' },
          base64: { type: 'string', description: 'Base64-encoded WebP data' },
          mimetype: { type: 'string', example: 'image/webp', default: 'image/webp' },
        },
        required: ['type', 'to'],
      },
      SendDocumentRequest: {
        type: 'object',
        description: 'Send a document/file attachment',
        properties: {
          type: { type: 'string', enum: ['document'], example: 'document' },
          to: { type: 'string', example: '6281234567890@s.whatsapp.net' },
          url: { type: 'string', format: 'uri', example: 'https://example.com/report.pdf', description: 'Document URL (use url OR base64)' },
          base64: { type: 'string', description: 'Base64-encoded document data' },
          filename: { type: 'string', example: 'Q4-Report-2025.pdf', description: 'Display filename' },
          mimetype: { type: 'string', example: 'application/pdf', default: 'application/pdf' },
          caption: { type: 'string', example: 'Here is the Q4 financial report', description: 'Document caption (max 1024 chars)' },
        },
        required: ['type', 'to'],
      },
      SendLocationRequest: {
        type: 'object',
        description: 'Send a location pin or live location',
        properties: {
          type: { type: 'string', enum: ['location'], example: 'location' },
          to: { type: 'string', example: '6281234567890@s.whatsapp.net' },
          latitude: { type: 'number', example: -6.2088, description: 'Latitude (-90 to 90)' },
          longitude: { type: 'number', example: 106.8456, description: 'Longitude (-180 to 180)' },
          live: { type: 'boolean', example: false, description: 'Send as live location (shares real-time position)' },
        },
        required: ['type', 'to', 'latitude', 'longitude'],
      },
      SendContactRequest: {
        type: 'object',
        description: 'Send a contact card (vCard)',
        properties: {
          type: { type: 'string', enum: ['contact'], example: 'contact' },
          to: { type: 'string', example: '6281234567890@s.whatsapp.net' },
          contactName: { type: 'string', example: 'John Doe', description: 'Contact display name' },
          contactNumber: { type: 'string', example: '+6289876543210', description: 'Contact phone number (with country code)' },
        },
        required: ['type', 'to', 'contactName', 'contactNumber'],
      },
      SendReactionRequest: {
        type: 'object',
        description: 'React to a message with an emoji (send empty emoji to remove)',
        properties: {
          type: { type: 'string', enum: ['reaction'], example: 'reaction' },
          to: { type: 'string', example: '6281234567890@s.whatsapp.net', description: 'Chat JID containing the message' },
          emoji: { type: 'string', example: '👍', description: 'Emoji to react with (empty string to remove reaction)' },
          messageId: { type: 'string', example: '3EB0C4A2B1F4E6D8', description: 'ID of the message to react to' },
        },
        required: ['type', 'to', 'emoji', 'messageId'],
      },
      SendPollRequest: {
        type: 'object',
        description: 'Send a poll with multiple options',
        properties: {
          type: { type: 'string', enum: ['poll'], example: 'poll' },
          to: { type: 'string', example: '120363012345678901@g.us', description: 'Recipient JID (works in groups and private chats)' },
          name: { type: 'string', example: 'What should we order for lunch? 🍕', description: 'Poll question' },
          options: {
            type: 'array',
            items: { type: 'string' },
            example: ['Pizza 🍕', 'Sushi 🍣', 'Burger 🍔', 'Salad 🥗'],
            description: 'Poll options (min 2, max 12)',
          },
          selectableCount: { type: 'number', example: 1, default: 1, description: 'How many options a voter can select' },
        },
        required: ['type', 'to', 'name', 'options'],
      },
      SendForwardRequest: {
        type: 'object',
        description: 'Forward an existing message to another chat (message must be in the recent store)',
        properties: {
          type: { type: 'string', enum: ['forward'], example: 'forward' },
          to: { type: 'string', example: '6289876543210@s.whatsapp.net', description: 'Recipient to forward to' },
          fromJid: { type: 'string', example: '6281234567890@s.whatsapp.net', description: 'Chat JID where the original message exists' },
          messageId: { type: 'string', example: '3EB0C4A2B1F4E6D8', description: 'ID of the message to forward' },
        },
        required: ['type', 'to', 'fromJid', 'messageId'],
      },
      SendButtonsRequest: {
        type: 'object',
        description:
          '⚠️ NOT YET SUPPORTED — Baileys v7 does not support sending interactive messages. ' +
          'Returns 501 NOT_IMPLEMENTED. Track: https://github.com/WhiskeySockets/Baileys',
        properties: {
          type: { type: 'string', enum: ['buttons'], example: 'buttons' },
          to: { type: 'string', example: '6281234567890@s.whatsapp.net', description: 'Recipient JID' },
          body: { type: 'string', example: 'Apakah Anda ingin melanjutkan?', description: 'Message body text (max 1024 chars)' },
          footer: { type: 'string', example: 'Pilih salah satu', description: 'Footer text (optional, max 64 chars)' },
          header: { type: 'string', example: 'Konfirmasi', description: 'Header title (optional, max 64 chars)' },
          buttons: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'btn_yes', description: 'Button ID returned on click' },
                displayText: { type: 'string', example: 'Ya', description: 'Button display text' },
              },
              required: ['id', 'displayText'],
            },
            minItems: 1,
            maxItems: 3,
            example: [
              { id: 'btn_yes', displayText: 'Ya' },
              { id: 'btn_no', displayText: 'Tidak' },
            ],
            description: 'Quick reply buttons (1-3)',
          },
        },
        required: ['type', 'to', 'body', 'buttons'],
      },
      SendListRequest: {
        type: 'object',
        description:
          '⚠️ NOT YET SUPPORTED — Baileys v7 does not support sending interactive messages. ' +
          'Returns 501 NOT_IMPLEMENTED. Track: https://github.com/WhiskeySockets/Baileys',
        properties: {
          type: { type: 'string', enum: ['list'], example: 'list' },
          to: { type: 'string', example: '6281234567890@s.whatsapp.net', description: 'Recipient JID' },
          title: { type: 'string', example: 'Menu Restoran', description: 'List message title (max 256 chars)' },
          body: { type: 'string', example: 'Silakan pilih menu favorit Anda', description: 'List body text (optional, max 1024 chars)' },
          footer: { type: 'string', example: 'Buka setiap hari 08:00-22:00', description: 'Footer text (optional, max 64 chars)' },
          buttonText: { type: 'string', example: 'Lihat Menu', description: 'Button text that opens the list (max 20 chars)' },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', example: 'Makanan', description: 'Section title' },
                rows: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', example: 'food_nasi', description: 'Row ID returned on selection' },
                      title: { type: 'string', example: 'Nasi Goreng', description: 'Row title' },
                      description: { type: 'string', example: 'Nasi goreng spesial', description: 'Row description (optional, max 72 chars)' },
                    },
                    required: ['id', 'title'],
                  },
                  minItems: 1,
                  description: 'Rows in this section',
                },
              },
              required: ['title', 'rows'],
            },
            minItems: 1,
            example: [
              {
                title: 'Makanan',
                rows: [
                  { id: 'food_nasi', title: 'Nasi Goreng', description: 'Nasi goreng spesial' },
                  { id: 'food_mie', title: 'Mie Ayam', description: 'Mie ayam bakso' },
                ],
              },
              {
                title: 'Minuman',
                rows: [{ id: 'drink_es', title: 'Es Teh', description: 'Teh manis dingin' }],
              },
            ],
            description: 'List sections (min 1)',
          },
        },
        required: ['type', 'to', 'title', 'buttonText', 'sections'],
      },
      SendCtaUrlRequest: {
        type: 'object',
        description:
          '⚠️ NOT YET SUPPORTED — Baileys v7 does not support sending interactive messages. ' +
          'Returns 501 NOT_IMPLEMENTED. Track: https://github.com/WhiskeySockets/Baileys',
        properties: {
          type: { type: 'string', enum: ['cta_url'], example: 'cta_url' },
          to: { type: 'string', example: '6281234567890@s.whatsapp.net', description: 'Recipient JID' },
          body: { type: 'string', example: 'Kunjungi website kami untuk info lebih lanjut.', description: 'Message body text (max 1024 chars)' },
          footer: { type: 'string', example: 'www.example.com', description: 'Footer text (optional, max 64 chars)' },
          header: { type: 'string', example: 'Info Produk', description: 'Header title (optional, max 64 chars)' },
          buttons: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                displayText: { type: 'string', example: 'Kunjungi Website', description: 'Button display text' },
                url: { type: 'string', format: 'uri', example: 'https://example.com', description: 'URL to open on click' },
              },
              required: ['displayText', 'url'],
            },
            minItems: 1,
            maxItems: 1,
            example: [{ displayText: 'Kunjungi Website', url: 'https://example.com' }],
            description: 'CTA URL button (exactly 1)',
          },
        },
        required: ['type', 'to', 'body', 'buttons'],
      },
      EditMessageRequest: {
        type: 'object',
        properties: {
          to: { type: 'string', example: '12345678901@s.whatsapp.net' },
          messageId: { type: 'string', example: '3EB0C4A2B1F4' },
          text: { type: 'string', example: 'Updated text' },
        },
        required: ['to', 'messageId', 'text'],
      },
      DeleteMessageRequest: {
        type: 'object',
        properties: {
          to: { type: 'string', example: '12345678901@s.whatsapp.net' },
          messageId: { type: 'string', example: '3EB0C4A2B1F4' },
        },
        required: ['to', 'messageId'],
      },

      // ── Contact ──
      ContactInfo: {
        type: 'object',
        properties: {
          jid: { type: 'string', example: '12345678901@s.whatsapp.net' },
          name: { type: 'string', nullable: true },
          pushName: { type: 'string', nullable: true },
          isGroup: { type: 'boolean' },
        },
        required: ['jid', 'isGroup'],
      },

      // ── Group ──
      GroupInfo: {
        type: 'object',
        properties: {
          jid: { type: 'string', example: '120363012345678901@g.us' },
          subject: { type: 'string', example: 'My Group' },
          description: { type: 'string', nullable: true },
          owner: { type: 'string', nullable: true },
          participantCount: { type: 'number', example: 25 },
          creation: { type: 'number', nullable: true },
          announce: { type: 'boolean', description: 'Only admins can send messages' },
          restrict: { type: 'boolean', description: 'Only admins can edit group info' },
          ephemeral: { type: 'boolean', description: 'Disappearing messages enabled' },
        },
        required: ['jid', 'subject', 'participantCount'],
      },
      CreateGroupRequest: {
        type: 'object',
        properties: {
          subject: { type: 'string', example: 'New Group' },
          participants: { type: 'array', items: { type: 'string' }, example: ['12345678901@s.whatsapp.net'] },
        },
        required: ['subject', 'participants'],
      },
      UpdateGroupSubjectRequest: {
        type: 'object',
        properties: { subject: { type: 'string', example: 'New Name' } },
        required: ['subject'],
      },
      UpdateGroupDescriptionRequest: {
        type: 'object',
        properties: { description: { type: 'string', example: 'New description' } },
        required: ['description'],
      },
      GroupParticipantsRequest: {
        type: 'object',
        properties: {
          participants: { type: 'array', items: { type: 'string' }, example: ['12345678901@s.whatsapp.net'] },
        },
        required: ['participants'],
      },
      UpdateGroupSettingsRequest: {
        type: 'object',
        properties: {
          setting: { type: 'string', enum: ['announcement', 'not_announcement', 'locked', 'unlocked'] },
        },
        required: ['setting'],
      },

      // ── Webhook ──
      WebhookConfig: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri', example: 'https://example.com/webhook' },
          secret: { type: 'string', description: 'HMAC-SHA256 signing secret' },
          events: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Subscribed events (all if empty). Canonical names preferred. Legacy names supported for backward compatibility.\n\n' +
              '**Canonical events:** messages.created, messages.updated, messages.deleted, messages.reaction, ' +
              'groups.updated, group-participants.updated, receipts.updated, ' +
              'connection.update, blocklist.set, blocklist.updated, call, ' +
              'chats.sync, messages.sync, history.progress, history.finished\n\n' +
              '**Legacy (deprecated):** messages.upsert, messages.update, messages.delete, ' +
              'groups.upsert, groups.update, ' +
              'group-participants.update, message-receipt.update, blocklist.update, creds.update',
            example: ['messages.created', 'history.finished', 'connection.update'],
          },
          createdAt: { type: 'number' },
        },
        required: ['url', 'createdAt'],
      },
      CreateWebhookRequest: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri', example: 'https://example.com/webhook' },
          secret: { type: 'string', minLength: 16, maxLength: 256 },
          events: {
            type: 'array',
            items: { type: 'string' },
            example: ['messages.created', 'history.finished', 'connection.update'],
            description: 'Events to subscribe to. Use canonical names (recommended) or legacy names.',
          },
        },
        required: ['url'],
      },

      // ── Gateway Event Envelope ──
      GatewayEventEnvelope: {
        type: 'object',
        description: 'Standardized webhook delivery payload. All events use this envelope.',
        properties: {
          eventId: { type: 'string', format: 'uuid', example: '01923abc-def0-7891-2345-67890abcdef0', description: 'UUIDv7 — unique, time-ordered, idempotency key' },
          instanceId: { type: 'string', example: 'my-session', description: 'Session/instance that produced this event' },
          sequence: { type: 'number', example: 3842, description: 'Monotonically increasing per instance — for ordering verification' },
          historySessionId: { type: 'string', format: 'uuid', description: 'Present only for sync events — correlates all events from one history sync session' },
          event: { type: 'string', example: 'messages.created', description: 'Event name (canonical or legacy depending on subscription)' },
          timestamp: { type: 'number', example: 1719000000000, description: 'Epoch milliseconds when envelope was created' },
          payload: { description: 'Event-specific payload data' },
        },
        required: ['eventId', 'instanceId', 'sequence', 'event', 'timestamp', 'payload'],
      },

      // ── Webhook Delivery Headers ──
      WebhookDeliveryHeaders: {
        type: 'object',
        description: 'HTTP headers included with every webhook delivery.',
        properties: {
          'Content-Type': { type: 'string', example: 'application/json' },
          'X-Instance-Id': { type: 'string', example: 'my-session', description: 'Session ID' },
          'X-Event': { type: 'string', example: 'messages.created', description: 'Event name' },
          'X-Timestamp': { type: 'string', example: '1719000000000', description: 'Envelope timestamp' },
          'X-Sequence': { type: 'string', example: '3842', description: 'Sequence number' },
          'X-Delivery-Id': { type: 'string', format: 'uuid', description: 'Event ID (UUIDv7)' },
          'X-Signature': { type: 'string', example: 'sha256=abc123...', description: 'HMAC-SHA256 signature (only if secret configured)' },
        },
      },

      // ── Dead Letter ──
      DeadLetter: {
        type: 'object',
        description: 'A webhook delivery that permanently failed after maximum retries.',
        properties: {
          id: { type: 'string', format: 'uuid' },
          instance_id: { type: 'string', example: 'my-session' },
          sequence: { type: 'number', example: 1234 },
          webhook_url: { type: 'string', format: 'uri' },
          payload: { type: 'string', description: 'JSON string of the GatewayEventEnvelope' },
          attempts: { type: 'number', example: 5 },
          last_error: { type: 'string', example: 'HTTP 500' },
          created_at: { type: 'number', description: 'Epoch ms when delivery was first created' },
          failed_at: { type: 'number', description: 'Epoch ms when moved to DLQ' },
        },
        required: ['id', 'instance_id', 'sequence', 'webhook_url', 'payload', 'attempts', 'created_at', 'failed_at'],
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    // ── Health ──
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        security: [],
        responses: {
          200: {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'ok' },
                        uptime: { type: 'number', example: 123.456 },
                        timestamp: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ── Session ──
    '/session': {
      get: {
        tags: ['Session'],
        summary: 'List all sessions',
        responses: {
          200: {
            description: 'List of sessions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'array', items: { $ref: '#/components/schemas/SessionInfo' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Session'],
        summary: 'Create a new WhatsApp session',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateSessionRequest' } } },
        },
        responses: {
          201: {
            description: 'Session created',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/SessionInfo' } } } } },
          },
          409: { description: 'Session already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/session/{id}/connect': {
      post: {
        tags: ['Session'],
        summary: 'Connect a WhatsApp session (starts QR flow)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Connection initiated', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/SessionInfo' } } } } } },
          404: { description: 'Session not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/session/{id}/status': {
      get: {
        tags: ['Session'],
        summary: 'Get session connection status',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Session status', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/SessionInfo' } } } } } },
          404: { description: 'Session not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/session/{id}/qr': {
      get: {
        tags: ['Session'],
        summary: 'Get QR code for session pairing',
        description: 'Returns PNG image by default. Use ?format=base64 for JSON response.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['png', 'base64'] } },
        ],
        responses: {
          200: { description: 'QR code image (PNG) or base64 JSON' },
          404: { description: 'QR not available', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/session/{id}': {
      delete: {
        tags: ['Session'],
        summary: 'Destroy a session (logout + delete auth data)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Session destroyed', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { deleted: { type: 'boolean' } } } } } } } },
          404: { description: 'Session not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },

    // ── Message ──
    '/session/{id}/send': {
      post: {
        tags: ['Message'],
        summary: 'Send a message (generic endpoint)',
        description:
          'Send any message type using a single endpoint. The `type` field determines the message format.\n\n' +
          'Supported types: text, image, video, audio, sticker, document, location, contact, reaction, poll, forward.\n\n' +
          'Media types accept either `url` or `base64`.\n\n' +
          '⚠️ Interactive types (buttons, list, cta_url) are defined but NOT YET SUPPORTED — Baileys v7 limitation.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendRequest' },
              examples: {
                text: {
                  summary: 'Text message',
                  value: {
                    type: 'text',
                    to: '6281234567890@s.whatsapp.net',
                    text: 'Hello! How are you doing today? 👋',
                    quotedMessageId: '3EB0C4A2B1F4E6D8',
                    mentions: ['6289876543210@s.whatsapp.net'],
                  },
                },
                image: {
                  summary: 'Image with caption',
                  value: {
                    type: 'image',
                    to: '6281234567890@s.whatsapp.net',
                    url: 'https://example.com/photo.jpg',
                    caption: 'Check out this beautiful sunset! 🌅',
                    mimetype: 'image/jpeg',
                  },
                },
                video: {
                  summary: 'Video clip',
                  value: {
                    type: 'video',
                    to: '6281234567890@s.whatsapp.net',
                    url: 'https://example.com/clip.mp4',
                    caption: 'Watch this! 😂',
                    mimetype: 'video/mp4',
                    gifPlayback: false,
                  },
                },
                audio: {
                  summary: 'Voice note',
                  value: {
                    type: 'audio',
                    to: '6281234567890@s.whatsapp.net',
                    url: 'https://example.com/voice.ogg',
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: true,
                  },
                },
                sticker: {
                  summary: 'Sticker',
                  value: {
                    type: 'sticker',
                    to: '6281234567890@s.whatsapp.net',
                    url: 'https://example.com/sticker.webp',
                  },
                },
                document: {
                  summary: 'PDF document',
                  value: {
                    type: 'document',
                    to: '6281234567890@s.whatsapp.net',
                    url: 'https://example.com/report.pdf',
                    filename: 'Q4-Report-2025.pdf',
                    mimetype: 'application/pdf',
                    caption: 'Here is the Q4 financial report 📊',
                  },
                },
                location: {
                  summary: 'Location pin',
                  value: {
                    type: 'location',
                    to: '6281234567890@s.whatsapp.net',
                    latitude: -6.2088,
                    longitude: 106.8456,
                    live: false,
                  },
                },
                contact: {
                  summary: 'Contact card',
                  value: {
                    type: 'contact',
                    to: '6281234567890@s.whatsapp.net',
                    contactName: 'John Doe',
                    contactNumber: '+6289876543210',
                  },
                },
                reaction: {
                  summary: 'React to message',
                  value: {
                    type: 'reaction',
                    to: '6281234567890@s.whatsapp.net',
                    emoji: '👍',
                    messageId: '3EB0C4A2B1F4E6D8',
                  },
                },
                poll: {
                  summary: 'Poll in group',
                  value: {
                    type: 'poll',
                    to: '120363012345678901@g.us',
                    name: 'What should we order for lunch? 🍕',
                    options: ['Pizza 🍕', 'Sushi 🍣', 'Burger 🍔', 'Salad 🥗'],
                    selectableCount: 1,
                  },
                },
                forward: {
                  summary: 'Forward a message',
                  value: {
                    type: 'forward',
                    to: '6289876543210@s.whatsapp.net',
                    fromJid: '6281234567890@s.whatsapp.net',
                    messageId: '3EB0C4A2B1F4E6D8',
                  },
                },
                buttons: {
                  summary: '⚠️ NOT SUPPORTED — Interactive buttons',
                  description: 'Baileys v7 does not support sending interactive messages. Returns 501.',
                  value: {
                    type: 'buttons',
                    to: '6281234567890@s.whatsapp.net',
                    body: 'Apakah Anda ingin melanjutkan?',
                    footer: 'Pilih salah satu',
                    header: 'Konfirmasi',
                    buttons: [
                      { id: 'btn_yes', displayText: 'Ya' },
                      { id: 'btn_no', displayText: 'Tidak' },
                    ],
                  },
                },
                list: {
                  summary: '⚠️ NOT SUPPORTED — List message',
                  description: 'Baileys v7 does not support sending interactive messages. Returns 501.',
                  value: {
                    type: 'list',
                    to: '6281234567890@s.whatsapp.net',
                    title: 'Menu Restoran',
                    body: 'Silakan pilih menu favorit Anda',
                    footer: 'Buka setiap hari 08:00-22:00',
                    buttonText: 'Lihat Menu',
                    sections: [
                      {
                        title: 'Makanan',
                        rows: [
                          { id: 'food_nasi', title: 'Nasi Goreng', description: 'Nasi goreng spesial' },
                          { id: 'food_mie', title: 'Mie Ayam', description: 'Mie ayam bakso' },
                        ],
                      },
                      {
                        title: 'Minuman',
                        rows: [
                          { id: 'drink_es', title: 'Es Teh', description: 'Teh manis dingin' },
                        ],
                      },
                    ],
                  },
                },
                cta_url: {
                  summary: '⚠️ NOT SUPPORTED — CTA URL button',
                  description: 'Baileys v7 does not support sending interactive messages. Returns 501.',
                  value: {
                    type: 'cta_url',
                    to: '6281234567890@s.whatsapp.net',
                    body: 'Kunjungi website kami untuk info lebih lanjut.',
                    footer: 'www.example.com',
                    header: 'Info Produk',
                    buttons: [
                      { displayText: 'Kunjungi Website', url: 'https://example.com' },
                    ],
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Message sent', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/SendMessageResult' } } } } } },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          503: { description: 'Session not connected', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/session/{id}/message': {
      patch: {
        tags: ['Message'],
        summary: 'Edit a sent message',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/EditMessageRequest' } } } },
        responses: {
          200: { description: 'Message edited', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/SendMessageResult' } } } } } },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      delete: {
        tags: ['Message'],
        summary: 'Delete a sent message (for everyone)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/DeleteMessageRequest' } } } },
        responses: {
          200: { description: 'Message deleted', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/SendMessageResult' } } } } } },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/session/{id}/messages/{messageId}/media': {
      get: {
        tags: ['Message'],
        summary: 'Download media from a received message',
        description:
          'Returns the raw media binary (image, video, audio, document, sticker) for a given message ID. ' +
          'The message must exist in the in-memory store (last 500 messages per chat). ' +
          'Use this endpoint to download media referenced in webhook payloads.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Session ID' },
          { name: 'messageId', in: 'path', required: true, schema: { type: 'string' }, description: 'Message ID from webhook payload (key.id)' },
        ],
        responses: {
          200: {
            description: 'Media binary',
            content: {
              'image/jpeg': { schema: { type: 'string', format: 'binary' } },
              'image/png': { schema: { type: 'string', format: 'binary' } },
              'video/mp4': { schema: { type: 'string', format: 'binary' } },
              'audio/ogg': { schema: { type: 'string', format: 'binary' } },
              'audio/mpeg': { schema: { type: 'string', format: 'binary' } },
              'application/pdf': { schema: { type: 'string', format: 'binary' } },
              'image/webp': { schema: { type: 'string', format: 'binary' } },
              'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
            },
          },
          400: { description: 'Message is not a media type', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          404: { description: 'Message not found in store', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          503: { description: 'Session not connected', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },

    // ── Contact ──
    '/session/{id}/contact/{jid}': {
      get: {
        tags: ['Contact'],
        summary: 'Get contact information',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'jid', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Contact info', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/ContactInfo' } } } } } },
          404: { description: 'Contact not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/session/{id}/contact/{jid}/history': {
      post: {
        tags: ['Contact'],
        summary: 'Sync message history for a contact',
        description: 'Manually sync 3-month message history for a specific contact. Returns a syncId to track the async operation via webhook events.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Session ID' },
          { name: 'jid', in: 'path', required: true, schema: { type: 'string' }, description: 'Contact JID or phone number' },
        ],
        responses: {
          202: {
            description: 'Sync started',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', enum: [true] },
                    data: {
                      type: 'object',
                      properties: {
                        syncId: { type: 'string', description: 'ID to track sync progress via webhook events' },
                        status: { type: 'string', enum: ['pending'] },
                      },
                      required: ['syncId', 'status'],
                    },
                  },
                  required: ['success', 'data'],
                },
              },
            },
          },
          404: { description: 'Session or contact not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },

    // ── Group ──
    '/session/{id}/group': {
      get: {
        tags: ['Group'],
        summary: 'List all groups the session participates in',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'List of groups', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/GroupInfo' } } } } } } },
        },
      },
      post: {
        tags: ['Group'],
        summary: 'Create a new group',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateGroupRequest' } } } },
        responses: {
          201: { description: 'Group created', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/GroupInfo' } } } } } },
        },
      },
    },
    '/session/{id}/group-invite/{code}/join': {
      post: {
        tags: ['Group'],
        summary: 'Join a group via invite code',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Joined group', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/GroupInfo' } } } } } },
        },
      },
    },
    '/session/{id}/group-invite/{code}': {
      get: {
        tags: ['Group'],
        summary: 'Preview group info by invite code (without joining)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Group info', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/GroupInfo' } } } } } },
          404: { description: 'Invalid invite code', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/session/{id}/group/{jid}': {
      get: {
        tags: ['Group'],
        summary: 'Get group metadata',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'jid', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Group info', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/GroupInfo' } } } } } },
          404: { description: 'Group not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/session/{id}/group/{jid}/subject': {
      patch: {
        tags: ['Group'],
        summary: 'Update group name',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'jid', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateGroupSubjectRequest' } } } },
        responses: { 200: { description: 'Updated' } },
      },
    },
    '/session/{id}/group/{jid}/description': {
      patch: {
        tags: ['Group'],
        summary: 'Update group description',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'jid', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateGroupDescriptionRequest' } } } },
        responses: { 200: { description: 'Updated' } },
      },
    },
    '/session/{id}/group/{jid}/participants/add': {
      post: {
        tags: ['Group'],
        summary: 'Add participants to group',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'jid', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GroupParticipantsRequest' } } } },
        responses: { 200: { description: 'Participants added' } },
      },
    },
    '/session/{id}/group/{jid}/participants/remove': {
      post: {
        tags: ['Group'],
        summary: 'Remove participants from group',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'jid', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GroupParticipantsRequest' } } } },
        responses: { 200: { description: 'Participants removed' } },
      },
    },
    '/session/{id}/group/{jid}/participants/promote': {
      post: {
        tags: ['Group'],
        summary: 'Promote participants to admin',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'jid', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GroupParticipantsRequest' } } } },
        responses: { 200: { description: 'Participants promoted' } },
      },
    },
    '/session/{id}/group/{jid}/participants/demote': {
      post: {
        tags: ['Group'],
        summary: 'Demote participants from admin',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'jid', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GroupParticipantsRequest' } } } },
        responses: { 200: { description: 'Participants demoted' } },
      },
    },
    '/session/{id}/group/{jid}/leave': {
      post: {
        tags: ['Group'],
        summary: 'Leave a group',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'jid', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Left group' } },
      },
    },
    '/session/{id}/group/{jid}/invite': {
      get: {
        tags: ['Group'],
        summary: 'Get group invite code',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'jid', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Invite code',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { code: { type: 'string' }, inviteUrl: { type: 'string' } } } } } } },
          },
        },
      },
    },
    '/session/{id}/group/{jid}/invite/revoke': {
      post: {
        tags: ['Group'],
        summary: 'Revoke group invite code and generate a new one',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'jid', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'New invite code',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { code: { type: 'string' }, inviteUrl: { type: 'string' } } } } } } },
          },
        },
      },
    },
    '/session/{id}/group/{jid}/settings': {
      patch: {
        tags: ['Group'],
        summary: 'Update group settings (announce/locked)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'jid', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateGroupSettingsRequest' } } } },
        responses: { 200: { description: 'Settings updated' } },
      },
    },

    // ── Webhook ──
    '/session/{id}/webhook': {
      post: {
        tags: ['Webhook'],
        summary: 'Register or update webhook for a session',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateWebhookRequest' } } } },
        responses: {
          201: { description: 'Webhook configured', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/WebhookConfig' } } } } } },
        },
      },
      get: {
        tags: ['Webhook'],
        summary: 'Get webhook configuration',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Webhook config', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/WebhookConfig' } } } } } },
          404: { description: 'No webhook configured', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      delete: {
        tags: ['Webhook'],
        summary: 'Remove webhook configuration',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Webhook removed', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { deleted: { type: 'boolean' } } } } } } } },
          404: { description: 'No webhook configured', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },

    // ── DLQ (Dead Letter Queue) ──
    '/dlq': {
      get: {
        tags: ['DLQ'],
        summary: 'List dead letters (failed webhook deliveries)',
        description:
          'Returns all webhook deliveries that permanently failed after maximum retries (5 attempts). ' +
          'Use ?instanceId= to filter by session.',
        parameters: [
          { name: 'instanceId', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter by session ID' },
        ],
        responses: {
          200: {
            description: 'List of dead letters',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'array', items: { $ref: '#/components/schemas/DeadLetter' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/dlq/{id}/replay': {
      post: {
        tags: ['DLQ'],
        summary: 'Replay a dead letter (re-enqueue for delivery)',
        description: 'Moves the dead letter back to the delivery queue with a fresh retry counter. The webhook will be redelivered.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Dead letter ID' },
        ],
        responses: {
          200: {
            description: 'Dead letter replayed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        replayed: { type: 'boolean', example: true },
                        id: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { description: 'Dead letter not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/dlq/{id}': {
      delete: {
        tags: ['DLQ'],
        summary: 'Discard a dead letter',
        description: 'Permanently removes the dead letter. The webhook delivery will not be retried.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Dead letter ID' },
        ],
        responses: {
          200: {
            description: 'Dead letter discarded',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        deleted: { type: 'boolean', example: true },
                        id: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { description: 'Dead letter not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    },
  } as const
}
