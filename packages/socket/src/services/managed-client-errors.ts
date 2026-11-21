import type { ManagedClientError } from "@razzia/common/types/managed-clients"

export class ManagedClientFailure extends Error {
  constructor(
    readonly code: ManagedClientError,
    readonly status: 400 | 401 | 404 | 409 | 429,
    readonly details?: { clientId?: string; retryAfterSeconds?: number },
  ) {
    super(code)
  }
}
