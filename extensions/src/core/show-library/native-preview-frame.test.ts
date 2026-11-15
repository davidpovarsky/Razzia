import { readFileSync } from "node:fs"
import { parseSync } from "vite"
import { describe, expect, it } from "vitest"
import { authoredFixture, previewInputFixture } from "./preview-fixtures"
import { getPreviewIdentityId, normalizePreviewDraft } from "./identity"
import { resolvePreviewPlan } from "./preview-resolve"
import { derivePreviewStageMetadata } from "./stage-metadata"
import { getCompiledPreviewManifest } from "./manifest"
import {
  nativePreviewFrameV1Schema,
  nativePreviewRendererInputV1Schema,
} from "./native-preview-frame-schema"
import { produceNativePreviewFrameV1 } from "./native-preview-frame"
import type { PreviewPhase, PreviewRole } from "./primitives"

function fixture(
  phase: PreviewPhase = "voting",
  options: {
    count?: number
    role?: PreviewRole
    type?: "single" | "multi"
    survey?: boolean
    seconds?: number
  } = {},
) {
  const show = authoredFixture(options.count ?? 5, 5)
  Object.assign(show.cards[2], {
    questionType: options.type ?? "single",
    timeSeconds: options.seconds ?? 20,
    ...(options.survey ? { kind: "survey", correctAnswers: [] } : {}),
  })
  const input = previewInputFixture(show)
  input.context.role = options.role ?? "spectator"
  const draft = normalizePreviewDraft(input),
    plan = resolvePreviewPlan(draft)
  const [, , card] = draft.show.cards

  if (card.kind !== "quiz" && card.kind !== "survey") {
    throw new Error("fixture")
  }

  const questionId = getPreviewIdentityId(
    draft.input.identityMap,
    "questions",
    card.key,
  )
  const choices = card.answers.map((answer, i) => ({
    id: `${questionId}.choice.${i + 1}`,
    label: answer.text,
  }))
  const clock = {
    epoch: 3,
    sequence: 7,
    elapsedMs: 500,
    deadlineMs: options.seconds === -1 ? null : 20000,
    paused: false,
  }
  const snapshot = {
    portVersion: 3,
    identityRuleVersion: 2,
    source: "deterministic-fixture",
    phase,
    clock,
    canAnswer: false,
    question: {
      id: questionId,
      text: card.question,
      questionType: card.questionType,
      playMode: card.kind,
      choices,
      solutionAnswerIds: [],
    },
    ...(phase === "results"
      ? {
          results: choices.map((choice) => ({
            answerId: choice.id,
            count: 0,
            percent: 0,
          })),
        }
      : {}),
  }
  const binding = { draft, plan, currentQuestionId: questionId, phase, clock }
  const metadata = derivePreviewStageMetadata(draft, plan, questionId)

  return { snapshot, binding, metadata, context: input.context }
}

describe("exact current native-stage frame host seam", () => {
  it.each([
    "question",
    "answerCards",
    "voting",
    "voteLocked",
    "results",
  ] as const)(
    "produces %s from actual current-card projection without changing readiness",
    (phase) => {
      const f = fixture(phase)
      const frame = produceNativePreviewFrameV1(
        f.snapshot,
        f.context,
        f.binding,
        f.metadata,
        12,
      )
      expect(frame.question).toMatchObject({
        ordinal: 3,
        totalQuestions: 5,
        text: "Synthetic question 3",
      })
      expect(frame.choices).toHaveLength(phase === "question" ? 0 : 5)
      expect(frame.seconds).toBe(20)
      expect(frame.epoch).toBe(3)
      expect(frame.revision).toBe(12)
      expect(frame.results !== undefined).toBe(phase === "results")
      expect(Object.isFrozen(frame.clock)).toBe(true)
      expect(JSON.stringify(frame)).not.toContain("Synthetic question 4")
      expect(f.binding.plan.resolution.kind).toBe("unavailable")
      expect(getCompiledPreviewManifest().pins).toEqual([])
    },
  )
  it("preserves native2/5 single/multi quiz/survey and read-only roles", () => {
    for (const count of [2, 5]) {
      for (const type of ["single", "multi"] as const) {
        for (const survey of [false, true]) {
          for (const role of ["manager", "spectator"] as const) {
            const f = fixture("answerCards", { count, type, survey, role })
            const frame = produceNativePreviewFrameV1(
              f.snapshot,
              f.context,
              f.binding,
              f.metadata,
              1,
            )
            expect(frame.choices).toHaveLength(count)
            expect(frame.question.type).toBe(type)
            expect(frame.question.mode).toBe(survey ? "survey" : "quiz")
            expect(frame.role).toBe(role)
          }
        }
      }
    }
  })
  it("derives unlimited from actual authored-1 and rejects unsupported0/oversized duration", () => {
    const f = fixture("voting", { seconds: -1 })
    expect(
      produceNativePreviewFrameV1(
        f.snapshot,
        f.context,
        f.binding,
        f.metadata,
        1,
      ).seconds,
    ).toBeNull()
    for (const seconds of [0, 86401]) {
      const invalid = fixture("voting", { seconds })
      expect(() =>
        produceNativePreviewFrameV1(
          invalid.snapshot,
          invalid.context,
          invalid.binding,
          invalid.metadata,
          1,
        ),
      ).toThrow()
      expect(invalid.binding.draft.show.cards[2]).toMatchObject({
        timeSeconds: seconds,
      })
    }
  })
  it("rejects cloned metadata, wrong plan, stale clock, player and unsupported phase", () => {
    const f = fixture()
    expect(() =>
      produceNativePreviewFrameV1(
        f.snapshot,
        f.context,
        f.binding,
        { ...f.metadata },
        1,
      ),
    ).toThrow("unbound-stage-metadata")
    expect(() =>
      produceNativePreviewFrameV1(
        f.snapshot,
        f.context,
        { ...f.binding, plan: { ...f.binding.plan } },
        f.metadata,
        1,
      ),
    ).toThrow("unbound-preview-plan")
    expect(() =>
      produceNativePreviewFrameV1(
        f.snapshot,
        f.context,
        { ...f.binding, clock: { ...f.binding.clock, elapsedMs: 700 } },
        f.metadata,
        1,
      ),
    ).toThrow("clock-phase-mismatch")
    const player = fixture("voting", { role: "player" })
    expect(() =>
      produceNativePreviewFrameV1(
        player.snapshot,
        player.context,
        player.binding,
        player.metadata,
        1,
      ),
    ).toThrow("unsupported-projection")
    const lobby = fixture("lobby")
    expect(() =>
      produceNativePreviewFrameV1(
        lobby.snapshot,
        lobby.context,
        lobby.binding,
        lobby.metadata,
        1,
      ),
    ).toThrow("unsupported-projection")
  })
  it("never transports private fields, asset refs or early result data", () => {
    const f = fixture(),
      frame = produceNativePreviewFrameV1(
        f.snapshot,
        f.context,
        f.binding,
        f.metadata,
        1,
      )
    for (const patch of [
      { draft: f.binding.draft },
      { roomId: "real-room" },
      { audio: {} },
      { results: [] },
    ]) {
      expect(
        nativePreviewFrameV1Schema.safeParse({ ...frame, ...patch }).success,
      ).toBe(false)
    }
    expect(
      nativePreviewFrameV1Schema.safeParse({
        ...frame,
        question: {
          ...frame.question,
          image: { assetId: "declared", sha256: "a".repeat(64) },
        },
      }).success,
    ).toBe(false)
    expect(() =>
      produceNativePreviewFrameV1(
        {
          ...f.snapshot,
          question: {
            ...f.snapshot.question,
            image: { assetId: "declared", sha256: "a".repeat(64) },
          },
        },
        f.context,
        f.binding,
        f.metadata,
        1,
      ),
    ).toThrow("visual-assets-unavailable")
  })
  it("requires complete unique results bound to exact current choices", () => {
    const f = fixture("results"),
      frame = produceNativePreviewFrameV1(
        f.snapshot,
        f.context,
        f.binding,
        f.metadata,
        1,
      )
    expect(
      nativePreviewFrameV1Schema.safeParse({
        ...frame,
        results: frame.results?.slice(1),
      }).success,
    ).toBe(false)
    const duplicate = [...frame.results!]
    const [firstResult] = duplicate
    duplicate[1] = firstResult
    expect(
      nativePreviewFrameV1Schema.safeParse({ ...frame, results: duplicate })
        .success,
    ).toBe(false)
    expect(
      nativePreviewFrameV1Schema.safeParse({
        ...frame,
        results: [
          { ...frame.results![0], answerId: "future-answer" },
          ...frame.results!.slice(1),
        ],
      }).success,
    ).toBe(false)
  })
  it("requires valid native cardinality, metadata, clock, revision and exact eight locales", () => {
    const f = fixture(),
      frame = produceNativePreviewFrameV1(
        f.snapshot,
        f.context,
        f.binding,
        f.metadata,
        1,
      )
    for (const patch of [
      { choices: [] },
      { choices: frame.choices.slice(0, 1) },
      { choices: [...frame.choices, { id: "six", label: "six" }] },
      { epoch: Number.MAX_SAFE_INTEGER + 1 },
      { revision: -1 },
      { seconds: 0 },
      { clock: { ...frame.clock, elapsedMs: Infinity } },
      { question: { ...frame.question, ordinal: 6 } },
      { question: { ...frame.question, id: "native-uuid" } },
    ]) {
      expect(
        nativePreviewFrameV1Schema.safeParse({ ...frame, ...patch }).success,
      ).toBe(false)
    }
    for (const locale of ["en", "fr", "de", "es", "it", "ja", "tr", "vi"]) {
      expect(
        nativePreviewRendererInputV1Schema.safeParse({
          frame,
          locale,
          reducedMotion: true,
        }).success,
      ).toBe(true)
    }
    expect(
      nativePreviewRendererInputV1Schema.safeParse({
        frame,
        locale: "he",
        reducedMotion: false,
      }).success,
    ).toBe(false)
  })
  it("keeps the payload schema dependency graph to the actual two safe leaves", () => {
    const source = readFileSync(
      new URL("./native-preview-frame-schema.ts", import.meta.url),
      "utf8",
    )
    const parsed = parseSync("native-preview-frame-schema.ts", source)
    expect(parsed.errors).toEqual([])
    expect(parsed.module.dynamicImports).toEqual([])
    const imports: unknown[] = []
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object") {
        return
      }

      const node = value as Record<string, unknown>

      if (
        [
          "ImportDeclaration",
          "ExportNamedDeclaration",
          "ExportAllDeclaration",
        ].includes(String(node.type))
      ) {
        const dependency = node.source as { value?: unknown } | null

        if (dependency) {
          imports.push(dependency.value)
        }
      }

      expect(node.type).not.toBe("TSImportEqualsDeclaration")

      if (node.type === "CallExpression") {
        const callee = node.callee as { type?: string; name?: string }
        expect(callee.type === "Identifier" && callee.name === "require").toBe(
          false,
        )
      }

      for (const child of Object.values(node)) {
        if (Array.isArray(child)) {
          child.forEach(visit)
        } else {
          visit(child)
        }
      }
    }
    visit(parsed.program)
    expect(imports).toEqual(["zod", "./stage-metadata-schema"])
  })
})
