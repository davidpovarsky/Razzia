// Private synthetic QA only. No production server, registry or pin authority.
import { createHash } from "node:crypto"
import { constants, closeSync, fstatSync, openSync, readFileSync, realpathSync } from "node:fs"
import { createServer } from "node:http"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { qaFrame } from "./qa-fixture-host"

const root = realpathSync(process.argv[2] ?? "")
const harnessSha = process.argv[3] ?? ""
if (!/^[a-f0-9]{64}$/u.test(harnessSha)) throw new Error("qa:expected-harness-sha-required")
const entries = {
  "/renderer.js": ["renderer.js", "text/javascript", "9024a0bef2cfbe3d8868d9fc3c6657269abd84d45c00bee0c95b02934f9763b1"],
  "/renderer.css": ["renderer.css", "text/css", "3b220b024863d1e4a58b86b0b14a74e94be7b3da0c07e9921c2fb17430b67064"],
  "/qa/browser.mjs": ["browser.mjs", "text/javascript", harnessSha],
  "/tadazz-show/motion/backdrop.webp": ["tadazz-show/motion/backdrop.webp", "image/webp", "a76a50432f43313d29e78f625302a256e7e7b71db322612c4b66ee3aef0cf37e"],
  "/tadazz-show/v4/question-bg.webp": ["tadazz-show/v4/question-bg.webp", "image/webp", "2f6912d851d8600e08d9a47d58e73dd40144fe30a908b82d10b3ba4036554321"],
  "/tadazz-show/v4/show-stage.webp": ["tadazz-show/v4/show-stage.webp", "image/webp", "9f3d1fe8d4458e98441303e728bba996b9a314295bbf5108f581c229f6db2d20"],
  "/tadazz-show/story/84acdb923677d591.webp": ["tadazz-show/story/84acdb923677d591.webp", "image/webp", "84acdb923677d591d7641d8452eb185aad360b4b990d6e0879905ad0494dbdc6"],
  "/tadazz-show/v4/tadazz-brand-logo.png": ["tadazz-show/v4/tadazz-brand-logo.png", "image/png", "e50aaf5f62f60a83b5a84ea1d55a8068c2e754df5c917681da553771756ebabd"],
} as const
const bytes = new Map<string, { content: Buffer; mime: string; sha: string }>()
for (const [url, [name, mime, expected]] of Object.entries(entries)) {
  const path = resolve(root, name), actual = realpathSync(path), rel = relative(root, actual)
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`) || actual !== path) throw new Error(`qa:unsafe-path:${name}`)
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = fstatSync(fd)
    if (!info.isFile() || info.size <= 0 || info.size > 4 * 1024 * 1024) throw new Error(`qa:invalid-file:${name}`)
    const content = readFileSync(fd)
    if (createHash("sha256").update(content).digest("hex") !== expected) throw new Error(`qa:hash-mismatch:${name}`)
    bytes.set(url, { content, mime, sha: expected })
  } finally { closeSync(fd) }
}
for (const [url, mime, source] of [
  ["/qa/integrity-decoy.js", "text/javascript", "export const qaDecoy = true;"],
  ["/qa/integrity-decoy.css", "text/css", ".qa-decoy { color: red; }"],
] as const) {
  const content = Buffer.from(source)
  bytes.set(url, { content, mime, sha: createHash("sha256").update(content).digest("hex") })
}
// Serving the already verified private buffers binds every response to checked bytes.
const sri = (hex: string) => `sha256-${Buffer.from(hex, "hex").toString("base64")}`
const requests: Array<{ path: string; status: number; mime: string; sha256: string }> = []
const locales = ["en", "fr", "de", "es", "it", "ja", "tr", "vi"] as const
const phases = ["question", "answerCards", "voting", "voteLocked", "results"] as const
const server = createServer((req, res) => {
  const raw = req.url ?? ""
  let url: URL
  try { url = new URL(raw, "http://127.0.0.1") } catch { res.writeHead(400); res.end("bad request"); return }
  const send = (status: number, mime: string, body: Buffer | string) => {
    if (requests.length < 10000) requests.push({ path: url.pathname, status, mime, sha256: createHash("sha256").update(body).digest("hex") })
    res.writeHead(status, { "Content-Type": mime, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; object-src 'none'" })
    res.end(body)
  }
  if (req.method !== "GET" || raw.includes("%") || raw.includes("\\") || raw.includes("#") || raw.split("?")[0] !== url.pathname) return send(400, "text/plain", "bad request")
  if (url.pathname === "/" && !url.search) return send(200, "text/html", `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="host"></div><script type="module" src="/qa/browser.mjs" integrity="${sri(harnessSha)}" crossorigin="anonymous"></script></body></html>`)
  if (url.pathname === "/qa/config" && !url.search) return send(200, "application/json", JSON.stringify({ jsIntegrity: sri(entries["/renderer.js"][2]), cssIntegrity: sri(entries["/renderer.css"][2]) }))
  if (url.pathname === "/qa/requests" && !url.search) return send(200, "application/json", JSON.stringify(requests))
  if (url.pathname === "/qa/frame") {
    const q = url.searchParams
    if ([...q.keys()].some((k) => !["role", "locale", "phase", "question", "paused", "elapsed"].includes(k)) || [...q.keys()].some((k) => q.getAll(k).length !== 1)) return send(400, "text/plain", "invalid frame")
    const role = q.get("role"), locale = q.get("locale"), phase = q.get("phase"), question = q.get("question"), paused = q.get("paused"), elapsed = Number(q.get("elapsed"))
    if ((role !== "manager" && role !== "spectator") || !locales.includes(locale as typeof locales[number]) || !phases.includes(phase as typeof phases[number]) || (question !== "0" && question !== "1") || (paused !== "true" && paused !== "false") || ![5000, 6000, 20000].includes(elapsed)) return send(400, "text/plain", "invalid frame")
    try { return send(200, "application/json", JSON.stringify(qaFrame({ role, locale: locale as typeof locales[number], phase: phase as typeof phases[number], question: Number(question) as 0 | 1, paused: paused === "true", elapsedMs: elapsed }))) } catch { return send(500, "text/plain", "fixture failed") }
  }
  const item = !url.search && bytes.get(url.pathname)
  if (!item) return send(404, "text/plain", "unavailable")
  return send(200, item.mime, item.content)
})
server.listen(0, "127.0.0.1", () => {
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("qa:listen-failed")
  process.stdout.write(`QA_PORT=${address.port}\n`)
})
