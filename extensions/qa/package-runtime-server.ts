/* oxlint-disable no-await-in-loop -- Startup waits for only this isolated store, with a fixed timeout. */
/** Dedicated cookie-free origin; no auth/game/private API is mounted here. */
import { Hono } from "hono"
import { serve } from "@hono/node-server"
import {
  PackageStore,
  readRuntimeAccess,
  sandboxDocument,
} from "../src/server/packages/index"
import path from "node:path"
import fs from "node:fs"
const root = process.env.TADAZZ_PACKAGE_STORE
const secret = process.env.TADAZZ_RUNTIME_CAPABILITY_SECRET
const parentOrigin = process.env.TADAZZ_PACKAGE_PARENT_ORIGIN
const runtimeOrigin = process.env.TADAZZ_PACKAGE_RUNTIME_ORIGIN

if (
  !root ||
  !secret ||
  !parentOrigin ||
  !runtimeOrigin ||
  new URL(parentOrigin).origin === new URL(runtimeOrigin).origin
) {
  throw new Error("Dedicated runtime configuration required")
}

for (
  let i = 0;
  i < 60 && !fs.existsSync(path.join(root, "packages.sqlite"));
  i += 1
) {
  await new Promise((r) => {
    setTimeout(r, 1000)
  })
}
const store = new PackageStore(
  root,
  secret,
  (tenant) => path.resolve(root, "../../tenants", tenant),
  { readOnly: true },
)
const app = new Hono()
app.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store")
  c.header("X-Content-Type-Options", "nosniff")
  c.header("Referrer-Policy", "no-referrer")
  c.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), autoplay=()",
  )

  if (c.req.header("host") !== new URL(runtimeOrigin).host) {
    return c.body(null, 404)
  }

  await next()
})
app.get("/render", (c) => {
  try {
    const { bundle } = readRuntimeAccess(
      store,
      c.req.query("ticket") ?? "",
      secret,
    )
    const theme = bundle[c.req.query("theme") ?? ""]

    if (!theme) {
      return c.body(null, 404)
    }

    const doc = sandboxDocument(
      theme.js,
      theme.css,
      new URL(parentOrigin).origin,
    )
    c.header("Content-Security-Policy", doc.csp)

    return c.html(doc.html)
  } catch {
    return c.body(null, 403)
  }
})
app.get("/health", (c) => c.json({ status: "ok" }))
serve({
  fetch: app.fetch,
  hostname: "0.0.0.0",
  port: Number(process.env.TADAZZ_PACKAGE_RUNTIME_PORT ?? 3192),
})
