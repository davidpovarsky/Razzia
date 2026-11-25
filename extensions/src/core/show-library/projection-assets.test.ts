import { describe, expect, it } from "vitest"
import { RUNTIME_PHASES } from "../packages/protocol"
import { tadaShowV1Schema } from "../show-authoring-schema"
import { showThemeRegistry } from "../show-themes/registry"
import { getPreviewIdentityId, normalizePreviewDraft } from "./identity"
import { getCompiledPreviewManifest } from "./manifest"
import {
  authoredFixture,
  previewInputFixture,
  snapshotFixture,
} from "./preview-fixtures"
import { resolvePreviewPlan } from "./preview-resolve"
import {
  demoPresentationSnapshotSchema,
  showProjectionSchema,
} from "./projection-schema"
import {
  projectShowBindings,
  type PreviewProjectionBinding,
} from "./projection"

const foreign = { assetId: "foreign-asset", sha256: "a".repeat(64) }
const bundled = showThemeRegistry.list().flatMap((theme) => theme.assets)
const image = bundled.find((asset) => asset.kind === "image")!
const audio = bundled.find((asset) => asset.kind === "audio")!
const ref = (asset: typeof image) => ({
  assetId: asset.id,
  sha256: asset.sha256,
})
function fixture(
  asset?: typeof image,
  slot: "future" | "current-choice" = "future",
) {
  const authored = authoredFixture(2, 2)
  const show =
    asset && slot === "future"
      ? {
          ...authored,
          cards: [
            ...authored.cards,
            { key: "future-media", kind: "media", mediaUrl: asset.url },
          ],
        }
      : authored

  if (asset && slot === "current-choice") {
    Object.assign(authored.cards[0].answers[0], { imageUrl: asset.url })
  }

  expect(tadaShowV1Schema.safeParse(show).success).toBe(true)
  const input = previewInputFixture(show)
  input.context.role = "player"
  input.assets = asset ? [ref(asset)] : []
  const draft = normalizePreviewDraft(input),
    plan = resolvePreviewPlan(draft)
  const [card] = draft.show.cards

  if (card.kind !== "quiz") {
    throw new Error("fixture")
  }

  const id = getPreviewIdentityId(
    draft.input.identityMap,
    "questions",
    card.key,
  )
  const snapshot = {
    portVersion: 3,
    identityRuleVersion: 2,
    source: "deterministic-fixture",
    phase: "voting",
    clock: snapshotFixture().clock,
    canAnswer: true,
    question: {
      id,
      text: card.question,
      questionType: card.questionType,
      playMode: card.kind,
      choices: card.answers.map((a, i) => ({
        id: `${id}.choice.${i + 1}`,
        label: a.text,
      })),
      solutionAnswerIds: [],
    },
  }
  const binding: PreviewProjectionBinding = {
    draft,
    plan,
    currentQuestionId: id,
    phase: "voting",
    clock: snapshot.clock,
  }

  return { snapshot, context: input.context, binding }
}
function withRef(
  snapshot: ReturnType<typeof fixture>["snapshot"],
  slot: "question" | "choice",
  asset: unknown,
) {
  return {
    ...snapshot,
    question: {
      ...snapshot.question,
      ...(slot === "question"
        ? { image: asset }
        : {
            choices: snapshot.question.choices.map((choice, i) =>
              i === 0 ? { ...choice, asset } : choice,
            ),
          }),
    },
  }
}

describe("resource-free preview projection until compiled authored-slot asset bindings exist", () => {
  it.each(["question", "choice"] as const)(
    "rejects actual review witness at %s with empty declared assets, unbound and genuinely bound",
    (slot) => {
      const { snapshot, context, binding } = fixture()
      expect(binding.draft.input.assets).toEqual([])
      expect(binding.plan.resolution.kind).toBe("unavailable")
      const forged = withRef(snapshot, slot, foreign)
      expect(demoPresentationSnapshotSchema.safeParse(forged).success).toBe(
        true,
      )
      for (const evidence of [undefined, binding]) {
        expect(() => projectShowBindings(forged, context, evidence)).toThrow(
          "visual-assets-unavailable",
        )
      }
    },
  )
  it.each(["question", "choice"] as const)(
    "does not allow known undeclared, future-card, mismatched ID/hash or wrong-kind assets at %s",
    (slot) => {
      const { snapshot, context, binding } = fixture(image)
      expect(binding.draft.input.assets).toEqual([ref(image)])
      const attempts = [
        ref(image),
        ref(audio),
        { ...ref(image), assetId: "other-asset" },
        { ...ref(image), sha256: "0".repeat(64) },
      ]
      for (const asset of attempts) {
        const forged = withRef(snapshot, slot, asset)
        expect(demoPresentationSnapshotSchema.safeParse(forged).success).toBe(
          true,
        )
        expect(() => projectShowBindings(forged, context, binding)).toThrow(
          "visual-assets-unavailable",
        )
      }
      const empty = fixture()
      expect(() =>
        projectShowBindings(
          withRef(empty.snapshot, slot, ref(image)),
          empty.context,
          empty.binding,
        ),
      ).toThrow("visual-assets-unavailable")
      const audioFuture = fixture(audio)
      expect(() =>
        projectShowBindings(
          withRef(audioFuture.snapshot, slot, ref(audio)),
          audioFuture.context,
          audioFuture.binding,
        ),
      ).toThrow("visual-assets-unavailable")
    },
  )
  it("keeps even a matching authored current-choice declaration unavailable without a compiled asset path", () => {
    const { snapshot, context, binding } = fixture(image, "current-choice")
    expect(binding.draft.input.assets).toEqual([ref(image)])
    expect(getCompiledPreviewManifest().pins).toHaveLength(0)
    expect(() =>
      projectShowBindings(
        withRef(snapshot, "choice", ref(image)),
        context,
        binding,
      ),
    ).toThrow("visual-assets-unavailable")
    expect(projectShowBindings(snapshot, context, binding)).toMatchObject({
      canAnswer: false,
      answerReadiness: "unavailable",
    })
  })
  it.each(["question", "choice"] as const)(
    "does not accept caller rights/type/tenant/URL/budget claims at %s",
    (slot) => {
      const { snapshot, context, binding } = fixture()
      for (const claim of [
        { rights: "owner-authorized", exportPermitted: true },
        { kind: "image" },
        { kind: "audio" },
        { owner: { scope: "tenant", tenantId: "other-tenant" } },
        { bytes: 1 },
        { url: "https://private.invalid/resource" },
        { url: "file:///private/asset" },
      ]) {
        expect(() =>
          projectShowBindings(
            withRef(snapshot, slot, { ...foreign, ...claim }),
            context,
            binding,
          ),
        ).toThrow()
      }
    },
  )
  it.each(RUNTIME_PHASES)(
    "rejects references even when phase %s would redact their visual slot",
    (phase) => {
      const { snapshot, context } = fixture()
      expect(() =>
        projectShowBindings(
          { ...withRef(snapshot, "question", foreign), phase },
          context,
        ),
      ).toThrow("visual-assets-unavailable")
    },
  )
  it.each(["manager", "player", "spectator"] as const)(
    "role %s confers no asset grant",
    (role) => {
      const { snapshot, context, binding } = fixture()
      expect(() =>
        projectShowBindings(withRef(snapshot, "choice", foreign), {
          ...context,
          role,
        }),
      ).toThrow("visual-assets-unavailable")
      expect(() =>
        projectShowBindings(
          withRef(snapshot, "question", foreign),
          { ...context, role },
          binding,
        ),
      ).toThrow("visual-assets-unavailable")
    },
  )
  it.each(["question", "choice"] as const)(
    "output branding cannot launder a forged %s resource reference",
    (slot) => {
      const { snapshot, context, binding } = fixture()
      const output = projectShowBindings(snapshot, context, binding)
      const forged =
        slot === "question"
          ? { ...output, question: { ...output.question!, image: foreign } }
          : {
              ...output,
              choices: output.choices!.map((choice, i) =>
                i === 0 ? { ...choice, asset: foreign } : choice,
              ),
            }
      expect(showProjectionSchema.safeParse(forged).success).toBe(false)
    },
  )
  it("preserves the real empty placeholder, clean redaction, and unavailable action gate", () => {
    const show = {
      ...authoredFixture(2, 1),
      cards: [{ key: "blank", kind: "media" }, ...authoredFixture(2, 1).cards],
    }
    const draft = normalizePreviewDraft(previewInputFixture(show))
    expect(draft.show.cards[0]).toMatchObject({ mediaUrl: "" })
    expect(draft.input.assets).toEqual([])
    const { snapshot, context, binding } = fixture()
    const output = projectShowBindings(snapshot, context, binding)
    expect(output).toMatchObject({
      canAnswer: false,
      answerReadiness: "unavailable",
    })
    expect(output.question).not.toHaveProperty("image")
    expect(output.choices?.every((choice) => !("asset" in choice))).toBe(true)
    expect(JSON.stringify(output)).not.toContain("solutionAnswerIds")
    expect(Object.isFrozen(output)).toBe(true)
  })
})
