import { describe, expect, it } from "vitest"
import {
  applicationCompositionPinSchema,
  projectApplicationComposition,
  applicationCardThemeScope,
  cloneApplicationCardScope,
  type ApplicationCompositionAppearance,
} from "./application-composition-pin"
import { getApplicationShowLibrary } from "./application-library"
import { authoredFixture } from "./preview-fixtures"
import {
  authoredShowToNativeBundleDraft,
  nativeBundleToAuthoredShow,
} from "../show-authoring-convert"

const pin = {
  workspaceId: "631212f9-6ced-41d1-99c0-b642e1e39ed6",
  documentId: "owned-theme",
  version: "1.0.0",
  digest: "1".repeat(64),
  rendererBuildSha256: "2".repeat(64),
}
function appearance(): ApplicationCompositionAppearance {
  const registry = structuredClone(getApplicationShowLibrary())
  const manager = structuredClone(
    registry.templates.find(
      (template) => template.id === "native.question.flow",
    )!,
  )
  manager.id = "host-only"
  manager.roles = ["manager"]
  manager.nodes[0].props.labelKey = "extensions:PRIVATE_MANAGER_SENTINEL"
  registry.templates.push(manager)

  return {
    registry,
    document: {
      format: "tadazz-show-composition",
      schemaVersion: 1,
      selection: {
        id: "tadazz-classic",
        version: "1.0.0",
        overrides: {
          roles: {
            manager: {
              slots: {
                question: { mediaUrl: "/media/PRIVATE_MANAGER_SENTINEL.png" },
              },
            },
            spectator: { slots: { question: { variantId: "default" } } },
          },
        },
      },
      scopes: [],
      composition: {
        schemaVersion: 1,
        id: "owned-theme",
        version: "1.0.0",
        baseTheme: { id: "tadazz-classic", version: "1.0.0" },
        registry: { id: registry.id, version: registry.version },
        sections: {},
        roles: {
          manager: {
            templates: { question: { id: "host-only", version: "1.0.0" } },
          },
        },
        scopes: [],
      },
    },
  }
}
describe("private immutable composition pins", () => {
  it("duplicates an immutable visual scope without mutating its source or losing an earlier alias", () => {
    const first = "00000000-0000-4000-8000-000000000001",
      second = "00000000-0000-4000-8000-000000000002",
      third = "00000000-0000-4000-8000-000000000003"
    const original = {
      showComposition: pin,
      showCompositionScopeAliases: {} as Record<string, string>,
    }
    const copy = cloneApplicationCardScope(original, first, second)
    const next = cloneApplicationCardScope(copy, second, third)
    expect(next.showCompositionScopeAliases[third]).toBe(first)
    expect(next.showCompositionScopeAliases[second]).toBe(first)
    expect(original.showCompositionScopeAliases).toEqual({})
    expect(next.showComposition).toBe(pin)
  })
  it("roundtrips an optional V2 pin without changing the original authored order", () => {
    const show = {
      ...authoredFixture(5, 2),
      defaults: { showComposition: pin },
    }
    const native = authoredShowToNativeBundleDraft(
      show,
      "qa-owned",
    ).bundleDraft!
    expect(native.extras.defaults.showComposition).toEqual(pin)
    const restored = nativeBundleToAuthoredShow(
      { quizz: native.quizz, extras: native.extras },
      { includePrivateRoster: false },
    )
    expect(restored.defaults?.showComposition).toEqual(pin)
    expect(
      restored.cards.map((card) =>
        card.kind === "quiz" ? card.question : card.kind,
      ),
    ).toEqual(show.cards.map((card) => card.question))
    expect(
      applicationCompositionPinSchema.safeParse({ ...pin, code: "caller-js" })
        .success,
    ).toBe(false)
  })
  it("projects public role configuration without host templates/media or mutable shared objects", () => {
    const source = appearance(),
      original = JSON.stringify(source)
    const audience = projectApplicationComposition(source, false)
    expect(JSON.stringify(audience)).not.toContain("PRIVATE_MANAGER_SENTINEL")
    expect(audience.document.selection.overrides.roles?.spectator).toBeDefined()
    audience.document.composition.sections = { templates: {} }
    expect(JSON.stringify(source)).toBe(original)
    const host = projectApplicationComposition(source, true)
    expect(JSON.stringify(host)).toBe(original)
    host.document.selection.overrides = {}
    expect(JSON.stringify(source)).toBe(original)
  })
  it("keeps authored card media over published defaults without affecting other cards", () => {
    const source = appearance()
    source.document.scopes = [
      {
        scopeId: "native-card-id",
        selection: {
          themeId: "tadazz-classic",
          themeVersion: "1.0.0",
          overrides: {
            slots: {
              question: { mediaUrl: "/media/theme.png" },
              voting: { mediaUrl: "/media/voting.png" },
            },
            audio: { opening: { muted: true } },
          },
        },
      },
    ]
    const card = {
      themeId: "tadazz-classic",
      themeVersion: "1.0.0",
      overrides: { slots: { question: { mediaUrl: "/media/author.png" } } },
    }
    const before = JSON.stringify({ source, card })
    const merged = applicationCardThemeScope(
      source,
      "native-card-id",
      card,
    ) as (typeof source.document.scopes)[number]["selection"]
    expect(merged.overrides.slots?.question?.mediaUrl).toBe("/media/author.png")
    expect(merged.overrides.slots?.voting?.mediaUrl).toBe("/media/voting.png")
    expect(merged.overrides.audio?.opening?.muted).toBe(true)
    expect(applicationCardThemeScope(source, "other-card", card)).toBe(card)
    expect(JSON.stringify({ source, card })).toBe(before)
  })
})
