import type { StatusCodes } from "http-status-codes"

export class CompositeStorageError extends Error {
  readonly statusCode: StatusCodes

  constructor(message: string, statusCode: StatusCodes) {
    super(message)
    this.name = "CompositeStorageError"
    this.statusCode = statusCode
  }
}
