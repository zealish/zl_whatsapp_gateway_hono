import { v7 as uuidv7 } from 'uuid'
import type { GatewayEventEnvelope } from './types.js'

/**
 * Create a standardized gateway event envelope.
 * All webhook payloads must pass through this factory.
 */
export function createEnvelope(
  instanceId: string,
  event: string,
  payload: unknown,
  sequence: number,
  historySessionId?: string,
  historySync?: boolean
): GatewayEventEnvelope {
  return {
    eventId: uuidv7(),
    instanceId,
    sequence,
    historySessionId,
    historySync,
    event,
    timestamp: Date.now(),
    payload,
  }
}
