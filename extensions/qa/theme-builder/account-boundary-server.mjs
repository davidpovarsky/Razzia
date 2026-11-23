import { readFileSync, readdirSync } from "node:fs"
import { resolve, extname } from "node:path"
import { createServer } from "node:http"
import { sign } from "hono/jwt"

if (process.env.TADAZZ_REMOTE_QA !== "1") {
  throw new Error("qa:isolated-only")
}

const root = resolve(process.argv[2]),
  resources = new Map()
for (const file of readdirSync(root, { recursive: true })) {
  if (![".html", ".js", ".css", ".woff2"].includes(extname(file))) {
    continue
  }

  resources.set(`/${file}`, readFileSync(resolve(root, file)))
}
const token = await sign(
  {
    sub: "synthetic-author-a",
    role: "manager",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
  },
  "synthetic-only-boundary-qa-key",
  "HS256",
)
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
}
const server = createServer((request, response) => {
  const path = request.url === "/" ? "/account-boundary.html" : request.url

  if (
    request.method !== "GET" ||
    !path ||
    path.includes("%") ||
    path.includes("\\")
  ) {
    response.writeHead(400)
    response.end()

    return
  }

  const body =
    path === "/qa/session"
      ? Buffer.from(JSON.stringify({ token }))
      : resources.get(path)
  response.writeHead(body ? 200 : 404, {
    "Content-Type":
      path === "/qa/session"
        ? "application/json"
        : (types[extname(path)] ?? "text/plain"),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  })
  response.end(body)
})
server.listen(0, "127.0.0.1", () =>
  console.log(`QA_PORT=${server.address().port}`),
)
