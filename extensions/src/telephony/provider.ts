import type {
  InboundWebhookRequest,
  TelephonyDirective,
  TelephonyEvent,
  WebhookVerificationResult,
} from "./types"

/**
 * Common contract for all telephony provider adapters.
 */
export interface TelephonyProvider {
  /**
   * Unique identifier for the provider (e.g. 'mock', 'yemot').
   */
  readonly id: string

  /**
   * Human-readable display name.
   */
  readonly name: string

  /**
   * Whether the provider is active/enabled.
   */
  readonly isEnabled: boolean

  /**
   * Verifies incoming webhook authenticity and anti-tamper signature.
   */
  verifyRequest(
    req: InboundWebhookRequest,
  ): Promise<WebhookVerificationResult> | WebhookVerificationResult

  /**
   * Translates incoming webhook request into normalized TelephonyEvent.
   */
  parseRequest(req: InboundWebhookRequest): TelephonyEvent | null

  /**
   * Formats a TelephonyDirective into provider-specific wire response.
   */
  formatResponse(directive: TelephonyDirective): {
    statusCode: number
    headers: Record<string, string>
    body: string
  }
}

/**
 * Registry of available telephony providers.
 */
export class ProviderRegistry {
  private static instance: ProviderRegistry | null = null
  private providers = new Map<string, TelephonyProvider>()

  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry()
    }
    return ProviderRegistry.instance
  }

  register(provider: TelephonyProvider): void {
    this.providers.set(provider.id, provider)
  }

  get(id: string): TelephonyProvider | undefined {
    return this.providers.get(id)
  }

  has(id: string): boolean {
    return this.providers.has(id)
  }

  list(): TelephonyProvider[] {
    return Array.from(this.providers.values())
  }

  clear(): void {
    this.providers.clear()
  }
}
