---
title: Sending Messages
description: Send text, images, videos, documents, and more
---

## Overview

WhatsApp Gateway supports sending various message types through a single endpoint. The `type` field determines the message format.

## Send Message Endpoint

```
POST /session/{id}/send
```

## Message Types

| Type | Description |
|------|-------------|
| `text` | Plain text message |
| `image` | Image with optional caption |
| `video` | Video clip |
| `audio` | Audio file or voice note |
| `sticker` | WebP sticker |
| `document` | File attachment |
| `location` | Location pin or live location |
| `contact` | Contact card (vCard) |
| `reaction` | Emoji reaction to a message |
| `poll` | Poll with multiple options |
| `forward` | Forward an existing message |

## Text Message

```bash
curl -X POST http://localhost:3000/session/my-session/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "type": "text",
    "to": "6281234567890@s.whatsapp.net",
    "text": "Hello! How are you? 👋"
  }'
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `"text"` |
| `to` | string | Yes | Recipient JID |
| `text` | string | Yes | Message text (max 65536 chars) |
| `quotedMessageId` | string | No | ID of message to quote |
| `mentions` | string[] | No | JIDs to @mention |

## Image Message

```bash
curl -X POST http://localhost:3000/session/my-session/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "type": "image",
    "to": "6281234567890@s.whatsapp.net",
    "url": "https://example.com/photo.jpg",
    "caption": "Check out this photo! 📸"
  }'
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `"image"` |
| `to` | string | Yes | Recipient JID |
| `url` | string | No* | Image URL |
| `base64` | string | No* | Base64-encoded image |
| `caption` | string | No | Image caption (max 1024 chars) |
| `mimetype` | string | No | MIME type (default: `image/jpeg`) |

*Use either `url` or `base64`

## Video Message

```bash
curl -X POST http://localhost:3000/session/my-session/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "type": "video",
    "to": "6281234567890@s.whatsapp.net",
    "url": "https://example.com/video.mp4",
    "caption": "Check this out! 🎬",
    "gifPlayback": false
  }'
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `"video"` |
| `to` | string | Yes | Recipient JID |
| `url` | string | No* | Video URL |
| `base64` | string | No* | Base64-encoded video |
| `caption` | string | No | Video caption |
| `mimetype` | string | No | MIME type (default: `video/mp4`) |
| `gifPlayback` | boolean | No | Send as GIF (no audio, auto-loop) |

## Audio Message

```bash
# Voice note
curl -X POST http://localhost:3000/session/my-session/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "type": "audio",
    "to": "6281234567890@s.whatsapp.net",
    "url": "https://example.com/voice.ogg",
    "ptt": true
  }'
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `"audio"` |
| `to` | string | Yes | Recipient JID |
| `url` | string | No* | Audio URL |
| `base64` | string | No* | Base64-encoded audio |
| `mimetype` | string | No | MIME type (default: `audio/mpeg`) |
| `ptt` | boolean | No | Push-to-talk (voice note) |

## Document Message

```bash
curl -X POST http://localhost:3000/session/my-session/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "type": "document",
    "to": "6281234567890@s.whatsapp.net",
    "url": "https://example.com/report.pdf",
    "filename": "Q4-Report.pdf",
    "caption": "Here is the Q4 report"
  }'
```

## Location Message

```bash
curl -X POST http://localhost:3000/session/my-session/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "type": "location",
    "to": "6281234567890@s.whatsapp.net",
    "latitude": -6.2088,
    "longitude": 106.8456,
    "live": false
  }'
```

## Contact Message

```bash
curl -X POST http://localhost:3000/session/my-session/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "type": "contact",
    "to": "6281234567890@s.whatsapp.net",
    "contactName": "John Doe",
    "contactNumber": "+6289876543210"
  }'
```

## Reaction

React to a message with an emoji:

```bash
curl -X POST http://localhost:3000/session/my-session/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "type": "reaction",
    "to": "6281234567890@s.whatsapp.net",
    "emoji": "👍",
    "messageId": "3EB0C4A2B1F4E6D8"
  }'
```

To remove a reaction, send an empty emoji:

```json
{
  "type": "reaction",
  "to": "6281234567890@s.whatsapp.net",
  "emoji": "",
  "messageId": "3EB0C4A2B1F4E6D8"
}
```

## Poll

```bash
curl -X POST http://localhost:3000/session/my-session/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "type": "poll",
    "to": "120363012345678901@g.us",
    "name": "What should we order?",
    "options": ["Pizza 🍕", "Sushi 🍣", "Burger 🍔"],
    "selectableCount": 1
  }'
```

## Forward Message

```bash
curl -X POST http://localhost:3000/session/my-session/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "type": "forward",
    "to": "6289876543210@s.whatsapp.net",
    "fromJid": "6281234567890@s.whatsapp.net",
    "messageId": "3EB0C4A2B1F4E6D8"
  }'
```

## Edit Message

```bash
curl -X PATCH http://localhost:3000/session/my-session/message \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "to": "6281234567890@s.whatsapp.net",
    "messageId": "3EB0C4A2B1F4E6D8",
    "text": "Updated message text"
  }'
```

## Delete Message

```bash
curl -X DELETE http://localhost:3000/session/my-session/message \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "to": "6281234567890@s.whatsapp.net",
    "messageId": "3EB0C4A2B1F4E6D8"
  }'
```

## Response Format

All send endpoints return:

```json
{
  "success": true,
  "data": {
    "id": "3EB0C4A2B1F4E6D8",
    "timestamp": 1719000000000,
    "status": "sent"
  }
}
```

## JID Format

| Type | Format | Example |
|------|--------|---------|
| Personal | `{phone}@s.whatsapp.net` | `6281234567890@s.whatsapp.net` |
| Group | `{id}@g.us` | `120363012345678901@g.us` |

> [!tip]
> The phone number should include the country code without `+` or `00`.

---

> [!info]
> Interactive message types (buttons, lists, CTA URLs) are defined in the API but not yet supported by Baileys v7. These return `501 NOT_IMPLEMENTED`.

View full API reference for [Message endpoints](/reference#tag/Message).
