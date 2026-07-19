---
title: Getting Started
description: Get up and running with WhatsApp Gateway in 5 minutes
---

## Prerequisites

Before you begin, make sure you have:

- **Node.js** 18.14.1 or later
- **npm**, **yarn**, or **pnpm** package manager
- A **WhatsApp account** on your phone

## Step 1: Install the Gateway

Choose your preferred package manager:

```bash
# npm
npm install whatsapp-gateway

# yarn
yarn add whatsapp-gateway

# pnpm
pnpm add whatsapp-gateway
```

Or use Docker:

```bash
docker pull whatsapp-gateway:latest
```

## Step 2: Configure Environment

Create a `.env` file in your project root:

```bash
cp .env.example .env
```

Edit the `.env` file with your settings:

```bash
# Server
PORT=3000
HOST=0.0.0.0

# API Base URL (prefix for all API routes)
BASE_URL=/

# Authentication (minimum 16 characters)
API_KEY=your-secure-api-key-here

# Database
DB_PATH=./data/gateway.db

# Sessions directory
SESSIONS_DIR=./sessions
```

> [!warning]
> Keep your `API_KEY` secret. Never commit it to version control.

## Step 3: Start the Server

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

You should see:

```
Server running on http://0.0.0.0:3000
API documentation: http://0.0.0.0:3000/docs
```

## Step 4: Create Your First Session

```bash
curl -X POST http://localhost:3000/session \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secure-api-key-here" \
  -d '{"id": "my-session"}'
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "my-session",
    "state": "connecting"
  }
}
```

## Step 5: Pair Your Phone

### Option A: QR Code

1. Get the QR code:

```bash
curl http://localhost:3000/session/my-session/qr \
  -H "X-API-Key: your-secure-api-key-here" \
  -o qr.png
```

2. Open the QR code image
3. Open WhatsApp on your phone
4. Go to **Settings > Linked Devices > Link a Device**
5. Scan the QR code

### Option B: Pairing Code

1. Get the pairing code:

```bash
curl -X POST http://localhost:3000/session/my-session/connect \
  -H "X-API-Key: your-secure-api-key-here"
```

2. Enter the 8-digit code on your phone

## Step 6: Send Your First Message

Once the session is connected:

```bash
curl -X POST http://localhost:3000/session/my-session/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secure-api-key-here" \
  -d '{
    "type": "text",
    "to": "6281234567890@s.whatsapp.net",
    "text": "Hello from WhatsApp Gateway!"
  }'
```

> [!info]
> The `to` field uses the WhatsApp JID format: `{phone_number}@s.whatsapp.net` for personal chats or `{group_id}@g.us` for groups.

## What's Next?

Now that you have a working session, explore:

- [Sessions Guide](/docs/sessions) - Advanced session management
- [Sending Messages](/docs/messages) - All message types
- [Webhooks](/docs/webhooks) - Receive incoming messages
- [History Sync](/docs/history-sync) - Sync existing chats

---

> [!tip]
> Check the [API Reference](/reference) for the complete list of endpoints and parameters.
