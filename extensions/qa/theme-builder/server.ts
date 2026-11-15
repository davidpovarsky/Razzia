/** Network-disabled synthetic QA only; no production account/storage mounts. */
import { readFileSync } from "node:fs"
import { resolve, extname } from "node:path"
import { createServer } from "node:http"
import { Hono } from "hono"
import { sign, verify } from "hono/jwt"
import { getRequestListener } from "@hono/node-server"
import {
  ThemeInstallationStore,
  ThemeInstallationError,
} from "../../src/server/show-themes/installation"
import { createThemeBuilderRoutes } from "../../src/server/show-themes/builder-routes"
import type { SessionClaims } from "@razzia/common/types/auth"

if (process.env.TADAZZ_REMOTE_QA !== "1") throw new Error("qa:isolated-only")
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
        sub: "author-a",
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
  if (!bearer) return c.json({ error: "unauthorized" }, 401)
  try {
    const claims = await verify(bearer, secret, "HS256")
    if (
      claims.sub !== "author-a" ||
      claims.role !== "manager" ||
      typeof claims.iat !== "number" ||
      typeof claims.exp !== "number"
    )
      return c.json({ error: "unauthorized" }, 401)
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
      if (claims.sub !== "author-a" || tenantId !== "tenant-a")
        throw new ThemeInstallationError("Not found", 404)
      return { userId: claims.sub, tenantId, grants: ["author"] }
    },
    store: () => store,
  }),
)
app.get("*", (c) => {
  const path = c.req.path === "/" ? "index.html" : c.req.path.slice(1)
  if (!/^(index\.html|assets\/[A-Za-z0-9._-]+)$/u.test(path))
    return c.notFound()
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
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'",
    )
    return c.body(bytes)
  } catch {
    return c.notFound()
  }
})
const server = createServer(getRequestListener(app.fetch))
server.listen(0, "127.0.0.1", () => {
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("qa:no-port")
  process.stdout.write(`QA_PORT=${address.port}\n`)
})
process.on("SIGTERM", () => {
  server.close()
  store.close()
})
