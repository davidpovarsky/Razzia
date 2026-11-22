import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { readPublicPreviewSource } from "./public-preview-source"
import { publicDemoCatalogue } from "../../core/show-library/public-demo-catalogue"
import { authoredShowToNativeBundleDraft } from "../../core/show-authoring-convert"
import { authoredFixture } from "../../core/show-library/preview-fixtures"
import { computeCanonicalBaseDigest } from "../../core/digest"
import { normalizeApplicationPreviewDraft } from "../../core/show-library/application-preview-input"
import {
  readAccountPreviewSource,
  readAccountPreviewAssets,
  PreviewSourceError,
} from "./account-preview-source"

const directories: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})
it("public sources bind only approved catalogue IDs and can be explicitly withdrawn", () => {
  vi.stubEnv("TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED", "false")
  expect(readPublicPreviewSource("quiz")).toBeNull()
  vi.stubEnv("TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED", "true")
  expect(readPublicPreviewSource("unknown-customer-game")).toBeNull()
  expect(readPublicPreviewSource("../quiz")).toBeNull()
  const source = readPublicPreviewSource("quiz")
  expect(source?.source.kind).toBe("published-demo")
  expect(source?.show.cards.length).toBeGreaterThanOrEqual(6)
  expect(source?.assets).toEqual([])
  expect(JSON.stringify(source)).not.toMatch(
    /(?:QA_PRIVATE|goldysterling|accountId|quizId|631212f9)/u,
  )
  for (const example of publicDemoCatalogue) {
    const demo = readPublicPreviewSource(example.id)

    expect(demo?.source).toMatchObject({
      kind: "published-demo",
      catalogueId: example.id,
    })
    expect(demo?.show.cards.length).toBeGreaterThanOrEqual(6)
    expect(demo?.assets).toEqual([])
    expect(demo?.show.defaults?.showTheme?.id).toBe(example.themeId)
  }
  vi.stubEnv("TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED", "false")
  expect(readPublicPreviewSource("quiz")).toBeNull()
})
it("enables the curated gallery with the site's inline preview while retaining an explicit public opt-out", () => {
  vi.stubEnv("TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED", undefined)
  vi.stubEnv("TADAZZ_INLINE_GAME_PREVIEW_ENABLED", "true")
  expect(readPublicPreviewSource("family")?.source).toMatchObject({
    kind: "published-demo",
    catalogueId: "family",
  })
  expect(readPublicPreviewSource("private-account-game")).toBeNull()
  vi.stubEnv("TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED", "false")
  expect(readPublicPreviewSource("family")).toBeNull()
  vi.stubEnv("TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED", undefined)
  vi.stubEnv("TADAZZ_INLINE_GAME_PREVIEW_ENABLED", "false")
  expect(readPublicPreviewSource("family")).toBeNull()
})
function fixture(sidecar: boolean) {
  const root = mkdtempSync(path.join(tmpdir(), "phase2-preview-"))
  directories.push(root)
  const source = authoredFixture(5, 2)
  const bundle = authoredShowToNativeBundleDraft(
    source,
    "owned-game",
  ).bundleDraft!
  mkdirSync(path.join(root, "quizz"))
  writeFileSync(
    path.join(root, "quizz", "source.json"),
    JSON.stringify({ id: "owned-game", ...bundle.quizz }),
  )

  if (sidecar) {
    mkdirSync(path.join(root, "extensions/quizzes"), { recursive: true })
    writeFileSync(
      path.join(root, "extensions/quizzes/owned-game.json"),
      JSON.stringify(bundle.extras),
    )
  }

  return { root, bundle, getPath: (file = "") => path.join(root, file) }
}
const digest = (file: string) =>
  createHash("sha256").update(readFileSync(file)).digest("hex")

describe("account-owned preview source is a read-only projection", () => {
  it("binds authored scene fragments to current owner bytes and preserves them through the native adapter", () => {
    const owner = fixture(true)
    const foreign = fixture(false)
    const url = "/media/owned-recap.mp3#authored-recap-marker"
    const sceneId = crypto.randomUUID()
    const audio = { mode: "custom" as const, url, volume: 1, loop: false }
    owner.bundle.extras.timeline.unshift({
      id: crypto.randomUUID(),
      kind: "animation",
      sceneId,
    })
    owner.bundle.extras.scenes[sceneId] = {
      id: sceneId,
      kind: "animation",
      preset: "round-recap",
      durationMs: 3000,
      advance: "manual",
      audio,
    }
    const sideFile = owner.getPath("extensions/quizzes/owned-game.json")
    writeFileSync(sideFile, JSON.stringify(owner.bundle.extras))
    mkdirSync(owner.getPath("media"))
    const mediaFile = owner.getPath("media/owned-recap.mp3")
    writeFileSync(mediaFile, "owner-scoped audio bytes")
    const before = [
      digest(owner.getPath("quizz/source.json")),
      digest(sideFile),
      digest(mediaFile),
    ]
    const result = readAccountPreviewSource(owner, "owned-game")

    expect(result.assets).toEqual([
      { url, bytes: 24, sha256: digest(mediaFile) },
    ])
    const draft = normalizeApplicationPreviewDraft(
      { source: result.source, show: result.show, assets: result.assets },
      {
        locale: "en",
        reducedMotion: false,
        role: "spectator",
      },
    )
    expect(draft.show.cards[0]).toMatchObject({ kind: "animation", audio })
    const converted = authoredShowToNativeBundleDraft(
      draft.show,
      "owned-preview",
    ).bundleDraft!
    const [first] = converted.extras.timeline
    expect(first.kind).toBe("animation")

    if (first.kind === "question") {
      throw new Error("Expected an authored scene")
    }

    expect(converted.extras.scenes[first.sceneId].audio).toEqual(audio)
    expect(() => readAccountPreviewAssets(foreign, [url])).toThrow()
    expect([
      digest(owner.getPath("quizz/source.json")),
      digest(sideFile),
      digest(mediaFile),
    ]).toEqual(before)
    expect(readdirSync(owner.getPath("media"))).toEqual(["owned-recap.mp3"])
  })
  it("authorizes installed media by pathname while binding the exact fragment reference", () => {
    const owner = fixture(false)
    const name = `pkg_${"a".repeat(24)}_${"b".repeat(64)}.mp3`
    const url = `/media/${name}#t=1,3`
    const bytes = Buffer.from("installed owner bytes")
    const readInstalledMedia = vi.fn(() => ({ bytes }))
    const result = readAccountPreviewAssets({ ...owner, readInstalledMedia }, [
      url,
    ])

    expect(readInstalledMedia).toHaveBeenCalledTimes(1)
    expect(readInstalledMedia).toHaveBeenCalledWith(name)
    expect(result).toEqual([
      {
        url,
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    ])
    expect(() => readAccountPreviewAssets(owner, [url])).toThrow(
      PreviewSourceError,
    )
  })
  it("binds appearance media to current tenant bytes and refuses foreign URLs or traversal", () => {
    const owner = fixture(false),
      foreign = fixture(false)
    mkdirSync(owner.getPath("media"))
    writeFileSync(owner.getPath("media/owned.png"), "owned source bytes")
    const first = readAccountPreviewAssets(owner, ["/media/owned.png"])
    expect(first).toEqual([
      {
        url: "/media/owned.png",
        bytes: 18,
        sha256: digest(owner.getPath("media/owned.png")),
      },
    ])
    expect(() =>
      readAccountPreviewAssets(foreign, ["/media/owned.png"]),
    ).toThrow()
    for (const url of [
      "/media/../quizz/source.json",
      "https://example.invalid/owned.png",
      "/media/%2e%2e.png",
    ]) {
      expect(() => readAccountPreviewAssets(owner, [url])).toThrow()
    }
    expect(() =>
      readAccountPreviewAssets(owner, ["/media/owned.png", "/media/owned.png"]),
    ).toThrow()
    writeFileSync(owner.getPath("media/owned.png"), "changed source bytes")
    expect(
      readAccountPreviewAssets(owner, ["/media/owned.png"])[0].sha256,
    ).not.toBe(first[0].sha256)
    expect(readdirSync(owner.getPath("media"))).toEqual(["owned.png"])
  })
  it("does not create a sidecar/directory, migrate IDs or mutate legacy bytes", () => {
    const f = fixture(false),
      file = f.getPath("quizz/source.json"),
      before = digest(file)
    const first = readAccountPreviewSource(f, "owned-game")
    const second = readAccountPreviewSource(f, "owned-game")
    expect(first).toEqual(second)
    expect(first.chapters).toHaveLength(10)
    expect(first.sampleData).toBe(true)
    expect(digest(file)).toBe(before)
    expect(readdirSync(f.root).sort()).toEqual(["quizz"])
    expect(existsSync(f.getPath("extensions"))).toBe(false)
  })
  it("keeps exact authored order and refuses mismatched sidecar revisions", () => {
    const f = fixture(true),
      file = f.getPath("extensions/quizzes/owned-game.json")
    const original = digest(file)
    const result = readAccountPreviewSource(f, "owned-game")
    expect(result.show.cards.map((card) => card.kind)).toEqual(["quiz", "quiz"])
    expect(digest(file)).toBe(original)
    writeFileSync(
      file,
      JSON.stringify({ ...f.bundle.extras, baseDigest: "0".repeat(64) }),
    )
    expect(() => readAccountPreviewSource(f, "owned-game")).toThrow(
      "Preview source unavailable",
    )
  })
  it.each(["logical", "legacy-full"] as const)(
    "accepts the stored %s digest without rewriting bytes, and still rejects drift",
    (form) => {
      const f = fixture(true)
      const baseFile = f.getPath("quizz/source.json")
      const sideFile = f.getPath("extensions/quizzes/owned-game.json")
      const storedPayload = { ...f.bundle.quizz, legacyMetadata: "preserved" }
      const storedRecord = { id: "owned-game", ...storedPayload }
      const extras = {
        ...f.bundle.extras,
        baseDigest: computeCanonicalBaseDigest(
          form === "logical" ? storedPayload : storedRecord,
        ),
      }
      writeFileSync(baseFile, JSON.stringify(storedRecord))
      writeFileSync(sideFile, JSON.stringify(extras))
      const before = [digest(baseFile), digest(sideFile)]
      const first = readAccountPreviewSource(f, "owned-game")

      expect(first.show.cards.map((card) => card.kind)).toEqual([
        "quiz",
        "quiz",
      ])
      expect(readAccountPreviewSource(f, "owned-game")).toEqual(first)
      expect([digest(baseFile), digest(sideFile)]).toEqual(before)

      const changed = structuredClone(storedRecord)
      changed.questions[0].question = "Changed after the saved sidecar"
      writeFileSync(baseFile, JSON.stringify(changed))
      const changedBytes = readFileSync(baseFile)

      expect(() => readAccountPreviewSource(f, "owned-game")).toThrow(
        expect.objectContaining({ status: 409 }),
      )
      expect(readFileSync(baseFile)).toEqual(changedBytes)
      expect(digest(sideFile)).toBe(before[1])

      writeFileSync(baseFile, JSON.stringify(storedRecord))
      writeFileSync(
        sideFile,
        JSON.stringify({ ...extras, quizId: "foreign-game" }),
      )
      expect(() => readAccountPreviewSource(f, "owned-game")).toThrow(
        PreviewSourceError,
      )
    },
  )
  it("never returns private directory numbers/representatives from authored scenes", () => {
    const f = fixture(true)
    const sceneId = crypto.randomUUID()
    f.bundle.extras.timeline.unshift({
      id: crypto.randomUUID(),
      kind: "animation",
      sceneId,
    })
    f.bundle.extras.scenes[sceneId] = {
      id: sceneId,
      kind: "animation",
      preset: "phone-instructions",
      title: "Join",
      durationMs: 3000,
      advance: "manual",
      dialNumber: "+440000000000",
      representatives: [{ table: 1, name: "PRIVATE_CONTACT_SENTINEL" }],
    }
    writeFileSync(
      f.getPath("extensions/quizzes/owned-game.json"),
      JSON.stringify(f.bundle.extras),
    )
    const json = JSON.stringify(readAccountPreviewSource(f, "owned-game"))
    expect(json).not.toContain("PRIVATE_CONTACT_SENTINEL")
    expect(json).not.toContain("+440000000000")
    expect(json).not.toContain("representatives")
    expect(json).not.toContain('"roster"')
  })
  it("does not traverse tenants, mint missing IDs, or alias foreign source IDs", () => {
    const f = fixture(false)
    for (const id of ["foreign-game", "../owned-game", "owned-game/other"]) {
      expect(() => readAccountPreviewSource(f, id)).toThrow()
    }
    const file = f.getPath("quizz/source.json")
    const value = JSON.parse(readFileSync(file, "utf8")) as Record<
      string,
      unknown
    >
    delete value.id
    writeFileSync(file, JSON.stringify(value))
    const before = digest(file)
    expect(() => readAccountPreviewSource(f, "owned-game")).toThrow()
    expect(digest(file)).toBe(before)
  })
})
