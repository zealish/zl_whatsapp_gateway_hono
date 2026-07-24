import { describe, it, expect } from 'vitest'
import { resolveIdentifier, resolveIdentifiersDeep } from '../whatsapp/identifier-resolver.js'

// ── Mock LidMappingStore ──

function createMockMapping(entries: Record<string, string>) {
  return {
    resolveLid: (lid: string): string | null => {
      const phone = entries[lid]
      return phone ? `${phone}@s.whatsapp.net` : null
    },
  } as any
}

// ── resolveIdentifier ──

describe('resolveIdentifier', () => {
  describe('null/undefined/empty', () => {
    it('returns empty string for null', () => {
      expect(resolveIdentifier(null)).toBe('')
    })

    it('returns empty string for undefined', () => {
      expect(resolveIdentifier(undefined)).toBe('')
    })

    it('returns empty string for empty string', () => {
      expect(resolveIdentifier('')).toBe('')
    })
  })

  describe('status@broadcast', () => {
    it('preserves status@broadcast', () => {
      expect(resolveIdentifier('status@broadcast')).toBe('status@broadcast')
    })
  })

  describe('@g.us (groups)', () => {
    it('preserves group JID as-is', () => {
      expect(resolveIdentifier('120363012345678901@g.us')).toBe('120363012345678901@g.us')
    })

    it('strips device suffix from group JID', () => {
      expect(resolveIdentifier('120363012345678901:0@g.us')).toBe('120363012345678901@g.us')
    })
  })

  describe('@broadcast', () => {
    it('preserves other broadcast JIDs', () => {
      expect(resolveIdentifier('some@broadcast')).toBe('some@broadcast')
    })
  })

  describe('@s.whatsapp.net → bare phone', () => {
    it('strips @s.whatsapp.net suffix', () => {
      expect(resolveIdentifier('6281234567890@s.whatsapp.net')).toBe('6281234567890')
    })

    it('strips device suffix and @s.whatsapp.net', () => {
      expect(resolveIdentifier('6281234567890:0@s.whatsapp.net')).toBe('6281234567890')
    })

    it('strips large device suffix', () => {
      expect(resolveIdentifier('6281234567890:42@s.whatsapp.net')).toBe('6281234567890')
    })

    it('returns bare phone when mapping has no entry for it', () => {
      const mockMapping = createMockMapping({})
      expect(resolveIdentifier('6281234567890@s.whatsapp.net', mockMapping)).toBe('6281234567890')
    })

    it('resolves disguised LID number to bare phone', () => {
      const mockMapping = createMockMapping({ '121131029766161@lid': '6285790228428' })
      expect(resolveIdentifier('121131029766161@s.whatsapp.net', mockMapping)).toBe('6285790228428')
    })

    it('resolves disguised LID with device suffix', () => {
      const mockMapping = createMockMapping({ '121131029766161@lid': '6285790228428' })
      expect(resolveIdentifier('121131029766161:0@s.whatsapp.net', mockMapping)).toBe('6285790228428')
    })
  })

  describe('@lid resolution', () => {
    it('returns original @lid when no mapping store provided', () => {
      expect(resolveIdentifier('1234567890@lid')).toBe('1234567890@lid')
    })

    it('returns original @lid when mapping store has no mapping', () => {
      const mockMapping = createMockMapping({})
      expect(resolveIdentifier('1234567890@lid', mockMapping)).toBe('1234567890@lid')
    })

    it('resolves @lid to bare phone when mapping exists', () => {
      const mockMapping = createMockMapping({ '1234567890@lid': '6281234567890' })
      expect(resolveIdentifier('1234567890@lid', mockMapping)).toBe('6281234567890')
    })
  })

  describe('other strings (passthrough)', () => {
    it('passes through non-JID strings', () => {
      expect(resolveIdentifier('hello world')).toBe('hello world')
    })

    it('passes through plain numbers without @', () => {
      expect(resolveIdentifier('6281234567890')).toBe('6281234567890')
    })
  })
})

// ── resolveIdentifiersDeep ──

describe('resolveIdentifiersDeep', () => {
  const mockMapping = createMockMapping({
    '1234567890@lid': '6281234567890',
    '9999999999@lid': '6289999999999',
  })

  it('resolves flat object with JID values', () => {
    const input = {
      sender: '6281234567890@s.whatsapp.net',
      remoteJid: '6289999999999@s.whatsapp.net',
      id: 'msg123',
    }
    const result = resolveIdentifiersDeep(input, mockMapping)
    expect(result.resolved).toBe(true)
    expect(result.payload).toEqual({
      sender: '6281234567890',
      remoteJid: '6289999999999',
      id: 'msg123',
    })
    expect(result.unresolvedLids).toEqual([])
  })

  it('resolves nested objects', () => {
    const input = {
      key: {
        remoteJid: '6281234567890@s.whatsapp.net',
        participant: '6289999999999:0@s.whatsapp.net',
      },
      sender: '6281234567890@s.whatsapp.net',
    }
    const result = resolveIdentifiersDeep(input, mockMapping)
    expect(result.resolved).toBe(true)
    expect(result.payload).toEqual({
      key: {
        remoteJid: '6281234567890',
        participant: '6289999999999',
      },
      sender: '6281234567890',
    })
  })

  it('resolves arrays', () => {
    const input = [
      { jid: '6281234567890@s.whatsapp.net' },
      { jid: '6289999999999@s.whatsapp.net' },
    ]
    const result = resolveIdentifiersDeep(input, mockMapping)
    expect(result.resolved).toBe(true)
    expect(result.payload).toEqual([
      { jid: '6281234567890' },
      { jid: '6289999999999' },
    ])
  })

  it('resolves @lid values in objects', () => {
    const input = {
      sender: '1234567890@lid',
      name: 'Test User',
    }
    const result = resolveIdentifiersDeep(input, mockMapping)
    expect(result.resolved).toBe(true)
    expect(result.payload).toEqual({
      sender: '6281234567890',
      name: 'Test User',
    })
  })

  it('strips unresolved @lid values to empty string and tracks them', () => {
    const input = {
      sender: 'UNKNOWN_LID@lid',
      name: 'Test',
    }
    const result = resolveIdentifiersDeep(input, mockMapping)
    expect(result.resolved).toBe(false)
    expect(result.unresolvedLids).toEqual(['UNKNOWN_LID@lid'])
    expect(result.payload).toEqual({
      sender: '',
      name: 'Test',
    })
  })

  it('preserves @g.us group JIDs', () => {
    const input = {
      groupJid: '120363012345678901@g.us',
      participant: '6281234567890@s.whatsapp.net',
    }
    const result = resolveIdentifiersDeep(input, mockMapping)
    expect(result.resolved).toBe(true)
    expect(result.payload).toEqual({
      groupJid: '120363012345678901@g.us',
      participant: '6281234567890',
    })
  })

  it('preserves status@broadcast', () => {
    const input = { jid: 'status@broadcast' }
    const result = resolveIdentifiersDeep(input, mockMapping)
    expect(result.resolved).toBe(true)
    expect(result.payload).toEqual({ jid: 'status@broadcast' })
  })

  it('handles null/undefined/primitives', () => {
    expect(resolveIdentifiersDeep(null).payload).toBeNull()
    expect(resolveIdentifiersDeep(undefined).payload).toBeUndefined()
    expect(resolveIdentifiersDeep(42).payload).toBe(42)
    expect(resolveIdentifiersDeep(true).payload).toBe(true)
    expect(resolveIdentifiersDeep('hello').payload).toBe('hello')
  })

  it('handles strings without @ as passthrough', () => {
    const input = { name: 'John Doe', id: 'msg123' }
    const result = resolveIdentifiersDeep(input, mockMapping)
    expect(result.resolved).toBe(true)
    expect(result.payload).toEqual({ name: 'John Doe', id: 'msg123' })
  })

  it('handles deeply nested structures', () => {
    const input = {
      level1: {
        level2: {
          level3: [{ sender: '1234567890@lid' }],
        },
      },
    }
    const result = resolveIdentifiersDeep(input, mockMapping)
    expect(result.resolved).toBe(true)
    expect(result.payload).toEqual({
      level1: {
        level2: {
          level3: [{ sender: '6281234567890' }],
        },
      },
    })
  })

  it('resolves mixed resolved and unresolved in same object', () => {
    const input = {
      resolved: '1234567890@lid',
      unresolved: 'UNKNOWN@lid',
    }
    const result = resolveIdentifiersDeep(input, mockMapping)
    expect(result.resolved).toBe(false)
    expect(result.unresolvedLids).toEqual(['UNKNOWN@lid'])
    expect(result.payload).toEqual({
      resolved: '6281234567890',
      unresolved: '',
    })
  })

  it('works without mapping store', () => {
    const input = {
      sender: '6281234567890@s.whatsapp.net',
      lid: '1234567890@lid',
    }
    const result = resolveIdentifiersDeep(input)
    expect(result.resolved).toBe(false)
    expect(result.unresolvedLids).toEqual(['1234567890@lid'])
    expect(result.payload).toEqual({
      sender: '6281234567890',
      lid: '',
    })
  })
})
