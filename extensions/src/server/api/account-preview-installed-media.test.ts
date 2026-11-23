import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createPackageFixture } from "../../testkit/package-fixtures"
import { authoredShowToNativeBundleDraft } from "../../core/show-authoring-convert"
import type { ThemePrincipal } from "../show-themes/review"
import { packageSha } from "../packages/archive"
import { PackageStore } from "../packages/store"
import { createExtensionRoutes } from "./routes"
import { readAccountPreviewAssets } from "./account-preview-source"

const temporary: string[] = []
const stores: PackageStore[] = []
const author: ThemePrincipal = {
  tenantId: "preview-owner",
  userId: "preview-author",
  grants: ["author"],
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const store of stores.splice(0)) {
    store.close()
  }
  for (const root of temporary.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function snapshot(root: string) {
  const entries: Array<{ name: string; sha256: string | null }> = []
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      entries.push({
        name: path.relative(root, file),
        sha256: entry.isDirectory() ? null : packageSha(fs.readFileSync(file)),
      })

      if (entry.isDirectory()) {
        visit(file)
      }
    }
  }
  visit(root)

  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

function setup(installed = true) {
  vi.stubEnv("TADAZZ_INLINE_GAME_PREVIEW_ENABLED", "true")
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-package-media-"))
  temporary.push(root)
  const tenantRoot = (tenant: string) => path.join(root, "tenants", tenant)
  const store = new PackageStore(
    path.join(root, "packages"),
    "preview-package-fixture-secret-at-least-32-characters",
    tenantRoot,
  )
  stores.push(store)
  const fixture = createPackageFixture("game")
  const upload = store.upload(author, fixture.bytes, randomUUID())
  store.requestBuild(author, upload.uploadId)
  // Only the trusted build worker is doubled; upload, install, media admission
  // and account preview use their real production implementations.
  const job = path.join(
    store.tenantRoot(author.tenantId),
    "jobs",
    upload.uploadId,
  )
  const output = Buffer.from("{}")
  fs.writeFileSync(path.join(job, "bundle.json"), output)
  fs.writeFileSync(
    path.join(job, "result.json"),
    JSON.stringify({
      sourceDigest: upload.sourceDigest,
      outputDigest: packageSha(output),
      mediaValidated: true,
    }),
  )
  store.acceptBuild(author, upload.uploadId)
  const receipt = store.details(author, upload.uploadId)
  const image = fixture.manifest.files.find(
    (file) => file.path === "shared/backdrop.png",
  )

  if (!image) {
    throw new Error("Fixture image missing")
  }

  const name = `pkg_${receipt.sourceDigest.slice(0, 24)}_${image.sha256}.png`
  const url = `/media/${name}`
  let gameId = "uninstalled-reference"

  if (installed) {
    const result = store.install(author, upload.uploadId, receipt.revision, [
      "demo-game-1",
    ])
    const [selected] = result.installedGames

    if (!selected) {
      throw new Error("Installed fixture game missing")
    }

    gameId = selected
  } else {
    const converted = authoredShowToNativeBundleDraft(
      {
        format: "tada-show",
        version: 1,
        title: "Owned game with an uninstalled package reference",
        cards: [
          {
            key: "question-1",
            kind: "quiz",
            question: "Synthetic question",
            questionType: "single",
            timeSeconds: 20,
            correctAnswers: [1],
            answers: [{ text: "First" }, { text: "Second" }],
            media: { type: "image", url },
          },
        ],
      },
      gameId,
    )

    if (!converted.bundleDraft) {
      throw new Error("Uninstalled reference fixture invalid")
    }

    const { quizz, extras } = converted.bundleDraft
    fs.mkdirSync(path.join(tenantRoot(author.tenantId), "quizz"), {
      recursive: true,
    })
    fs.mkdirSync(path.join(tenantRoot(author.tenantId), "extensions/quizzes"), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(tenantRoot(author.tenantId), `quizz/${gameId}.json`),
      JSON.stringify({ id: gameId, ...quizz }),
    )
    fs.writeFileSync(
      path.join(
        tenantRoot(author.tenantId),
        `extensions/quizzes/${gameId}.json`,
      ),
      JSON.stringify(extras),
    )
  }

  const mutationDenied = () => {
    throw new Error("Preview attempted a storage mutation")
  }
  const app = (tenant: string) =>
    createExtensionRoutes(
      {
        getPath: (relative = "") => path.join(tenantRoot(tenant), relative),
        getQuizzById: mutationDenied,
        saveQuizz: mutationDenied,
        updateQuizz: mutationDenied,
        deleteQuizz: mutationDenied,
        readInstalledMedia: (assetName) => store.readMedia(tenant, assetName),
      },
      async (_context, next) => {
        // One fixed authenticated test owner per app; real HTTP session binding is
        // exercised by the native stored-game acceptance runner.
        await next()
      },
    )
  const read = (tenant = author.tenantId) =>
    Promise.all([
      app(tenant).request(`/preview/quizzes/${gameId}`),
      app(tenant).request("/preview/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [url] }),
      }),
    ])

  return { root, store, tenantRoot, receipt, image, name, url, gameId, read }
}

describe("saved account previews of installed package media", () => {
  it("keeps ordinary uploaded filenames that start with pkg_ or theme_", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "preview-upload-prefix-"),
    )
    temporary.push(root)
    fs.mkdirSync(path.join(root, "media"))
    const bytes = Buffer.from("owned upload")
    const urls = ["/media/pkg_uploaded.png", "/media/theme_uploaded.png"]
    for (const url of urls) {
      fs.writeFileSync(path.join(root, url.slice(1)), bytes)
    }
    const reader = vi.fn(() => null)
    expect(
      readAccountPreviewAssets(
        {
          getPath: (relative = "") => path.join(root, relative),
          readInstalledMedia: reader,
        },
        urls,
      ),
    ).toEqual(
      urls.map((url) => ({
        url,
        sha256: packageSha(bytes),
        bytes: bytes.length,
      })),
    )
    expect(reader).not.toHaveBeenCalled()
  })

  it("reads real installed blobs for source and asset endpoints without copying or writing", async () => {
    const f = setup()
    const before = snapshot(f.root)
    const [source, assets] = await f.read()
    expect(source.status).toBe(200)
    expect(assets.status).toBe(200)
    const expected = {
      url: f.url,
      sha256: f.image.sha256,
      bytes: f.image.bytes,
    }
    const projected: unknown = await source.json()
    expect(projected).toMatchObject({
      source: { kind: "account-owned", quizId: f.gameId },
    })
    expect(projected).toHaveProperty(
      "assets",
      expect.arrayContaining([expected]),
    )
    expect(await assets.json()).toEqual({ assets: [expected] })
    expect(snapshot(f.root)).toEqual(before)
    expect(
      fs.existsSync(path.join(f.tenantRoot(author.tenantId), "media", f.name)),
    ).toBe(false)
  })

  it("denies another owner's copied game and a same-named physical upload", async () => {
    const f = setup()
    const foreign = "preview-other-owner"
    fs.cpSync(f.tenantRoot(author.tenantId), f.tenantRoot(foreign), {
      recursive: true,
    })
    fs.mkdirSync(path.join(f.tenantRoot(foreign), "media"), { recursive: true })
    fs.writeFileSync(
      path.join(f.tenantRoot(foreign), "media", f.name),
      "shadow upload",
    )
    const before = snapshot(f.root)
    expect((await f.read(foreign)).map((response) => response.status)).toEqual([
      422, 422,
    ])
    expect(snapshot(f.root)).toEqual(before)
  })

  it("does not use a draft's preview capability as installed media authorization", async () => {
    const f = setup(false)
    expect(
      f.store.readMedia(author.tenantId, f.name, f.receipt.sourceDigest)?.bytes
        .length,
    ).toBe(f.image.bytes)
    expect(f.store.readMedia(author.tenantId, f.name)).toBeNull()
    const before = snapshot(f.root)
    expect((await f.read()).map((response) => response.status)).toEqual([
      422, 422,
    ])
    expect(snapshot(f.root)).toEqual(before)
  })

  it.each(["deleted", "corrupt"] as const)(
    "fails closed for an installed asset whose bytes are %s",
    async (failure) => {
      const f = setup()
      const object = path.join(
        f.store.tenantRoot(author.tenantId),
        "objects",
        f.image.sha256,
      )

      if (failure === "deleted") {
        fs.unlinkSync(object)
      } else {
        fs.writeFileSync(object, "digest mismatch")
      }

      const before = snapshot(f.root)
      expect((await f.read()).map((response) => response.status)).toEqual([
        422, 422,
      ])
      expect(snapshot(f.root)).toEqual(before)
    },
  )
})
