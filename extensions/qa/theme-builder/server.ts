/** Network-disabled synthetic QA only; no production account/storage mounts. */
import { readFileSync } from "node:fs"
import { resolve, extname } from "node:path"
import { createServer } from "node:http"
import { createHash } from "node:crypto"
import { oauthConsentSecurityHeaders } from "../../src/site/oauth-consent-headers"
import { Hono } from "hono"
import { sign, verify } from "hono/jwt"
import { getRequestListener } from "@hono/node-server"
import {
  ThemeInstallationStore,
  ThemeInstallationError,
} from "../../src/server/show-themes/installation"
import { createThemeBuilderRoutes } from "../../src/server/show-themes/builder-routes"
import type { SessionClaims } from "@razzia/common/types/auth"

function isSyntheticConsentRequest(
  value: unknown,
): value is Record<string, unknown> & { ticket: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "ticket" in value &&
    typeof value.ticket === "string"
  )
}

if (process.env.TADAZZ_REMOTE_QA !== "1") {
  throw new Error("qa:isolated-only")
}

const secret = "synthetic-only-theme-builder-test-key-20261115"
const store = new ThemeInstallationStore(
  "/tmp/theme-builder-ui/themes.sqlite",
  Buffer.alloc(32, 42),
)
const app = new Hono<{ Variables: { claims: SessionClaims } }>()
app.get("/qa/session", async (c) =>
  c.json({
    token: await sign(
      {
        sub: c.req.query("owner") === "b" ? "author-b" : "author-a",
        role: "manager",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
      },
      secret,
      "HS256",
    ),
  }),
)
app.use("/api/*", async (c, next) => {
  const bearer = c.req
    .header("Authorization")
    ?.match(/^Bearer ([A-Za-z0-9._-]+)$/u)?.[1]

  if (!bearer) {
    return c.json({ error: "unauthorized" }, 401)
  }

  try {
    const claims = await verify(bearer, secret, "HS256")

    if (
      claims.sub !== "author-a" ||
      claims.role !== "manager" ||
      typeof claims.iat !== "number" ||
      typeof claims.exp !== "number"
    ) {
      return c.json({ error: "unauthorized" }, 401)
    }

    c.set("claims", claims as unknown as SessionClaims)
  } catch {
    return c.json({ error: "unauthorized" }, 401)
  }

  await next()
})
app.route(
  "/api/themes/builder",
  createThemeBuilderRoutes({
    enabled: () => true,
    principal: (claims, tenantId) => {
      if (claims.sub !== "author-a" || tenantId !== "tenant-a") {
        throw new ThemeInstallationError("Not found", 404)
      }

      return { userId: claims.sub, tenantId, grants: ["author"] }
    },
    store: () => store,
  }),
)
// Only this isolated component fixture emulates inspect/approve. Real F issuer
// account/session/PKCE/grant integration remains an independently labeled check.
const consentRequests = new Map<
  string,
  { proof: string; expiresAt: number; inspect: number; approve: number }
>()
app.get("/api/accounts/me", (c) =>
  c.json({
    id: "author-a",
    email: "synthetic-author@example.invalid",
    verified: true,
  }),
)
app.post("/api/qa/oauth/inspect", async (c) => {
  if (c.req.header("Origin") !== new URL(c.req.url).origin) {
    return c.json({ error: "origin" }, 403)
  }

  const body: unknown = await c.req.json()

  if (
    !isSyntheticConsentRequest(body) ||
    body.ticket.length < 40 ||
    body.ticket.length > 8192 ||
    consentRequests.size >= 128
  ) {
    return c.json({ error: "invalid" }, 400)
  }

  const current = consentRequests.get(body.ticket)
  const value = {
    proof: createHash("sha256")
      .update(body.ticket + String(c.req.header("Authorization")))
      .digest("hex"),
    expiresAt: Date.now() + (body.ticket.startsWith("short-") ? 5000 : 300000),
    inspect: (current?.inspect ?? 0) + 1,
    approve: current?.approve ?? 0,
  }
  consentRequests.set(body.ticket, value)

  return c.json({
    clientId: "synthetic-registered-client",
    scopes: ["tadazz.catalog.read", "tadazz.drafts.read"],
    expiresAt: value.expiresAt,
    proof: value.proof,
  })
})
app.post("/api/qa/oauth/approve", async (c) => {
  if (c.req.header("Origin") !== new URL(c.req.url).origin) {
    return c.json({ error: "origin" }, 403)
  }

  const body: unknown = await c.req.json()

  if (!isSyntheticConsentRequest(body)) {
    return c.json({ error: "invalid" }, 400)
  }

  const record = consentRequests.get(body.ticket)

  if (
    !record ||
    record.approve ||
    record.expiresAt <= Date.now() ||
    body.decision !== "allow" ||
    body.proof !== record.proof
  ) {
    return c.json({ error: "invalid" }, 400)
  }

  record.approve += 1

  return c.json({
    grantId: "synthetic-ui-only-grant",
    redirectUrl:
      "https://consent-callback.example.invalid/callback?code=synthetic-code&state=original",
  })
})
app.get("/qa/oauth-stats", (c) => {
  const record = consentRequests.get(c.req.query("ticket") ?? "")

  return c.json({
    inspect: record?.inspect ?? 0,
    approve: record?.approve ?? 0,
  })
})
app.get("*", (c) => {
  const consent = c.req.path === "/studio/oauth-consent"
  const path =
    c.req.path === "/" || consent ? "index.html" : c.req.path.slice(1)

  if (!/^(index\.html|assets\/[A-Za-z0-9._-]+)$/u.test(path)) {
    return c.notFound()
  }

  try {
    const bytes = readFileSync(resolve("/out/ui", path))
    c.header(
      "Content-Type",
      (
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".woff2": "font/woff2",
        } as Record<string, string>
      )[extname(path)] ?? "application/octet-stream",
    )
    c.header("X-Content-Type-Options", "nosniff")
    c.header(
      "Content-Security-Policy",

      `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'${
        consent
          ? `; ${oauthConsentSecurityHeaders["Content-Security-Policy"]}`
          : ""
      }`,
    )

    if (consent) {
      c.header(
        "X-Frame-Options",
        oauthConsentSecurityHeaders["X-Frame-Options"],
      )
      c.header(
        "Referrer-Policy",
        oauthConsentSecurityHeaders["Referrer-Policy"],
      )
      c.header("Cache-Control", oauthConsentSecurityHeaders["Cache-Control"])
    }

    return c.body(bytes)
  } catch {
    return c.notFound()
  }
})
const requestListener = getRequestListener(app.fetch)
const server = createServer((request, response) => {
  void requestListener(request, response).catch((error: unknown) => {
    server.emit("error", error)
  })
})
server.listen(0, "127.0.0.1", () => {
  const address = server.address()

  if (!address || typeof address === "string") {
    throw new Error("qa:no-port")
  }

  process.stdout.write(`QA_PORT=${address.port}\n`)
})
process.on("SIGTERM", () => {
  server.close()
  store.close()
})
