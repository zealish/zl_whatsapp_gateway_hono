import type { FC } from 'hono/jsx'
import { DocsLayout } from './DocsLayout.js'

interface HomeLayoutProps {
  children: any
}

export const HomeLayout: FC<HomeLayoutProps> = ({ children }) => {
  return (
    <DocsLayout title="Documentation">
      <div class="prose prose-surface dark:prose-invert max-w-none">
        {/* Hero Section */}
        <div class="text-center py-12 mb-12 border-b border-surface-200 dark:border-surface-800">
          <div class="inline-flex items-center gap-2 px-3 py-1 mb-6 text-sm text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950 rounded-full">
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
            </span>
            v3.0 — History Sync
          </div>
          <h1 class="text-4xl md:text-5xl font-bold text-surface-900 dark:text-surface-100 mb-4 !mt-0">
            WhatsApp Gateway
          </h1>
          <p class="text-xl text-surface-600 dark:text-surface-400 mb-8 max-w-2xl mx-auto">
            Simple. Reliable. Developer Friendly.
          </p>
          <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/docs/getting-started"
              class="inline-flex items-center gap-2 px-6 py-3 text-base font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
            >
              Get Started
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
            <a
              href="/reference"
              class="inline-flex items-center gap-2 px-6 py-3 text-base font-medium text-surface-700 dark:text-surface-300 bg-surface-100 dark:bg-surface-800 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
            >
              API Reference
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        {/* Features Grid */}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 not-prose">
          <FeatureCard
            icon={<SessionIcon />}
            title="Session Management"
            description="Create and manage multiple WhatsApp sessions with QR code or phone number pairing."
          />
          <FeatureCard
            icon={<MessageIcon />}
            title="Rich Messaging"
            description="Send text, images, videos, documents, locations, contacts, polls, and more."
          />
          <FeatureCard
            icon={<WebhookIcon />}
            title="Webhook Events"
            description="Receive real-time events for messages, contacts, groups, and connection status."
          />
          <FeatureCard
            icon={<HistoryIcon />}
            title="History Sync"
            description="Automatic synchronization of contacts, chats, and messages when pairing a device."
          />
        </div>

        {/* Quick Start */}
        <div class="bg-surface-50 dark:bg-surface-900 rounded-xl p-6 mb-12 not-prose">
          <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4">
            Quick Start
          </h2>
          <div class="space-y-4">
            <div class="flex items-start gap-3">
              <span class="flex items-center justify-center w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-400 text-sm font-medium shrink-0">1</span>
              <div>
                <p class="font-medium text-surface-900 dark:text-surface-100">Install the Gateway</p>
                <code class="text-sm text-surface-600 dark:text-surface-400">npm install whatsapp-gateway</code>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <span class="flex items-center justify-center w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-400 text-sm font-medium shrink-0">2</span>
              <div>
                <p class="font-medium text-surface-900 dark:text-surface-100">Configure environment</p>
                <code class="text-sm text-surface-600 dark:text-surface-400">cp .env.example .env</code>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <span class="flex items-center justify-center w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-400 text-sm font-medium shrink-0">3</span>
              <div>
                <p class="font-medium text-surface-900 dark:text-surface-100">Start the server</p>
                <code class="text-sm text-surface-600 dark:text-surface-400">npm run dev</code>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <span class="flex items-center justify-center w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-400 text-sm font-medium shrink-0">4</span>
              <div>
                <p class="font-medium text-surface-900 dark:text-surface-100">Create your first session</p>
                <code class="text-sm text-surface-600 dark:text-surface-400">curl -X POST http://localhost:3000/session</code>
              </div>
            </div>
          </div>
          <a
            href="/docs/getting-started"
            class="inline-flex items-center gap-2 mt-6 text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
          >
            Read the full guide
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>

        {/* Content from markdown */}
        {children}
      </div>
    </DocsLayout>
  )
}

const FeatureCard: FC<{ icon: any; title: string; description: string }> = ({ icon, title, description }) => {
  return (
    <div class="p-5 rounded-lg border border-surface-200 dark:border-surface-800 hover:border-brand-200 dark:hover:border-brand-800 transition-colors">
      <div class="w-10 h-10 mb-3 flex items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400">
        {icon}
      </div>
      <h3 class="font-semibold text-surface-900 dark:text-surface-100 mb-1">{title}</h3>
      <p class="text-sm text-surface-600 dark:text-surface-400">{description}</p>
    </div>
  )
}

const SessionIcon: FC = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
)

const MessageIcon: FC = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
)

const WebhookIcon: FC = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)

const HistoryIcon: FC = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
