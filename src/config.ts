import { z } from 'zod'

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  API_KEY: z.string().min(16, 'API_KEY must be at least 16 characters'),

  SESSIONS_DIR: z.string().default('./sessions'),
  WEBHOOK_DIR: z.string().default('./webhooks'),
  WEBHOOK_MAX_RETRIES: z.coerce.number().min(0).max(10).default(3),
  WEBHOOK_RETRY_DELAY_MS: z.coerce.number().min(100).max(30_000).default(1000),

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
