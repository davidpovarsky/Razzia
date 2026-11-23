// HOST ONLY. No file path, principal, mutable bytes or authority is serialized.
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs"
import { isAbsolute, join, parse, resolve, sep } from "node:path"
import { createHash } from "node:crypto"
import { findNativeAssetLibraryEntry } from "../../core/show-library/native-media-library.ts"
import { assetReferenceSchema } from "../../core/show-library/schemas.ts"
import { exactRefSchema } from "../../core/show-library/primitives.ts"
import type { VerifiedPrincipal } from "./dependencies.ts"
import { ToolError } from "./errors.ts"

type Entry = NonNullable<ReturnType<typeof findNativeAssetLibraryEntry>>
type Declaration = Entry["declarations"][number]
const MAX_ASSET_BYTES = 100_000_000
const MAX_RETAINED_BYTES = 256 * 1024 * 1024
const MAX_ASSETS = 64
const MAX_ACCOUNT_ASSETS = 16
const MAX_ACCOUNT_BYTES = 128 * 1024 * 1024
const MAX_STREAMS = 4
const LIFETIME_MS = 60_000
const CHUNK_BYTES = 64 * 1024
const unavailable = () => new ToolError("PREVIEW_UNAVAILABLE")
const issuerIdentity = (p: VerifiedPrincipal) =>
  JSON.stringify([
    p.issuer,
    p.audience,
    p.accountId,
    p.subject,
    p.clientId,
    p.grantId,
  ])

export interface BundledPreviewAsset {
  readonly assetId: string
  readonly sha256: string
  readonly bytes: number
  readonly kind: "image" | "video" | "audio"
  readonly mimeType: string
}

export interface BundledPreviewAssetPolicy {
  /** Explicit immutable deployed public root, never a model/tenant path. */
  readonly publicRoot: string
  /** Must check the actual issuer capability, live grant/account and scope. */
  assertActive(principal: VerifiedPrincipal): Promise<void>
  /** Metadata/provenance is supplied for review, never treated as permission. */
  allowRead(
    principal: VerifiedPrincipal,
    declaration: Declaration,
  ): Promise<boolean>
}

function plainAncestry(path: string): void {
  let current = parse(path).root
  for (const part of path.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part)
    const stat = lstatSync(current)

    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw unavailable()
    }
  }
}

function mimeType(bytes: Uint8Array, kind: Entry["kind"]): string {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (kind === "image") {
    if (
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      return "image/png"
    }

    if (b[0] === 255 && b[1] === 216 && b[2] === 255) {
      return "image/jpeg"
    }

    if (
      b.subarray(0, 4).toString() === "RIFF" &&
      b.subarray(8, 12).toString() === "WEBP"
    ) {
      return "image/webp"
    }
  }

  if (kind === "video") {
    if (b.subarray(4, 8).toString() === "ftyp") {
      return "video/mp4"
    }

    if (b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) {
      return "video/webm"
    }
  }

  if (kind === "audio") {
    if (b.subarray(0, 4).toString() === "OggS") {
      return "audio/ogg"
    }

    if (
      b.subarray(0, 3).toString() === "ID3" ||
      (b.length > 1 && b[0] === 255 && (b[1] & 224) === 224)
    ) {
      return "audio/mpeg"
    }
  }

  // SVG, HTML, arbitrary JSON/Lottie, scripts and disguised payloads are closed.
  throw unavailable()
}

function readBundledFile(root: string, declaration: Declaration): Buffer {
  const { asset } = declaration
  const { url } = asset

  if (
    !url.startsWith("/") ||
    url.startsWith("//") ||
    /[\\?#%]/u.test(url) ||
    url.split("").some((character) => character.charCodeAt(0) <= 32)
  ) {
    throw unavailable()
  }

  const path = resolve(root, `.${url}`)

  if (!path.startsWith(root + sep)) {
    throw unavailable()
  }

  plainAncestry(parse(path).dir)
  const before = lstatSync(path)

  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size !== asset.bytes ||
    before.size > MAX_ASSET_BYTES
  ) {
    throw unavailable()
  }

  const fd = openSync(
    path,
    constants.O_RDONLY |
      (process.platform === "win32" ? 0 : constants.O_NOFOLLOW),
  )

  try {
    const opened = fstatSync(fd)

    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size ||
      opened.nlink !== 1 ||
      !opened.isFile()
    ) {
      throw unavailable()
    }

    const bytes = Buffer.alloc(opened.size)
    let offset = 0

    while (offset < bytes.length) {
      const read = readSync(
        fd,
        bytes,
        offset,
        Math.min(CHUNK_BYTES, bytes.length - offset),
        offset,
      )

      if (read === 0) {
        throw unavailable()
      }

      offset += read
    }

    const after = fstatSync(fd)

    if (
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      createHash("sha256").update(bytes).digest("hex") !== asset.sha256
    ) {
      throw unavailable()
    }

    return bytes
  } finally {
    closeSync(fd)
  }
}

// Exact bundled bytes only. This grants neither export nor executable rights.
// Tenant/customer media requires a separate actual account-scoped adapter.
//
export function createBundledPreviewAssetAdmission(
  policy: BundledPreviewAssetPolicy,
) {
  if (
    !isAbsolute(policy.publicRoot) ||
    typeof policy.assertActive !== "function" ||
    typeof policy.allowRead !== "function"
  ) {
    throw unavailable()
  }

  const root = resolve(policy.publicRoot)

  if (root === parse(root).root) {
    throw unavailable()
  }

  const admitted = new Map<
    BundledPreviewAsset,
    {
      identity: string
      accountId: string
      declaration: Declaration
      bytes: Buffer
      expiresAt: number
      controllers: Map<ReadableStreamDefaultController<Uint8Array>, () => void>
    }
  >()
  let retained = 0
  const accountBudgets = new Map<string, { count: number; bytes: number }>()
  const releaseBudget = (accountId: string, bytes: number) => {
    const budget = accountBudgets.get(accountId)

    if (!budget) {
      throw unavailable()
    }

    retained -= bytes
    budget.count -= 1
    budget.bytes -= bytes

    if (budget.count === 0) {
      accountBudgets.delete(accountId)
    }
  }
  let pending = 0
  let streams = 0
  let checks = 0
  let closed = false
  const isClosed = () => closed
  const revoke = (capability: BundledPreviewAsset) => {
    const record = admitted.get(capability)

    if (!record) {
      return
    }

    admitted.delete(capability)
    releaseBudget(record.accountId, record.bytes.byteLength)
    // Streams retain the lease object, not the payload after revocation/expiry.
    record.bytes = Buffer.alloc(0)
    for (const [controller, finish] of [...record.controllers]) {
      controller.error(unavailable())
      finish()
    }
  }
  const purge = () => {
    const now = Date.now()
    for (const [capability, record] of admitted) {
      if (record.expiresAt <= now) {
        revoke(capability)
      }
    }
  }
  const allowed = async (
    p: VerifiedPrincipal,
    declaration?: Declaration,
    signal?: AbortSignal,
  ) => {
    signal?.throwIfAborted()

    if (isClosed() || checks >= 16) {
      throw unavailable()
    }

    checks += 1

    try {
      await policy.assertActive(p)

      if (declaration) {
        if (!(await policy.allowRead(p, declaration))) {
          throw unavailable()
        }

        await policy.assertActive(p)
      }

      signal?.throwIfAborted()

      if (isClosed()) {
        throw unavailable()
      }
    } catch {
      throw unavailable()
    } finally {
      // Cancellation/close never frees an outstanding authorization operation.
      checks -= 1
    }
  }
  const expiry = setInterval(purge, 1000)
  expiry.unref()

  return Object.freeze({
    async admit(
      p: VerifiedPrincipal,
      selection: {
        theme: { id: string; version: string }
        reference: unknown
        signal?: AbortSignal
      },
    ): Promise<BundledPreviewAsset> {
      const { reference, signal } = selection
      await allowed(p, undefined, signal)
      signal?.throwIfAborted()

      if (closed) {
        throw unavailable()
      }

      const theme = exactRefSchema.parse(selection.theme)

      const ref = assetReferenceSchema.parse(reference)
      const entry = findNativeAssetLibraryEntry(ref)
      const declaration = entry?.declarations.find(
        (d) => d.theme.id === theme.id && d.theme.version === theme.version,
      )

      if (!entry || !declaration || entry.kind === "lottie") {
        throw unavailable()
      }

      await allowed(p, declaration, signal)
      purge()
      const identity = issuerIdentity(p)
      const { accountId } = p
      const cached = () =>
        [...admitted].find(
          ([capability, record]) =>
            capability.assetId === ref.assetId &&
            capability.sha256 === ref.sha256 &&
            record.identity === identity &&
            record.declaration.theme.id === theme.id &&
            record.declaration.theme.version === theme.version,
        )?.[0]
      const existing = cached()

      if (existing) {
        return existing
      }

      const budget = accountBudgets.get(accountId) ?? { count: 0, bytes: 0 }

      if (
        admitted.size + pending >= MAX_ASSETS ||
        retained + entry.bytes > MAX_RETAINED_BYTES ||
        budget.count >= MAX_ACCOUNT_ASSETS ||
        budget.bytes + entry.bytes > MAX_ACCOUNT_BYTES
      ) {
        throw unavailable()
      }

      retained += entry.bytes
      budget.count += 1
      budget.bytes += entry.bytes
      accountBudgets.set(accountId, budget)
      pending += 1

      try {
        const bytes = readBundledFile(root, declaration)
        const mime = mimeType(bytes, entry.kind)
        await allowed(p, declaration, signal)

        if (issuerIdentity(p) !== identity) {
          throw unavailable()
        }

        const concurrent = cached()

        if (concurrent) {
          releaseBudget(accountId, entry.bytes)

          return concurrent
        }

        const capability: BundledPreviewAsset = Object.freeze({
          ...ref,
          kind: entry.kind,
          bytes: bytes.byteLength,
          mimeType: mime,
        })
        admitted.set(capability, {
          identity,
          accountId,
          declaration,
          bytes,
          expiresAt: Date.now() + LIFETIME_MS,
          controllers: new Map(),
        })

        return capability
      } catch {
        releaseBudget(accountId, entry.bytes)
        throw unavailable()
      } finally {
        pending -= 1
      }
    },
    async open(
      p: VerifiedPrincipal,
      capability: BundledPreviewAsset,
      signal?: AbortSignal,
    ) {
      await allowed(p, undefined, signal)
      purge()
      const record = admitted.get(capability)

      if (
        closed ||
        !record ||
        record.identity !== issuerIdentity(p) ||
        streams >= MAX_STREAMS
      ) {
        throw unavailable()
      }

      try {
        await allowed(p, record.declaration, signal)
      } catch {
        revoke(capability)
        throw unavailable()
      }

      if (
        admitted.get(capability) !== record ||
        record.identity !== issuerIdentity(p) ||
        record.expiresAt <= Date.now() ||
        streams >= MAX_STREAMS
      ) {
        throw unavailable()
      }

      streams += 1
      let offset = 0
      let done = false
      let activeController: ReadableStreamDefaultController<Uint8Array> | null =
        null
      const finish = () => {
        if (!done) {
          done = true
          streams -= 1

          if (activeController) {
            record.controllers.delete(activeController)
          }
        }
      }

      return new ReadableStream<Uint8Array>(
        {
          start(controller) {
            activeController = controller
            record.controllers.set(controller, finish)
          },
          async pull(controller) {
            try {
              await allowed(p, record.declaration, signal)

              if (
                admitted.get(capability) !== record ||
                record.identity !== issuerIdentity(p) ||
                record.expiresAt <= Date.now()
              ) {
                throw unavailable()
              }

              if (offset === record.bytes.length) {
                finish()
                controller.close()

                return
              }

              const end = Math.min(offset + CHUNK_BYTES, record.bytes.length)
              controller.enqueue(
                Uint8Array.from(record.bytes.subarray(offset, end)),
              )
              offset = end
            } catch {
              revoke(capability)
            }
          },
          cancel() {
            finish()
          },
        },
        { highWaterMark: 0 },
      )
    },
    async release(p: VerifiedPrincipal, capability: BundledPreviewAsset) {
      await allowed(p)
      const record = admitted.get(capability)

      if (!record || record.identity !== issuerIdentity(p)) {
        throw unavailable()
      }

      revoke(capability)
    },
    close() {
      closed = true
      clearInterval(expiry)
      for (const capability of admitted.keys()) {
        revoke(capability)
      }
    },
  })
}
