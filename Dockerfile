# ── Stage 1: Build ──
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

# ── Stage 2: Production dependencies ──
FROM node:24-alpine AS prod-deps

RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

RUN pnpm install --prod --frozen-lockfile

# ── Stage 3: Runtime ──
FROM node:24-alpine

RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/docs ./docs

RUN mkdir -p /app/sessions /app/webhooks

EXPOSE 3000

CMD ["node", "dist/index.js"]
