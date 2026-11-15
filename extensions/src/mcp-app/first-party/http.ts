import { Hono } from "hono"
import type { Context } from "hono"
import type { ApiEnv } from "@razzia/socket/api/factory"
import type { AuthoringPolicy } from "../server/dependencies.ts"
import { safeError, ToolError } from "../server/errors.ts"
import { inputs } from "../contracts/tools.ts"
import { finiteJson } from "../contracts/canonical.ts"
import { CONTRACT_VERSION } from "../contracts/schemas.ts"
import type { ErrorCode } from "../contracts/schemas.ts"
import { loadFirstPartyBindings } from "./bindings.ts"
import type { FirstPartyBindings } from "./bindings.ts"
import { FirstPartyDraftStore } from "./store.ts"
import {
  bodyText,
  HttpRejection,
  IngressBudget,
  route,
  trustedOrigin,
} from "./ingress.ts"
import type { Route } from "./ingress.ts"

export interface FirstPartyAppOptions {
  origin: string
  configRoot: string
  authoring: AuthoringPolicy
}
const budget = new IngressBudget()
const statuses: Partial<Record<ErrorCode, number>> = {
  SCOPE_REQUIRED: 401,
  ACCOUNT_UNAVAILABLE: 503,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  REVISION_CONFLICT: 409,
  REQUEST_KEY_REUSED: 409,
  QUOTA_EXCEEDED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
}
function failure(error: unknown) {
  const status =
    error instanceof HttpRejection
      ? error.status
      : error instanceof ToolError
        ? (statuses[error.code] ?? 500)
        : 500
  return Response.json(
    {
      contractVersion: CONTRACT_VERSION,
      ok: false,
      ...(error instanceof HttpRejection
        ? { error: { code: "HTTP_REJECTED", status } }
        : { error: safeError(error) }),
    },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  )
}
async function dispatch(
  c: Context<ApiEnv>,
  auth: FirstPartyBindings,
  selected: Route,
  policy: AuthoringPolicy,
) {
  // requireManager's real withAccount scope remains active across body awaits.
  const raw = selected.kind === "get" ? undefined : await bodyText(c.req.raw)
  const p = await auth.principal(c)
  auth.assertActive(p)
  const store = new FirstPartyDraftStore(auth, policy)
  if (selected.kind === "get") {
    const data = store.get(p, selected.id)
    auth.assertActive(p)
    return c.json({ contractVersion: CONTRACT_VERSION, ok: true, data })
  }
  let body: unknown
  try {
    body = JSON.parse(raw ?? "")
    finiteJson(body)
  } catch {
    throw new ToolError("VALIDATION_FAILED")
  }
  if (selected.kind === "create") {
    const input = inputs.create_game_draft.safeParse(body)
    if (!input.success) throw new ToolError("VALIDATION_FAILED")
    const data = store.create(p, input.data)
    auth.assertActive(p)
    return c.json({ contractVersion: CONTRACT_VERSION, ok: true, data }, 201)
  }
  if (selected.kind === "replace") {
    const input = inputs.update_game_draft.safeParse(body)
    if (!input.success || input.data.draftId !== selected.id)
      throw new ToolError("VALIDATION_FAILED")
    const data = store.replace(p, input.data)
    auth.assertActive(p)
    return c.json({ contractVersion: CONTRACT_VERSION, ok: true, data })
  }
  const input = inputs.save_game.safeParse(body)
  if (!input.success || input.data.draftId !== selected.id)
    throw new ToolError("VALIDATION_FAILED")
  const preparation = store.prepareSave(p, input.data)
  auth.assertActive(p)
  // A recorded preparation is NOT save_game success, consent or native allocation.
  return c.json(
    {
      contractVersion: CONTRACT_VERSION,
      ok: false,
      error: safeError(new ToolError("DEPENDENCY_UNAVAILABLE")),
      preparation,
    },
    409,
  )
}

/** Unmounted, first-party-only Hono adapter. Does not import/mount the accepted
 * MCP factory or invent host OAuth grants, download endpoints or renderers.
 */
export async function createFirstPartyApp(options: FirstPartyAppOptions) {
  const origin = trustedOrigin(options.origin)
  const root = options.configRoot
  const policy: AuthoringPolicy = {
    allowedPublicAssetUrls: new Set(options.authoring.allowedPublicAssetUrls),
    ...(options.authoring.trustedDefaults === undefined
      ? {}
      : {
          trustedDefaults: structuredClone(options.authoring.trustedDefaults),
        }),
  }
  const auth = await loadFirstPartyBindings(root)
  auth.prepareRuntime()
  return Object.freeze({
    async fetch(request: Request): Promise<Response> {
      let release: (() => void) | undefined
      try {
        release = budget.enter()
        const selected = route(request, origin)
        auth.configured()
        const app = new Hono<ApiEnv>()
        app.use("*", auth.requireManager)
        app.all("*", (c) => dispatch(c, auth, selected, policy))
        app.onError((error) => failure(error))
        const response = await app.fetch(request)
        response.headers.set("cache-control", "no-store")
        response.headers.set("x-content-type-options", "nosniff")
        return response
      } catch (error) {
        return failure(error)
      } finally {
        release?.()
      }
    },
  })
}
