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
const mediaBytes = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
for (const extension of ["mp3", "wav", "mp4"]) {
  writeFileSync(join(root, "assets", "media." + extension), mediaBytes)
}
writeFileSync(join(root, "assets", "empty.mp3"), "")
mkdirSync(join(root, "oauth"))
writeFileSync(join(root, "oauth", "token"), "must never be served")
after(() => rmSync(root, { recursive: true, force: true }))
const serve = createSiteDistHandler(root)
const request = (path, method = "GET", headers = {}) =>
  new Request(`https://synthetic.invalid${path}`, { method, headers })

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

test("media GET and HEAD advertise byte seeking with accurate audio/video types", async () => {
  for (const [extension, contentType] of [
    ["mp3", "audio/mpeg"],
    ["wav", "audio/wav"],
    ["mp4", "video/mp4"],
  ]) {
    const get = serve(request("/assets/media." + extension))
    const head = serve(request("/assets/media." + extension, "HEAD"))

    for (const response of [get, head]) {
      assert.equal(response.status, 200)
      assert.equal(response.headers.get("content-type"), contentType)
      assert.equal(response.headers.get("content-length"), "10")
      assert.equal(response.headers.get("accept-ranges"), "bytes")
      assert.equal(response.headers.get("content-range"), null)
    }

    assert.deepEqual(Buffer.from(await get.arrayBuffer()), mediaBytes)
    assert.equal(await head.text(), "")
  }
})

test("single byte ranges return exact closed, open-ended and suffix slices", async () => {
  for (const [header, start, end] of [
    ["bytes=0-0", 0, 0],
    ["bytes=3-6", 3, 6],
    ["bytes=4-", 4, 9],
    ["bytes=-3", 7, 9],
    ["bytes=0-999", 0, 9],
    ["bytes=-999", 0, 9],
    ["BYTES=0002-0004", 2, 4],
    ["bytes=2-999999999999999999999999", 2, 9],
    ["bytes=-999999999999999999999999", 0, 9],
  ]) {
    const response = serve(
      request("/assets/media.mp3", "GET", { Range: header }),
    )
    assert.equal(response.status, 206, header)
    assert.equal(response.headers.get("accept-ranges"), "bytes", header)
    assert.equal(response.headers.get("content-type"), "audio/mpeg", header)
    assert.equal(
      response.headers.get("content-range"),
      "bytes " + start + "-" + end + "/10",
      header,
    )
    assert.equal(
      response.headers.get("content-length"),
      String(end - start + 1),
      header,
    )
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      mediaBytes.subarray(start, end + 1),
      header,
    )
  }
})

test("invalid and unsatisfiable byte ranges return bounded 416 responses", async () => {
  for (const header of [
    "bytes=10-",
    "bytes=10-12",
    "bytes=9-3",
    "bytes=-0",
    "bytes=-",
    "bytes=word",
    "bytes=1.5-2",
    "bytes=+1-2",
    "bytes=999999999999999999999999-",
  ]) {
    const response = serve(
      request("/assets/media.wav", "GET", { Range: header }),
    )
    assert.equal(response.status, 416, header)
    assert.equal(response.headers.get("accept-ranges"), "bytes", header)
    assert.equal(response.headers.get("content-range"), "bytes */10", header)
    assert.equal(response.headers.get("content-length"), "0", header)
    assert.equal(await response.text(), "", header)
  }

  const empty = serve(
    request("/assets/empty.mp3", "GET", { Range: "bytes=0-" }),
  )
  assert.equal(empty.status, 416)
  assert.equal(empty.headers.get("content-range"), "bytes */0")
  assert.equal(empty.headers.get("content-length"), "0")
  assert.equal(await empty.text(), "")
})

test("HEAD ignores Range and retains full representation metadata without a body", async () => {
  for (const header of ["bytes=0-0", "bytes=100-", "bytes=invalid"]) {
    const response = serve(
      request("/assets/media.mp4", "HEAD", { Range: header }),
    )
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("content-type"), "video/mp4")
    assert.equal(response.headers.get("accept-ranges"), "bytes")
    assert.equal(response.headers.get("content-length"), "10")
    assert.equal(response.headers.get("content-range"), null)
    assert.equal(await response.text(), "")
  }
})

test("unsupported ranges and unvalidated If-Range use complete 200 responses", async () => {
  for (const headers of [
    { Range: "items=0-1" },
    { Range: "bytes=0-1,3-5" },
    { Range: "bytes=0-2", "If-Range": '"unpublished-etag"' },
    { Range: "bytes=0-2", "If-Range": 'W/"unpublished-etag"' },
    { Range: "bytes=0-2", "If-Range": "Wed, 19 Nov 2025 00:00:00 GMT" },
  ]) {
    const response = serve(request("/assets/media.mp3", "GET", headers))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("accept-ranges"), "bytes")
    assert.equal(response.headers.get("content-length"), "10")
    assert.equal(response.headers.get("content-range"), null)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), mediaBytes)
  }
})

test("Range cannot bypass protected paths or change consent fallback protections", async () => {
  const headers = { Range: "bytes=0-4" }
  for (const path of [
    "/oauth/token",
    "/%6fauth/token",
    "/api/extensions/private",
  ]) {
    const response = serve(request(path, "GET", headers))
    assert.equal(response.status, 404)
    assert.equal(response.headers.get("content-range"), null)
    assert.equal(response.headers.get("cache-control"), "no-store")
  }

  assert.equal(
    serve(request("/assets/missing.mp4", "GET", headers)).status,
    404,
  )
  assert.equal(serve(request("/%2fsecret", "GET", headers)).status, 400)
  assert.equal(serve(request("/assets/media.mp4", "POST", headers)).status, 405)

  const consent = serve(request("/studio/oauth-consent", "GET", headers))
  assert.equal(consent.status, 200)
  assert.equal(consent.headers.get("content-range"), null)
  assert.equal(consent.headers.get("x-frame-options"), "DENY")
  assert.equal(consent.headers.get("cache-control"), "no-store")
  assert.match(await consent.text(), /Synthetic Studio/u)

  const protectedFile = createSiteDistHandler(root, {
    isConsentPath: (pathname) => pathname === "/index.html",
  })(request("/index.html", "GET", headers))
  assert.equal(protectedFile.status, 206)
  assert.equal(protectedFile.headers.get("x-frame-options"), "DENY")
  assert.equal(
    protectedFile.headers.get("content-security-policy"),
    "frame-ancestors 'none'",
  )
  assert.equal(protectedFile.headers.get("referrer-policy"), "no-referrer")
  assert.equal(protectedFile.headers.get("cache-control"), "no-store")
})
