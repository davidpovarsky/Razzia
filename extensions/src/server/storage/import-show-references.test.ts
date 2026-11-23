import { afterEach, expect, it } from "vitest"
import { CompositeStorageService } from "./service"
import {
  createRecoveryFixture,
  removeSyntheticFixture,
} from "./recovery-fixture"
import {
  authoredShowToNativeBundleDraft,
  nativeBundleToAuthoredShow,
} from "../../core/show-authoring-convert"
import { authoredFixture } from "../../core/show-library/preview-fixtures"
import { isQuizExtrasV2 } from "../../core"
import { nativePreviewScopeIds } from "../../core/show-library/native-preview-scopes"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    removeSyntheticFixture(root)
  }
})
it("imports recap references and preserves immutable card scopes across enhanced and authored clones", () => {
  const fixture = createRecoveryFixture()
  roots.push(fixture.root)
  const source = authoredFixture(2, 2)
  const bundle = authoredShowToNativeBundleDraft(
    {
      ...source,
      cards: [
        ...source.cards,
        {
          key: "recap",
          kind: "answerRecap",
          title: "Recap",
          startQuestionKey: source.cards[0].key,
          advance: "manual",
        },
      ],
    },
    "source-qa",
  ).bundleDraft!
  bundle.extras.defaults.showComposition = {
    workspaceId: "00000000-0000-4000-8000-000000000099",
    documentId: "qa-published",
    version: "1.0.0",
    digest: "1".repeat(64),
    rendererBuildSha256: "2".repeat(64),
  }
  const [originalId] = bundle.extras.questionIds,
    originalScene = bundle.extras.timeline.find(
      (item) => item.kind === "answerRecap",
    )!
  const before = JSON.stringify(bundle)
  const service = new CompositeStorageService(fixture.injections)
  const first = service.importEnhancedBundle({ bundleVersion: 1, ...bundle })
  const exported = service.exportEnhancedBundle(first.quizId)

  if (!isQuizExtrasV2(exported.extras)) {
    throw new Error("Expected V2 import")
  }

  const recap = Object.values(exported.extras.scenes).find(
    (scene) => scene.kind === "answerRecap",
  )!
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- Deliberate runtime assertion of the serialized contract.
  expect(recap.kind === "answerRecap" && recap.startQuestionId).toBe(
    exported.extras.questionIds[0],
  )
  expect(exported.extras.questionIds[0]).not.toBe(originalId)
  expect(
    exported.extras.defaults.showCompositionScopeAliases?.[
      exported.extras.questionIds[0]
    ],
  ).toBe(originalId)
  for (const payload of [
    exported,
    nativeBundleToAuthoredShow(exported, { includePrivateRoster: false }),
  ]) {
    const copy = service.importEnhancedBundle(payload)
    const reopened = service.exportEnhancedBundle(copy.quizId)

    if (!isQuizExtrasV2(reopened.extras)) {
      throw new Error("Expected V2 copy")
    }

    const show = nativeBundleToAuthoredShow(reopened, {
      includePrivateRoster: false,
    })
    const scopes = nativePreviewScopeIds(show, reopened.extras.timeline)
    expect(scopes.Q01).toBe(originalId)
    expect(scopes.ANSWERRECAP_01).toBe(originalScene.sceneId)
    expect(reopened.extras.defaults.showComposition).toEqual(
      bundle.extras.defaults.showComposition,
    )
  }
  expect(JSON.stringify(bundle)).toBe(before)
})
