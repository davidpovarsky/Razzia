export class HttpRejection extends Error {
  constructor(readonly status: 400 | 403 | 404 | 405 | 413 | 415 | 429) {
    super("HTTP_REJECTED")
  }
}
