import { createHash, randomBytes } from "node:crypto"
import { request as httpsRequest, type RequestOptions } from "node:https"

export const ALL_MCP_SCOPES = [
  "tadazz.catalog.read",
  "tadazz.drafts.read",
  "tadazz.drafts.write",
  "tadazz.library.write",
  "tadazz.exports.read",
] as const

export function createPkcePair(): {
  readonly verifier: string
  readonly challenge: string
} {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")

  return { verifier, challenge }
}

export function buildDraftShow(title = "Phase 3 Native Consent Show") {
  return {
    format: "tada-show",
    version: 1,
    title,
    cards: [1, 2, 3, 4, 5].map((index) => ({
      key: `q${index}`,
      kind: "quiz",
      question: `Question ${index}`,
      timeSeconds: 20,
      answers: [{ text: "Alpha" }, { text: "Beta" }],
      correctAnswers: [1],
    })),
    settings: [],
  }
}

export function buildCreateDraftInput(title?: string) {
  return {
    contractVersion: "0.1.0" as const,
    authoredShowJson: JSON.stringify(buildDraftShow(title)),
    idempotencyKey: randomBytes(18).toString("base64url"),
    locale: "en" as const,
  }
}

export function createPinnedCaFetch(
  caCertPem: string,
): typeof globalThis.fetch {
  return (input, init) =>
    new Promise((resolve, reject) => {
      const request =
        input instanceof Request ? input : new Request(input, init)
      const url = new URL(request.url)
      const headerRecord = new Map<string, string | string[]>()

      request.headers.forEach((value, key) => {
        const lower = key.toLowerCase()
        const existing = headerRecord.get(lower)

        if (existing === undefined) {
          headerRecord.set(lower, value)
        } else if (Array.isArray(existing)) {
          existing.push(value)
        } else {
          headerRecord.set(lower, [existing, value])
        }
      })

      const readBody =
        request.method === "GET" || request.method === "HEAD"
          ? Promise.resolve<Buffer | null>(null)
          : request.arrayBuffer().then((buf) => Buffer.from(buf))

      void readBody.then((body) => {
        const reqOpts: RequestOptions = {
          hostname: url.hostname,
          port: url.port ? Number(url.port) : 443,
          path: `${url.pathname}${url.search}`,
          method: request.method,
          headers: Object.fromEntries(headerRecord),
          ca: caCertPem,
          rejectUnauthorized: true,
        }
        const clientReq = httpsRequest(reqOpts, (res) => {
          const chunks: Buffer[] = []

          res.on("data", (chunk: Buffer) => {
            chunks.push(chunk)
          })
          res.on("end", () => {
            const responseHeaders = new Headers()

            for (const [name, rawVal] of Object.entries(res.headers)) {
              if (rawVal === undefined) {
                continue
              }

              if (Array.isArray(rawVal)) {
                for (const item of rawVal) {
                  responseHeaders.append(name, item)
                }
              } else {
                responseHeaders.append(name, rawVal)
              }
            }

            const status = res.statusCode ?? 500
            const emptyBody =
              request.method === "HEAD" ||
              status === 204 ||
              status === 304 ||
              status < 200
            const rawBuffer = Buffer.concat(chunks)

            resolve(
              new Response(emptyBody ? null : new Uint8Array(rawBuffer), {
                status,
                statusText: res.statusMessage,
                headers: responseHeaders,
              }),
            )
          })
        })

        clientReq.on("error", reject)

        if (body && body.byteLength > 0) {
          clientReq.write(body)
        }

        clientReq.end()
      }, reject)
    })
}
