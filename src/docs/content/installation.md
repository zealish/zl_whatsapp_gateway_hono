---
title: Installation
description: Install WhatsApp Gateway using npm, Docker, or Docker Compose
---

## System Requirements

- **Node.js** 18.14.1+ (LTS recommended)
- **Memory** 512MB minimum, 1GB recommended
- **Storage** 100MB for application + space for session data

## npm Installation

### Global Install

```bash
npm install -g whatsapp-gateway
whatsapp-gateway
```

### Local Install

```bash
# Create project directory
mkdir my-whatsapp-gateway
cd my-whatsapp-gateway

# Initialize package
npm init -y

# Install
npm install whatsapp-gateway

# Create start script
echo 'import { start } from "whatsapp-gateway"; start();' > index.js
```

### Using pnpm (Recommended)

```bash
pnpm add whatsapp-gateway
```

## Docker Installation

### Pull Image

```bash
docker pull whatsapp-gateway:latest
```

### Run Container

```bash
docker run -d \
  --name whatsapp-gateway \
  -p 3000:3000 \
  -v $(pwd)/sessions:/app/sessions \
  -v $(pwd)/data:/app/data \
  -e API_KEY=your-secure-api-key-here \
  whatsapp-gateway:latest
```

### Docker Compose

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  gateway:
    image: whatsapp-gateway:latest
    container_name: whatsapp-gateway
    ports:
      - "3000:3000"
    volumes:
      - ./sessions:/app/sessions
      - ./data:/app/data
    environment:
      - PORT=3000
      - API_KEY=your-secure-api-key-here
      - DB_PATH=/app/data/gateway.db
      - SESSIONS_DIR=/app/sessions
    restart: unless-stopped
```

Start the service:

```bash
docker-compose up -d
```

## Build from Source

### Clone Repository

```bash
git clone https://github.com/yourusername/whatsapp-gateway.git
cd whatsapp-gateway
```

### Install Dependencies

```bash
pnpm install
```

### Build

```bash
pnpm build
```

### Run

```bash
pnpm start
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `NODE_ENV` | `development` | Environment mode |
| `BASE_URL` | `/` | API route prefix |
| `API_KEY` | (required) | Authentication key (min 16 chars) |
| `SESSIONS_DIR` | `./sessions` | Session storage directory |
| `DB_PATH` | `./data/gateway.db` | SQLite database path |
| `WEBHOOK_DIR` | `./webhooks` | Webhook config directory |
| `WEBHOOK_MAX_RETRIES` | `5` | Max webhook delivery retries |
| `LOG_LEVEL` | `info` | Log level (fatal/error/warn/info/debug/trace) |
| `LOG_PRETTY` | `true` | Pretty print logs |
| `DOCS_ENABLED` | `true` | Enable documentation UI |

## Verifying Installation

After starting the server, verify it's running:

```bash
# Health check
curl http://localhost:3000/health

# Expected response
{
  "success": true,
  "data": {
    "status": "ok",
    "uptime": 1.234,
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Permission Denied

```bash
# Fix session directory permissions
chmod -R 755 ./sessions
chmod -R 755 ./data
```

### Database Errors

```bash
# Remove corrupted database
rm ./data/gateway.db

# Restart the server
```

---

> [!tip]
> For production deployments, use a process manager like [PM2](https://pm2.keymetrics.io/) or run behind a reverse proxy like [Nginx](https://nginx.org/).
