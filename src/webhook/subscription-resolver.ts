import type { WebhookEvent } from '../schemas/webhook.js'

/**
 * Canonical event → Legacy alias mapping.
 * Internal events always use canonical names.
 * Legacy names exist only at the subscription layer.
 */
const EVENT_ALIASES: Record<string, string> = {
  'messages.created': 'messages.upsert',
  'messages.updated': 'messages.update',
  'messages.deleted': 'messages.delete',
  'groups.updated': 'groups.upsert',
  'group-participants.updated': 'group-participants.update',
  'receipts.updated': 'message-receipt.update',
  'blocklist.updated': 'blocklist.update',
}

/**
 * Reverse: Legacy → Canonical.
 */
const LEGACY_TO_CANONICAL: Record<string, string> = Object.fromEntries(
  Object.entries(EVENT_ALIASES).map(([canonical, legacy]) => [legacy, canonical])
)

/**
 * Resolve which event name to deliver to a consumer.
 *
 * Rules:
 * 1. If subscribed to canonical → deliver canonical.
 * 2. If subscribed only to legacy alias → deliver legacy name.
 * 3. If subscribed to both → deliver canonical (dedup).
 * 4. If not subscribed → return null (skip).
 *
 * If no subscription filter is configured (events undefined/empty),
 * the consumer receives all events using canonical names.
 */
export function resolveEventName(
  canonicalEvent: string,
  subscribedEvents?: WebhookEvent[]
): string | null {
  // No filter = receive all events as canonical
  if (!subscribedEvents || subscribedEvents.length === 0) {
    return canonicalEvent
  }

  // Direct canonical match → deliver canonical
  if (subscribedEvents.includes(canonicalEvent as WebhookEvent)) {
    return canonicalEvent
  }

  // Legacy alias match → deliver the legacy name they subscribed to
  const legacyName = EVENT_ALIASES[canonicalEvent]
  if (legacyName && subscribedEvents.includes(legacyName as WebhookEvent)) {
    return legacyName
  }

  // Not subscribed
  return null
}

/**
 * Check if a canonical event has a legacy alias.
 */
export function hasLegacyAlias(canonicalEvent: string): boolean {
  return canonicalEvent in EVENT_ALIASES
}

/**
 * Get the canonical name for a legacy event.
 * Returns undefined if not a legacy event.
 */
export function toCanonical(legacyEvent: string): string | undefined {
  return LEGACY_TO_CANONICAL[legacyEvent]
}

/**
 * Get the legacy alias for a canonical event.
 * Returns undefined if no alias exists.
 */
export function toLegacy(canonicalEvent: string): string | undefined {
  return EVENT_ALIASES[canonicalEvent]
}
