import MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import type Token from 'markdown-it/lib/token.mjs'

export interface MarkdownMeta {
  title?: string
  description?: string
  order?: number
  prev?: { title: string; slug: string }
  next?: { title: string; slug: string }
}

export interface RenderedMarkdown {
  html: string
  meta: MarkdownMeta
  toc: TocEntry[]
}

export interface TocEntry {
  id: string
  text: string
  level: number
}

// Shiki highlighter instance (lazy initialized)
let highlighter: any = null

async function getHighlighter() {
  if (highlighter) return highlighter

  const { createHighlighter } = await import('shiki')
  highlighter = await createHighlighter({
    themes: ['github-dark', 'github-light'],
    langs: [
      'javascript',
      'typescript',
      'bash',
      'shell',
      'json',
      'python',
      'php',
      'go',
      'html',
      'css',
      'yaml',
      'markdown',
    ],
  })
  return highlighter
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function extractFrontmatter(content: string): { meta: MarkdownMeta; body: string } {
  const meta: MarkdownMeta = {}
  let body = content

  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (match) {
    const frontmatter = match[1]
    body = match[2]

    for (const line of frontmatter.split('\n')) {
      const [key, ...valueParts] = line.split(':')
      if (key && valueParts.length > 0) {
        const value = valueParts.join(':').trim()
        const trimmedKey = key.trim()

        if (trimmedKey === 'title') meta.title = value
        if (trimmedKey === 'description') meta.description = value
        if (trimmedKey === 'order') meta.order = parseInt(value, 10)
      }
    }
  }

  return { meta, body }
}

function extractToc(content: string): TocEntry[] {
  const toc: TocEntry[] = []
  const headingRegex = /^(#{2,3})\s+(.+)$/gm
  let match

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length
    const text = match[2].trim()
    const id = slugify(text)
    toc.push({ id, text, level })
  }

  return toc
}

function addHeadingIds(md: MarkdownIt) {
  const defaultHeadingOpen = md.renderer.rules.heading_open || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx]
    const nextToken = tokens[idx + 1]

    if (nextToken && nextToken.type === 'inline') {
      const id = slugify(nextToken.content)
      token.attrSet('id', id)
    }

    return defaultHeadingOpen(tokens, idx, options, env, self)
  }
}

function addCopyButtons(md: MarkdownIt) {
  const defaultFence = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx]
    const info = token.info.trim()
    const lang = info.split(/\s+/)[0] || ''
    const langLabel = lang || 'code'

    const highlighted = defaultFence(tokens, idx, options, env, self)

    return `<div class="relative group my-6 rounded-lg overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2 bg-surface-800 text-surface-400 text-xs font-mono">
        <span>${langLabel}</span>
        <button class="copy-btn" data-code="${encodeURIComponent(token.content)}" onclick="copyCode(this)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <svg class="w-4 h-4 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>
      ${highlighted}
    </div>`
  }
}

function addTableClasses(md: MarkdownIt) {
  const defaultTableOpen = md.renderer.rules.table_open || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  md.renderer.rules.table_open = function (tokens, idx, options, env, self) {
    tokens[idx].attrSet('class', 'w-full text-sm border-collapse my-6')
    return defaultTableOpen(tokens, idx, options, env, self)
  }

  const defaultThOpen = md.renderer.rules.th_open || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  md.renderer.rules.th_open = function (tokens, idx, options, env, self) {
    tokens[idx].attrSet('class', 'text-left px-4 py-2 border-b-2 border-surface-200 font-semibold text-surface-700')
    return defaultThOpen(tokens, idx, options, env, self)
  }

  const defaultTdOpen = md.renderer.rules.td_open || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  md.renderer.rules.td_open = function (tokens, idx, options, env, self) {
    tokens[idx].attrSet('class', 'px-4 py-2 border-b border-surface-100')
    return defaultTdOpen(tokens, idx, options, env, self)
  }
}

function addLinkTarget(md: MarkdownIt) {
  const defaultLinkOpen = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx]
    const href = token.attrGet('href') || ''

    if (href.startsWith('http://') || href.startsWith('https://')) {
      token.attrSet('target', '_blank')
      token.attrSet('rel', 'noopener noreferrer')
    }

    return defaultLinkOpen(tokens, idx, options, env, self)
  }
}

function addCallouts(md: MarkdownIt) {
  md.block.ruler.before('fence', 'callout', function (state, startLine, endLine, silent) {
    const pos = state.bMarks[startLine] + state.tShift[startLine]
    const max = state.eMarks[startLine]

    if (pos + 3 > max) return false
    if (state.src.charCodeAt(pos) !== 0x3E /* > */) return false

    let line = state.src.slice(pos, max).trim()

    const calloutTypes = ['info', 'warning', 'error', 'success', 'note']
    let calloutType = ''

    for (const type of calloutTypes) {
      if (line.toLowerCase().startsWith(`> [!${type}]`)) {
        calloutType = type
        break
      }
    }

    if (!calloutType) return false
    if (silent) return true

    let nextLine = startLine
    let content = ''

    while (nextLine < endLine) {
      nextLine++
      const linePos = state.bMarks[nextLine] + state.tShift[nextLine]
      const lineMax = state.eMarks[nextLine]

      if (linePos >= lineMax) break

      const lineContent = state.src.slice(linePos, lineMax).trim()
      if (!lineContent.startsWith('>')) break

      content += lineContent.slice(1).trim() + '\n'
    }

    const token = state.push('callout', 'div', 0)
    token.content = content
    token.markup = calloutType
    token.map = [startLine, nextLine]

    state.line = nextLine

    return true
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })

  md.renderer.rules.callout = function (tokens, idx) {
    const token = tokens[idx]
    const type = token.markup
    const content = md.render(token.content)

    const icons: Record<string, string> = {
      info: '<svg class="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>',
      warning: '<svg class="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>',
      error: '<svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>',
      success: '<svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>',
      note: '<svg class="w-5 h-5 text-surface-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>',
    }

    const titles: Record<string, string> = {
      info: 'Info',
      warning: 'Warning',
      error: 'Error',
      success: 'Success',
      note: 'Note',
    }

    return `<div class="callout callout-${type}">
      <div class="flex items-center gap-2 mb-1 font-semibold">
        ${icons[type] || icons.note}
        <span>${titles[type] || 'Note'}</span>
      </div>
      <div class="ml-7">${content}</div>
    </div>`
  }
}

export function createMarkdownRenderer(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  })

  addHeadingIds(md)
  addCopyButtons(md)
  addTableClasses(md)
  addLinkTarget(md)
  addCallouts(md)

  return md
}

export function renderMarkdown(content: string): RenderedMarkdown {
  const { meta, body } = extractFrontmatter(content)
  const toc = extractToc(body)

  const md = createMarkdownRenderer()
  const html = md.render(body)

  return { html, meta, toc }
}

export function getMarkdownFiles(): string[] {
  return [
    'index',
    'getting-started',
    'installation',
    'authentication',
    'sessions',
    'messages',
    'webhooks',
    'history-sync',
  ]
}

export const navigation = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Introduction', slug: 'index' },
      { title: 'Getting Started', slug: 'getting-started' },
      { title: 'Installation', slug: 'installation' },
      { title: 'Authentication', slug: 'authentication' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { title: 'Sessions', slug: 'sessions' },
      { title: 'Sending Messages', slug: 'messages' },
      { title: 'Webhooks', slug: 'webhooks' },
      { title: 'History Sync', slug: 'history-sync' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { title: 'API Reference', slug: 'reference', external: true },
    ],
  },
]
