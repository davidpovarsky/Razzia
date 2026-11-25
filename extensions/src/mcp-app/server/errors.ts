import {
  errorSchema,
  type ErrorCode,
  type ToolFailure,
} from "../contracts/schemas.ts"

export class ToolError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details: Partial<
      Pick<ToolFailure, "currentRevision" | "consentRequestId" | "consentUrl">
    > = {},
    readonly retryable = false,
  ) {
    super(code)
  }
}

export const unavailable = () => new ToolError("DEPENDENCY_UNAVAILABLE")

export function safeError(error: unknown): ToolFailure {
  const e = error instanceof ToolError ? error : new ToolError("INTERNAL")
  const parsed = errorSchema.safeParse({
    code: e.code,
    messageKey: `extensions:mcp.${e.code}`,
    retryable: e.retryable,
    ...e.details,
  })

  return parsed.success
    ? parsed.data
    : {
        code: "INTERNAL",
        messageKey: "extensions:mcp.INTERNAL",
        retryable: false,
      }
}
