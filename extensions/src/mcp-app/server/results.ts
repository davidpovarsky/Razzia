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
  ) {
    throw new ToolError("INTERNAL")
  }
}

export function failureResult({
  name,
  error,
  config,
  correlationId = randomUUID(),
}: {
  name: ToolName | undefined
  error: unknown
  config: ServerConfig
  correlationId?: ReturnType<typeof randomUUID>
}) {
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
        // already origin-validated, exact first-party consent route for the
        // requested save action, never private draft data or approval grants.
        text: JSON.stringify({
          ok: false,
          code: failure.code,
          ...((name === "save_game" || name === "install_package") &&
          failure.code === "CONSENT_REQUIRED" &&
          failure.consentRequestId &&
          failure.consentUrl &&
          failure.consentUrl ===
            `${new URL(failure.consentUrl).origin}/studio/${name === "save_game" ? "native-save-consent" : "package-save-consent"}/${failure.consentRequestId}`
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
