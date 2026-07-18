import pino from 'pino'
import type { Config } from '../config.js'

export function createLogger(config: Config): pino.Logger {
  return pino({
    level: config.LOG_LEVEL,
    transport:
      config.NODE_ENV !== 'production' && config.LOG_PRETTY
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  })
}

export function createChildLogger(
  parent: pino.Logger,
  module: string
): pino.Logger {
  return parent.child({ module })
}
