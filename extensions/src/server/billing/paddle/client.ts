import type { BillingConfig } from "../config"
import { BillingError } from "../errors"

export class PaddleClient {
  private readonly config: BillingConfig
  private readonly request: typeof fetch
  constructor(config: BillingConfig, request: typeof fetch = fetch) {
    this.config = config
    this.request = request
  }
  async call<T>(path: string, body?: unknown): Promise<T> {
    if (!this.config.apiKey) {
      throw new BillingError("notConfigured", 503)
    }

    const base =
      this.config.environment === "live"
        ? "https://api.paddle.com"
        : "https://sandbox-api.paddle.com"
    let response: Response | undefined = undefined

    try {
      response = await this.request(`${base}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "Paddle-Version": "1",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      })
    } catch {
      throw new BillingError("providerUnavailable", 502)
    }

    if (!response.ok) {
      throw new BillingError("providerUnavailable", 502)
    }

    const payload = (await response.json()) as { data: T }

    return payload.data
  }
  checkout(priceId: string, intentId: string, customerId?: string) {
    return this.call<{ id: string; checkout: { url: string | null } }>(
      "/transactions",
      {
        items: [{ price_id: priceId, quantity: 1 }],
        collection_mode: "automatic",
        custom_data: { tadazz_intent_id: intentId },
        ...(customerId ? { customer_id: customerId } : {}),
      },
    )
  }
  async portal(customerId: string) {
    const result = await this.call<{ urls: { general: { overview: string } } }>(
      `/customers/${encodeURIComponent(customerId)}/portal-sessions`,
      {},
    )
    const url = new URL(result.urls.general.overview)
    const hosts =
      this.config.environment === "live"
        ? ["customer-portal.paddle.com"]
        : ["sandbox-customer-portal.paddle.com"]

    if (url.protocol !== "https:" || !hosts.includes(url.hostname)) {
      throw new BillingError("providerUnavailable", 502)
    }

    return url.href
  }
}
