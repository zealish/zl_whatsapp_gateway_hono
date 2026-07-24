# WhatsApp Gateway API — Integration Guide

Complete API reference for the WhatsApp Gateway. All endpoints return JSON.

> **Base URL:** configurable via `BASE_URL` env (default `/`).  
> All paths below are relative to the base URL.

---

## Table of Contents

- [Authentication](#authentication)
- [Response Envelope](#response-envelope)
- [Error Codes](#error-codes)
- [Endpoints — Health](#health)
- [Endpoints — Session](#session)
- [Endpoints — Message](#message)
- [Endpoints — Contact](#contact)
- [Endpoints — Group](#group)
- [Endpoints — Webhook Config](#webhook-config)
- [Endpoints — Dead Letter Queue (DLQ)](#dead-letter-queue-dlq)
- [Webhook Consumer Guide](#webhook-consumer-guide)
  - [Event Envelope](#event-envelope)
  - [HTTP Headers](#http-headers)
  - [Signature Verification](#signature-verification)
  - [Event Reference](#event-reference)
  - [Idempotency & Ordering](#idempotency--ordering)
  - [History Sync Flow](#history-sync-flow)
  - [Retry Policy & DLQ](#retry-policy--dlq)
  - [Legacy Event Names](#legacy-event-names)
- [Environment Variables](#environment-variables)

---

## Authentication

All endpoints under `/session/*` and `/dlq*` require the `X-API-Key` header.

```
X-API-Key: your-api-key-min-16-chars
```

Health and docs endpoints are public (no auth).

---

## Response Envelope

Every response uses a consistent envelope:

### Success

```json
{
  "success": true,
  "data": { ... }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Session with id 'abc' not found",
    "details": null
  }
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid request body or parameters |
| `UNAUTHORIZED` | 401 | Missing or invalid `X-API-Key` |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists or state conflict |
| `SERVICE_UNAVAILABLE` | 503 | WhatsApp connection not ready |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Health

### `GET /health` — Health Check

No authentication required.

**Response**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "uptime": 123.456,
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

---

## Session

All endpoints require `X-API-Key`.

### `POST /session` — Create Session

Create a new WhatsApp session.

**Request Body**

```json
{
  "id": "my-session"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | No | Custom session ID. Alphanumeric, `-`, `_`, max 64 chars. Auto-generated if omitted. |

**Response** `201`

```json
{
  "success": true,
  "data": {
    "id": "my-session",
    "state": "close",
    "qr": null
  }
}
```

### `GET /session` — List All Sessions

**Response**

```json
{
  "success": true,
  "data": [
    { "id": "my-session", "state": "open", "pushName": "John" },
    { "id": "other-session", "state": "close" }
  ]
}
```

### `POST /session/:id/connect` — Connect Session

Initiate WhatsApp connection (starts QR code flow).

**Response**

```json
{
  "success": true,
  "data": {
    "id": "my-session",
    "state": "connecting",
    "qr": null
  }
}
```

### `GET /session/:id/status` — Get Session Status

**Response**

```json
{
  "success": true,
  "data": {
    "id": "my-session",
    "state": "open",
    "pushName": "John"
  }
}
```

State values: `connecting`, `open`, `close`.

### `GET /session/:id/qr` — Get QR Code

**Query Parameters**

| Param | Values | Default | Description |
|---|---|---|---|
| `format` | `png`, `base64` | `png` | Response format |

**Response (default / png)**

Returns a PNG image binary (`Content-Type: image/png`).

**Response (base64)**

```json
{
  "success": true,
  "data": {
    "qr": "data:image/png;base64,..."
  }
}
```

### `DELETE /session/:id` — Delete Session

Destroys the session: logs out from WhatsApp and deletes auth credentials.

**Response**

```json
{
  "success": true,
  "data": { "deleted": true }
}
```

---

## Message

All endpoints require `X-API-Key`.

### `POST /session/:id/send` — Send Message

Generic message sender. Discriminated by `type` field.

**Response** `201`

```json
{
  "success": true,
  "data": {
    "id": "3EB0C4A2B1F4",
    "timestamp": 1719000000,
    "status": "sent"
  }
}
```

#### Send Types

##### `text`

```json
{
  "type": "text",
  "to": "6281234567890@s.whatsapp.net",
  "text": "Hello!",
  "quotedMessageId": "ABC123",
  "mentions": ["6289876543210@s.whatsapp.net"]
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `to` | string (JID) | Yes | `user@s.whatsapp.net` or `group@g.us` |
| `text` | string | Yes | 1–65536 chars |
| `quotedMessageId` | string | No | Message ID to quote |
| `mentions` | string[] | No | JIDs to @mention |

##### `image`

```json
{
  "type": "image",
  "to": "6281234567890@s.whatsapp.net",
  "url": "https://example.com/photo.jpg",
  "caption": "Look at this!",
  "mimetype": "image/jpeg"
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `to` | string (JID) | Yes | | |
| `url` | string (URL) | One of url/base64 | | |
| `base64` | string | One of url/base64 | | |
| `caption` | string | No | | Max 1024 chars |
| `mimetype` | string | No | `image/jpeg` | |

##### `video`

```json
{
  "type": "video",
  "to": "6281234567890@s.whatsapp.net",
  "url": "https://example.com/video.mp4",
  "caption": "Check this out",
  "gifPlayback": false
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `to` | string (JID) | Yes | | |
| `url` / `base64` | string | One required | | |
| `caption` | string | No | | Max 1024 chars |
| `mimetype` | string | No | `video/mp4` | |
| `gifPlayback` | boolean | No | | Send as GIF |

##### `audio`

```json
{
  "type": "audio",
  "to": "6281234567890@s.whatsapp.net",
  "url": "https://example.com/audio.mp3",
  "ptt": false
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `to` | string (JID) | Yes | | |
| `url` / `base64` | string | One required | | |
| `mimetype` | string | No | `audio/mpeg` | |
| `ptt` | boolean | No | `false` | Push-to-talk (voice note) |

##### `sticker`

```json
{
  "type": "sticker",
  "to": "6281234567890@s.whatsapp.net",
  "url": "https://example.com/sticker.webp"
}
```

| Field | Type | Required | Default |
|---|---|---|---|
| `to` | string (JID) | Yes | |
| `url` / `base64` | string | One required | |
| `mimetype` | string | No | `image/webp` |

##### `document`

```json
{
  "type": "document",
  "to": "6281234567890@s.whatsapp.net",
  "url": "https://example.com/file.pdf",
  "filename": "report.pdf",
  "caption": "Monthly report"
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `to` | string (JID) | Yes | | |
| `url` / `base64` | string | One required | | |
| `filename` | string | No | | |
| `mimetype` | string | No | `application/pdf` | |
| `caption` | string | No | | Max 1024 chars |

##### `location`

```json
{
  "type": "location",
  "to": "6281234567890@s.whatsapp.net",
  "latitude": -6.2088,
  "longitude": 106.8456,
  "live": false
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `to` | string (JID) | Yes | |
| `latitude` | number | Yes | -90 to 90 |
| `longitude` | number | Yes | -180 to 180 |
| `live` | boolean | No | Live location sharing |

##### `contact`

```json
{
  "type": "contact",
  "to": "6281234567890@s.whatsapp.net",
  "contactName": "Jane Doe",
  "contactNumber": "6289876543210"
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `to` | string (JID) | Yes | |
| `contactName` | string | Yes | 1–256 chars |
| `contactNumber` | string | Yes | 8–20 chars |

##### `reaction`

```json
{
  "type": "reaction",
  "to": "6281234567890@s.whatsapp.net",
  "emoji": "👍",
  "messageId": "ABC123"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `to` | string (JID) | Yes | |
| `emoji` | string | Yes | Max 16 chars. Empty string removes reaction. |
| `messageId` | string | Yes | Message to react to |

##### `poll`

```json
{
  "type": "poll",
  "to": "6281234567890@s.whatsapp.net",
  "name": "Favorite color?",
  "options": ["Red", "Blue", "Green"],
  "selectableCount": 1
}
```

| Field | Type | Required | Default | Validation |
|---|---|---|---|---|
| `to` | string (JID) | Yes | | |
| `name` | string | Yes | | 1–256 chars |
| `options` | string[] | Yes | | 2–12 items, each 1–128 chars |
| `selectableCount` | number | No | 1 | Min 1 |

##### `forward`

```json
{
  "type": "forward",
  "to": "6289876543210@s.whatsapp.net",
  "fromJid": "6281234567890@s.whatsapp.net",
  "messageId": "ABC123"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `to` | string (JID) | Yes | |
| `fromJid` | string (JID) | Yes | Chat containing the message |
| `messageId` | string | Yes | Message must be in recent store |

##### `buttons` — Interactive Buttons

> ⚠️ **Not implemented** in Baileys v7. Returns `501`.

```json
{
  "type": "buttons",
  "to": "6281234567890@s.whatsapp.net",
  "body": "Choose an option:",
  "footer": "Powered by WA Gateway",
  "header": "Options",
  "buttons": [
    { "id": "btn1", "displayText": "Yes" },
    { "id": "btn2", "displayText": "No" }
  ]
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `to` | string (JID) | Yes | |
| `body` | string | Yes | 1–1024 chars |
| `footer` | string | No | Max 64 chars |
| `header` | string | No | Max 64 chars |
| `buttons` | object[] | Yes | 1–3 items. Each: `{id: 1–256, displayText: 1–256}` |

##### `list` — Interactive List

> ⚠️ **Not implemented** in Baileys v7. Returns `501`.

```json
{
  "type": "list",
  "to": "6281234567890@s.whatsapp.net",
  "title": "Menu",
  "body": "Select an item",
  "footer": "Powered by WA Gateway",
  "buttonText": "View Menu",
  "sections": [
    {
      "title": "Fruits",
      "rows": [
        { "id": "apple", "title": "Apple", "description": "Red fruit" },
        { "id": "banana", "title": "Banana" }
      ]
    }
  ]
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `to` | string (JID) | Yes | |
| `title` | string | Yes | 1–256 chars |
| `body` | string | No | Max 1024 chars |
| `footer` | string | No | Max 64 chars |
| `buttonText` | string | Yes | 1–20 chars |
| `sections` | object[] | Yes | Min 1. Each: `{title, rows[{id, title, description?}]}` |

##### `cta_url` — Call-to-Action URL Button

> ⚠️ **Not implemented** in Baileys v7. Returns `501`.

```json
{
  "type": "cta_url",
  "to": "6281234567890@s.whatsapp.net",
  "body": "Visit our website",
  "footer": "Powered by WA Gateway",
  "header": "Website",
  "buttons": [
    { "displayText": "Open Website", "url": "https://example.com" }
  ]
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `to` | string (JID) | Yes | |
| `body` | string | Yes | 1–1024 chars |
| `footer` | string | No | Max 64 chars |
| `header` | string | No | Max 64 chars |
| `buttons` | object[] | Yes | Exactly 1. `{displayText: 1–256, url}` |

---

### `PATCH /session/:id/message` — Edit Message

**Request Body**

```json
{
  "to": "6281234567890@s.whatsapp.net",
  "messageId": "ABC123",
  "text": "Updated message text"
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `to` | string (JID) | Yes | Chat containing the message |
| `messageId` | string | Yes | Message ID to edit |
| `text` | string | Yes | 1–65536 chars |

**Response**

```json
{
  "success": true,
  "data": { "id": "ABC123", "timestamp": 1719000000, "status": "sent" }
}
```

### `DELETE /session/:id/message` — Delete Message

Delete a message for everyone.

**Request Body**

```json
{
  "to": "6281234567890@s.whatsapp.net",
  "messageId": "ABC123"
}
```

| Field | Type | Required |
|---|---|---|
| `to` | string (JID) | Yes |
| `messageId` | string | Yes |

**Response**

```json
{
  "success": true,
  "data": { "id": "ABC123", "timestamp": 1719000000, "status": "sent" }
}
```

### `GET /session/:id/messages/:messageId/media` — Download Media

Download the raw media binary (image, video, audio, document, sticker) for a received message.

**Path Parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Session ID |
| `messageId` | string | Yes | Message ID from webhook payload (`key.id`) |

**Response**

Returns raw binary with `Content-Type` set to the media's mimetype (e.g. `image/jpeg`, `video/mp4`).

Includes `Content-Disposition: inline; filename="..."` when the message has a filename (documents).

**Error Responses**

| Status | Code | Description |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Message exists but is not a media type |
| 404 | `NOT_FOUND` | Message not found in store (evicted or process restarted) |
| 503 | `SERVICE_UNAVAILABLE` | Session not connected |

**Example**

```bash
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/session/my-session/messages/AC4F33D8EFB9D6EDCC0421122338682D/media \
  --output image.jpg
```

> **Note:** The in-memory message store keeps the last 500 messages per chat. Media must be downloaded before messages are evicted.

---

## Contact

All endpoints require `X-API-Key`.

### `GET /session/:id/contact/:jid` — Get Contact Info

**Response**

```json
{
  "success": true,
  "data": {
    "jid": "6281234567890@s.whatsapp.net",
    "name": "John Doe",
    "pushName": "John",
    "isGroup": false
  }
}
```

---

## Group

All endpoints require `X-API-Key`.

### `GET /session/:id/group` — List Groups

List all groups the session participates in.

**Response**

```json
{
  "success": true,
  "data": [
    {
      "jid": "120363012345678901@g.us",
      "subject": "My Group",
      "description": "Group description",
      "owner": "6281234567890@s.whatsapp.net",
      "participantCount": 25,
      "creation": 1719000000,
      "announce": false,
      "restrict": false,
      "ephemeral": false
    }
  ]
}
```

### `POST /session/:id/group` — Create Group

**Request Body**

```json
{
  "subject": "New Group Name",
  "participants": [
    "6281234567890@s.whatsapp.net",
    "6289876543210@s.whatsapp.net"
  ]
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `subject` | string | Yes | 1–256 chars |
| `participants` | string[] | Yes | 1–1024 JIDs |

**Response** `201`

```json
{
  "success": true,
  "data": {
    "jid": "120363012345678901@g.us",
    "subject": "New Group Name",
    "participantCount": 2
  }
}
```

### `GET /session/:id/group/:jid` — Get Group Metadata

**Response**

```json
{
  "success": true,
  "data": {
    "jid": "120363012345678901@g.us",
    "subject": "My Group",
    "description": "Group description",
    "owner": "6281234567890@s.whatsapp.net",
    "participantCount": 25,
    "creation": 1719000000,
    "announce": false,
    "restrict": false,
    "ephemeral": false
  }
}
```

### `PATCH /session/:id/group/:jid/subject` — Update Group Name

**Request Body**

```json
{ "subject": "New Group Name" }
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `subject` | string | Yes | 1–256 chars |

**Response**

```json
{ "success": true, "data": { "updated": true } }
```

### `PATCH /session/:id/group/:jid/description` — Update Group Description

**Request Body**

```json
{ "description": "New group description" }
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `description` | string | Yes | Max 2048 chars |

**Response**

```json
{ "success": true, "data": { "updated": true } }
```

### `POST /session/:id/group/:jid/participants/add` — Add Participants

**Request Body**

```json
{ "participants": ["6289876543210@s.whatsapp.net"] }
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `participants` | string[] | Yes | 1–128 JIDs |

**Response**

```json
{ "success": true, "data": { "updated": true } }
```

### `POST /session/:id/group/:jid/participants/remove` — Remove Participants

Same request/response format as add.

### `POST /session/:id/group/:jid/participants/promote` — Promote to Admin

Same request/response format as add.

### `POST /session/:id/group/:jid/participants/demote` — Demote from Admin

Same request/response format as add.

### `POST /session/:id/group/:jid/leave` — Leave Group

**Response**

```json
{ "success": true, "data": { "left": true } }
```

### `GET /session/:id/group/:jid/invite` — Get Invite Code

**Response**

```json
{
  "success": true,
  "data": {
    "code": "AbCdEfGhIjKl",
    "inviteUrl": "https://chat.whatsapp.com/AbCdEfGhIjKl"
  }
}
```

### `POST /session/:id/group/:jid/invite/revoke` — Revoke & Regenerate Invite Code

**Response**

```json
{
  "success": true,
  "data": {
    "code": "NewCodeHere",
    "inviteUrl": "https://chat.whatsapp.com/NewCodeHere"
  }
}
```

### `POST /session/:id/group-invite/:code/join` — Join Group via Invite Code

**Response**

```json
{
  "success": true,
  "data": {
    "jid": "120363012345678901@g.us",
    "subject": "Joined Group",
    "participantCount": 50
  }
}
```

### `GET /session/:id/group-invite/:code` — Preview Group by Invite Code

Preview group info without joining.

**Response**

```json
{
  "success": true,
  "data": {
    "jid": "120363012345678901@g.us",
    "subject": "Some Group",
    "participantCount": 50
  }
}
```

### `PATCH /session/:id/group/:jid/settings` — Update Group Settings

**Request Body**

```json
{ "setting": "announcement" }
```

| Field | Type | Required | Values |
|---|---|---|---|
| `setting` | string | Yes | `announcement`, `not_announcement`, `locked`, `unlocked` |

- `announcement` — only admins can send messages
- `not_announcement` — everyone can send messages
- `locked` — only admins can edit group info
- `unlocked` — everyone can edit group info

**Response**

```json
{ "success": true, "data": { "updated": true } }
```

---

## Webhook Config

All endpoints require `X-API-Key`.

### `POST /session/:id/webhook` — Register / Update Webhook

**Request Body**

```json
{
  "url": "https://your-app.com/webhook/whatsapp",
  "secret": "your-hmac-secret-min-16-chars",
  "events": ["messages.created", "history.finished", "connection.update"]
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `url` | string (URL) | Yes | Valid URL |
| `secret` | string | No | 16–256 chars. Auto-generated if omitted. |
| `events` | string[] | No | Event names to subscribe. All events if omitted. |

**Subscribable events:**

- **Canonical:** `messages.created`, `messages.updated`, `messages.deleted`, `messages.reaction`, `groups.updated`, `group-participants.updated`, `receipts.updated`, `connection.update`, `blocklist.set`, `blocklist.updated`, `call`, `chats.sync`, `messages.sync`, `history.progress`, `history.finished`
- **Legacy (deprecated):** `messages.upsert`, `messages.update`, `messages.delete`, `groups.upsert`, `groups.update`, `group-participants.update`, `message-receipt.update`, `blocklist.update`, `creds.update`

**Response** `201`

```json
{
  "success": true,
  "data": {
    "url": "https://your-app.com/webhook/whatsapp",
    "events": ["messages.created", "history.finished", "connection.update"],
    "createdAt": 1719000000000
  }
}
```

### `GET /session/:id/webhook` — Get Webhook Config

**Response**

```json
{
  "success": true,
  "data": {
    "url": "https://your-app.com/webhook/whatsapp",
    "events": ["messages.created", "history.finished", "connection.update"],
    "createdAt": 1719000000000
  }
}
```

### `DELETE /session/:id/webhook` — Remove Webhook Config

**Response**

```json
{ "success": true, "data": { "deleted": true } }
```

---

## Dead Letter Queue (DLQ)

All endpoints require `X-API-Key`.

### `GET /dlq` — List Dead Letters

List permanently failed webhook deliveries.

**Query Parameters**

| Param | Required | Description |
|---|---|---|
| `instanceId` | No | Filter by session ID |

**Response**

```json
{
  "success": true,
  "data": [
    {
      "id": "01923abc-def0-7891-2345-67890abcdef0",
      "instance_id": "my-session",
      "sequence": 3842,
      "webhook_url": "https://your-app.com/webhook/whatsapp",
      "payload": "{ ... }",
      "attempts": 6,
      "last_error": "Request failed with status code 503",
      "created_at": 1719000000000,
      "failed_at": 1719000900000
    }
  ]
}
```

### `POST /dlq/:id/replay` — Replay Dead Letter

Re-enqueue a dead letter for delivery.

**Response**

```json
{
  "success": true,
  "data": { "replayed": true, "id": "01923abc-def0-..." }
}
```

### `DELETE /dlq/:id` — Discard Dead Letter

Permanently delete a dead letter.

**Response**

```json
{
  "success": true,
  "data": { "deleted": true, "id": "01923abc-def0-..." }
}
```

---

# Webhook Consumer Guide

This section describes how to receive events from the Gateway via webhooks.

The Gateway acts as a synchronization service. It does **not** store business data. All events are forwarded to your application via HTTP webhooks.

## Implementing Your Webhook Endpoint

Your endpoint must:

- Accept `POST` requests with JSON body.
- Return HTTP `200`, `201`, or `202` to acknowledge receipt.
- Respond within **10 seconds**.

Any other response (or timeout) triggers automatic retries.

---

## Event Envelope

Every webhook delivery uses the same standardized envelope:

```json
{
  "eventId": "01923abc-def0-7891-2345-67890abcdef0",
  "instanceId": "my-session",
  "sequence": 3842,
  "historySessionId": "01923abc-1234-5678-abcd-ef0123456789",
  "historySync": false,
  "event": "messages.created",
  "timestamp": 1719000000000,
  "payload": { ... }
}
```

| Field | Type | Description |
|---|---|---|
| `eventId` | string (UUIDv7) | Unique, time-ordered. Use as idempotency key. |
| `instanceId` | string | Session that produced the event. |
| `sequence` | number | Monotonically increasing per pipeline. Use to verify ordering. |
| `historySessionId` | string \| null | Present only on sync events. Correlates all events from one history sync. |
| `historySync` | boolean | `true` for history events, `false` for realtime. Metadata only — both pipelines are identical. |
| `event` | string | Event name (see Event Reference). |
| `timestamp` | number | Epoch milliseconds when envelope was created. |
| `payload` | object | Event-specific data. |

---

## HTTP Headers

Every delivery includes these headers:

| Header | Example | Description |
|---|---|---|
| `Content-Type` | `application/json` | Always JSON. |
| `X-Instance-Id` | `my-session` | Session ID. |
| `X-Event` | `messages.created` | Event name. |
| `X-Timestamp` | `1719000000000` | Envelope timestamp. |
| `X-Sequence` | `3842` | Sequence number. |
| `X-Delivery-Id` | `01923abc-...` | Same as `eventId` in body. |
| `X-Signature` | `sha256=abc123...` | HMAC-SHA256 signature (only if secret configured). |

---

## Signature Verification

If you configured a `secret`, every delivery is signed with HMAC-SHA256.

### Verification (Node.js)

```ts
import { createHmac } from 'crypto'

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
  return signature === expected
}

// In your webhook handler:
app.post('/webhook/whatsapp', (req, res) => {
  const signature = req.headers['x-signature'] as string
  const rawBody = req.rawBody // must be the raw JSON string

  if (!verifySignature(rawBody, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  // Process event...
  res.status(200).json({ ok: true })
})
```

### Verification (Python)

```python
import hmac, hashlib

def verify_signature(body: str, signature: str, secret: str) -> bool:
    expected = 'sha256=' + hmac.new(
        secret.encode(), body.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

---

## Event Reference

### History Sync Events

Emitted once when a new device is paired. Multiple chunks may arrive.
All history sync events include `historySync: true`.

#### `history.progress`

```json
{
  "event": "history.progress",
  "historySync": true,
  "historySessionId": "01923abc-...",
  "payload": { "progress": 45 }
}
```

#### `chats.sync`

```json
{
  "event": "chats.sync",
  "historySync": true,
  "historySessionId": "01923abc-...",
  "payload": [
    {
      "jid": "6281234567890@s.whatsapp.net",
      "name": "John Doe",
      "unreadCount": 3,
      "lastMessageTimestamp": 1719000000,
      "archived": false,
      "pinned": true,
      "muted": false,
      "ephemeral": false,
      "isGroup": false
    }
  ]
}
```

Batch size: up to **200 chats** per delivery.

#### `messages.sync`

```json
{
  "event": "messages.sync",
  "historySync": true,
  "historySessionId": "01923abc-...",
  "payload": [
    {
      "key": {
        "remoteJid": "6281234567890@s.whatsapp.net",
        "id": "3EB0C4A2B1F4",
        "fromMe": false,
        "participant": null
      },
      "chatJid": "6281234567890@s.whatsapp.net",
      "fromMe": false,
      "sender": "6281234567890@s.whatsapp.net",
      "pushName": "John",
      "messageTimestamp": 1719000000,
      "messageType": "conversation",
      "content": { "type": "conversation", "text": "Hello!" }
    }
  ]
}
```

Batch size: up to **250 messages** per delivery.

#### `history.finished`

```json
{
  "event": "history.finished",
  "historySync": true,
  "historySessionId": "01923abc-...",
  "payload": {}
}
```

After this event, you can assume the initial import is complete. Realtime events have been flowing independently throughout the sync.

---

### Realtime Events

Emitted for all new activity. Delivered independently of history sync — **never delayed**.

#### `messages.created`

```json
{
  "event": "messages.created",
  "payload": {
    "type": "notify",
    "messages": [
      {
        "key": { "remoteJid": "6281234567890@s.whatsapp.net", "id": "ABC123", "fromMe": false },
        "chatJid": "6281234567890@s.whatsapp.net",
        "fromMe": false,
        "pushName": "John",
        "messageTimestamp": 1719000000,
        "messageType": "extendedTextMessage",
        "content": { "type": "extendedTextMessage", "text": "How are you?" }
      }
    ],
    "contacts": [
      {
        "wa_id": "6281234567890",
        "profile": { "name": "John" }
      }
    ]
  }
}
```

The `contacts` array is included only when non-empty. Each entry contains:

| Field | Type | Description |
|---|---|---|
| `wa_id` | string | Phone number extracted from JID |
| `profile.name` | string | Best available display name |

Display name priority: `verifiedName` → `notify` → `name` → `pushName` → phone number.

Contacts are resolved lazily: first seen via message, enriched over time by `contacts.upsert` and `contacts.update` events (which are store-only and do not emit webhooks).

##### Media Messages

When a media message is received, the `content` field includes metadata and `hasMedia: true`. Use the message ID to download the binary.

**Image message example:**

```json
{
  "messageType": "imageMessage",
  "content": {
    "type": "imageMessage",
    "hasMedia": true,
    "caption": "foto liburan",
    "mimetype": "image/jpeg",
    "fileLength": 245120,
    "width": 960,
    "height": 1280
  }
}
```

**Video message example:**

```json
{
  "messageType": "videoMessage",
  "content": {
    "type": "videoMessage",
    "hasMedia": true,
    "caption": "check this out",
    "mimetype": "video/mp4",
    "fileLength": 5000000,
    "width": 1920,
    "height": 1080,
    "seconds": 30,
    "gifPlayback": false
  }
}
```

**Audio message example:**

```json
{
  "messageType": "audioMessage",
  "content": {
    "type": "audioMessage",
    "hasMedia": true,
    "mimetype": "audio/ogg; codecs=opus",
    "fileLength": 50000,
    "seconds": 15,
    "ptt": true
  }
}
```

**Document message example:**

```json
{
  "messageType": "documentMessage",
  "content": {
    "type": "documentMessage",
    "hasMedia": true,
    "caption": "monthly report",
    "fileName": "report.pdf",
    "mimetype": "application/pdf",
    "fileLength": 102400,
    "pageCount": 5
  }
}
```

**Other message types:**

| `messageType` | Key fields in `content` |
|---|---|
| `stickerMessage` | `mimetype`, `fileLength`, `width`, `height`, `isAnimated` |
| `locationMessage` | `latitude`, `longitude`, `name`, `address`, `isLive` |
| `contactMessage` | `displayName` |
| `contactsArrayMessage` | `displayName`, `contacts[]` |
| `pollCreationMessage` | `name`, `options[]`, `selectableOptionsCount` |
| `reactionMessage` | `text`, `key` |

**Downloading media:**

```bash
# Use the message ID from the webhook payload
curl -H "X-API-Key: your-api-key" \
  "http://localhost:3000/session/{sessionId}/messages/{messageId}/media" \
  --output media.file
```

> Media must be downloaded while the message is still in the store (last 500 messages per chat).

#### `messages.updated`

```json
{
  "event": "messages.updated",
  "payload": [
    {
      "key": { "remoteJid": "6281234567890@s.whatsapp.net", "id": "ABC123", "fromMe": true },
      "update": { "status": 4 }
    }
  ]
}
```

Status codes: `0` = error, `1` = pending, `2` = server received, `3` = delivered, `4` = read, `5` = played.

#### `messages.deleted`

```json
{
  "event": "messages.deleted",
  "payload": {
    "keys": [
      { "remoteJid": "6281234567890@s.whatsapp.net", "id": "ABC123", "fromMe": true }
    ]
  }
}
```

#### `messages.reaction`

```json
{
  "event": "messages.reaction",
  "payload": [
    {
      "key": { "remoteJid": "6281234567890@s.whatsapp.net", "id": "ABC123" },
      "reaction": { "text": "👍", "fromMe": false }
    }
  ]
}
```

#### `groups.updated`

```json
{
  "event": "groups.updated",
  "payload": [
    { "id": "120363012345678901@g.us", "subject": "New Group Name" }
  ]
}
```

#### `group-participants.updated`

```json
{
  "event": "group-participants.updated",
  "payload": {
    "groupJid": "120363012345678901@g.us",
    "author": "6281234567890@s.whatsapp.net",
    "action": "add",
    "participants": [
      { "jid": "6289876543210@s.whatsapp.net", "admin": null }
    ]
  }
}
```

Actions: `add`, `remove`, `promote`, `demote`.

#### `receipts.updated`

```json
{
  "event": "receipts.updated",
  "payload": [
    {
      "key": { "remoteJid": "6281234567890@s.whatsapp.net", "id": "ABC123" },
      "receipt": { "userJid": "6281234567890@s.whatsapp.net", "readTimestamp": 1719000000 }
    }
  ]
}
```

#### `connection.update`

```json
{
  "event": "connection.update",
  "payload": {
    "connection": "open",
    "hasQr": false,
    "lastDisconnect": null
  }
}
```

Connection values: `connecting`, `open`, `close`.

#### `blocklist.updated`

```json
{
  "event": "blocklist.updated",
  "payload": {
    "blocklist": ["6281234567890@s.whatsapp.net"]
  }
}
```

#### `call`

```json
{
  "event": "call",
  "payload": {
    "from": "6281234567890@s.whatsapp.net",
    "id": "CALL123",
    "status": "offer"
  }
}
```

---

## Idempotency & Ordering

### Idempotency

Every event has a unique `eventId` (UUIDv7). Use this as your idempotency key.

The gateway may redeliver events on retry. Always check:

```ts
if (await isEventProcessed(event.eventId)) {
  return res.status(200).json({ ok: true }) // already handled
}
await markEventProcessed(event.eventId)
// process event...
```

### Ordering

Events are delivered in sequence order per pipeline. History and realtime use **independent sequence counters**.

- **Within history**: events are ordered by sequence (1, 2, 3, ...)
- **Within realtime**: events are ordered by sequence (1, 2, 3, ...)
- **Between pipelines**: no ordering relationship

Use `historySync` and `sequence` together for ordering:

```ts
// Track sequence per pipeline
const lastSequence = {
  history: new Map(),
  realtime: new Map(),
};

function isOutOfOrder(event) {
  const pipeline = event.historySync ? 'history' : 'realtime';
  const last = lastSequence[pipeline].get(event.instanceId) || 0;
  if (event.sequence <= last) {
    // Duplicate or out-of-order — skip
    return true;
  }
  lastSequence[pipeline].set(event.instanceId, event.sequence);
  return false;
}
```

**Ordering guarantee:** Within each pipeline, event #9 is always delivered before event #10 for the same instance. No ordering guarantee between history and realtime pipelines.

---

## History Sync Flow

When a new device is paired, the gateway automatically synchronizes available history.

```
Pairing
  │
  ▼
history.progress { progress: 0 }
  │
  ▼
chats.sync       (batched, may arrive multiple times)
messages.sync    (batched, may arrive multiple times)
  │
  ▼
history.progress { progress: 50 }
  │
  ▼
chats.sync / messages.sync  (more chunks)
  │
  ▼
history.progress { progress: 100 }
  │
  ▼
history.finished

Note: Realtime events (messages.created, etc.) are delivered
IMMEDIATELY throughout this process — they are NEVER delayed.

Note: Contacts are NOT synced via history webhooks.
Contacts are resolved lazily when messages arrive and included
in the messages.created webhook payload.
```

**Important:**

- Multiple `chats.sync` and `messages.sync` events may arrive. Do not assume only one.
- All sync events share the same `historySessionId`. Use this to correlate them.
- **Realtime events are delivered immediately**, regardless of history sync status.
- Use `historySync: true/false` to distinguish history data from realtime data.
- History and realtime use **independent sequence counters**.

---

## Retry Policy & DLQ

### Retry Policy

If your endpoint returns anything other than `200`, `201`, or `202`:

| Attempt | Delay |
|---|---|
| 1 | immediate |
| 2 | 10 seconds |
| 3 | 30 seconds |
| 4 | 1 minute |
| 5 | 5 minutes |
| 6 | 15 minutes |

After 5 retries (6 total attempts), the event moves to the **Dead Letter Queue**.

### Dead Letter Queue

Permanently failed deliveries are stored in the DLQ. Inspect and replay them via API:

```bash
# List all dead letters
curl -H "X-API-Key: your-api-key" http://localhost:3000/dlq

# Filter by instance
curl -H "X-API-Key: your-api-key" "http://localhost:3000/dlq?instanceId=my-session"

# Replay (re-enqueue) a dead letter
curl -X POST -H "X-API-Key: your-api-key" http://localhost:3000/dlq/{id}/replay

# Discard a dead letter
curl -X DELETE -H "X-API-Key: your-api-key" http://localhost:3000/dlq/{id}
```

---

## Legacy Event Names

For backward compatibility, you can subscribe to legacy Baileys event names:

| Canonical (recommended) | Legacy (deprecated) |
|---|---|
| `messages.created` | `messages.upsert` |
| `messages.updated` | `messages.update` |
| `messages.deleted` | `messages.delete` |
| `groups.updated` | `groups.upsert` / `groups.update` |
| `group-participants.updated` | `group-participants.update` |
| `receipts.updated` | `message-receipt.update` |
| `blocklist.updated` | `blocklist.update` |

**Rules:**

- If you subscribe only to legacy names, you receive legacy names.
- If you subscribe only to canonical names, you receive canonical names.
- If you subscribe to both, you receive **canonical only** (no duplicates).
- If you omit the `events` filter, you receive **all events** using canonical names.

**Recommendation:** Migrate to canonical names. Legacy names will be removed in a future version.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `NODE_ENV` | `development` | `development`, `production`, `test` |
| `BASE_URL` | `/` | API route prefix (e.g., `/api/v1`) |
| `API_KEY` | — | **Required.** Min 16 chars. Used in `X-API-Key` header. |
| `SESSIONS_DIR` | `./sessions` | Directory for session auth data |
| `WEBHOOK_DIR` | `./webhooks` | Directory for webhook persistence |
| `DB_PATH` | `./data/gateway.db` | SQLite database path |
| `WEBHOOK_MAX_RETRIES` | `5` | Max retry attempts (1–10) |
| `WEBHOOK_BATCH_MESSAGES` | `250` | Max messages per batch delivery |
| `WEBHOOK_BATCH_CHATS` | `200` | Max chats per batch delivery |
| `CONTACT_CACHE_SIZE` | `1000` | Max contacts in LRU memory cache |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `LOG_PRETTY` | `true` | Pretty-print logs |
| `DOCS_ENABLED` | `true` | Enable Swagger UI and docs site |

---

## Quick Start Examples

### Create a session and send a text message

```bash
# 1. Create session
curl -X POST http://localhost:3000/session \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{ "id": "my-session" }'

# 2. Connect (start QR flow)
curl -X POST http://localhost:3000/session/my-session/connect \
  -H "X-API-Key: your-api-key"

# 3. Get QR code (scan with WhatsApp)
curl http://localhost:3000/session/my-session/qr?format=base64 \
  -H "X-API-Key: your-api-key"

# 4. Register webhook
curl -X POST http://localhost:3000/session/my-session/webhook \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhook/whatsapp",
    "secret": "your-hmac-secret-min-16-chars",
    "events": ["messages.created", "connection.update"]
  }'

# 5. Send a text message
curl -X POST http://localhost:3000/session/my-session/send \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "to": "6281234567890@s.whatsapp.net",
    "text": "Hello from the Gateway!"
  }'
```

### Express webhook handler example

```ts
import express from 'express'
import { createHmac } from 'crypto'

const app = express()
const SECRET = process.env.WEBHOOK_SECRET!

// IMPORTANT: use raw body for signature verification
app.post('/webhook/whatsapp', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-signature'] as string
  const expected = 'sha256=' + createHmac('sha256', SECRET).update(req.body).digest('hex')

  if (signature !== expected) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const event = JSON.parse(req.body.toString())

  // Idempotency check
  if (await isEventProcessed(event.eventId)) {
    return res.status(200).json({ ok: true })
  }

  switch (event.event) {
    case 'chats.sync':
      await importChats(event.instanceId, event.payload)
      break
    case 'messages.sync':
      await importMessages(event.instanceId, event.payload)
      break
    case 'history.finished':
      await markInstanceReady(event.instanceId)
      break
    case 'messages.created':
      // event.payload.contacts contains resolved contact info (if available)
      await handleNewMessage(event.instanceId, event.payload)
      break
    case 'messages.updated':
      await handleMessageUpdate(event.instanceId, event.payload)
      break
    // ... handle other events
  }

  await markEventProcessed(event.eventId)
  res.status(200).json({ ok: true })
})
```

---

## Endpoint Summary

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| 1 | `GET` | `/health` | — | Health check |
| 2 | `POST` | `/session` | 🔑 | Create session |
| 3 | `GET` | `/session` | 🔑 | List all sessions |
| 4 | `POST` | `/session/:id/connect` | 🔑 | Connect session (QR flow) |
| 5 | `GET` | `/session/:id/status` | 🔑 | Get session status |
| 6 | `GET` | `/session/:id/qr` | 🔑 | Get QR code |
| 7 | `DELETE` | `/session/:id` | 🔑 | Delete session |
| 8 | `POST` | `/session/:id/send` | 🔑 | Send message (14 types) |
| 9 | `PATCH` | `/session/:id/message` | 🔑 | Edit message |
| 10 | `DELETE` | `/session/:id/message` | 🔑 | Delete message |
| 11 | `GET` | `/session/:id/messages/:messageId/media` | 🔑 | Download media binary |
| 12 | `GET` | `/session/:id/contact/:jid` | 🔑 | Get contact info |
| 12 | `GET` | `/session/:id/group` | 🔑 | List groups |
| 13 | `POST` | `/session/:id/group` | 🔑 | Create group |
| 14 | `GET` | `/session/:id/group/:jid` | 🔑 | Get group metadata |
| 15 | `PATCH` | `/session/:id/group/:jid/subject` | 🔑 | Update group name |
| 16 | `PATCH` | `/session/:id/group/:jid/description` | 🔑 | Update group description |
| 17 | `POST` | `/session/:id/group/:jid/participants/add` | 🔑 | Add participants |
| 18 | `POST` | `/session/:id/group/:jid/participants/remove` | 🔑 | Remove participants |
| 19 | `POST` | `/session/:id/group/:jid/participants/promote` | 🔑 | Promote to admin |
| 20 | `POST` | `/session/:id/group/:jid/participants/demote` | 🔑 | Demote from admin |
| 21 | `POST` | `/session/:id/group/:jid/leave` | 🔑 | Leave group |
| 22 | `GET` | `/session/:id/group/:jid/invite` | 🔑 | Get invite code |
| 23 | `POST` | `/session/:id/group/:jid/invite/revoke` | 🔑 | Revoke invite code |
| 24 | `POST` | `/session/:id/group-invite/:code/join` | 🔑 | Join group via invite |
| 25 | `GET` | `/session/:id/group-invite/:code` | 🔑 | Preview group by invite |
| 26 | `PATCH` | `/session/:id/group/:jid/settings` | 🔑 | Update group settings |
| 27 | `POST` | `/session/:id/webhook` | 🔑 | Register/update webhook |
| 28 | `GET` | `/session/:id/webhook` | 🔑 | Get webhook config |
| 29 | `DELETE` | `/session/:id/webhook` | 🔑 | Remove webhook |
| 30 | `GET` | `/dlq` | 🔑 | List dead letters |
| 31 | `POST` | `/dlq/:id/replay` | 🔑 | Replay dead letter |
| 32 | `DELETE` | `/dlq/:id` | 🔑 | Discard dead letter |
