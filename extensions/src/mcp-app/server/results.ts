import { randomUUID } from "node:crypto"
import { CONTRACT_VERSION, jsonObject } from "../contracts/schemas.ts"
import { outputs, type ToolName } from "../contracts/tools.ts"
import type { ServerConfig } from "./dependencies.ts"
import { oauthChallenge } from "./authorization.ts"
import { safeError, ToolError } from "./errors.ts"

export function firstPartyUrl(value: string, config: ServerConfig) {
  const u = new URL(value)
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hash ||
    u.search ||
    !config.firstPartyOrigins?.includes(u.origin)
  )
    throw new ToolError("INTERNAL")
}

export function failureResult(
  name: ToolName | undefined,
  error: unknown,
  config: ServerConfig,
  correlationId = randomUUID(),
) {
  const failure = safeError(error)
  if (failure.consentUrl) {
    try {
      firstPartyUrl(failure.consentUrl, config)
    } catch {
      delete failure.consentUrl
      delete failure.consentRequestId
      failure.code = "INTERNAL"
      failure.messageKey = "extensions:mcp.INTERNAL"
      failure.retryable = false
    }
  }
  // Every tool has this same strict failure branch. Unknown names are never echoed.
  const structuredContent = jsonObject.parse(
    outputs[name ?? "get_game_draft"].parse({
      contractVersion: CONTRACT_VERSION,
      ok: false,
      correlationId,
      error: failure,
    }),
  )
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        // Some MCP hosts surface only text when isError=true. Include the
        // already origin-validated, first-party consent URL for this one
        // owner-reviewed save action, never private draft data or tokens.
        text: JSON.stringify({
          ok: false,
          code: failure.code,
          ...(name === "save_game" &&
          failure.code === "CONSENT_REQUIRED" &&
          failure.consentRequestId &&
          failure.consentUrl &&
          failure.consentUrl ===
            `${new URL(failure.consentUrl).origin}/studio/native-save-consent/${failure.consentRequestId}`
            ? {
                consentRequestId: failure.consentRequestId,
                consentUrl: failure.consentUrl,
              }
            : {}),
        }),
      },
    ],
    structuredContent,
    ...(name &&
    (failure.code === "SCOPE_REQUIRED" ||
      failure.code === "ACCOUNT_UNAVAILABLE")
      ? { _meta: { "mcp/www_authenticate": [oauthChallenge(config, name)] } }
      : {}),
  }
}
