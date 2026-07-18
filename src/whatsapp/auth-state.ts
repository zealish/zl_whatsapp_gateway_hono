import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AuthenticationCreds, SignalDataSet, SignalDataTypeMap, SignalKeyStoreWithTransaction } from 'baileys'
import { BufferJSON, initAuthCreds, proto } from 'baileys'

/**
 * Production-ready file-based auth state for Baileys.
 *
 * - Atomic writes (tmp + rename) to prevent corruption on crash
 * - Supports all v7 key types (creds, pre-keys, sessions, sender-keys, etc.)
 * - Single-session use: one instance per session directory
 */
export async function useFileAuthState(sessionDir: string): Promise<{
  state: { creds: AuthenticationCreds; keys: SignalKeyStoreWithTransaction }
  saveCreds: () => Promise<void>
}> {
  const credsPath = join(sessionDir, 'creds.json')
  const keysDir = join(sessionDir, 'keys')

  await mkdir(keysDir, { recursive: true })

  // ── Load or initialize credentials ──
  let creds: AuthenticationCreds
  if (existsSync(credsPath)) {
    const raw = await readFile(credsPath, 'utf-8')
    creds = JSON.parse(raw, BufferJSON.reviver) as AuthenticationCreds
  } else {
    creds = initAuthCreds()
    await writeJsonAtomic(credsPath, creds)
  }

  // ── Atomic write helper ──
  async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
    const tmpPath = `${filePath}.tmp.${Date.now()}`
    const json = JSON.stringify(data, BufferJSON.replacer, 2)
    await writeFile(tmpPath, json, 'utf-8')
    await rename(tmpPath, filePath)
  }

  // ── Save credentials ──
  async function saveCreds(): Promise<void> {
    await writeJsonAtomic(credsPath, creds)
  }

  // ── Key store ──
  function keyPath(type: string, id: string): string {
    return join(keysDir, `${type}-${id}.json`)
  }

  const keys: SignalKeyStoreWithTransaction = {
    get: async <T extends keyof SignalDataTypeMap>(
      type: T,
      ids: string[]
    ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
      const result: Record<string, unknown> = {}
      for (const id of ids) {
        const p = keyPath(type as string, id)
        if (existsSync(p)) {
          const raw = await readFile(p, 'utf-8')
          result[id] = JSON.parse(raw, BufferJSON.reviver)
        }
      }
      return result as { [id: string]: SignalDataTypeMap[T] }
    },

    set: async (data: SignalDataSet): Promise<void> => {
      for (const [type, entries] of Object.entries(data)) {
        if (!entries) continue
        for (const [id, value] of Object.entries(entries)) {
          const p = keyPath(type, id)
          if (value) {
            await writeJsonAtomic(p, value)
          } else if (existsSync(p)) {
            await unlink(p).catch(() => {})
          }
        }
      }
    },

    isInTransaction: () => false,

    transaction: async <T>(exec: () => Promise<T>): Promise<T> => {
      // No-op transaction: file-based state doesn't need locking for single-instance
      return exec()
    },
  }

  return {
    state: { creds, keys },
    saveCreds,
  }
}
