import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { loadContent } from './lib/content.js'
import { navigation } from './lib/markdown.js'
import { DocsLayout } from './layouts/DocsLayout.js'
import { HomeLayout } from './layouts/HomeLayout.js'

export function createDocsRoutes(): Hono {
  const app = new Hono()

  // Serve static assets - CSS
  app.get('/docs/assets/css/:file', serveStatic({ root: './', rewriteRequestPath: (path) => `/docs/css/${path.split('/').pop()}` }))

  // Serve static assets - JS
  app.get('/docs/assets/js/:file', serveStatic({ root: './', rewriteRequestPath: (path) => `/docs/js/${path.split('/').pop()}` }))

  // Serve static assets - Images
  app.get('/docs/assets/images/:file', serveStatic({ root: './', rewriteRequestPath: (path) => `/docs/images/${path.split('/').pop()}` }))

  // Search index
  app.get('/docs/search-index.json', serveStatic({ root: './', rewriteRequestPath: () => '/docs/js/search-index.json' }))

  // Home page
  app.get('/docs', async (c) => {
    const content = await loadContent('index')
    if (!content) {
      return c.html('<h1>Content not found</h1>', 404)
    }

    return c.html(
      <HomeLayout>
        <div dangerouslySetInnerHTML={{ __html: content.html }} />
      </HomeLayout>
    )
  })

  // Documentation pages
  app.get('/docs/:slug', async (c) => {
    const slug = c.req.param('slug')

    // Skip if it's a static asset
    if (slug === 'assets' || slug === 'search-index.json') {
      return c.notFound()
    }

    const content = await loadContent(slug)
    if (!content) {
      return c.html(
        <DocsLayout title="Not Found">
          <div class="text-center py-16">
            <h1 class="text-4xl font-bold text-surface-900 dark:text-surface-100 mb-4">404</h1>
            <p class="text-surface-600 dark:text-surface-400 mb-8">Page not found</p>
            <a href="/docs" class="text-brand-600 dark:text-brand-400 hover:underline">
              Back to documentation
            </a>
          </div>
        </DocsLayout>,
        404
      )
    }

    const currentNav = navigation.flatMap((s) => s.items).find((i) => i.slug === slug)
    const currentIndex = navigation.flatMap((s) => s.items).findIndex((i) => i.slug === slug)
    const allItems = navigation.flatMap((s) => s.items)
    const prev = currentIndex > 0 ? allItems[currentIndex - 1] : null
    const next = currentIndex < allItems.length - 1 ? allItems[currentIndex + 1] : null

    return c.html(
      <DocsLayout
        title={content.meta.title || currentNav?.title}
        description={content.meta.description}
        toc={content.toc}
        currentSlug={slug}
      >
        <article class="prose prose-surface dark:prose-invert max-w-none">
          {content.meta.title && (
            <h1>{content.meta.title}</h1>
          )}
          <div dangerouslySetInnerHTML={{ __html: content.html }} />

          {/* Pagination */}
          <nav class="flex items-center justify-between pt-8 mt-8 border-t border-surface-200 dark:border-surface-800 not-prose">
            {prev ? (
              <a
                href={prev.slug === 'reference' ? '/reference' : `/docs/${prev.slug === 'index' ? '' : prev.slug}`}
                class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
                {prev.title}
              </a>
            ) : <div />}
            {next ? (
              <a
                href={next.slug === 'reference' ? '/reference' : `/docs/${next.slug === 'index' ? '' : next.slug}`}
                class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
              >
                {next.title}
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </a>
            ) : <div />}
          </nav>
        </article>
      </DocsLayout>
    )
  })

  return app
}
