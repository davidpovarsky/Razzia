/** Synthetic DTO/UI QA only. No real F issuer, B native port or native allocator. */
import { readFileSync } from "node:fs"
import { resolve, extname } from "node:path"
import { createServer } from "node:http"
import { createHash, randomUUID } from "node:crypto"
import { Hono } from "hono"
import { sign, verify } from "hono/jwt"
import { getRequestListener } from "@hono/node-server"
import {
  nativeSaveInspectInput,
  nativeSaveApproveInput,
} from "../../src/mcp-app/contracts/native-save"
import { oauthConsentSecurityHeaders } from "../../src/site/oauth-consent-headers"
if (process.env.TADAZZ_REMOTE_QA !== "1") throw new Error("qa:isolated-only")
const secret = "synthetic-native-save-consent-key-only-20261115"
const accountA = "d8c27613-c6b8-49bf-9f92-c333f38beb3a",
  accountB = "b7a38b3d-b799-4a3d-8d96-d592b4cc57c4"
const account = (id: string) => ({
  id,
  email:
    id === accountA
      ? "native-author@example.invalid"
      : "other-author@example.invalid",
  verified: true,
})
const snapshot =
  '{\n  "title": "Exact <img src=x onerror=window.__nativeSaveXss=true> snapshot",\n  "cards": [{"id":"one","text":"Literal </pre><script>window.__nativeSaveXss=true</script>"}]\n}\n'
const authoredDigest = createHash("sha256").update(snapshot).digest("hex")
type Record = {
  proof: string
  token: string
  expiresAt: number
  inspect: number
  approve: number
}
const records = new Map<string, Record>()
const app = new Hono<{ Variables: { owner: string; token: string } }>()
app.get("/qa/native-save/session", async (c) => {
  const id = c.req.query("owner") === "b" ? accountB : accountA
  return c.json({
    account: account(id),
    token: await sign(
      {
        sub: id,
        sid: randomUUID(),
        role: "manager",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
      },
      secret,
      "HS256",
    ),
  })
})
app.use("/api/*", async (c, next) => {
  const token = c.req
    .header("Authorization")
    ?.match(/^Bearer ([A-Za-z0-9._-]+)$/u)?.[1]
  if (!token) return c.json({ error: "unauthorized" }, 401)
  try {
    const claims = await verify(token, secret, "HS256")
    if (
      ![accountA, accountB].includes(String(claims.sub)) ||
      claims.role !== "manager"
    )
      return c.json({ error: "unauthorized" }, 401)
    c.set("owner", String(claims.sub))
    c.set("token", token)
  } catch {
    return c.json({ error: "unauthorized" }, 401)
  }
  await next()
})
app.get("/api/accounts/me", (c) => c.json(account(c.get("owner"))))
app.post("/api/qa/oauth/native-save/inspect", async (c) => {
  if (
    c.req.header("Origin") !== new URL(c.req.url).origin ||
    records.size >= 128
  )
    return c.json({ error: "denied" }, 403)
  const { consentRequestId: id } = nativeSaveInspectInput.parse(
    await c.req.json(),
  )
  const token = c.get("token"),
    previous = records.get(id)
  const record = {
    token,
    proof: createHash("sha256")
      .update(id + token)
      .digest("hex"),
    expiresAt: Date.now() + 300000,
    inspect: (previous?.inspect ?? 0) + 1,
    approve: previous?.approve ?? 0,
  }
  records.set(id, record)
  const state = id.startsWith("A")
    ? "approved"
    : id.startsWith("B")
      ? "publishing"
      : id.startsWith("S")
        ? "saved"
        : id.startsWith("E")
          ? "expired"
          : "pending"
  return c.json({
    contractVersion: "0.1.0",
    ok: true,
    data: {
      version: 1,
      consentRequestId: id,
      accountId: c.get("owner"),
      clientId: "synthetic-native-save-client",
      draftId: "d".repeat(22),
      revision: 7,
      summary: {
        title: "Exact snapshot",
        cardCount: 3,
        questionCount: 2,
        themeId: "razzia-original",
        themeVersion: "1.0.0",
        diagnostics: [],
      },
      authoredShowJson: snapshot,
      authoredDigest,
      expiresAt: state === "expired" ? Date.now() - 1 : record.expiresAt,
      state,
      ...(state === "pending" ? { proof: record.proof } : {}),
    },
  })
})
app.post("/api/qa/oauth/native-save/approve", async (c) => {
  if (c.req.header("Origin") !== new URL(c.req.url).origin)
    return c.json({ error: "origin" }, 403)
  const body = nativeSaveApproveInput.parse(await c.req.json()),
    record = records.get(body.consentRequestId)
  if (
    !record ||
    record.token !== c.get("token") ||
    record.approve ||
    record.expiresAt <= Date.now() ||
    body.proof !== record.proof
  )
    return c.json(
      {
        contractVersion: "0.1.0",
        ok: false,
        error: {
          code: "CONSENT_REQUIRED",
          messageKey: "safe",
          retryable: false,
        },
      },
      409,
    )
  record.approve++
  return c.json({
    contractVersion: "0.1.0",
    ok: true,
    data: {
      version: 1,
      state: "approved",
      consentRequestId: body.consentRequestId,
      draftId: "d".repeat(22),
      revision: 7,
      expiresAt: record.expiresAt,
    },
  })
})
app.get("/qa/native-save/stats", (c) => {
  const record = records.get(c.req.query("id") ?? "")
  return c.json({
    inspect: record?.inspect ?? 0,
    approve: record?.approve ?? 0,
  })
})
app.get("/qa/native-save/snapshot", (c) =>
  c.json({ authoredShowJson: snapshot, authoredDigest }),
)
app.get("/favicon.ico", (c) => c.body(null, 204))
app.get("*", (c) => {
  const consent = c.req.path.startsWith("/studio/native-save-consent/")
  const path = consent ? "native-save.html" : c.req.path.slice(1)
  if (!/^(native-save\.html|assets\/[A-Za-z0-9._-]+)$/u.test(path))
    return c.notFound()
  try {
    const bytes = readFileSync(resolve("/out/native-save-ui", path))
    c.header(
      "Content-Type",
      (
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".woff2": "font/woff2",
        } as { [key: string]: string }
      )[extname(path)] ?? "application/octet-stream",
    )
    c.header("X-Content-Type-Options", "nosniff")
    c.header(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'" +
        (consent
          ? `; ${oauthConsentSecurityHeaders["Content-Security-Policy"]}`
          : ""),
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
const server = createServer(getRequestListener(app.fetch))
server.listen(0, "127.0.0.1", () => {
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("qa:no-port")
  process.stdout.write(`QA_PORT=${address.port}\n`)
})
process.on("SIGTERM", () => server.close())
