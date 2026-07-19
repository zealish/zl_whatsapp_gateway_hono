# Feature: Developer Documentation Website

## Objective

Build a first-class Developer Documentation website for the WhatsApp Gateway.

The documentation should be designed for humans, while Swagger/OpenAPI remains the machine-readable API reference.

The goal is to provide an onboarding experience similar to Stripe, Discord, GitHub, Cloudflare, and Twilio.

---

# Vision

Separate documentation into two experiences.

```
Documentation
    ↓
Learn how the gateway works.

Reference
    ↓
See every endpoint and test APIs.
```

Documentation teaches.

OpenAPI references.

Swagger tests.

---

# Goals

- Easy onboarding for new developers.
- Explain concepts before endpoints.
- Beautiful and searchable documentation.
- Keep OpenAPI as the single source of API schemas.
- Avoid duplicating endpoint definitions.

---

# Non Goals

The documentation site should NOT replace Swagger.

Swagger remains responsible for:

- Try It Out
- OpenAPI JSON
- SDK generation
- Postman import
- Endpoint testing

---

# Documentation Structure

```
/
├── Home
├── Getting Started
├── Installation
├── Authentication
├── Sessions
├── Sending Messages
├── Receiving Messages
├── Webhooks
├── Webhook Events
├── History Sync
├── Media
├── Error Handling
├── Rate Limits
├── FAQ
├── Changelog
└── API Reference (Swagger)
```

---

# Navigation

Example sidebar:

```
Documentation

Getting Started
Installation
Authentication

Guides
Sessions
Messages
Media
History Sync
Webhooks

Reference
Webhook Events
Error Codes
API Reference

Resources
FAQ
Changelog
```

---

# Home Page

The landing page should explain:

- What the Gateway is.
- Core features.
- Why use it.
- Architecture overview.
- Quick links.

Example:

```
WhatsApp Gateway

Simple.
Reliable.
Developer Friendly.

Get Started →

View API Reference →
```

---

# Getting Started

Topics:

- Requirements
- Installation
- Environment variables
- Running locally
- Docker
- Creating first session

Goal:

A developer should have a connected WhatsApp session within 5 minutes.

---

# Installation

Include:

- npm
- Docker
- Docker Compose

Environment variables:

```
PORT

BASE_URL

DATABASE_URL

WEBHOOK_SECRET

...
```

---

# Authentication

Explain:

- API Key
- Authorization header
- Security recommendations

Examples:

```
curl

JavaScript

PHP

Python
```

---

# Sessions Guide

Explain:

- Create session
- Pair QR
- Pair code
- Session lifecycle
- Logout
- Delete session

Include diagrams.

---

# Messages Guide

Explain:

- Send text
- Send image
- Send video
- Send document
- Send location
- Send contact
- Send reaction

Each page should contain:

- explanation
- request
- response
- example

---

# Webhooks Guide

Explain:

- Configure webhook
- Verify signature
- Retry policy
- Ordering
- Idempotency

Include examples.

---

# Webhook Events

Every event should have its own page.

Example:

```
messages.created

Description

Payload

Example

Ordering

Retry behavior

Notes
```

Repeat for:

- messages.updated
- messages.deleted
- contacts.updated
- chats.updated
- history.started
- history.progress
- history.finished

---

# History Sync Guide

Explain:

```
Pair Device

↓

history.started

↓

contacts.sync

↓

chats.sync

↓

messages.sync

↓

history.finished

↓

Realtime
```

Explain:

- why history exists
- ordering
- buffering
- transition to realtime

---

# Error Handling

Explain:

- HTTP status codes
- Gateway errors
- WhatsApp errors
- Retryable errors
- Fatal errors

Include examples.

---

# Rate Limits

Explain:

- Request limits
- Webhook retries
- Queue behavior

---

# FAQ

Examples:

- Why didn't I receive old messages?
- Why is QR expired?
- How does history sync work?
- Can I reconnect sessions?
- Does the Gateway store messages?
- How do retries work?

---

# Changelog

Document:

- Breaking changes
- New features
- Deprecations

---

# API Reference

Swagger UI remains available.

Recommended route:

```
/reference
```

or

```
/api-reference
```

Avoid placing Swagger on the main documentation page.

---

# Documentation ↔ Swagger Integration

Every guide should contain:

```
View API Reference →
```

Example:

```
Create Session

Explanation...

Example...

View API Reference →
```

The link should jump directly to the corresponding Swagger endpoint.

Likewise, Swagger endpoint descriptions should include links back to the relevant guide.

Example:

```
See "Sessions Guide" for a complete walkthrough.
```

Documentation and Swagger should complement each other.

---

# Search

Support full-text search.

Search should cover:

- Guides
- Events
- Error codes
- Endpoints
- FAQ

---

# Copy Buttons

Every code block should include a copy button.

Supported examples:

- curl
- JavaScript
- TypeScript
- PHP
- Python
- Go

---

# Interactive Examples

Where appropriate:

- Request examples
- Response examples
- Webhook payload examples

Keep examples synchronized with OpenAPI schemas whenever possible.

---

# Code Generation

Where possible, generate request/response examples from OpenAPI to avoid duplication.

OpenAPI should remain the single source of truth.

---

# Versioning

Support future documentation versions.

Example:

```
v1

v2
```

Users should be able to switch versions.

---

# Dark Mode

Support:

- Light
- Dark
- System

---

# Responsive Design

Documentation must work well on:

- Desktop
- Tablet
- Mobile

---

# Performance

Goals:

- Static generation where possible.
- Fast page loads.
- Lazy-loaded assets.
- Minimal JavaScript.

---

# Recommended Tech Stack

Preferred:

- Vite
- Hono JSX
- Markdown (MDX if needed)
- Shiki for syntax highlighting

Alternative:

- Astro + Starlight
- Docusaurus
- Mintlify
- Fumadocs
- Nextra

The documentation should remain framework-independent as much as possible.

---

# Future Features

- Multi-language support.
- AI-powered documentation search.
- Interactive webhook simulator.
- SDK documentation.
- Downloadable Postman collection.
- Downloadable OpenAPI spec.
- Live examples.
- "Edit this page" links.
- Automatic changelog generation.

---

# Success Criteria

A new developer should be able to:

- Install the Gateway.
- Create a session.
- Pair WhatsApp.
- Send a message.
- Receive webhooks.
- Understand history sync.
- Troubleshoot common issues.

...without needing to inspect the source code or Swagger first.

Swagger should become the reference manual, while the documentation website becomes the primary learning experience.
