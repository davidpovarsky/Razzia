export class PackageError extends Error {
  readonly code: string
  readonly status: 400 | 403 | 404 | 409 | 413 | 422

  constructor(code: string, status: 400 | 403 | 404 | 409 | 413 | 422 = 422) {
    super(code)
    this.code = code
    this.status = status
  }
}
