import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const execFileAsync = promisify(execFile)

/**
 * Convert webm/opus audio to ogg/opus using ffmpeg.
 * WhatsApp PTT requires ogg/opus container.
 * Returns the input buffer unchanged if it's already ogg (starts with OggS).
 */
export async function convertToOggOpus(input: Buffer): Promise<Buffer> {
  // Already ogg? Return as-is
  if (input.length >= 4 && input[0] === 0x4f && input[1] === 0x67 && input[2] === 0x67 && input[3] === 0x53) {
    return input
  }

  const id = randomUUID()
  const inPath = join(tmpdir(), `${id}.webm`)
  const outPath = join(tmpdir(), `${id}.ogg`)

  try {
    await writeFile(inPath, input)
    await execFileAsync('ffmpeg', [
      '-y', '-i', inPath,
      '-vn',
      '-ac', '1',
      '-b:a', '64k',
      '-ar', '16000',
      '-c:a', 'libopus',
      '-f', 'ogg',
      outPath,
    ], { timeout: 30000 })

    return await readFile(outPath)
  } finally {
    await unlink(inPath).catch(() => {})
    await unlink(outPath).catch(() => {})
  }
}
