import { describe, expect, it } from "vitest"
import { normalizeLegacyStageLook, resolveStageLook } from "./stage-look"
import { authoredShowToNativeBundleDraft, nativeBundleToAuthoredShow } from "./show-authoring-convert"
import { authoredFixture } from "./show-library/preview-fixtures"
import { studioDefaultsSchema } from "./studio-timeline-schema"

const legacyId = "6369bf77-c3d4-40ee-8a67-0476434b562f"
const composition = {
  workspaceId: "00000000-0000-4000-8000-000000000099",
  documentId: "appearance-test", version: "1.0.0",
  digest: "1".repeat(64), rendererBuildSha256: "2".repeat(64),
}
const bundle = () => authoredShowToNativeBundleDraft(authoredFixture(3, 2), legacyId).bundleDraft!

describe("persisted native stage appearance", () => {
  it("normalizes the legacy show without changing any authored data or mutating its source", () => {
    const source = bundle().extras
    const before = JSON.stringify(source)
    const normalized = normalizeLegacyStageLook(source)
    expect(resolveStageLook(normalized.defaults)).toBe("guess-off")
    expect(normalizeLegacyStageLook(normalized)).toBe(normalized)
    expect(JSON.stringify(source)).toBe(before)
    const { stageLook: _look, ...defaults } = normalized.defaults
    expect({ ...normalized, defaults }).toEqual(source)
    const other = { ...source, quizId: "new-show" }
    expect(normalizeLegacyStageLook(other)).toBe(other)
    expect(resolveStageLook(other.defaults)).toBe("theme")
  })

  it("preserves appearance through friendly conversion and a new game identity", () => {
    const source = bundle()
    const before = JSON.stringify(source)
    const authored = nativeBundleToAuthoredShow(source)
    expect(authored.defaults?.stageLook).toBe("guess-off")
    const restored = authoredShowToNativeBundleDraft(authored, "new-clone").bundleDraft!
    expect(restored.extras.quizId).toBe("new-clone")
    expect(resolveStageLook(restored.extras.defaults)).toBe("guess-off")
    expect(nativeBundleToAuthoredShow(restored).cards).toEqual(authored.cards)
    expect(JSON.stringify(source)).toBe(before)
  })

  it("keeps explicit theme, version, composition and opt-out choices authoritative", () => {
    const source = normalizeLegacyStageLook(bundle().extras)
    for (const showTheme of [
      { id: "razzia-original", version: "1.0.0", overrides: {} },
      { id: "installed-theme", version: "1.0.0", overrides: {} },
      { id: "tadazz-classic", version: "2.0.0", overrides: {} },
    ]) {
      expect(resolveStageLook({ ...source.defaults, showTheme })).toBe("theme")
    }
    expect(resolveStageLook({ ...source.defaults, showComposition: composition })).toBe("theme")
    const optOut = { ...source, defaults: { ...source.defaults, stageLook: "theme" as const } }
    expect(normalizeLegacyStageLook(optOut)).toBe(optOut)
    expect(resolveStageLook(optOut.defaults)).toBe("theme")
    expect(studioDefaultsSchema.safeParse({ ...source.defaults, stageLook: "unknown" }).success).toBe(false)
  })
})
