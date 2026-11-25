import type { QuizzValidated } from "@razzia/common/validators/quizz"
import {
  RevisionConflictError,
  computeCanonicalBaseDigest,
  type AnyQuizExtras,
  type EnhancedBundle,
} from "@razzia/extensions/core"

export { RevisionConflictError }

export interface CompositeQuizResponse {
  quizId: string
  exists: boolean
  extras: AnyQuizExtras | null
  baseDigest: string
}

export interface SaveCompositeResult {
  quizId: string
  revision: number
  baseDigest: string
}

export type EnhancedQuizBundle = EnhancedBundle

export interface CompositeApiClientOptions {
  baseUrl?: string
  fetchFn?: typeof fetch
  getAuthToken?: () => Promise<string | null> | string | null
}

/**
 * Typed client for composite /api/extensions/quizzes REST endpoints.
 * Mounts manager-authenticated endpoints per 12_IMPLEMENTATION_ARCHITECTURE_AND_WIRE.md.
 */
export class CompositeApiClient {
  private readonly baseUrl: string
  private readonly fetchFn: typeof fetch
  private readonly getAuthToken?: () => Promise<string | null> | string | null

  constructor(options: CompositeApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? ""
    const rawFetch = options.fetchFn ?? globalThis.fetch
    this.fetchFn = rawFetch.bind(globalThis)
    this.getAuthToken = options.getAuthToken
  }

  private async getHeaders(): Promise<Headers> {
    const headers = new Headers({
      "Content-Type": "application/json",
      Accept: "application/json",
    })

    if (this.getAuthToken) {
      const token = await this.getAuthToken()

      if (token) {
        headers.set("Authorization", `Bearer ${token}`)
      }
    } else if (typeof window !== "undefined") {
      const token = window.localStorage.getItem("token")

      if (token) {
        headers.set("Authorization", `Bearer ${token}`)
      }
    }

    return headers
  }

  /**
   * GET /api/extensions/quizzes/:id
   */
  async getQuizComposite(id: string): Promise<CompositeQuizResponse> {
    const headers = await this.getHeaders()
    const res = await this.fetchFn(
      `${this.baseUrl}/api/extensions/quizzes/${id}`,
      {
        method: "GET",
        headers,
      },
    )

    if (res.status === 404) {
      return {
        quizId: id,
        exists: false,
        extras: null,
        baseDigest: "",
      }
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch quiz extras: HTTP ${res.status}`)
    }

    return (await res.json()) as CompositeQuizResponse
  }

  /**
   * PUT /api/extensions/quizzes/:id
   * Handles 409 revision/digest conflict.
   */
  async saveQuizComposite(
    id: string,
    payload: {
      expectedRevision: number | null
      quizz: QuizzValidated
      extras: AnyQuizExtras
    },
  ): Promise<SaveCompositeResult> {
    const baseDigest = computeCanonicalBaseDigest(payload.quizz)

    const normalizedPayload = {
      ...payload,
      extras: {
        ...payload.extras,
        baseDigest,
      },
    }

    const headers = await this.getHeaders()
    const res = await this.fetchFn(
      `${this.baseUrl}/api/extensions/quizzes/${id}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify(normalizedPayload),
      },
    )

    if (res.status === 409) {
      let conflictBody: {
        error?: string
        message?: string
        currentRevision?: number
        serverRevision?: number
        expectedRevision?: number | null
      } = {}

      try {
        conflictBody = (await res.json()) as typeof conflictBody
      } catch {
        // Ignore parse error
      }

      const effectiveServerRevision =
        conflictBody.currentRevision ?? conflictBody.serverRevision

      throw new RevisionConflictError(
        conflictBody.error ??
          conflictBody.message ??
          "Revision conflict: quiz was modified by another session",
        {
          serverRevision: effectiveServerRevision,
          expectedRevision:
            conflictBody.expectedRevision ?? payload.expectedRevision,
        },
      )
    }

    if (!res.ok) {
      throw new Error(`Failed to save composite quiz: HTTP ${res.status}`)
    }

    return (await res.json()) as SaveCompositeResult
  }

  /**
   * POST /api/extensions/quizzes
   */
  async createQuizComposite(payload: {
    quizz: QuizzValidated
    extras: AnyQuizExtras
  }): Promise<SaveCompositeResult> {
    const baseDigest = computeCanonicalBaseDigest(payload.quizz)

    const normalizedPayload = {
      ...payload,
      extras: {
        ...payload.extras,
        quizId: payload.extras.quizId || "temp-new",
        baseDigest,
      },
    }

    const headers = await this.getHeaders()
    const res = await this.fetchFn(`${this.baseUrl}/api/extensions/quizzes`, {
      method: "POST",
      headers,
      body: JSON.stringify(normalizedPayload),
    })

    if (!res.ok) {
      throw new Error(`Failed to create composite quiz: HTTP ${res.status}`)
    }

    return (await res.json()) as SaveCompositeResult
  }

  /**
   * DELETE /api/extensions/quizzes/:id
   */
  async deleteQuizComposite(id: string): Promise<void> {
    const headers = await this.getHeaders()
    const res = await this.fetchFn(
      `${this.baseUrl}/api/extensions/quizzes/${id}`,
      {
        method: "DELETE",
        headers,
      },
    )

    if (!res.ok && res.status !== 404) {
      throw new Error(`Failed to delete composite quiz: HTTP ${res.status}`)
    }
  }

  /**
   * GET /api/extensions/export/:id
   */
  async exportQuizBundle(id: string): Promise<EnhancedQuizBundle> {
    const headers = await this.getHeaders()
    const res = await this.fetchFn(
      `${this.baseUrl}/api/extensions/export/${id}`,
      {
        method: "GET",
        headers,
      },
    )

    if (!res.ok) {
      throw new Error(`Failed to export enhanced bundle: HTTP ${res.status}`)
    }

    return (await res.json()) as EnhancedQuizBundle
  }

  /**
   * POST /api/extensions/import
   */
  async importQuizBundle(
    bundle: EnhancedQuizBundle,
  ): Promise<SaveCompositeResult> {
    const headers = await this.getHeaders()
    const res = await this.fetchFn(`${this.baseUrl}/api/extensions/import`, {
      method: "POST",
      headers,
      body: JSON.stringify(bundle),
    })

    if (!res.ok) {
      throw new Error(`Failed to import enhanced bundle: HTTP ${res.status}`)
    }

    return (await res.json()) as SaveCompositeResult
  }
}
