/**
 * Simple hand-rolled DI container.
 * Register factories, resolve singletons.
 */
export class Container {
  private factories = new Map<string, () => unknown>()
  private singletons = new Map<string, unknown>()

  register<T>(key: string, factory: () => T): void {
    this.factories.set(key, factory)
  }

  resolve<T>(key: string): T {
    // Return cached singleton if exists
    if (this.singletons.has(key)) {
      return this.singletons.get(key) as T
    }

    const factory = this.factories.get(key)
    if (!factory) {
      throw new Error(`Service '${key}' not registered in container`)
    }

    const instance = factory() as T
    this.singletons.set(key, instance)
    return instance
  }

  has(key: string): boolean {
    return this.factories.has(key)
  }
}

// ── DI Keys ──
export const DI = {
  Config: 'config',
  Logger: 'logger',
  QueueDB: 'queueDB',
  ContactStore: 'contactStore',
  ContactResolver: 'contactResolver',
  LidMappingStore: 'lidMappingStore',
  WebhookQueue: 'webhookQueue',
  WebhookDispatcher: 'webhookDispatcher',
  SessionManager: 'sessionManager',
  WhatsAppService: 'whatsappService',
} as const
