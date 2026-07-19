import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderMarkdown, type RenderedMarkdown } from './markdown.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const CONTENT_DIR = join(__dirname, '..', 'content')

// Cache for parsed content
const contentCache = new Map<string, RenderedMarkdown>()

export async function loadContent(slug: string): Promise<RenderedMarkdown | null> {
  // Check cache first
  if (contentCache.has(slug)) {
    return contentCache.get(slug)!
  }

  try {
    const filePath = join(CONTENT_DIR, `${slug}.md`)
    const raw = await readFile(filePath, 'utf-8')
    const rendered = renderMarkdown(raw)

    // Cache the result
    contentCache.set(slug, rendered)

    return rendered
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function getContentList(): Promise<string[]> {
  try {
    const files = await readdir(CONTENT_DIR)
    return files
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace('.md', ''))
  } catch {
    return []
  }
}

export function clearContentCache(): void {
  contentCache.clear()
}
