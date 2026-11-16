// Local-only, read-only, synthetic browser fixture; never a remote MCP endpoint.
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { extname } from "node:path"
import { retainedPacket } from "./retained-schema.ts"
import { qaNativeV2Input } from "../../../docs/extensions/qa-evidence/show-ui-20261115/qa-native-v2-host.ts"
const mime = new Map([
  [".html", "text/html"],
  [".css", "text/css"],
  [".js", "text/javascript"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".webp", "image/webp"],
])
const root = new URL("../../src/mcp-app/widget/dist/", import.meta.url)
const raw: unknown = JSON.parse(
  process.env.TADAZZ_WIDGET_PREVIEW_PACKET
    ? readFileSync(process.env.TADAZZ_WIDGET_PREVIEW_PACKET, "utf8")
    : execFileSync(
        "git",
        [
          "show",
          "7f0d4d89e0f77be49c6543411937d977212f132f:docs/extensions/qa-evidence/mcp-foundation-20261115/preview-candidate/candidate-07/tool-results.json",
        ],
        { encoding: "utf8" },
      ),
)
const [retainedResult] = retainedPacket.parse(raw).results

const bytes = new Map(
  [
    "widget.html",
    "widget.js",
    "widget.css",
    "fixture.html",
    "fixture.js",
    "fixture.css",
    "host.js",
  ].map((name) => [`/${name}`, readFileSync(new URL(name, root))]),
)
const csp =
  "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; object-src 'none'"
const server = createServer((request, response) => {
  const url = new URL(request.url ?? "", "http://127.0.0.1")
  response.setHeader("Content-Security-Policy", csp)
  response.setHeader("X-Content-Type-Options", "nosniff")
  response.setHeader("Cache-Control", "no-store")

  if (url.pathname === "/favicon.ico") {
    response.writeHead(204)
    response.end()

    return
  }

  if (request.method !== "GET") {
    response.writeHead(405)
    response.end()

    return
  }

  if (url.pathname === "/host.html") {
    response.setHeader("Content-Type", "text/html")
    response.end(
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script src="/host.js"></script></body></html>',
    )

    return
  }

  if (url.pathname === "/qa/input-v2") {
    try {
      response.setHeader("Content-Type", "application/json")
      response.end(
        JSON.stringify(qaNativeV2Input(Object.fromEntries(url.searchParams))),
      )
    } catch {
      response.writeHead(400)
      response.end("invalid fixture")
    }

    return
  }

  if (url.pathname === "/qa/retained-tool-result") {
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify(retainedResult))

    return
  }

  if (bytes.has(url.pathname)) {
    response.setHeader(
      "Content-Type",
      mime.get(extname(url.pathname)) ?? "application/octet-stream",
    )
    response.end(bytes.get(url.pathname))

    return
  }

  // Exact existing native private-fixture asset allowlist. No arbitrary download.
  const allowed = [
    "/tadazz-show/motion/backdrop.webp",
    "/tadazz-show/v4/question-bg.webp",
    "/tadazz-show/v4/show-stage.webp",
    "/tadazz-show/story/84acdb923677d591.webp",
    "/tadazz-show/second-library/teaser-screen-source.jpg",
    "/tadazz-show/v4/tadazz-brand-logo.png",
  ]

  if (allowed.includes(url.pathname) && !url.search) {
    response.setHeader(
      "Content-Type",
      mime.get(extname(url.pathname)) ?? "application/octet-stream",
    )
    response.end(
      readFileSync(
        new URL(`../../../packages/web/public${url.pathname}`, import.meta.url),
      ),
    )

    return
  }

  response.writeHead(404)
  response.end()
})
server.listen(0, "127.0.0.1", () => {
  const address = server.address()

  if (typeof address !== "string" && address) {
    console.log(
      JSON.stringify({ port: address.port, root: fileURLToPath(root) }),
    )
  }
})
