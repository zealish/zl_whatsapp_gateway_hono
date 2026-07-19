import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getContentList } from './content.js'
import { renderMarkdown } from './markdown.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const CONTENT_DIR = join(__dirname, '..', 'content')
const OUTPUT_FILE = join(__dirname, '..', '..', '..', 'docs', 'js', 'search-index.json')

interface SearchDocument {
  slug: string
  title: string
  content: string
  section: string
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).replace(/\s+\S*$/, '') + '...'
}

export async function generateSearchIndex(): Promise<void> {
  const slugs = await getContentList()
  const documents: SearchDocument[] = []

  for (const slug of slugs) {
    try {
      const filePath = join(CONTENT_DIR, `${slug}.md`)
      const raw = await readFile(filePath, 'utf-8')
      const { html, meta } = renderMarkdown(raw)

      const plainText = stripHtml(html)
      const title = meta.title || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

      documents.push({
        slug,
        title,
        content: truncate(plainText, 500),
        section: getSection(slug),
      })
    } catch (error) {
      console.error(`Error processing ${slug}:`, error)
    }
  }

  await writeFile(OUTPUT_FILE, JSON.stringify(documents, null, 2))
  console.log(`Search index generated: ${OUTPUT_FILE}`)
}

function getSection(slug: string): string {
  const sections: Record<string, string> = {
    'index': 'Getting Started',
    'getting-started': 'Getting Started',
    'installation': 'Getting Started',
    'authentication': 'Getting Started',
    'sessions': 'Guides',
    'messages': 'Guides',
    'webhooks': 'Guides',
    'history-sync': 'Guides',
  }

  return sections[slug] || 'Other'
}

// Run if called directly
if (process.argv[1] && process.argv[1].includes('search-index')) {
  generateSearchIndex().catch(console.error)
}
