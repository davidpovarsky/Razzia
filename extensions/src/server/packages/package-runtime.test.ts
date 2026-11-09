/* oxlint-disable eslint/max-params, eslint/no-nested-ternary -- Synthetic fixtures explicitly bind the store, account, bytes and optional replay key; attack cases select fixed variants. */
/* oxlint-disable typescript/no-non-null-assertion -- Fixture inventory and successful responses are asserted before indexed access. */
import { afterEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { createPackageFixture } from "../../testkit/package-fixtures"
import { packagePath, relativePackagePath } from "../../core/packages/paths"
import {
  RendererMessageGuard,
  runtimeSnapshotSchema,
} from "../../core/packages/protocol"
import { packageManifestSchema } from "../../core/packages/manifest"
import { unpackPackage, packPackage, packageSha } from "./archive"
import { inspectPackage } from "./preflight"
import { PackageStore } from "./store"
import {
  issueRuntimeAccess,
  readRuntimeAccess,
  sandboxDocument,
} from "./runtime-access"
import type { ThemePrincipal } from "../show-themes/review"
import { quizExtrasV2Schema } from "../../core/studio-timeline-schema"
import { quizzValidator } from "@razzia/common/validators/quizz"

const temporary: string[] = []
const databases: Array<{ close: () => void }> = []
const author: ThemePrincipal = {
  tenantId: "tenant-a",
  userId: "author",
  grants: ["author"],
}
const reviewer: ThemePrincipal = {
  tenantId: "tenant-a",
  userId: "reviewer",
  grants: ["review"],
}
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tadazz-package-"))
  temporary.push(dir)
  const store = new PackageStore(
    path.join(dir, "store"),
    "fixture-secret-at-least-32-characters",
    (tenant) => path.join(dir, tenant),
  )
  databases.push(store)

  return { dir, store }
}
afterEach(() => {
  databases.splice(0).forEach((s) => {
    s.close()
  })
  temporary.splice(0).forEach((d) => {
    fs.rmSync(d, { recursive: true, force: true })
  })
})
function approve(store: PackageStore, upload: string) {
  const receipt = store.details(author, upload)
  store.approve(reviewer, upload, {
    revision: receipt.revision,
    sourceDigest: receipt.sourceDigest,
    buildDigest: receipt.buildDigest,
    qaEvidenceSha256: packageSha("synthetic fixture review"),
    rightsReviewed: true,
    contentReviewed: true,
    accessibilityReviewed: true,
    performanceReviewed: true,
  })
}
/** Unit double for the trusted worker; actual decoder/build is exercised remotely. */
function preparedUpload(
  store: PackageStore,
  p: ThemePrincipal,
  bytes: Buffer,
  key: string = randomUUID(),
) {
  const draft = store.upload(p, bytes, key)
  store.requestBuild(p, draft.uploadId)
  const job = path.join(store.tenantRoot(p.tenantId), "jobs", draft.uploadId)
  const output = Buffer.from("{}")
  fs.writeFileSync(path.join(job, "bundle.json"), output)
  fs.writeFileSync(
    path.join(job, "result.json"),
    JSON.stringify({
      sourceDigest: draft.sourceDigest,
      outputDigest: packageSha(output),
      mediaValidated: true,
    }),
  )
  store.acceptBuild(p, draft.uploadId)

  return store.details(p, draft.uploadId)
}

describe("portable package trust boundary", () => {
  it("reclaims idle draft archives/jobs and permits same-key retry while counting orphan disk usage", () => {
    const { store } = setup()
    const fixture = createPackageFixture("game")
    const key = packageSha(fixture.bytes)
    const draft = preparedUpload(store, author, fixture.bytes, key)
    store.uninstall(author, draft.uploadId)
    expect(
      fs.existsSync(
        path.join(
          store.tenantRoot(author.tenantId),
          `${draft.sourceDigest}.tadazz`,
        ),
      ),
    ).toBe(false)
    expect(
      fs.existsSync(
        path.join(store.tenantRoot(author.tenantId), "jobs", draft.uploadId),
      ),
    ).toBe(false)
    expect(store.upload(author, fixture.bytes, key).uploadId).not.toBe(
      draft.uploadId,
    )
    const orphan = path.join(
      store.tenantRoot(author.tenantId),
      "retained-orphan",
    )
    fs.writeFileSync(orphan, "")
    fs.truncateSync(orphan, 2_000_000_001)
    expect(() =>
      store.upload(
        author,
        createPackageFixture("game", "another").bytes,
        randomUUID(),
      ),
    ).toThrow("PACKAGE_QUOTA")
  })
  it("binds expiring runtime capabilities to exact tenant/source/build and hashes CSP scripts", () => {
    const { store } = setup()
    const draft = preparedUpload(
      store,
      author,
      createPackageFixture("theme").bytes,
    )
    const secret = "isolated-runtime-capability-test-secret"
    const token = issueRuntimeAccess(store, author, draft.uploadId, secret)
    const image = draft.manifest.files.find((f) => f.kind === "image")!
    const name = `pkg_${draft.sourceDigest.slice(0, 24)}_${image.sha256}.png`
    expect(store.readMedia(author.tenantId, name)).toBeNull()
    expect(
      store.readMedia(author.tenantId, name, draft.sourceDigest)?.bytes.length,
    ).toBe(image.bytes)
    expect(store.readMedia("tenant-b", name, draft.sourceDigest)).toBeNull()
    expect(readRuntimeAccess(store, token, secret).row.source).toBe(
      draft.sourceDigest,
    )
    expect(() => readRuntimeAccess(store, token, "different-secret")).toThrow(
      "PACKAGE_CAPABILITY",
    )
    expect(() => readRuntimeAccess(store, `${token}.extra`, secret)).toThrow(
      "PACKAGE_CAPABILITY",
    )
    expect(() =>
      issueRuntimeAccess(
        store,
        { ...author, tenantId: "tenant-b" },
        draft.uploadId,
        secret,
      ),
    ).toThrow("PACKAGE_NOT_FOUND")
    const now = Date.now()
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 300_001)

    try {
      expect(() => readRuntimeAccess(store, token, secret)).toThrow(
        "PACKAGE_CAPABILITY",
      )
    } finally {
      clock.mockRestore()
    }

    const document = sandboxDocument(
      "console.log(1)",
      "body{color:white}",
      "https://manager.example.invalid",
    )
    expect(document.csp).toContain("script-src 'sha256-")
    expect(document.csp).toContain("connect-src 'none'")
    expect(document.csp).not.toContain("unsafe-eval")
    expect(document.csp).not.toContain("allow-same-origin")
  })
  it.each(["theme", "game", "complete", "declarative"] as const)(
    "round trips a real %s archive and verifies its full inventory",
    (kind) => {
      const fixture = createPackageFixture(kind)
      const result = inspectPackage(fixture.bytes)
      expect(result.report.manifest.id).toBe(fixture.manifest.id)
      expect(packPackage(result.pkg.manifest, result.pkg.files)).toEqual(
        fixture.bytes,
      )
      expect(result.report.games.length).toBe(
        kind === "complete" ? 2 : kind === "game" ? 1 : 0,
      )

      if (result.report.games.length) {
        expect(result.report.games[0].summary?.sceneCount).toBe(2)
      }
    },
  )
  it.each([
    "../x",
    "/x",
    "C:/x",
    "x\\y",
    "x/%2e",
    "x//y",
    "x/../y",
    "x\u0000y",
    "e\u0301.png",
    "x/CON.png",
    "x/y.",
  ])("rejects unsafe archive path %j", (name) =>
    expect(() => packagePath(name)).toThrow(),
  )
  it("resolves references relative to the declaring file and rejects root escape/URLs", () => {
    expect(relativePackagePath("theme/theme.json", "../shared/music.wav")).toBe(
      "shared/music.wav",
    )
    expect(() => relativePackagePath("theme.json", "../secret")).toThrow()
    expect(() =>
      relativePackagePath("theme.json", "https://external.test/x.png"),
    ).toThrow()
    expect(() => relativePackagePath("theme.json", "./%2e/x")).toThrow()
  })
  it("rejects placeholders, duplicate casefolded paths, unknown versions and extra fields", () => {
    const { manifest } = createPackageFixture("game")
    expect(
      packageManifestSchema.safeParse({ ...manifest, formatVersion: 2 })
        .success,
    ).toBe(false)
    expect(
      packageManifestSchema.safeParse({ ...manifest, tenantId: "foreign" })
        .success,
    ).toBe(false)
    expect(
      packageManifestSchema.safeParse({
        ...manifest,
        files: [
          ...manifest.files,
          { ...manifest.files[0], path: manifest.files[0].path.toUpperCase() },
        ],
      }).success,
    ).toBe(false)
    expect(
      packageManifestSchema.safeParse({
        ...manifest,
        files: [{ ...manifest.files[0], sha256: "ACTUAL_SHA256_REQUIRED" }],
      }).success,
    ).toBe(false)
  })
  it.each([
    "crc",
    "local-size",
    "link",
    "encrypted",
    "extra",
    "appended",
    "truncated",
  ])("rejects %s archive before installation", (attack) => {
    const buffer = Buffer.from(createPackageFixture("game").bytes)
    const central = buffer.readUInt32LE(buffer.length - 6)

    if (attack === "crc") {
      buffer[35] ^= 1
    }

    if (attack === "local-size") {
      buffer.writeUInt32LE(100_000_001, 22)
    }

    if (attack === "link") {
      buffer.writeUInt32LE(0xa1ff0000, central + 38)
    }

    if (attack === "encrypted") {
      buffer.writeUInt16LE(1, central + 8)
    }

    if (attack === "extra") {
      buffer.writeUInt16LE(4, central + 30)
    }

    const bytes =
      attack === "appended"
        ? Buffer.concat([buffer, Buffer.from("junk")])
        : attack === "truncated"
          ? buffer.subarray(0, -1)
          : buffer
    expect(() => unpackPackage(bytes)).toThrow()
  })
  it("fails missing relative assets and data-only scripts at preflight", () => {
    const fixture = createPackageFixture("game")
    const descriptor = fixture.files
      .get("games/game-1.json")!
      .toString()
      .replace("./assets/q0-a0.png", "./assets/missing.png")
    fixture.files.set("games/game-1.json", Buffer.from(descriptor))
    const manifest = {
      ...fixture.manifest,
      files: fixture.manifest.files.map((f) =>
        f.path === "games/game-1.json"
          ? {
              ...f,
              bytes: Buffer.byteLength(descriptor),
              sha256: packageSha(descriptor),
            }
          : f,
      ),
    }
    expect(() => inspectPackage(packPackage(manifest, fixture.files))).toThrow(
      "PACKAGE_MISSING_ASSET",
    )
  })
  it("installs ten five-image questions/audio, persists and reimports in another tenant without manual upload", () => {
    const { store, dir } = setup(),
      fixture = createPackageFixture("game")
    const draft = preparedUpload(store, author, fixture.bytes)
    const result = store.install(author, draft.uploadId, draft.revision, [
      "demo-game-1",
    ])
    expect(result.installedGames).toHaveLength(1)
    const savedBase = JSON.parse(
      fs.readFileSync(
        path.join(
          dir,
          author.tenantId,
          `quizz/${result.installedGames[0]}.json`,
        ),
        "utf8",
      ),
    ) as { id: string }
    const base = { ...quizzValidator.parse(savedBase), id: savedBase.id }
    expect(base.questions).toHaveLength(10)
    const sidecar = quizExtrasV2Schema.parse(
      JSON.parse(
        fs.readFileSync(
          path.join(dir, author.tenantId, `extensions/quizzes/${base.id}.json`),
          "utf8",
        ),
      ),
    )
    expect(
      Object.values(sidecar.perQuestion).flatMap((q) => q.answerVisuals ?? []),
    ).toHaveLength(50)
    const asset = `/media/pkg_${draft.sourceDigest.slice(0, 24)}_${fixture.manifest.files[0].sha256}.png`
    expect(
      store.readMedia(author.tenantId, asset.split("/").at(-1)!),
    ).not.toBeNull()
    expect(store.readMedia("tenant-b", asset.split("/").at(-1)!)).toBeNull()
    const other = { ...author, tenantId: "tenant-b" }
    const upload = preparedUpload(
      store,
      other,
      store.export(author, draft.uploadId),
    )
    const second = store.install(other, upload.uploadId, upload.revision, [
      "demo-game-1",
    ])
    expect(second.installedGames[0]).not.toBe(base.id)
    expect(() => store.details(other, draft.uploadId)).toThrow(
      "PACKAGE_NOT_FOUND",
    )
    expect(() => store.uninstall(author, draft.uploadId)).toThrow(
      "PACKAGE_REFERENCES_RETAINED",
    )
    const currentExport = store.exportGame(author, draft.uploadId, {
      bundleVersion: 1,
      quizz: base,
      extras: sidecar,
    })
    const exported = inspectPackage(currentExport)
    expect(exported.report.type).toBe("game")
    expect(exported.report.games[0].summary?.answerImageCount).toBe(50)
  })
  it("declarative theme needs independent exact review, persists and supports immutable rollback", () => {
    const { store, dir } = setup()
    const one = preparedUpload(
      store,
      author,
      createPackageFixture("declarative").bytes,
    )
    expect(() =>
      store.install(author, one.uploadId, one.revision, ["fixture-arcade"]),
    ).toThrow("PACKAGE_REVIEW_REQUIRED")
    expect(() =>
      store.approve({ ...author, grants: ["review"] }, one.uploadId, {}),
    ).toThrow()
    approve(store, one.uploadId)
    store.install(author, one.uploadId, one.revision, ["fixture-arcade"])
    const two = preparedUpload(
      store,
      author,
      createPackageFixture("declarative", "arcade", "2.0.0").bytes,
    )
    approve(store, two.uploadId)
    store.install(author, two.uploadId, two.revision, ["fixture-arcade"])
    expect(store.catalog(author.tenantId, true)[0].version).toBe("2.0.0")
    store.rollback(author, one.uploadId)
    expect(store.catalog(author.tenantId, true)[0].version).toBe("1.0.0")
    expect(store.catalog(author.tenantId)).toHaveLength(2)
    const reopened = new PackageStore(
      path.join(dir, "store"),
      "fixture-secret-at-least-32-characters",
      (tenant) => path.join(dir, tenant),
    )
    databases.push(reopened)
    expect(reopened.catalog(author.tenantId, true)[0].version).toBe("1.0.0")
  })
  it("prevents replayed idempotency keys changing bytes and retains revisions", () => {
    const { store } = setup(),
      fixture = createPackageFixture("game"),
      key = randomUUID()
    const first = preparedUpload(store, author, fixture.bytes, key)
    expect(store.upload(author, fixture.bytes, key).uploadId).toBe(
      first.uploadId,
    )
    expect(() =>
      store.upload(
        author,
        createPackageFixture("game", "cinematic").bytes,
        key,
      ),
    ).toThrow("PACKAGE_IDEMPOTENCY_CONFLICT")
    expect(() =>
      store.install(author, first.uploadId, 100, ["demo-game-1"]),
    ).toThrow("PACKAGE_INSTALL_STATE")
  })
  it("complete packs install two games and one runtime pin atomically", () => {
    const { store, dir } = setup()
    const upload = preparedUpload(
      store,
      author,
      createPackageFixture("complete").bytes,
    )
    approve(store, upload.uploadId)
    const result = store.install(author, upload.uploadId, upload.revision, [
      "fixture-arcade",
      "demo-game-1",
      "demo-game-2",
    ])
    expect(result.installedGames).toHaveLength(2)
    expect(store.catalog(author.tenantId)[0].runtime?.sourceDigest).toBe(
      upload.sourceDigest,
    )
    for (const id of result.installedGames) {
      const sidecar = quizExtrasV2Schema.parse(
        JSON.parse(
          fs.readFileSync(
            path.join(dir, author.tenantId, `extensions/quizzes/${id}.json`),
            "utf8",
          ),
        ),
      )
      expect(sidecar.defaults.showTheme?.id).toBe("fixture-arcade")
    }
  })
  it("a failed second game leaves no imported games or installed theme", () => {
    const { store, dir } = setup()
    const upload = preparedUpload(
      store,
      author,
      createPackageFixture("complete").bytes,
    )
    approve(store, upload.uploadId)
    const original = fs.writeFileSync
    let writes = 0
    const spy = vi
      .spyOn(fs, "writeFileSync")
      .mockImplementation((file, data, options) => {
        if (
          typeof file === "string" &&
          file.startsWith(path.join(dir, author.tenantId, "quizz"))
        ) {
          writes += 1

          if (writes === 2) {
            throw new Error("Injected disk failure")
          }
        }

        return original(file, data, options)
      })

    try {
      expect(() =>
        store.install(author, upload.uploadId, upload.revision, [
          "fixture-arcade",
          "demo-game-1",
          "demo-game-2",
        ]),
      ).toThrow("Injected disk failure")
    } finally {
      spy.mockRestore()
    }

    expect(fs.readdirSync(path.join(dir, author.tenantId, "quizz"))).toEqual([])
    expect(store.catalog(author.tenantId)).toEqual([])
    expect(store.details(author, upload.uploadId).phase).toBe("preview-ready")
  })
  it("explicit game-only selection can use Classic without installing the bundled code", () => {
    const { store } = setup()
    const upload = preparedUpload(
      store,
      author,
      createPackageFixture("complete").bytes,
    )
    expect(() =>
      store.install(author, upload.uploadId, upload.revision, ["demo-game-1"]),
    ).toThrow("PACKAGE_DEPENDENCY")
    const result = store.install(
      author,
      upload.uploadId,
      upload.revision,
      ["demo-game-1"],
      true,
    )
    expect(result.installedGames).toHaveLength(1)
    expect(store.catalog(author.tenantId)).toEqual([])
  })
  it("recovers interrupted installation using only its predeclared new game paths", () => {
    const { store, dir } = setup(),
      upload = preparedUpload(store, author, createPackageFixture("game").bytes)
    const id = randomUUID(),
      relative = `quizz/${id}.json`
    fs.mkdirSync(path.join(dir, author.tenantId, "quizz"), { recursive: true })
    fs.writeFileSync(path.join(dir, author.tenantId, relative), "partial")
    store.db
      .prepare(
        "UPDATE packages SET phase='installing',targets=? WHERE upload=?",
      )
      .run(JSON.stringify([relative]), upload.uploadId)
    const reopened = new PackageStore(
      path.join(dir, "store"),
      "fixture-secret-at-least-32-characters",
      (tenant) => path.join(dir, tenant),
    )
    databases.push(reopened)
    expect(fs.existsSync(path.join(dir, author.tenantId, relative))).toBe(false)
    expect(reopened.details(author, upload.uploadId).phase).toBe(
      "preview-ready",
    )
  })
  it("rejects excess/PII fields, bridge replays, foreign channels and stale epochs", () => {
    expect(
      runtimeSnapshotSchema.safeParse({ account: { token: "secret" } }).success,
    ).toBe(false)
    const guard = new RendererMessageGuard("a".repeat(64))
    const context = {
      epoch: 3,
      roomId: "room-a",
      questionId: "question-a",
      role: "player" as const,
    }
    const message = {
      v: 1,
      channel: "a".repeat(64),
      sequence: 1,
      ...context,
      type: "READY",
      runtimeApi: 1,
    }
    expect(guard.accept(message, context, 1000)).not.toBeNull()
    expect(guard.accept(message, context, 1001)).toBeNull()
    expect(
      guard.accept({ ...message, sequence: 2, epoch: 2 }, context, 1002),
    ).toBeNull()
    expect(
      guard.accept(
        { ...message, sequence: 2, channel: "b".repeat(64) },
        context,
        1002,
      ),
    ).toBeNull()
    expect(
      guard.accept(
        { ...message, sequence: 2, roomId: "room-b" },
        context,
        1002,
      ),
    ).toBeNull()
    expect(
      guard.accept({ ...message, sequence: 2, auth: "secret" }, context, 1002),
    ).toBeNull()
    expect(
      guard.accept({ ...message, sequence: 2 }, context, 1002),
    ).not.toBeNull()
  })
})
