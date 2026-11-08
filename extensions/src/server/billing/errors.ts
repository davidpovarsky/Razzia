export class BillingError extends Error {
  readonly code: string
  readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 502 | 503
  constructor(code: string, status: BillingError["status"] = 409) {
    super(`extensions:billing.errors.${code}`)
    this.code = code
    this.status = status
  }
}
