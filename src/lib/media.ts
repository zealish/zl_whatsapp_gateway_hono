import { AppError } from './errors.js'

/**
 * Resolve media from URL or base64 string to Buffer.
 * Used by the generic send endpoint for media message types.
 */
export async function resolveMedia(source: {
  url?: string
  base64?: string
}): Promise<Buffer> {
  if (source.base64) {
    return Buffer.from(source.base64, 'base64')
  }

  if (source.url) {
    const res = await fetch(source.url)
    if (!res.ok) {
      throw new AppError(
        `Failed to fetch media from URL: HTTP ${res.status}`,
        400,
        'MEDIA_FETCH_FAILED'
      )
    }
    return Buffer.from(await res.arrayBuffer())
  }

  throw new AppError('Either url or base64 must be provided', 400, 'MEDIA_SOURCE_REQUIRED')
}
