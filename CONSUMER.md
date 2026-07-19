# Webhook Consumer Integration Guide

This document describes how to integrate with the WhatsApp API Gateway as a webhook consumer.

The Gateway acts as a synchronization service. It does **not** store business data. All events are forwarded to your application via HTTP webhooks.

---

## Quick Start

### 1. Register a Webhook

```bash
curl -X POST http://localhost:3000/session/{id}/webhook \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhook/whatsapp",
    "secret": "your-hmac-secret-min-16-chars",
    "events": ["messages.created", "history.finished", "connection.update"]
  }'
```

### 2. Implement the Endpoint

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
  "event": "messages.created",
  "timestamp": 1719000000000,
  "payload": { ... }
}
```

| Field | Type | Description |
|---|---|---|
| `eventId` | string (UUIDv7) | Unique, time-ordered. Use as idempotency key. |
| `instanceId` | string | Session that produced the event. |
| `sequence` | number | Monotonically increasing per instance. Use to verify ordering. |
| `historySessionId` | string \| null | Present only on sync events. Correlates all events from one history sync. |
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

#### `history.progress`

```json
{
  "event": "history.progress",
  "historySessionId": "01923abc-...",
  "payload": { "progress": 45 }
}
```

#### `contacts.sync`

```json
{
  "event": "contacts.sync",
  "historySessionId": "01923abc-...",
  "payload": [
    {
      "jid": "6281234567890@s.whatsapp.net",
      "name": "John Doe",
      "notify": "John",
      "username": "johndoe",
      "imgUrl": "https://...",
      "status": "Available"
    }
  ]
}
```

Batch size: up to **500 contacts** per delivery.

#### `chats.sync`

```json
{
  "event": "chats.sync",
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
  "historySessionId": "01923abc-...",
  "payload": {}
}
```

After this event, you can assume the initial import is complete. Realtime events will follow.

---

### Realtime Events

Emitted for all new activity after history sync completes.

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
    ]
  }
}
```

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

#### `contacts.updated`

```json
{
  "event": "contacts.updated",
  "payload": [
    { "id": "6281234567890@s.whatsapp.net", "name": "John Doe", "notify": "John" }
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

---

## Idempotency

Every event has a unique `eventId` (UUIDv7). Use this as your idempotency key.

The gateway may redeliver events on retry. Always check:

```ts
if (await isEventProcessed(event.eventId)) {
  return res.status(200).json({ ok: true }) // already handled
}
await markEventProcessed(event.eventId)
// process event...
```

---

## Ordering

Events are delivered in sequence order per instance. Use the `sequence` field to verify:

```ts
const lastSequence = await getLastSequence(event.instanceId)
if (event.sequence <= lastSequence) {
  // Duplicate or out-of-order — skip
  return res.status(200).json({ ok: true })
}
await saveLastSequence(event.instanceId, event.sequence)
```

**Ordering guarantee:** Event #9 is always delivered before event #10 for the same instance.

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
contacts.sync    (batched, may arrive multiple times)
chats.sync       (batched, may arrive multiple times)
messages.sync    (batched, may arrive multiple times)
  │
  ▼
history.progress { progress: 50 }
  │
  ▼
contacts.sync / chats.sync / messages.sync  (more chunks)
  │
  ▼
history.progress { progress: 100 }
  │
  ▼
history.finished
  │
  ▼
messages.created  (realtime events begin)
messages.updated
...
```

**Important:**

- Multiple `contacts.sync`, `chats.sync`, `messages.sync` events may arrive. Do not assume only one.
- All sync events share the same `historySessionId`. Use this to correlate them.
- Realtime events are **buffered** during sync and delivered **after** `history.finished`.
- This preserves chronological ordering.

---

## Retry Policy

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

---

## Dead Letter Queue

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
| `contacts.updated` | `contacts.upsert` / `contacts.update` |
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

## Example: Express Webhook Handler

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
    case 'contacts.sync':
      await importContacts(event.instanceId, event.payload)
      break
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
