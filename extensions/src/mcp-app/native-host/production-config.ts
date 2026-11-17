// HOST ONLY. This object contains issuer key material; never log or serialize it.
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs"
import { isAbsolute, join, parse, resolve, sep } from "node:path"
import { z } from "zod"
import {
  createOAuthProtocol,
  type OAuthCryptoOptions,
} from "../first-party/oauth-protocol.ts"
import { freeze } from "../../core/show-library/primitives.ts"

const rejected = () => new Error("MCP production configuration rejected")
const exactHttps = (value: string) => {
  try {
    const url = new URL(value)

    return (
      url.protocol === "https:" &&
      url.href === value &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !url.hostname.includes("*")
    )
  } catch {
    return false
  }
}
const schema = z.strictObject({
  version: z.literal(1),
  origin: z
    .string()
    .max(2048)
    .refine(
      (value) => exactHttps(`${value}/`) && new URL(value).origin === value,
    ),
  keyId: z.string().min(1).max(128),
  signingPrivateKeyPem: z.string().min(1).max(8192),
  ticketEncryptionKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  clients: z
    .array(
      z.strictObject({
        clientId: z.string().min(1).max(256),
        redirectUris: z
          .array(z.string().max(2048).refine(exactHttps))
          .min(1)
          .max(4),
        scopes: z.array(z.string().max(128)).min(1).max(5),
      }),
    )
    .min(1)
    .max(20),
})
const MAX_CONFIG_BYTES = 65536
function plainAncestry(path: string) {
  let current = parse(path).root

  for (const part of path.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part)
    const stat = lstatSync(current)

    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw rejected()
    }
  }
}

// Reads no file at all when OFF. No key generation, write, import of native auth,
// public listener, environment mutation or fallback configuration occurs here.
//
export function readProductionMcpConfiguration(
  env: Readonly<NodeJS.ProcessEnv> = process.env,
): OAuthCryptoOptions | null {
  if (env.TADAZZ_MCP_SERVICE_ENABLED !== "true") {
    return null
  }

  let fd: number | undefined = undefined

  try {
    const root = env.CONFIG_PATH

    if (!root || !isAbsolute(root) || root !== resolve(root)) {
      throw rejected()
    }

    const directory = join(root, "extensions", "mcp-service")
    plainAncestry(directory)
    for (const parent of [root, join(root, "extensions"), directory]) {
      const stat = lstatSync(parent)

      if (
        process.platform !== "win32" &&
        ((stat.mode & 0o022) !== 0 ||
          (typeof process.getuid === "function" &&
            stat.uid !== process.getuid()))
      ) {
        throw rejected()
      }
    }

    const file = join(directory, "runtime.json")
    const before = lstatSync(file)

    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.size < 2 ||
      before.size > MAX_CONFIG_BYTES
    ) {
      throw rejected()
    }

    // O_NOFOLLOW is absent on Windows; explicit lstat/identity checks still apply.
    const noFollowValue: unknown = Reflect.get(constants, "O_NOFOLLOW")

    const noFollow = typeof noFollowValue === "number" ? noFollowValue : 0

    fd = openSync(file, constants.O_RDONLY | noFollow)
    const opened = fstatSync(fd)

    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.size > MAX_CONFIG_BYTES
    ) {
      throw rejected()
    }

    if (
      process.platform !== "win32" &&
      ((opened.mode & 0o777) !== 0o600 ||
        (typeof process.getuid === "function" &&
          opened.uid !== process.getuid()))
    ) {
      throw rejected()
    }

    const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1)
    let total = 0

    while (total < buffer.byteLength) {
      const read = readSync(fd, buffer, total, buffer.byteLength - total, null)

      if (read === 0) {
        break
      }

      total += read
    }

    if (total > MAX_CONFIG_BYTES) {
      throw rejected()
    }

    const raw = buffer.subarray(0, total)
    const after = fstatSync(fd)

    if (
      raw.byteLength !== opened.size ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.nlink !== 1
    ) {
      throw rejected()
    }

    const parsed = schema.parse(JSON.parse(raw.toString("utf8")))
    const key = Buffer.from(parsed.ticketEncryptionKey, "base64url")

    if (
      key.byteLength !== 32 ||
      key.toString("base64url") !== parsed.ticketEncryptionKey
    ) {
      throw rejected()
    }

    const options: OAuthCryptoOptions = {
      config: {
        issuer: `${parsed.origin}/oauth`,
        resource: `${parsed.origin}/mcp`,
        resourceMetadataUrl: `${parsed.origin}/.well-known/oauth-protected-resource`,
        firstPartyOrigins: [parsed.origin],
      },
      clients: parsed.clients,
      keyId: parsed.keyId,
      signingPrivateKeyPem: parsed.signingPrivateKeyPem,
      ticketEncryptionKey: new Uint8Array(key),
    }
    // Use the real existing client/scope/key validator, never a second OAuth policy.
    createOAuthProtocol(options)

    // Typed arrays cannot be frozen; this private return is not exported over HTTP.
    return {
      ...options,
      config: freeze(options.config),
      clients: freeze(parsed.clients),
    }
  } catch {
    throw rejected()
  } finally {
    if (fd !== undefined) {
      closeSync(fd)
    }
  }
}
