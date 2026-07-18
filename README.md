# WhatsApp Gateway

REST API gateway for WhatsApp built with [Hono](https://hono.dev) and [Baileys](https://github.com/WhiskeySockets/Baileys).

## Features

- Multi-session WhatsApp connections
- Send text, media, and location messages
- Contact and group management
- Webhook support with configurable retry
- API key authentication
- Swagger/OpenAPI docs
- Structured logging with Pino

## Quick Start

```bash
# Install
npm install

# Configure
cp .env.example .env  # set API_KEY (min 16 chars)

# Dev
npm run dev

# Production
npm run build && npm start
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `NODE_ENV` | `development` | Environment mode |
| `API_KEY` | — | API key (min 16 chars, required) |
| `SESSIONS_DIR` | `./sessions` | Session storage path |
| `WEBHOOK_DIR` | `./webhooks` | Webhook config storage |
| `WEBHOOK_MAX_RETRIES` | `3` | Max webhook retry attempts |
| `WEBHOOK_RETRY_DELAY_MS` | `1000` | Delay between retries (ms) |
| `LOG_LEVEL` | `info` | Log level |
| `LOG_PRETTY` | `true` | Pretty print logs |
| `DOCS_ENABLED` | `true` | Enable Swagger UI |

## API Endpoints

### Public

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI (if enabled) |

### Protected (requires `x-api-key` header)

| Method | Path | Description |
|---|---|---|
| `POST` | `/session/create` | Create WhatsApp session |
| `GET` | `/session/status/:sessionId` | Get session status |
| `DELETE` | `/session/:sessionId` | Delete session |
| `GET` | `/session/qr/:sessionId` | Get QR code |
| `POST` | `/session/:sessionId/send` | Send message |
| `POST` | `/session/:sessionId/send-media` | Send media |
| `GET` | `/session/:sessionId/contacts` | List contacts |
| `GET` | `/session/:sessionId/groups` | List groups |
| `POST` | `/session/:sessionId/webhook` | Configure webhook |

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Hono
- **WhatsApp**: Baileys
- **Validation**: Zod
- **Logging**: Pino
- **Docs**: Swagger UI

## License

MIT
