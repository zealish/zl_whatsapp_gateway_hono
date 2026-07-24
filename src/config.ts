import { z } from 'zod'

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  BASE_URL: z
    .string()
    .default('/')
    .transform((v) => (v.startsWith('/') ? v : `/${v}`))
    .transform((v) => (v.endsWith('/') && v.length > 1 ? v.slice(0, -1) : v)),

  API_KEY: z.string().min(16, 'API_KEY must be at least 16 characters'),

  SESSIONS_DIR: z.string().default('./sessions'),
  WEBHOOK_DIR: z.string().default('./webhooks'),
  DB_PATH: z.string().default('./data/gateway.db'),
  WEBHOOK_MAX_RETRIES: z.coerce.number().min(1).max(10).default(5),
  WEBHOOK_BATCH_MESSAGES: z.coerce.number().min(1).max(1000).default(250),
  WEBHOOK_BATCH_CHATS: z.coerce.number().min(1).max(1000).default(200),

  CONTACT_CACHE_SIZE: z.coerce.number().min(100).max(10000).default(1000),

  PENDING_RESOLUTION_RETENTION_MS: z.coerce.number().min(60_000).max(86_400_000).default(86_400_000), // 24h default

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  LOG_PRETTY: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => v === true || v === 'true')
    .default(true),

  DOCS_ENABLED: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => v === true || v === 'true')
    .default(true),
})

export type Config = z.infer<typeof configSchema>

export function loadConfig(env: Record<string, unknown> = process.env): Config {
  const result = configSchema.safeParse(env)
  if (!result.success) {
    console.error('Invalid environment configuration:')
    console.error(result.error.format())
    process.exit(1)
  }
  return result.data
}

export const config = loadConfig()
