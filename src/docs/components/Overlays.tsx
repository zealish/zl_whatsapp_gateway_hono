import type { FC } from 'hono/jsx'

export const SearchModal: FC = () => {
  return (
    <div id="search-modal" class="hidden fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div class="fixed inset-0 bg-surface-900/50 backdrop-blur-sm" onclick="closeSearch()" />

      {/* Modal */}
      <div class="relative max-w-2xl mx-auto mt-[10vh] px-4">
        <div class="bg-surface-0 dark:bg-surface-900 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-800 overflow-hidden">
          {/* Search input */}
          <div class="flex items-center gap-3 px-4 py-3 border-b border-surface-200 dark:border-surface-800">
            <svg class="w-5 h-5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              id="search-input"
              type="text"
              placeholder="Search documentation..."
              class="flex-1 bg-transparent text-surface-900 dark:text-surface-100 placeholder-surface-400 outline-none"
              oninput="handleSearchInput(event)"
              autocomplete="off"
            />
            <kbd class="hidden sm:inline-flex items-center px-2 py-1 text-xs font-mono text-surface-400 bg-surface-100 dark:bg-surface-800 rounded">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div id="search-results" class="max-h-[60vh] overflow-y-auto">
            <p class="text-sm text-surface-500 dark:text-surface-400 p-4">Type to search...</p>
          </div>

          {/* Footer */}
          <div class="flex items-center justify-between px-4 py-2 border-t border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 text-xs text-surface-400">
            <span>Search by <a href="https://fusejs.io" target="_blank" rel="noopener noreferrer" class="hover:text-surface-600 dark:hover:text-surface-300">Fuse.js</a></span>
            <span>
              <kbd class="px-1 py-0.5 bg-surface-200 dark:bg-surface-700 rounded">↑↓</kbd> Navigate
              <kbd class="px-1 py-0.5 bg-surface-200 dark:bg-surface-700 rounded ml-2">↵</kbd> Select
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export const MobileOverlay: FC = () => {
  return (
    <div
      id="mobile-overlay"
      class="hidden fixed inset-0 z-40 bg-surface-900/50 backdrop-blur-sm lg:hidden"
      onclick="closeMobileMenu()"
    />
  )
}
