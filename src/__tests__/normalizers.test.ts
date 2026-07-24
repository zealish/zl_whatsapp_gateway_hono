import { describe, it, expect } from 'vitest'
import {
  normalizeTimestamp,
  normalizeMessage,
  normalizeJid,
  extractPhoneFromJid,
  normalizeReaction,
  normalizeMessageDelete,
  normalizeReceiptUpdate,
  normalizeGroupParticipantsUpdate,
  normalizeGroup,
} from '../whatsapp/normalizers.js'

// ── Mock LidMappingStore ──

function createMockMapping(entries: Record<string, string>) {
  return {
    resolveLid: (lid: string): string | null => {
      const phone = entries[lid]
      return phone ? `${phone}@s.whatsapp.net` : null
    },
  } as any
}

describe('normalizeTimestamp', () => {
  // ── Protobuf Long ──

  describe('protobuf Long (assumed seconds)', () => {
    it('converts Long in seconds to milliseconds', () => {
      const long = { toNumber: () => 1700000000 }
      expect(normalizeTimestamp(long)).toBe(1_700_000_000_000)
    })

    it('converts small Long values (early WhatsApp era)', () => {
      const long = { toNumber: () => 1400000000 }
      expect(normalizeTimestamp(long)).toBe(1_400_000_000_000)
    })

    it('converts Long value of 1 (epoch + 1 second)', () => {
      const long = { toNumber: () => 1 }
      expect(normalizeTimestamp(long)).toBe(1000)
    })

    it('returns undefined for Long with toNumber() returning 0', () => {
      const long = { toNumber: () => 0 }
      expect(normalizeTimestamp(long)).toBeUndefined()
    })

    it('returns undefined for Long with toNumber() returning negative', () => {
      const long = { toNumber: () => -1700000000 }
      expect(normalizeTimestamp(long)).toBeUndefined()
    })

    it('returns undefined for Long with toNumber() returning NaN', () => {
      const long = { toNumber: () => NaN }
      expect(normalizeTimestamp(long)).toBeUndefined()
    })

    it('returns undefined for Long with toNumber() returning Infinity', () => {
      const long = { toNumber: () => Infinity }
      expect(normalizeTimestamp(long)).toBeUndefined()
    })

    it('returns undefined for Long with toNumber() returning non-number', () => {
      const long = { toNumber: () => 'not a number' }
      expect(normalizeTimestamp(long)).toBeUndefined()
    })
  })

  // ── bigint ──

  describe('bigint', () => {
    it('converts bigint in seconds to milliseconds', () => {
      expect(normalizeTimestamp(1700000000n)).toBe(1_700_000_000_000)
    })

    it('leaves bigint in milliseconds unchanged', () => {
      expect(normalizeTimestamp(1700000000000n)).toBe(1_700_000_000_000)
    })

    it('handles small bigint (seconds)', () => {
      expect(normalizeTimestamp(1400000000n)).toBe(1_400_000_000_000)
    })

    it('handles large bigint (milliseconds)', () => {
      expect(normalizeTimestamp(1700000000123n)).toBe(1_700_000_000_123)
    })

    it('returns undefined for 0n', () => {
      expect(normalizeTimestamp(0n)).toBeUndefined()
    })

    it('returns undefined for negative bigint', () => {
      expect(normalizeTimestamp(-1700000000n)).toBeUndefined()
    })
  })

  // ── number ──

  describe('number', () => {
    it('converts number in seconds to milliseconds', () => {
      expect(normalizeTimestamp(1700000000)).toBe(1_700_000_000_000)
    })

    it('leaves number in milliseconds unchanged', () => {
      expect(normalizeTimestamp(1700000000000)).toBe(1_700_000_000_000)
    })

    it('preserves sub-second precision in millisecond timestamps', () => {
      expect(normalizeTimestamp(1700000000123)).toBe(1_700_000_000_123)
    })

    it('converts small seconds value', () => {
      expect(normalizeTimestamp(1400000000)).toBe(1_400_000_000_000)
    })

    it('returns undefined for 0', () => {
      expect(normalizeTimestamp(0)).toBeUndefined()
    })

    it('returns undefined for negative number', () => {
      expect(normalizeTimestamp(-1700000000)).toBeUndefined()
    })

    it('returns undefined for NaN', () => {
      expect(normalizeTimestamp(NaN)).toBeUndefined()
    })

    it('returns undefined for Infinity', () => {
      expect(normalizeTimestamp(Infinity)).toBeUndefined()
    })

    it('returns undefined for -Infinity', () => {
      expect(normalizeTimestamp(-Infinity)).toBeUndefined()
    })

    it('returns undefined for 1 (positive but too small for any epoch)', () => {
      expect(normalizeTimestamp(1)).toBe(1000)
    })
  })

  // ── null / undefined ──

  describe('nullish values', () => {
    it('returns undefined for undefined', () => {
      expect(normalizeTimestamp(undefined)).toBeUndefined()
    })

    it('returns undefined for null', () => {
      expect(normalizeTimestamp(null)).toBeUndefined()
    })
  })

  // ── Edge cases / unknown types ──

  describe('edge cases', () => {
    it('returns undefined for string', () => {
      expect(normalizeTimestamp('1700000000')).toBeUndefined()
    })

    it('returns undefined for boolean', () => {
      expect(normalizeTimestamp(true)).toBeUndefined()
    })

    it('returns undefined for object without toNumber', () => {
      expect(normalizeTimestamp({})).toBeUndefined()
    })

    it('returns undefined for empty string', () => {
      expect(normalizeTimestamp('')).toBeUndefined()
    })
  })

  // ── Round-trip consistency ──

  describe('consistency', () => {
    it('Long(seconds) === number(seconds) === bigint(seconds)', () => {
      const long = { toNumber: () => 1700000000 }
      const num = 1700000000
      const big = 1700000000n

      const a = normalizeTimestamp(long)
      const b = normalizeTimestamp(num)
      const c = normalizeTimestamp(big)

      expect(a).toBe(b)
      expect(b).toBe(c)
      expect(a).toBe(1_700_000_000_000)
    })

    it('number(ms) === bigint(ms)', () => {
      const num = 1700000000123
      const big = 1700000000123n

      expect(normalizeTimestamp(num)).toBe(normalizeTimestamp(big))
      expect(normalizeTimestamp(num)).toBe(1_700_000_000_123)
    })
  })
})

// ── extractPhoneFromJid ──

describe('extractPhoneFromJid', () => {
  it('extracts phone from standard JID', () => {
    expect(extractPhoneFromJid('6281234567890@s.whatsapp.net')).toBe('6281234567890')
  })

  it('strips device suffix from JID', () => {
    expect(extractPhoneFromJid('6281234567890:0@s.whatsapp.net')).toBe('6281234567890')
  })

  it('strips device suffix with large number', () => {
    expect(extractPhoneFromJid('6281234567890:12@s.whatsapp.net')).toBe('6281234567890')
  })

  it('extracts number from @lid JID', () => {
    expect(extractPhoneFromJid('1234567890@lid')).toBe('1234567890')
  })

  it('handles group JID', () => {
    expect(extractPhoneFromJid('120363012345678901@g.us')).toBe('120363012345678901')
  })

  it('returns empty string for empty input', () => {
    expect(extractPhoneFromJid('')).toBe('')
  })
})

// ── normalizeJid ──

describe('normalizeJid', () => {
  describe('@s.whatsapp.net → bare phone', () => {
    it('strips @s.whatsapp.net suffix to bare phone', () => {
      expect(normalizeJid('6281234567890@s.whatsapp.net')).toBe('6281234567890')
    })

    it('strips device suffix and @s.whatsapp.net', () => {
      expect(normalizeJid('6281234567890:0@s.whatsapp.net')).toBe('6281234567890')
    })

    it('strips device suffix with large number', () => {
      expect(normalizeJid('6281234567890:42@s.whatsapp.net')).toBe('6281234567890')
    })

    it('returns bare phone when mapping has no entry for it', () => {
      const mockMapping = createMockMapping({})
      expect(normalizeJid('6281234567890@s.whatsapp.net', mockMapping as any)).toBe('6281234567890')
    })

    it('resolves disguised LID number to bare phone', () => {
      const mockMapping = createMockMapping({ '121131029766161@lid': '6285790228428' })
      expect(normalizeJid('121131029766161@s.whatsapp.net', mockMapping as any)).toBe('6285790228428')
    })

    it('resolves disguised LID with device suffix', () => {
      const mockMapping = createMockMapping({ '121131029766161@lid': '6285790228428' })
      expect(normalizeJid('121131029766161:0@s.whatsapp.net', mockMapping as any)).toBe('6285790228428')
    })
  })

  describe('@g.us passthrough', () => {
    it('keeps group JID as-is', () => {
      expect(normalizeJid('120363012345678901@g.us')).toBe('120363012345678901@g.us')
    })
  })

  describe('@lid resolution → bare phone', () => {
    it('returns original @lid when no mapping store provided', () => {
      expect(normalizeJid('1234567890@lid')).toBe('1234567890@lid')
    })

    it('returns original @lid when mapping store has no mapping', () => {
      const mockMapping = createMockMapping({})
      expect(normalizeJid('1234567890@lid', mockMapping as any)).toBe('1234567890@lid')
    })

    it('resolves @lid to bare phone when mapping exists', () => {
      const mockMapping = createMockMapping({ '1234567890@lid': '6281234567890' })
      expect(normalizeJid('1234567890@lid', mockMapping as any)).toBe('6281234567890')
    })
  })

  describe('null/undefined/empty', () => {
    it('returns empty string for null', () => {
      expect(normalizeJid(null)).toBe('')
    })

    it('returns empty string for undefined', () => {
      expect(normalizeJid(undefined)).toBe('')
    })

    it('returns empty string for empty string', () => {
      expect(normalizeJid('')).toBe('')
    })
  })
})

// ── normalizeMessage / extractContent ──

describe('normalizeMessage', () => {
  const baseKey = {
    remoteJid: '6281234567890@s.whatsapp.net',
    id: 'ABC123',
    fromMe: false,
    participant: null,
  }

  describe('conversation (plain text)', () => {
    it('extracts text from conversation', () => {
      const msg = normalizeMessage({
        key: baseKey,
        message: { conversation: 'Hello world' },
        messageTimestamp: 1700000000,
      } as any)

      expect(msg.messageType).toBe('conversation')
      expect(msg.content).toEqual({ type: 'conversation', text: 'Hello world' })
      // key.remoteJid should be bare phone
      expect(msg.key.remoteJid).toBe('6281234567890')
      expect(msg.chatJid).toBe('6281234567890')
      expect(msg.sender).toBe('6281234567890')
    })
  })

  describe('extendedTextMessage', () => {
    it('extracts text from extended text', () => {
      const msg = normalizeMessage({
        key: baseKey,
        message: { extendedTextMessage: { text: 'How are you?' } },
        messageTimestamp: 1700000000,
      } as any)

      expect(msg.messageType).toBe('extendedTextMessage')
      expect(msg.content).toEqual({ type: 'extendedTextMessage', text: 'How are you?' })
    })
  })

  describe('imageMessage', () => {
    it('extracts media metadata', () => {
      const msg = normalizeMessage({
        key: baseKey,
        message: {
          imageMessage: {
            caption: 'photo caption',
            mimetype: 'image/jpeg',
            fileLength: { toNumber: () => 245120 },
            width: 960,
            height: 1280,
          },
        },
        messageTimestamp: 1700000000,
      } as any)

      expect(msg.messageType).toBe('imageMessage')
      expect(msg.content).toEqual({
        type: 'imageMessage',
        hasMedia: true,
        caption: 'photo caption',
        mimetype: 'image/jpeg',
        fileLength: 245120,
        width: 960,
        height: 1280,
      })
    })
  })

  describe('participant in group', () => {
    it('resolves participant to bare phone', () => {
      const msg = normalizeMessage({
        key: {
          remoteJid: '120363012345678901@g.us',
          id: 'MSG1',
          fromMe: false,
          participant: '6281234567890:0@s.whatsapp.net',
        },
        message: { conversation: 'hi' },
        messageTimestamp: 1700000000,
      } as any)

      expect(msg.key.remoteJid).toBe('120363012345678901@g.us')
      expect(msg.key.participant).toBe('6281234567890')
      expect(msg.chatJid).toBe('120363012345678901@g.us')
      expect(msg.sender).toBe('6281234567890')
    })
  })

  describe('reactionMessage in content', () => {
    it('resolves reaction key remoteJid to bare phone', () => {
      const msg = normalizeMessage({
        key: baseKey,
        message: {
          reactionMessage: {
            text: '👍',
            key: { remoteJid: '6289999999999@s.whatsapp.net', id: 'XYZ789' },
          },
        },
        messageTimestamp: 1700000000,
      } as any)

      const content = msg.content as any
      expect(content.type).toBe('reactionMessage')
      expect(content.text).toBe('👍')
      expect(content.key.remoteJid).toBe('6289999999999')
    })
  })

  describe('null/missing message', () => {
    it('returns null content when message is undefined', () => {
      const msg = normalizeMessage({
        key: baseKey,
        message: undefined,
        messageTimestamp: 1700000000,
      } as any)

      expect(msg.content).toBeNull()
      expect(msg.messageType).toBeUndefined()
    })
  })
})

// ── normalizeReaction ──

describe('normalizeReaction', () => {
  it('normalizes single reaction object', () => {
    const raw = {
      key: {
        remoteJid: '6281234567890@s.whatsapp.net',
        id: 'MSG1',
        fromMe: false,
        participant: '6289999999999:0@s.whatsapp.net',
      },
      reaction: {
        text: '👍',
        key: { remoteJid: '6281234567890@s.whatsapp.net', id: 'MSG1' },
        senderTimestampMs: 1700000000,
      },
    }

    const result = normalizeReaction(raw) as any
    expect(result.key.remoteJid).toBe('6281234567890')
    expect(result.key.participant).toBe('6289999999999')
    expect(result.reaction.key.remoteJid).toBe('6281234567890')
    expect(result.reaction.text).toBe('👍')
  })

  it('normalizes array of reactions', () => {
    const raw = [
      {
        key: { remoteJid: '6281234567890@s.whatsapp.net', id: 'MSG1', fromMe: false },
        reaction: { text: '❤️' },
      },
    ]

    const result = normalizeReaction(raw) as any[]
    expect(result).toHaveLength(1)
    expect(result[0].key.remoteJid).toBe('6281234567890')
  })
})

// ── normalizeMessageDelete ──

describe('normalizeMessageDelete', () => {
  it('normalizes delete with keys array', () => {
    const raw = {
      keys: [
        { remoteJid: '6281234567890@s.whatsapp.net', id: 'MSG1', fromMe: false, participant: null },
        { remoteJid: '120363012345678901@g.us', id: 'MSG2', fromMe: true, participant: '6289999999999:0@s.whatsapp.net' },
      ],
    }

    const result = normalizeMessageDelete(raw) as any
    expect(result.keys[0].remoteJid).toBe('6281234567890')
    expect(result.keys[1].remoteJid).toBe('120363012345678901@g.us')
    expect(result.keys[1].participant).toBe('6289999999999')
  })

  it('normalizes delete-all with jid', () => {
    const raw = { jid: '6281234567890@s.whatsapp.net', all: true }

    const result = normalizeMessageDelete(raw) as any
    expect(result.jid).toBe('6281234567890')
    expect(result.all).toBe(true)
  })
})

// ── normalizeReceiptUpdate ──

describe('normalizeReceiptUpdate', () => {
  it('normalizes single receipt', () => {
    const raw = {
      key: {
        remoteJid: '6281234567890@s.whatsapp.net',
        id: 'MSG1',
        fromMe: false,
        participant: '6289999999999:0@s.whatsapp.net',
      },
      receipt: { type: 'read', senderParticipant: '6281111111111@s.whatsapp.net' },
    }

    const result = normalizeReceiptUpdate(raw) as any
    expect(result.key.remoteJid).toBe('6281234567890')
    expect(result.key.participant).toBe('6289999999999')
    expect(result.receipt.senderParticipant).toBe('6281111111111')
  })

  it('normalizes array of receipts', () => {
    const raw = [
      {
        key: { remoteJid: '6281234567890@s.whatsapp.net', id: 'MSG1', fromMe: false },
        receipt: { type: 'delivered' },
      },
    ]

    const result = normalizeReceiptUpdate(raw) as any[]
    expect(result).toHaveLength(1)
    expect(result[0].key.remoteJid).toBe('6281234567890')
  })
})

// ── normalizeGroupParticipantsUpdate ──

describe('normalizeGroupParticipantsUpdate', () => {
  it('resolves participant JIDs to bare phones, preserves group JID', () => {
    const raw = {
      id: '120363012345678901@g.us',
      author: '6281234567890:0@s.whatsapp.net',
      action: 'add',
      participants: ['6289999999999@s.whatsapp.net', '6281111111111:0@s.whatsapp.net'],
    }

    const result = normalizeGroupParticipantsUpdate(raw) as any
    expect(result.groupJid).toBe('120363012345678901@g.us')
    expect(result.author).toBe('6281234567890')
    expect(result.participants[0].jid).toBe('6289999999999')
    expect(result.participants[1].jid).toBe('6281111111111')
    expect(result.action).toBe('add')
  })
})

// ── normalizeGroup ──

describe('normalizeGroup', () => {
  it('normalizes group with participant JIDs resolved', () => {
    const raw = {
      id: '120363012345678901@g.us',
      subject: 'Test Group',
      participants: [
        { id: '6281234567890:0@s.whatsapp.net', admin: 'admin' },
        { id: '6289999999999@s.whatsapp.net' },
      ],
    }

    const result = normalizeGroup(raw) as any
    expect(result.id).toBe('120363012345678901@g.us')
    expect(result.subject).toBe('Test Group')
    expect(result.participants[0].id).toBe('6281234567890')
    expect(result.participants[0].admin).toBe('admin')
    expect(result.participants[1].id).toBe('6289999999999')
  })
})
