import type { ManagedClientError } from "@razzia/common/types/managed-clients"

export class ManagedClientFailure extends Error {
  readonly code: ManagedClientError
  readonly status: 400 | 401 | 404 | 409 | 429
  readonly details?: { clientId?: string; retryAfterSeconds?: number }

  constructor(
    code: ManagedClientError,
    status: 400 | 401 | 404 | 409 | 429,
    details?: { clientId?: string; retryAfterSeconds?: number },
  ) {
    super(code)
    this.code = code
    this.status = status
    this.details = details
  }
}
