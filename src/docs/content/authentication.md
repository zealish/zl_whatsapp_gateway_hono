---
title: Authentication
description: Learn how to authenticate API requests
---

## API Key Authentication

All API endpoints (except health check) require authentication via an API key.

### Setting Up the API Key

1. Generate a secure API key (minimum 16 characters):

```bash
# Generate a random key
openssl rand -base64 32
```

2. Add to your `.env` file:

```bash
API_KEY=your-generated-key-here
```

### Using the API Key

Include the API key in the `X-API-Key` header with every request:

```bash
curl http://localhost:3000/session \
  -H "X-API-Key: your-api-key-here"
```

## Examples by Language

### cURL

```bash
curl http://localhost:3000/session \
  -H "X-API-Key: your-api-key-here"
```

### JavaScript (Fetch)

```javascript
const response = await fetch('http://localhost:3000/session', {
  headers: {
    'X-API-Key': 'your-api-key-here'
  }
});

const data = await response.json();
```

### JavaScript (Axios)

```javascript
import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'X-API-Key': 'your-api-key-here'
  }
});

const { data } = await client.get('/session');
```

### Python (Requests)

```python
import requests

headers = {
    'X-API-Key': 'your-api-key-here'
}

response = requests.get('http://localhost:3000/session', headers=headers)
data = response.json()
```

### PHP (cURL)

```php
<?php
$ch = curl_init('http://localhost:3000/session');
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'X-API-Key: your-api-key-here'
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
$data = json_decode($response, true);
curl_close($ch);
```

### Go

```go
package main

import (
    "fmt"
    "io"
    "net/http"
)

func main() {
    client := &http.Client{}
    req, _ := http.NewRequest("GET", "http://localhost:3000/session", nil)
    req.Header.Set("X-API-Key", "your-api-key-here")

    resp, _ := client.Do(req)
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    fmt.Println(string(body))
}
```

## Security Best Practices

### Key Management

- **Never commit API keys** to version control
- Use environment variables or secret managers
- Rotate keys periodically
- Use different keys for different environments

### Network Security

- Use HTTPS in production
- Restrict API access by IP address
- Use a reverse proxy with rate limiting

### Example: Secure Production Setup

```bash
# .env.production
API_KEY=${API_KEY}  # Use environment variable
BASE_URL=/api/v1
NODE_ENV=production
```

```nginx
# nginx.conf
server {
    listen 443 ssl;
    server_name api.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Error Responses

### Missing API Key

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "API key is required"
  }
}
```

### Invalid API Key

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key"
  }
}
```

## Public Endpoints

The following endpoints do not require authentication:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/docs` | GET | Documentation (if enabled) |
| `/reference` | GET | API Reference (if enabled) |

---

> [!warning]
> In production, consider disabling the documentation endpoints by setting `DOCS_ENABLED=false`.
