import type { LidMappingStore } from './lid-mapping.js'

/**
 * Resolve a single JID value to its canonical form.
 *
 * Rules:
 * - null/undefined/empty → ''
 * - status@broadcast → 'status@broadcast'
 * - *@g.us → passthrough (strip device suffix only)
 * - *@lid → resolve via mapping → bare phone. Unresolved → return original
 * - *@s.whatsapp.net → extract phone, check disguised LID → bare phone
 * - Any other string → passthrough
 *
 * @param value - Raw JID string from Baileys
 * @param lidMapping - Optional LID mapping store for resolution
 * @returns Bare phone number, @g.us JID, status@broadcast, or original if unresolvable
 */
export function resolveIdentifier(
  value: string | null | undefined,
  lidMapping?: LidMappingStore | null
): string {
  if (!value || typeof value !== 'string') return ''

  // status@broadcast — preserve as-is
  if (value === 'status@broadcast') return value

  // @g.us — group, preserve with suffix, strip device suffix only
  if (value.endsWith('@g.us')) {
    return stripDeviceSuffix(value, '@g.us')
  }

  // @broadcast — preserve as-is (e.g. status@broadcast already handled above)
  if (value.endsWith('@broadcast')) return value

  // @lid → resolve via mapping → bare phone
  if (value.endsWith('@lid')) {
    if (lidMapping) {
      const resolved = lidMapping.resolveLid(value)
      if (resolved) return extractPhone(resolved)
    }
    // Unresolvable — return original @lid (signals unresolved to caller)
    return value
  }

  // @s.whatsapp.net → extract phone, check disguised LID
  if (value.endsWith('@s.whatsapp.net')) {
    const atIndex = value.indexOf('@')
    const localPart = value.substring(0, atIndex)
    const colonIndex = localPart.indexOf(':')
    const number = colonIndex > 0 ? localPart.substring(0, colonIndex) : localPart

    // Check if this number is actually a LID disguised as @s.whatsapp.net
    if (lidMapping) {
      const resolved = lidMapping.resolveLid(`${number}@lid`)
      if (resolved) return extractPhone(resolved)
    }

    // Normal phone JID — return bare phone
    return number
  }

  // Any other string — passthrough
  return value
}

/**
 * Result of a deep identifier resolution.
 */
export interface ResolveResult {
  /** The resolved payload (identifiers replaced with bare phones) */
  payload: unknown
  /** true if all identifiers were resolved successfully */
  resolved: boolean
  /** List of @lid values that could not be resolved */
  unresolvedLids: string[]
}

/**
 * Deep-resolve all identifier strings in an object/array tree.
 *
 * Traverses all object values and array elements recursively.
 * For each string value that looks like a JID (contains '@'),
 * applies resolveIdentifier() to replace it with a bare phone number.
 *
 * @param obj - Payload to resolve (object, array, or primitive)
 * @param lidMapping - Optional LID mapping store for resolution
 * @returns { payload, resolved, unresolvedLids }
 */
export function resolveIdentifiersDeep(
  obj: unknown,
  lidMapping?: LidMappingStore | null
): ResolveResult {
  const unresolvedLids: string[] = []
  const payload = resolveDeep(obj, lidMapping, unresolvedLids)
  return {
    payload,
    resolved: unresolvedLids.length === 0,
    unresolvedLids,
  }
}

// ── Internal helpers ──

/**
 * Extract bare phone number from a JID string.
 * Handles @s.whatsapp.net and device suffixes.
 *
 * '6281234567890@s.whatsapp.net' → '6281234567890'
 * '6281234567890:0@s.whatsapp.net' → '6281234567890'
 * '6281234567890' → '6281234567890'
 */
function extractPhone(jid: string): string {
  const atIndex = jid.indexOf('@')
  if (atIndex === -1) return jid

  const localPart = jid.substring(0, atIndex)
  const colonIndex = localPart.indexOf(':')
  return colonIndex > 0 ? localPart.substring(0, colonIndex) : localPart
}

/**
 * Strip device suffix from a JID while preserving the domain.
 * '120363012345678901:0@g.us' → '120363012345678901@g.us'
 */
function stripDeviceSuffix(jid: string, suffix: string): string {
  const atIndex = jid.indexOf('@')
  if (atIndex === -1) return jid

  const localPart = jid.substring(0, atIndex)
  const colonIndex = localPart.indexOf(':')
  const number = colonIndex > 0 ? localPart.substring(0, colonIndex) : localPart
  return `${number}${suffix}`
}

/**
 * Recursive traversal worker.
 */
function resolveDeep(
  value: unknown,
  lidMapping: LidMappingStore | null | undefined,
  unresolvedLids: string[]
): unknown {
  if (value == null) return value

  if (typeof value === 'string') {
    // Only attempt resolution if the string contains '@' (potential JID)
    if (!value.includes('@')) return value

    const resolved = resolveIdentifier(value, lidMapping)

    // Track unresolved @lid values — strip to empty string so payload never leaks @lid
    if (resolved.endsWith('@lid')) {
      unresolvedLids.push(resolved)
      return ''
    }

    return resolved
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveDeep(item, lidMapping, unresolvedLids))
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = resolveDeep(val, lidMapping, unresolvedLids)
    }
    return result
  }

  // Primitives (number, boolean, bigint, symbol) — passthrough
  return value
}
