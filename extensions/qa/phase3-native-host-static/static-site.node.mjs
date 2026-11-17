import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { createSiteDistHandler } from "../../src/mcp-app/native-host/static-site.ts"

const root = mkdtempSync(join(tmpdir(), "tadazz-static-synthetic-"))
mkdirSync(join(root, "assets"))
writeFileSync(
  join(root, "index.html"),
  "<!doctype html><title>Synthetic Studio</title>",
)
writeFileSync(join(root, "assets", "app.js"), "/* synthetic bundle */")
mkdirSync(join(root, "oauth"))
writeFileSync(join(root, "oauth", "token"), "must never be served")
after(() => rmSync(root, { recursive: true, force: true }))
const serve = createSiteDistHandler(root)
const request = (path, method = "GET") =>
  new Request(`https://synthetic.invalid${path}`, { method })

test("machine/discovery GET and HEAD cannot fall through to SPA or static bytes", async () => {
  for (const path of [
    "/mcp",
    "/mcp/",
    "/mcp/session",
    "/oauth",
    "/oauth/authorize",
    "/oauth/token",
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource/mcp",
    "/api/extensions/private",
    "/%6dcp",
    "/%6fauth/token",
  ]) {
    for (const method of ["GET", "HEAD"]) {
      const response = serve(request(path, method))
      assert.equal(response.status, 404, `${method} ${path}`)
      assert.match(response.headers.get("content-type"), /^application\/json/u)
      assert.equal(response.headers.get("cache-control"), "no-store")
      assert.equal(
        await response.text(),
        method === "HEAD" ? "" : '{"error":"NOT_FOUND"}',
      )
    }
  }
})

test("configured machine paths are denied before SPA and asset resolution", () => {
  const configured = createSiteDistHandler(root, {
    isMachinePath: (pathname) =>
      pathname === "/identity/jwks" || pathname.startsWith("/identity/token/"),
  })
  assert.equal(configured(request("/identity/jwks")).status, 404)
  assert.equal(configured(request("/identity/token/session")).status, 404)
})

test("Studio GET and HEAD retain identical HTML headers and HEAD has no body", async () => {
  const path = "/studio/native-save-consent/synthetic-request"
  const get = serve(request(path))
  const head = serve(request(path, "HEAD"))
  assert.equal(get.status, 200)
  assert.match(get.headers.get("content-type"), /^text\/html/u)
  assert.equal(head.status, 200)
  assert.equal(
    head.headers.get("content-length"),
    get.headers.get("content-length"),
  )
  for (const response of [get, head]) {
    assert.equal(
      response.headers.get("content-security-policy"),
      "frame-ancestors 'none'",
    )
    assert.equal(response.headers.get("x-frame-options"), "DENY")
    assert.equal(response.headers.get("referrer-policy"), "no-referrer")
    assert.equal(response.headers.get("cache-control"), "no-store")
  }
  assert.equal(await head.text(), "")
  assert.match(await get.text(), /Synthetic Studio/u)
})

test("OAuth consent and configured consent HTML use the existing root security policy", () => {
  const configured = createSiteDistHandler(root, {
    isConsentPath: (pathname) => pathname === "/review",
  })
  for (const path of [
    "/studio/oauth-consent?oauth_request=synthetic",
    "/review",
    "/studio/native-save-consent/invalid",
  ]) {
    assert.equal(
      configured(request(path, "HEAD")).headers.get("x-frame-options"),
      "DENY",
    )
  }
  assert.equal(
    configured(request("/studio/games")).headers.get("x-frame-options"),
    null,
  )
  assert.equal(
    configured(request("/assets/app.js")).headers.get("x-frame-options"),
    null,
  )
})

test("assets retain content types and missing assets do not become HTML", async () => {
  const script = serve(request("/assets/app.js"))
  assert.equal(script.status, 200)
  assert.match(script.headers.get("content-type"), /^text\/javascript/u)
  assert.equal(await script.text(), "/* synthetic bundle */")
  assert.equal(serve(request("/assets/missing")).status, 404)
  assert.equal(serve(request("/missing.js")).status, 404)
})

test("unsafe encoded segments and unsupported methods fail closed", () => {
  for (const path of ["/%00", "/%2fsecret", "/%5csecret", "/%ZZ"]) {
    assert.equal(serve(request(path)).status, 400)
  }
  const post = serve(request("/studio", "POST"))
  assert.equal(post.status, 405)
  assert.equal(post.headers.get("allow"), "GET, HEAD")
})
