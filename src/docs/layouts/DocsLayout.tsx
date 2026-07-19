import type { FC } from 'hono/jsx'
import type { TocEntry } from '../lib/markdown.js'
import { SearchModal, MobileOverlay } from '../components/Overlays.js'

interface DocsLayoutProps {
  title?: string
  description?: string
  toc?: TocEntry[]
  currentSlug?: string
  children: any
}

export const DocsLayout: FC<DocsLayoutProps> = ({ title, description, toc, currentSlug, children }) => {
  const pageTitle = title ? `${title} - WhatsApp Gateway` : 'WhatsApp Gateway Documentation'

  return (
    <html lang="en" class="scroll-smooth">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{pageTitle}</title>
        {description && <meta name="description" content={description} />}
        <meta name="theme-color" content="#16a34a" />
        <link rel="stylesheet" href="/docs/assets/css/output.css" />
        <link rel="icon" type="image/svg+xml" href="/docs/assets/images/favicon.svg" />
        <script dangerouslySetInnerHTML={{ __html: `
          // Prevent flash of wrong theme
          (function() {
            const theme = localStorage.getItem('theme') || 'system';
            if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.classList.add('dark');
            }
          })();
        `}} />
      </head>
      <body class="bg-surface-0 text-surface-900 dark:bg-surface-950 dark:text-surface-100 min-h-screen">
        <MobileOverlay />
        <SearchModal />
        <Header currentSlug={currentSlug} />
        <div class="flex max-w-[1440px] mx-auto">
          <Sidebar currentSlug={currentSlug} />
          <main class="flex-1 min-w-0 px-6 py-8 lg:px-12 lg:py-10">
            <div class="max-w-3xl mx-auto">
              {children}
            </div>
          </main>
          {toc && toc.length > 0 && (
            <TableOfContents toc={toc} />
          )}
        </div>
        <Footer />
        <script src="/docs/assets/js/app.js" />
      </body>
    </html>
  )
}

const Header: FC<{ currentSlug?: string }> = ({ currentSlug }) => {
  return (
    <header class="sticky top-0 z-50 border-b border-surface-200 dark:border-surface-800 bg-surface-0/80 dark:bg-surface-950/80 backdrop-blur-lg">
      <div class="max-w-[1440px] mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
        <div class="flex items-center gap-8">
          <a href="/docs" class="flex items-center gap-2.5 text-surface-900 dark:text-surface-100 hover:opacity-80 transition-opacity">
            <Logo />
            <span class="font-semibold text-lg">WhatsApp Gateway</span>
          </a>
          <nav class="hidden md:flex items-center gap-1">
            <a href="/docs" class={`px-3 py-1.5 text-sm rounded-md transition-colors ${currentSlug === 'index' ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100'}`}>
              Docs
            </a>
            <a href="/reference" class="px-3 py-1.5 text-sm text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 rounded-md transition-colors">
              API Reference
            </a>
          </nav>
        </div>
        <div class="flex items-center gap-3">
          <SearchButton />
          <ThemeToggle />
          <a href="https://github.com/yourusername/whatsapp-gateway" target="_blank" rel="noopener noreferrer" class="text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors">
            <GitHubIcon />
          </a>
          <MobileMenuButton />
        </div>
      </div>
    </header>
  )
}

const Sidebar: FC<{ currentSlug?: string }> = ({ currentSlug }) => {
  const sections: { title: string; items: { title: string; slug: string; external?: boolean }[] }[] = [
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

  return (
    <aside id="sidebar" class="hidden lg:block w-64 shrink-0 border-r border-surface-200 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-900/50">
      <nav class="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto scrollbar-thin p-4 pb-8">
        {sections.map((section) => (
          <div class="mb-6">
            <h4 class="px-3 mb-2 text-xs font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider">
              {section.title}
            </h4>
            <ul class="space-y-0.5">
              {section.items.map((item) => (
                <li>
                  {item.external ? (
                    <a
                      href={`/${item.slug}`}
                      class="sidebar-link flex items-center gap-2"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {item.title}
                      <ExternalLinkIcon />
                    </a>
                  ) : (
                    <a
                      href={`/docs/${item.slug === 'index' ? '' : item.slug}`}
                      class={`sidebar-link ${currentSlug === item.slug ? 'active' : ''}`}
                    >
                      {item.title}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}

const TableOfContents: FC<{ toc: TocEntry[] }> = ({ toc }) => {
  return (
    <aside class="hidden xl:block w-56 shrink-0">
      <nav class="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto scrollbar-thin p-4 pb-8">
        <h4 class="text-xs font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-3">
          On this page
        </h4>
        <ul class="space-y-1.5 text-sm">
          {toc.map((entry) => (
            <li style={{ paddingLeft: `${(entry.level - 2) * 12}px` }}>
              <a
                href={`#${entry.id}`}
                class="block text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 transition-colors"
              >
                {entry.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}

const Footer: FC = () => {
  return (
    <footer class="border-t border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900">
      <div class="max-w-[1440px] mx-auto px-4 lg:px-6 py-8">
        <div class="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-surface-500 dark:text-surface-400">
          <div class="flex items-center gap-2">
            <Logo />
            <span>WhatsApp Gateway</span>
          </div>
          <div class="flex items-center gap-6">
            <a href="/docs" class="hover:text-surface-700 dark:hover:text-surface-300 transition-colors">Documentation</a>
            <a href="/reference" class="hover:text-surface-700 dark:hover:text-surface-300 transition-colors">API Reference</a>
            <a href="https://github.com/yourusername/whatsapp-gateway" target="_blank" rel="noopener noreferrer" class="hover:text-surface-700 dark:hover:text-surface-300 transition-colors">GitHub</a>
          </div>
        </div>
      </div>
    </footer>
  )
}

const Logo: FC = () => {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-brand-600 dark:text-brand-400">
      <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" fill="currentColor" opacity="0.2"/>
      <path d="M12 6C8.69 6 6 8.69 6 12C6 15.31 8.69 18 12 18C15.31 18 18 15.31 18 12C18 8.69 15.31 6 12 6ZM12 16C9.79 16 8 14.21 8 12C8 9.79 9.79 8 12 8C14.21 8 16 9.79 16 12C16 14.21 14.21 16 12 16Z" fill="currentColor"/>
      <circle cx="12" cy="12" r="2" fill="currentColor"/>
    </svg>
  )
}

const SearchButton: FC = () => {
  return (
    <button
      id="search-button"
      class="flex items-center gap-2 px-3 py-1.5 text-sm text-surface-500 dark:text-surface-400 bg-surface-100 dark:bg-surface-800 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
      onclick="openSearch()"
    >
      <SearchIcon />
      <span class="hidden sm:inline">Search docs...</span>
      <kbd class="hidden sm:inline-flex items-center px-1.5 py-0.5 text-2xs font-mono text-surface-400 bg-surface-200 dark:bg-surface-700 rounded">
        ⌘K
      </kbd>
    </button>
  )
}

const ThemeToggle: FC = () => {
  return (
    <button
      id="theme-toggle"
      class="p-2 text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
      onclick="toggleTheme()"
      aria-label="Toggle theme"
    >
      <SunIcon />
      <MoonIcon />
    </button>
  )
}

const MobileMenuButton: FC = () => {
  return (
    <button
      id="mobile-menu-button"
      class="lg:hidden p-2 text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
      onclick="toggleMobileMenu()"
      aria-label="Toggle menu"
    >
      <MenuIcon />
    </button>
  )
}

// Icons
const SearchIcon: FC = () => (
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)

const SunIcon: FC = () => (
  <svg class="w-5 h-5 hidden dark:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
)

const MoonIcon: FC = () => (
  <svg class="w-5 h-5 block dark:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
)

const GitHubIcon: FC = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
)

const ExternalLinkIcon: FC = () => (
  <svg class="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
)

const MenuIcon: FC = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
)
