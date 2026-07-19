---
title: Webhooks
description: Configure webhooks to receive real-time events
---

## Overview

Webhooks allow you to receive real-time notifications when events occur in your WhatsApp sessions. Instead of polling the API, you can register a URL and the Gateway will POST events to your server.

## Webhook Events

| Event | Description |
|-------|-------------|
| `messages.created` | New message received |
| `messages.updated` | Message status updated |
| `messages.deleted` | Message deleted |
| `messages.reaction` | Reaction added/removed |
| `contacts.updated` | Contact info updated |
| `contacts.sync` | Contact synced (history) |
| `groups.updated` | Group info updated |
| `group-participants.updated` | Group members changed |
| `connection.update` | Connection state changed |
| `history.finished` | History sync completed |

## Configure Webhook

```bash
curl -X POST http://localhost:3000/session/my-session/webhook \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "url": "https://your-server.com/webhook",
    "secret": "your-webhook-secret-min-16-chars",
    "events": ["messages.created", "connection.update"]
  }'
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Webhook endpoint URL |
| `secret` | string | No | HMAC signing secret (min 16 chars) |
| `events` | string[] | No | Events to subscribe (all if empty) |

## Webhook Payload

Every webhook delivery uses a standard envelope:

```json
{
  "eventId": "01923abc-def0-7891-2345-67890abcdef0",
  "instanceId": "my-session",
  "sequence": 3842,
  "event": "messages.created",
  "timestamp": 1719000000000,
  "payload": {
    // Event-specific data
  }
}
```

### Delivery Headers

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Instance-Id` | Session ID |
| `X-Event` | Event name |
| `X-Timestamp` | Envelope timestamp |
| `X-Sequence` | Sequence number |
| `X-Delivery-Id` | Event ID (UUIDv7) |
| `X-Signature` | HMAC-SHA256 signature |

## Signature Verification

If you configured a `secret`, verify the webhook signature:

### Node.js

```javascript
import crypto from 'crypto';

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}

// In your webhook handler
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-signature'];
  const isValid = verifyWebhookSignature(
    JSON.stringify(req.body),
    signature,
    process.env.WEBHOOK_SECRET
  );
  
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process webhook...
  res.status(200).json({ received: true });
});
```

### Python

```python
import hmac
import hashlib

def verify_signature(payload: str, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return signature == f"sha256={expected}"
```

### PHP

```php
function verifySignature(string $payload, string $signature, string $secret): bool {
    $expected = 'sha256=' . hash_hmac('sha256', $payload, $secret);
    return hash_equals($expected, $signature);
}
```

## Retry Policy

Failed webhook deliveries are automatically retried:

| Attempt | Delay |
|---------|-------|
| 1 | Immediate |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 15 minutes |
| 5 | 1 hour |

After 5 failed attempts, the delivery is moved to the Dead Letter Queue (DLQ).

## Dead Letter Queue

Inspect and replay failed deliveries:

```bash
# List failed deliveries
curl http://localhost:3000/dlq \
  -H "X-API-Key: your-api-key"

# Replay a delivery
curl -X POST http://localhost:3000/dlq/{id}/replay \
  -H "X-API-Key: your-api-key"
```

## Event Ordering

Events include a `sequence` number for ordering verification:

```json
{
  "sequence": 3842,
  "instanceId": "my-session"
}
```

Events are delivered in order per instance. If you receive out-of-order events, use the sequence number to reorder them.

## Idempotency

Each event has a unique `eventId` (UUIDv7). Use this for idempotent processing:

```javascript
const processedEvents = new Set();

function handleWebhook(event) {
  if (processedEvents.has(event.eventId)) {
    return; // Already processed
  }
  
  // Process event...
  
  processedEvents.add(event.eventId);
}
```

## Example: Message Handler

```javascript
app.post('/webhook', async (req, res) => {
  const { event, payload } = req.body;
  
  switch (event) {
    case 'messages.created':
      const { key, message } = payload;
      console.log(`New message from ${key.remoteJid}: ${message.conversation}`);
      
      // Auto-reply
      if (message.conversation === '!ping') {
        await fetch(`http://localhost:3000/session/${req.headers['x-instance-id']}/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.API_KEY
          },
          body: JSON.stringify({
            type: 'text',
            to: key.remoteJid,
            text: 'Pong! 🏓'
          })
        });
      }
      break;
      
    case 'connection.update':
      console.log(`Connection state: ${payload.state}`);
      break;
  }
  
  res.status(200).json({ received: true });
});
```

## Security Best Practices

1. **Always use HTTPS** for webhook endpoints
2. **Verify signatures** to prevent spoofing
3. **Return 200 quickly** - process events asynchronously
4. **Use idempotency** - handle duplicate deliveries
5. **Monitor the DLQ** - check for persistent failures

---

> [!tip]
> Use a tool like [ngrok](https://ngrok.com/) for local webhook development:
> ```bash
> ngrok http 3001
> ```

View full API reference for [Webhook endpoints](/reference#tag/Webhook).
