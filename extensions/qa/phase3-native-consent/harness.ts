import {
  generateKeyPairSync,
  randomBytes,
  sign as cryptoSign,
} from "node:crypto"
import { createServer as createNetServer } from "node:net"
import {
  createPrincipalRateLimiter,
  type ProtectedMcpServiceOptions,
} from "../../src/mcp-app/first-party/index.ts"
import type { NativeCreationOperationPort } from "../../src/server/storage/creation-operation-types.ts"
import { ALL_MCP_SCOPES } from "./crypto-helpers.ts"

export {
  ALL_MCP_SCOPES,
  buildCreateDraftInput,
  buildDraftShow,
  createPinnedCaFetch,
  createPkcePair,
} from "./crypto-helpers.ts"

export interface LoopbackTlsCredentials {
  readonly key: string
  readonly cert: string
}

export interface EphemeralOAuthKeys {
  readonly keyId: string
  readonly signingPrivateKeyPem: string
  readonly ticketEncryptionKey: Uint8Array
}

function derLength(length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length])
  }

  const bytes: number[] = []
  let value = length

  while (value > 0) {
    bytes.unshift(value & 0xff)
    value >>= 8
  }

  return Buffer.from([0x80 | bytes.length, ...bytes])
}

function derTag(tag: number, content: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([tag]),
    derLength(content.byteLength),
    content,
  ])
}

function derSequence(items: readonly Buffer[]): Buffer {
  return derTag(0x30, Buffer.concat(items))
}

function derSet(items: readonly Buffer[]): Buffer {
  return derTag(0x31, Buffer.concat(items))
}

function derInteger(bytes: Buffer): Buffer {
  const trimmed = bytes.byteLength === 0 ? Buffer.from([0]) : bytes
  const needsZero = trimmed.readUInt8(0) >= 0x80

  return derTag(
    0x02,
    needsZero ? Buffer.concat([Buffer.from([0x00]), trimmed]) : trimmed,
  )
}

function derOid(dotted: string): Buffer {
  const parts = dotted.split(".").map((part) => Number(part))
  const first = (parts[0] ?? 0) * 40 + (parts[1] ?? 0)
  const out: number[] = [first]

  for (let index = 2; index < parts.length; index += 1) {
    let value = parts[index] ?? 0
    const encoded: number[] = [value & 0x7f]

    value >>= 7

    while (value > 0) {
      encoded.unshift((value & 0x7f) | 0x80)
      value >>= 7
    }

    out.push(...encoded)
  }

  return derTag(0x06, Buffer.from(out))
}

function derUtcTime(date: Date): Buffer {
  const pad = (value: number) => String(value).padStart(2, "0")
  const text = `${String(date.getUTCFullYear()).slice(-2)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`

  return derTag(0x17, Buffer.from(text, "ascii"))
}

function wrapPem(label: string, der: Buffer): string {
  const base64 = der.toString("base64")
  const lines = base64.match(/.{1,64}/gu) ?? []

  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`
}

function buildExtension(options: {
  readonly oid: string
  readonly critical?: boolean
  readonly value: Buffer
}): Buffer {
  const parts: Buffer[] = [derOid(options.oid)]

  if (options.critical) {
    parts.push(derTag(0x01, Buffer.from([0xff])))
  }

  parts.push(derTag(0x04, options.value))

  return derSequence(parts)
}

export function createLoopbackTlsCertificate(): LoopbackTlsCredentials {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  })
  const keyPem = privateKey.export({ format: "pem", type: "pkcs8" })
  const spki = publicKey.export({ format: "der", type: "spki" })
  const serial = randomBytes(16)

  serial.writeUInt8(serial.readUInt8(0) & 0x7f, 0)

  const sigAlg = derSequence([derOid("1.2.840.10045.4.3.2")])
  const commonName = derSequence([
    derSet([
      derSequence([
        derOid("2.5.4.3"),
        derTag(0x0c, Buffer.from("localhost", "utf8")),
      ]),
    ]),
  ])
  const now = Date.now()
  const validity = derSequence([
    derUtcTime(new Date(now - 60_000)),
    derUtcTime(new Date(now + 7 * 24 * 60 * 60 * 1000)),
  ])
  const ipv4Loopback = Buffer.from([127, 0, 0, 1])
  const ipv6Loopback = Buffer.from([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
  ])
  const san = derSequence([
    derTag(0x82, Buffer.from("localhost", "ascii")),
    derTag(0x87, ipv4Loopback),
    derTag(0x87, ipv6Loopback),
  ])
  const extensions = derTag(
    0xa3,
    derSequence([
      buildExtension({
        oid: "2.5.29.19",
        critical: true,
        value: derSequence([]),
      }),
      buildExtension({
        oid: "2.5.29.15",
        critical: true,
        value: derTag(0x03, Buffer.from([0x05, 0xa0])),
      }),
      buildExtension({
        oid: "2.5.29.37",
        value: derSequence([derOid("1.3.6.1.5.5.7.3.1")]),
      }),
      buildExtension({
        oid: "2.5.29.17",
        value: san,
      }),
    ]),
  )
  const tbs = derSequence([
    derTag(0xa0, derInteger(Buffer.from([0x02]))),
    derInteger(serial),
    sigAlg,
    commonName,
    validity,
    commonName,
    spki,
    extensions,
  ])
  const signature = cryptoSign("sha256", tbs, privateKey)
  const certDer = derSequence([
    tbs,
    sigAlg,
    derTag(0x03, Buffer.concat([Buffer.from([0x00]), signature])),
  ])

  return {
    key: keyPem,
    cert: wrapPem("CERTIFICATE", certDer),
  }
}

export function createEphemeralOAuthKeys(): EphemeralOAuthKeys {
  const { privateKey } = generateKeyPairSync("ed25519")

  return {
    keyId: `phase3-k-${randomBytes(4).toString("hex")}`,
    signingPrivateKeyPem: privateKey.export({
      format: "pem",
      type: "pkcs8",
    }),
    ticketEncryptionKey: randomBytes(32),
  }
}

export function buildMcpOptions(options: {
  readonly origin: string
  readonly keys: EphemeralOAuthKeys
  readonly redirectUris?: readonly string[]
  readonly scopes?: readonly string[]
  readonly operations?: NativeCreationOperationPort
  readonly requireFirstPartyConsent?: boolean
}): Omit<ProtectedMcpServiceOptions, "enabled" | "configRoot"> & {
  readonly nativeSave: NonNullable<ProtectedMcpServiceOptions["nativeSave"]>
} {
  const { origin } = new URL(options.origin)

  return {
    keyId: options.keys.keyId,
    signingPrivateKeyPem: options.keys.signingPrivateKeyPem,
    ticketEncryptionKey: options.keys.ticketEncryptionKey,
    config: {
      issuer: `${origin}/oauth`,
      resource: `${origin}/mcp`,
      resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource`,
      firstPartyOrigins: [origin],
    },
    clients: [
      {
        clientId: "tadazz-chatgpt-client",
        redirectUris: options.redirectUris ?? [`${origin}/oauth/callback`],
        scopes: [...(options.scopes ?? ALL_MCP_SCOPES)],
      },
    ],
    consentPageUrl: `${origin}/studio/oauth-consent`,
    allowedOrigins: [origin],
    authoring: {
      allowedPublicAssetUrls: new Set<string>(),
    },
    rateLimit: createPrincipalRateLimiter({
      readsPerMinute: 120,
      mutationsPerMinute: 60,
    }),
    nativeSave: {
      consentPageUrl: `${origin}/studio/native-save-consent`,
      requireFirstPartyConsent: options.requireFirstPartyConsent,
      ...(options.operations ? { operations: options.operations } : {}),
    },
  }
}

function extractFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input
  }

  if (input instanceof URL) {
    return input.toString()
  }

  return input.url
}

function extractFetchBody(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<string> {
  if (typeof init?.body === "string") {
    return Promise.resolve(init.body)
  }

  if (input instanceof Request) {
    return input.text()
  }

  return Promise.resolve("")
}

export function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createNetServer()

    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address()

      probe.close((closeErr) => {
        if (closeErr) {
          reject(closeErr)

          return
        }

        if (!address || typeof address === "string") {
          reject(new Error("Expected TCP address when reserving port"))

          return
        }

        resolvePort(address.port)
      })
    })
  })
}

export function installResendVerificationTrap(
  onCode?: (email: string, code: string) => void,
): {
  readonly codes: Map<string, string>
  restore(): void
} {
  const originalFetch = globalThis.fetch
  const codes = new Map<string, string>()

  globalThis.fetch = async (input, init) => {
    const url = extractFetchUrl(input)

    if (url.startsWith("https://api.resend.com/")) {
      const rawBody = await extractFetchBody(input, init)
      const parsed = JSON.parse(rawBody) as {
        readonly to?: string[]
        readonly text?: string
      }
      const match = /\b\d{6}\b/u.exec(parsed.text ?? "")
      const recipient = parsed.to?.[0]

      if (match && recipient) {
        const lower = recipient.toLowerCase()

        codes.set(lower, match[0])
        onCode?.(lower, match[0])
      }

      return new Response(JSON.stringify({ id: "qa-mail-trap" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    return originalFetch(input, init)
  }

  return {
    codes,
    restore: () => {
      globalThis.fetch = originalFetch
    },
  }
}
