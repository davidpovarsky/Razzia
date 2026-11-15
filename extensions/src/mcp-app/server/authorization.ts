import { z } from "zod"
import type { MessageExtraInfo } from "@modelcontextprotocol/server"
import { scopes, type ToolName } from "../contracts/tools.ts"
import type {
  Dependencies,
  ServerConfig,
  VerifiedPrincipal,
} from "./dependencies.ts"
import { ToolError } from "./errors.ts"

const nonempty = z.string().min(1).max(256)
const principalSchema = z.strictObject({
  issuer: z.string().url().max(2048),
  audience: z.string().url().max(2048),
  subject: nonempty,
  clientId: nonempty,
  grantId: nonempty,
  accountId: z.uuid(),
  scopes: z.array(z.string().min(1).max(100)).max(20),
  expiresAt: z.number().finite(),
  active: z.literal(true),
  accountsEnabled: z.literal(true),
})
export function validateConfig(config: ServerConfig): ServerConfig {
  for (const value of [
    config.issuer,
    config.resource,
    config.resourceMetadataUrl,
  ]) {
    const url = new URL(value)
    if (
      value.length > 2048 ||
      /[\u0000-\u0020"\\]/u.test(value) ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.search
    ) {
      throw new Error("Exact HTTPS OAuth configuration required")
    }
  }
  for (const origin of config.firstPartyOrigins ?? []) {
    const url = new URL(origin)
    if (url.protocol !== "https:" || url.origin !== origin)
      throw new Error("Exact first-party origin required")
  }
  return Object.freeze({
    ...config,
    firstPartyOrigins: Object.freeze([...(config.firstPartyOrigins ?? [])]),
  })
}
export async function authorize(
  name: ToolName | undefined,
  extra: MessageExtraInfo | undefined,
  deps: Dependencies,
  config: ServerConfig,
): Promise<VerifiedPrincipal> {
  if (!deps.prevalidationLimit) throw new ToolError("DEPENDENCY_UNAVAILABLE")
  if (!(await deps.prevalidationLimit(extra)))
    throw new ToolError("RATE_LIMITED", {}, true)
  if (!deps.authorize) throw new ToolError("ACCOUNT_UNAVAILABLE")
  let raw: unknown
  try {
    raw = await deps.authorize(extra)
  } catch {
    throw new ToolError("SCOPE_REQUIRED")
  }
  const parsed = principalSchema.safeParse(raw)
  if (!parsed.success) throw new ToolError("SCOPE_REQUIRED")
  const p = parsed.data
  if (
    p.issuer !== config.issuer ||
    p.audience !== config.resource ||
    p.expiresAt <= Date.now()
  )
    throw new ToolError("SCOPE_REQUIRED")
  if (!deps.rateLimit) throw new ToolError("DEPENDENCY_UNAVAILABLE")
  if (!(await deps.rateLimit(p, name)))
    throw new ToolError("RATE_LIMITED", {}, true)
  if (name && !scopes[name].every((scope) => p.scopes.includes(scope)))
    throw new ToolError("SCOPE_REQUIRED")
  return Object.freeze({ ...p, scopes: Object.freeze([...p.scopes]) })
}
export function oauthChallenge(config: ServerConfig, name: ToolName): string {
  return (
    'Bearer resource_metadata="' +
    config.resourceMetadataUrl +
    '", error="insufficient_scope", error_description="Authorization required", scope="' +
    scopes[name].join(" ") +
    '"'
  )
}
