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
import { authoredShowToNativeBundleDraft } from "../../core/show-authoring-convert"
import { authoredFixture } from "../../core/show-library/preview-fixtures"
import {
  readAccountPreviewSource,
  readAccountPreviewAssets,
} from "./account-preview-source"

const directories: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})
it("public source requires an explicit flag, binds one approved ID and can be withdrawn", () => {
  vi.stubEnv("TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED", "false")
  expect(readPublicPreviewSource("quiz")).toBeNull()
  vi.stubEnv("TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED", "true")
  expect(readPublicPreviewSource("crowd")).toBeNull()
  expect(readPublicPreviewSource("../quiz")).toBeNull()
  const source = readPublicPreviewSource("quiz")
  expect(source?.source.kind).toBe("published-demo")
  expect(source?.show.cards).toHaveLength(4)
  expect(source?.assets).toEqual([])
  expect(JSON.stringify(source)).not.toMatch(
    /(?:QA_PRIVATE|goldysterling|accountId|quizId|631212f9)/u,
  )
  vi.stubEnv("TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED", "false")
  expect(readPublicPreviewSource("quiz")).toBeNull()
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
