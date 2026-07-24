import { describe, it, expect } from 'vitest'
import { phoneToJid, recipientToJid } from '../whatsapp/normalizers.js'

// ── phoneToJid ──

describe('phoneToJid', () => {
  it('converts bare phone number to JID', () => {
    expect(phoneToJid('6281234567890')).toBe('6281234567890@s.whatsapp.net')
  })

  it('normalizes Indonesian local format (0xxx)', () => {
    expect(phoneToJid('081234567890')).toBe('6281234567890@s.whatsapp.net')
  })

  it('normalizes Indonesian format without country code', () => {
    expect(phoneToJid('8512345678')).toBe('628512345678@s.whatsapp.net')
  })

  it('preserves existing @s.whatsapp.net JID', () => {
    expect(phoneToJid('6281234567890@s.whatsapp.net')).toBe('6281234567890@s.whatsapp.net')
  })

  it('preserves @g.us JID', () => {
    expect(phoneToJid('120363012345678901@g.us')).toBe('120363012345678901@g.us')
  })

  it('preserves @lid JID', () => {
    expect(phoneToJid('1234567890@lid')).toBe('1234567890@lid')
  })

  it('returns empty string for empty input', () => {
    expect(phoneToJid('')).toBe('')
  })

  it('handles null/undefined gracefully', () => {
    expect(phoneToJid(null as any)).toBe(null)
    expect(phoneToJid(undefined as any)).toBe(undefined)
  })

  it('converts international format with country code', () => {
    expect(phoneToJid('12025551234')).toBe('12025551234@s.whatsapp.net')
  })

  it('converts UK number', () => {
    expect(phoneToJid('447911123456')).toBe('447911123456@s.whatsapp.net')
  })
})

// ── recipientToJid ──

describe('recipientToJid', () => {
  describe('bare phone numbers', () => {
    it('converts bare phone to @s.whatsapp.net', () => {
      expect(recipientToJid('6281234567890')).toBe('6281234567890@s.whatsapp.net')
    })

    it('normalizes Indonesian local format', () => {
      expect(recipientToJid('081234567890')).toBe('6281234567890@s.whatsapp.net')
    })

    it('normalizes Indonesian format without country code', () => {
      expect(recipientToJid('8512345678')).toBe('628512345678@s.whatsapp.net')
    })
  })

  describe('group JIDs', () => {
    it('preserves @g.us JID as-is', () => {
      expect(recipientToJid('120363012345678901@g.us')).toBe('120363012345678901@g.us')
    })

    it('preserves @g.us JID with device suffix', () => {
      expect(recipientToJid('120363012345678901:0@g.us')).toBe('120363012345678901:0@g.us')
    })
  })

  describe('backward compatibility', () => {
    it('preserves @s.whatsapp.net JID', () => {
      expect(recipientToJid('6281234567890@s.whatsapp.net')).toBe('6281234567890@s.whatsapp.net')
    })

    it('preserves @s.whatsapp.net JID with device suffix', () => {
      expect(recipientToJid('6281234567890:0@s.whatsapp.net')).toBe('6281234567890:0@s.whatsapp.net')
    })
  })

  describe('LID rejection', () => {
    it('throws error for @lid JID', () => {
      expect(() => recipientToJid('1234567890@lid')).toThrow('LID identifiers are not accepted')
    })

    it('throws error for @lid JID with message suggesting phone number', () => {
      expect(() => recipientToJid('1234567890@lid')).toThrow('Use a bare phone number')
    })
  })

  describe('error handling', () => {
    it('throws error for empty string', () => {
      expect(() => recipientToJid('')).toThrow('Recipient is required')
    })

    it('throws error for null', () => {
      expect(() => recipientToJid(null as any)).toThrow('Recipient is required')
    })

    it('throws error for undefined', () => {
      expect(() => recipientToJid(undefined as any)).toThrow('Recipient is required')
    })
  })
})