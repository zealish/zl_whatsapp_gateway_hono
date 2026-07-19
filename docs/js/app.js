// WhatsApp Gateway Documentation - Client-side JavaScript
// Features: Dark mode, Search, Copy code, Mobile menu

(function () {
  'use strict'

  // ── Theme Management ──

  const THEME_KEY = 'theme'

  function getTheme() {
    return localStorage.getItem(THEME_KEY) || 'system'
  }

  function setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme)
    applyTheme(theme)
  }

  function applyTheme(theme) {
    const root = document.documentElement
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    root.classList.toggle('dark', isDark)

    // Update theme toggle icons
    const sunIcon = document.querySelector('#theme-toggle .sun-icon')
    const moonIcon = document.querySelector('#theme-toggle .moon-icon')
    if (sunIcon && moonIcon) {
      sunIcon.style.display = isDark ? 'block' : 'none'
      moonIcon.style.display = isDark ? 'none' : 'block'
    }
  }

  window.toggleTheme = function () {
    const current = getTheme()
    const next = current === 'dark' ? 'light' : 'dark'
    setTheme(next)
  }

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (getTheme() === 'system') {
      applyTheme('system')
    }
  })

  // Apply theme on load
  applyTheme(getTheme())

  // ── Copy Code ──

  window.copyCode = async function (button) {
    const code = decodeURIComponent(button.dataset.code)
    const svgCopy = button.querySelector('svg:first-child')
    const svgCheck = button.querySelector('svg:last-child')

    try {
      await navigator.clipboard.writeText(code)
      button.classList.add('copied')
      svgCopy.style.display = 'none'
      svgCheck.style.display = 'block'

      setTimeout(() => {
        button.classList.remove('copied')
        svgCopy.style.display = 'block'
        svgCheck.style.display = 'none'
      }, 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // ── Mobile Menu ──

  let mobileMenuOpen = false

  window.toggleMobileMenu = function () {
    mobileMenuOpen = !mobileMenuOpen
    const sidebar = document.getElementById('sidebar')
    const overlay = document.getElementById('mobile-overlay')

    if (sidebar) {
      sidebar.classList.toggle('mobile-open', mobileMenuOpen)
    }
    if (overlay) {
      overlay.classList.toggle('hidden', !mobileMenuOpen)
    }
  }

  window.closeMobileMenu = function () {
    mobileMenuOpen = false
    const sidebar = document.getElementById('sidebar')
    const overlay = document.getElementById('mobile-overlay')

    if (sidebar) {
      sidebar.classList.remove('mobile-open')
    }
    if (overlay) {
      overlay.classList.add('hidden')
    }
  }

  // ── Search ──

  let searchIndex = null
  let fuse = null

  async function loadSearchIndex() {
    if (searchIndex) return searchIndex

    try {
      const response = await fetch('/docs/search-index.json')
      searchIndex = await response.json()

      // Load Fuse.js dynamically
      if (typeof Fuse === 'undefined') {
        await loadScript('https://cdn.jsdelivr.net/npm/fuse.js@7.0.0')
      }

      fuse = new Fuse(searchIndex, {
        keys: ['title', 'content'],
        threshold: 0.3,
        includeMatches: true,
      })

      return searchIndex
    } catch (err) {
      console.error('Failed to load search index:', err)
      return []
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.onload = resolve
      script.onerror = reject
      document.head.appendChild(script)
    })
  }

  window.openSearch = async function () {
    const modal = document.getElementById('search-modal')
    if (!modal) return

    modal.classList.remove('hidden')
    document.body.style.overflow = 'hidden'

    const input = document.getElementById('search-input')
    if (input) {
      input.focus()
      input.value = ''
    }

    await loadSearchIndex()
  }

  window.closeSearch = function () {
    const modal = document.getElementById('search-modal')
    if (modal) {
      modal.classList.add('hidden')
      document.body.style.overflow = ''
    }
  }

  window.handleSearchInput = function (e) {
    const query = e.target.value.trim()
    const resultsContainer = document.getElementById('search-results')

    if (!resultsContainer) return

    if (!query) {
      resultsContainer.innerHTML = '<p class="text-sm text-surface-500 dark:text-surface-400 p-4">Type to search...</p>'
      return
    }

    if (!fuse) {
      resultsContainer.innerHTML = '<p class="text-sm text-surface-500 dark:text-surface-400 p-4">Loading search index...</p>'
      return
    }

    const results = fuse.search(query).slice(0, 10)

    if (results.length === 0) {
      resultsContainer.innerHTML = '<p class="text-sm text-surface-500 dark:text-surface-400 p-4">No results found</p>'
      return
    }

    resultsContainer.innerHTML = results
      .map(
        (result) => `
        <a
          href="/docs/${result.item.slug === 'index' ? '' : result.item.slug}"
          class="block px-4 py-3 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          onclick="closeSearch()"
        >
          <div class="font-medium text-surface-900 dark:text-surface-100">${result.item.title}</div>
          <div class="text-sm text-surface-500 dark:text-surface-400 line-clamp-2">${result.item.content.slice(0, 150)}...</div>
        </a>
      `
      )
      .join('')
  }

  // ── Keyboard Shortcuts ──

  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + K to open search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      window.openSearch()
    }

    // Escape to close modals
    if (e.key === 'Escape') {
      window.closeSearch()
      window.closeMobileMenu()
    }
  })

  // ── Table of Contents Scroll Spy ──

  function initTocScrollSpy() {
    const headings = document.querySelectorAll('h2[id], h3[id]')
    const tocLinks = document.querySelectorAll('[href^="#"]')

    if (headings.length === 0 || tocLinks.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id
            tocLinks.forEach((link) => {
              const isActive = link.getAttribute('href') === `#${id}`
              link.classList.toggle('text-brand-600', isActive)
              link.classList.toggle('dark:text-brand-400', isActive)
              link.classList.toggle('font-medium', isActive)
            })
          }
        })
      },
      {
        rootMargin: '-80px 0px -80% 0px',
        threshold: 0,
      }
    )

    headings.forEach((heading) => observer.observe(heading))
  }

  // ── Initialize ──

  document.addEventListener('DOMContentLoaded', () => {
    initTocScrollSpy()
  })
})()
