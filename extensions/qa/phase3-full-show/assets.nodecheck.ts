import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import { syncBuiltinESMExports } from "node:module"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { test } from "node:test"
import { getNativeAssetLibrary } from "../../src/core/show-library/native-media-library.ts"
import {
  createBundledPreviewAssetAdmission,
  type BundledPreviewAsset,
} from "../../src/mcp-app/server/full-show-assets.ts"
import type { VerifiedPrincipal } from "../../src/mcp-app/server/dependencies.ts"

const publicRoot = resolve(import.meta.dirname, "../../../packages/web/public")
const entry = getNativeAssetLibrary().entries.find(
  (e) => e.kind === "image" && e.bytes > 131072 && e.bytes < 200000,
)
assert(entry, "Actual bundled multi-chunk image fixture is required")
const [declaration] = entry.declarations
assert(declaration)
const selection = { theme: declaration.theme, reference: entry.ref }
const original = fs.readFileSync(
  join(publicRoot, declaration.asset.url.slice(1)),
)
assert.equal(
  createHash("sha256").update(original).digest("hex"),
  entry.ref.sha256,
)
const principal = (
  grantId = "unit-grant-A",
  accountId = "11111111-1111-4111-8111-111111111111",
): VerifiedPrincipal => ({
  issuer: "https://unit.invalid/oauth",
  audience: "https://unit.invalid/mcp",
  subject: "unit-subject",
  clientId: "unit-client",
  grantId,
  accountId,
  scopes: ["tadazz.drafts.read"],
  expiresAt: Date.now() + 3600000,
  active: true,
  accountsEnabled: true,
})
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex")
function setup(root = publicRoot) {
  const a = principal()
  const b = principal("unit-grant-B", "22222222-2222-4222-8222-222222222222")
  const active = new Set<VerifiedPrincipal>([a, b])
  const rights = { permitted: true }
  const port = createBundledPreviewAssetAdmission({
    publicRoot: root,
    assertActive: (p) =>
      active.has(p)
        ? Promise.resolve()
        : Promise.reject(new Error("Unit issuer rejected capability")),
    allowRead: () => Promise.resolve(rights.permitted),
  })

  return { a, b, active, rights, port }
}
function fixture() {
  const parent = fs.realpathSync(tmpdir())
  const root = fs.mkdtempSync(join(parent, "tadazz-fullshow-"))
  const file = join(root, declaration.asset.url.slice(1))
  fs.mkdirSync(dirname(file), { recursive: true })
  fs.writeFileSync(file, original)

  return {
    root,
    file,
    cleanup() {
      assert.equal(fs.realpathSync(root), root)
      assert.equal(dirname(root), parent)
      assert(basename(root).startsWith("tadazz-fullshow-"))
      fs.rmSync(root, { recursive: true, force: true })
    },
  }
}

test("admits actual catalog bytes for both bundled families without serializing authority", async () => {
  const { a, port } = setup()

  try {
    for (const declared of entry.declarations) {
      const cap = await port.admit(a, { ...selection, theme: declared.theme })
      assert(Object.isFrozen(cap))
      assert.deepEqual(Object.keys(cap).sort(), [
        "assetId",
        "bytes",
        "kind",
        "mimeType",
        "sha256",
      ])
      assert.doesNotMatch(
        JSON.stringify(cap),
        /unit-grant|11111111|public|oauth|Bearer/u,
      )
      const stream = await port.open(a, cap)
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
      assert.equal(digest(bytes), entry.ref.sha256)
      assert.equal(cap.mimeType, "image/webp")
      bytes.fill(0)
      assert.equal(
        digest(
          new Uint8Array(
            await new Response(await port.open(a, cap)).arrayBuffer(),
          ),
        ),
        entry.ref.sha256,
      )
      assert.equal(
        await port.admit(a, { ...selection, theme: declared.theme }),
        cap,
      )
    }
  } finally {
    port.close()
  }
})

test("serialized lookalikes, foreign accounts and different grants cannot reuse a capability", async () => {
  const { a, b, active, port } = setup()

  try {
    const cap = await port.admit(a, selection)
    await assert.rejects(() => port.open(a, { ...cap }), /PREVIEW_UNAVAILABLE/u)
    await assert.rejects(() => port.open(b, cap), /PREVIEW_UNAVAILABLE/u)
    const sameAccount = principal("another-unit-grant")
    active.add(sameAccount)
    await assert.rejects(
      () => port.open(sameAccount, cap),
      /PREVIEW_UNAVAILABLE/u,
    )
    assert.equal(
      digest(
        new Uint8Array(
          await new Response(await port.open(a, cap)).arrayBuffer(),
        ),
      ),
      entry.ref.sha256,
    )
  } finally {
    port.close()
  }
})

test("rights and issuer denial occur before any filesystem inspection", async (t) => {
  const { a, active, rights, port } = setup()
  let inspections = 0
  const spy = t.mock.method(fs, "lstatSync", () => {
    inspections += 1
    throw new Error("Forbidden filesystem probe")
  })
  syncBuiltinESMExports()

  try {
    rights.permitted = false
    await assert.rejects(() => port.admit(a, selection), /PREVIEW_UNAVAILABLE/u)
    rights.permitted = true
    active.delete(a)
    await assert.rejects(() => port.admit(a, selection), /PREVIEW_UNAVAILABLE/u)
    assert.equal(inspections, 0)
  } finally {
    spy.mock.restore()
    syncBuiltinESMExports()
    port.close()
  }
})

test("rejects unknown hashes/families and arbitrary Lottie execution", async () => {
  const { a, port } = setup()

  try {
    await assert.rejects(
      () =>
        port.admit(a, {
          ...selection,
          reference: { ...entry.ref, sha256: "0".repeat(64) },
        }),
      /PREVIEW_UNAVAILABLE/u,
    )
    await assert.rejects(
      () =>
        port.admit(a, {
          ...selection,
          theme: { id: "unknown-family", version: "1.0.0" },
        }),
      /PREVIEW_UNAVAILABLE/u,
    )
    const lottie = getNativeAssetLibrary().entries.find(
      (asset) => asset.kind === "lottie",
    )
    assert(lottie)
    await assert.rejects(
      () =>
        port.admit(a, {
          theme: lottie.declarations[0].theme,
          reference: lottie.ref,
        }),
      /PREVIEW_UNAVAILABLE/u,
    )
  } finally {
    port.close()
  }
})

test("same-length byte tampering and hard-linked files are refused", async () => {
  const f = fixture()
  const { a, port } = setup(f.root)

  try {
    const tampered = Buffer.from(original)
    tampered[tampered.length - 1] ^= 1
    fs.writeFileSync(f.file, tampered)
    await assert.rejects(() => port.admit(a, selection), /PREVIEW_UNAVAILABLE/u)
    fs.writeFileSync(f.file, original)
    fs.linkSync(f.file, join(f.root, "alias.webp"))
    await assert.rejects(() => port.admit(a, selection), /PREVIEW_UNAVAILABLE/u)
  } finally {
    port.close()
    f.cleanup()
  }
})

test("in-memory admitted snapshot stays immutable after its source changes", async () => {
  const f = fixture()
  const { a, port } = setup(f.root)

  try {
    const cap = await port.admit(a, selection)
    fs.writeFileSync(f.file, Buffer.alloc(original.length))
    assert.equal(
      digest(
        new Uint8Array(
          await new Response(await port.open(a, cap)).arrayBuffer(),
        ),
      ),
      entry.ref.sha256,
    )
  } finally {
    port.close()
    f.cleanup()
  }
})

test("revocation after IO prevents publishing the admitted capability", async () => {
  const a = principal()
  let valid = true
  let calls = 0
  let entered: () => void = () => undefined
  let release: () => void = () => undefined
  const reached = new Promise<void>((r) => {
    entered = r
  })
  const barrier = new Promise<void>((r) => {
    release = r
  })
  const port = createBundledPreviewAssetAdmission({
    publicRoot,
    assertActive: () =>
      valid ? Promise.resolve() : Promise.reject(new Error("revoked")),
    allowRead: async () => {
      calls += 1

      if (calls === 2) {
        entered()
        await barrier
      }

      return true
    },
  })
  const admission = port.admit(a, selection)
  const rejected = assert.rejects(admission, /PREVIEW_UNAVAILABLE/u)

  try {
    await reached
    valid = false
    release()
    await rejected
  } finally {
    release()
    await admission.catch(() => undefined)
    port.close()
  }
})

test("midstream grant revocation releases no subsequent bytes", async () => {
  const { a, active, port } = setup()

  try {
    const cap = await port.admit(a, selection)
    const reader = (await port.open(a, cap)).getReader()
    assert.equal((await reader.read()).value?.byteLength, 65536)
    active.delete(a)
    await assert.rejects(() => reader.read(), /PREVIEW_UNAVAILABLE/u)
    active.add(a)
    assert.notEqual(await port.admit(a, selection), cap)
  } finally {
    port.close()
  }
})

test("four bounded streams apply backpressure and cancel releases a slot", async () => {
  const { a, port } = setup()
  const streams: Array<ReadableStream<Uint8Array>> = []

  try {
    const cap = await port.admit(a, selection)
    for (let i = 0; i < 4; i += 1) {
      streams.push(await port.open(a, cap))
    }
    await assert.rejects(() => port.open(a, cap), /PREVIEW_UNAVAILABLE/u)
    await streams[0].cancel()
    streams.push(await port.open(a, cap))
  } finally {
    await Promise.allSettled(streams.map((s) => s.cancel()))
    port.close()
  }
})

test("expiry errors idle streams and renews only through fresh admission", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: Date.now() })
  const { a, port } = setup()

  try {
    const cap = await port.admit(a, selection)
    const reader = (await port.open(a, cap)).getReader()
    const closed = assert.rejects(reader.closed, /PREVIEW_UNAVAILABLE/u)
    t.mock.timers.tick(60001)
    await closed
    await assert.rejects(() => port.open(a, cap), /PREVIEW_UNAVAILABLE/u)
    const renewed = await port.admit(a, selection)
    assert.notEqual(renewed, cap)
  } finally {
    port.close()
  }
})

test("canceled authorization work keeps its quota until the actual callback settles", async () => {
  const a = principal()
  let blocking = true
  let count = 0
  let entered: () => void = () => undefined
  let release: () => void = () => undefined
  const full = new Promise<void>((r) => {
    entered = r
  })
  const barrier = new Promise<void>((r) => {
    release = r
  })
  const port = createBundledPreviewAssetAdmission({
    publicRoot,
    assertActive: async () => {
      if (blocking) {
        count += 1

        if (count === 16) {
          entered()
        }

        await barrier
      }
    },
    allowRead: () => Promise.resolve(true),
  })
  const controllers = Array.from({ length: 16 }, () => new AbortController())
  const pending = Promise.allSettled(
    controllers.map((controller) =>
      port.admit(a, { ...selection, signal: controller.signal }),
    ),
  )

  try {
    await full
    controllers.forEach((controller) => {
      controller.abort()
    })
    await assert.rejects(() => port.admit(a, selection), /PREVIEW_UNAVAILABLE/u)
    blocking = false
    release()
    assert((await pending).every((result) => result.status === "rejected"))
    assert(await port.admit(a, selection))
  } finally {
    release()
    await pending
    port.close()
  }
})

test("close revokes active streams and disallows new admission", async () => {
  const { a, port } = setup()
  const cap = await port.admit(a, selection)
  const reader = (await port.open(a, cap)).getReader()
  const closed = assert.rejects(reader.closed, /PREVIEW_UNAVAILABLE/u)
  port.close()
  await closed
  await assert.rejects(() => port.admit(a, selection), /PREVIEW_UNAVAILABLE/u)
  await assert.rejects(() => port.open(a, cap), /PREVIEW_UNAVAILABLE/u)
  port.close()
})

test("one account cannot consume the global asset count; only its owner can release a lease", async () => {
  const { a, b, active, port } = setup()

  try {
    const caps: Array<{ p: VerifiedPrincipal; cap: BundledPreviewAsset }> = []
    for (let i = 0; i < 16; i += 1) {
      const p = principal(`unit-quota-${i}`)
      active.add(p)
      caps.push({ p, cap: await port.admit(p, selection) })
    }
    await assert.rejects(() => port.admit(a, selection), /PREVIEW_UNAVAILABLE/u)
    const foreign = await port.admit(b, selection)
    await assert.rejects(
      () => port.release(b, caps[0].cap),
      /PREVIEW_UNAVAILABLE/u,
    )
    await port.release(caps[0].p, caps[0].cap)
    await assert.rejects(
      () => port.open(caps[0].p, caps[0].cap),
      /PREVIEW_UNAVAILABLE/u,
    )
    assert(await port.admit(a, selection))
    assert.equal(
      digest(
        new Uint8Array(
          await new Response(await port.open(b, foreign)).arrayBuffer(),
        ),
      ),
      entry.ref.sha256,
    )
  } finally {
    port.close()
  }
})

test("mutating an accepted principal during asynchronous rights work cannot change lease ownership", async () => {
  const a = principal()
  let calls = 0
  const port = createBundledPreviewAssetAdmission({
    publicRoot,
    assertActive: () => Promise.resolve(),
    allowRead: () => {
      calls += 1

      if (calls === 2) {
        a.accountId = "22222222-2222-4222-8222-222222222222"
      }

      return Promise.resolve(true)
    },
  })

  try {
    await assert.rejects(() => port.admit(a, selection), /PREVIEW_UNAVAILABLE/u)
    const cap = await port.admit(a, selection)
    const reader = (await port.open(a, cap)).getReader()
    assert.equal((await reader.read()).value?.byteLength, 65536)
    a.accountId = "11111111-1111-4111-8111-111111111111"
    await assert.rejects(() => reader.read(), /PREVIEW_UNAVAILABLE/u)
  } finally {
    port.close()
  }
})

test("a symbolic public-root alias cannot traverse to the declared asset", async (t) => {
  const f = fixture()
  const alias = join(f.root, "linked-public")

  try {
    try {
      fs.symlinkSync(
        f.root,
        alias,
        process.platform === "win32" ? "junction" : "dir",
      )
    } catch (error) {
      if (
        process.platform === "win32" &&
        error instanceof Error &&
        "code" in error &&
        error.code === "EPERM"
      ) {
        t.skip(
          "Windows denies this fixture's symlink creation; Linux check still required",
        )

        return
      }

      throw error
    }

    const { a, port } = setup(alias)

    try {
      await assert.rejects(
        () => port.admit(a, selection),
        /PREVIEW_UNAVAILABLE/u,
      )
    } finally {
      port.close()
    }
  } finally {
    f.cleanup()
  }
})
