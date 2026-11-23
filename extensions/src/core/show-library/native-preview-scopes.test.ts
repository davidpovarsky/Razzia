import { expect, it } from "vitest"
import { authoredFixture } from "./preview-fixtures"
import {
  authoredShowToNativeBundleDraft,
  nativeBundleToAuthoredShow,
} from "../show-authoring-convert"
import { nativePreviewScopeIds } from "./native-preview-scopes"
import {
  resolveApplicationTemplate,
  getApplicationShowLibrary,
} from "./application-library"
import type { ApplicationCompositionAppearance } from "./application-composition-pin"

it("keeps native card scope identity after reorder and export renumbering", () => {
  const bundle = authoredShowToNativeBundleDraft(
    authoredFixture(2, 2),
    "scope-qa",
  ).bundleDraft!
  const [firstId] = bundle.extras.questionIds
  bundle.extras.timeline.reverse()
  const show = nativeBundleToAuthoredShow(bundle, {
    includePrivateRoster: false,
  })
  const scopes = nativePreviewScopeIds(show, bundle.extras.timeline)
  expect(scopes.Q02).toBe(firstId)
  expect(scopes.Q01).toBe(bundle.extras.questionIds[1])
  const registry = structuredClone(getApplicationShowLibrary())
  const appearance: ApplicationCompositionAppearance = {
    registry,
    document: {
      format: "tadazz-show-composition",
      schemaVersion: 1,
      selection: { id: "tadazz-classic", version: "1.0.0", overrides: {} },
      scopes: [],
      composition: {
        schemaVersion: 1,
        id: "qa",
        version: "1.0.0",
        baseTheme: { id: "tadazz-classic", version: "1.0.0" },
        registry: { id: registry.id, version: registry.version },
        sections: {},
        roles: {},
        scopes: [
          {
            scopeId: firstId,
            theme: { id: "tadazz-classic", version: "1.0.0" },
            roles: {},
            sections: {
              templates: {
                question: { id: "native.question.grid", version: "1.0.0" },
              },
            },
          },
        ],
      },
    },
  }
  expect(
    resolveApplicationTemplate(appearance, "spectator", "question", scopes.Q02)
      .id,
  ).toBe("native.question.grid")
  expect(
    resolveApplicationTemplate(appearance, "spectator", "question", scopes.Q01)
      .id,
  ).toBe("native.question.flow")
  expect(() => nativePreviewScopeIds(show, [])).toThrow(
    "Preview timeline mismatch",
  )
})
