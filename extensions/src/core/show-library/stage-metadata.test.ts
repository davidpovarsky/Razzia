import { parseSync } from "vite"
import { describe, expect, it } from "vitest"
import fs from "node:fs"
import { authoredFixture, previewInputFixture } from "./preview-fixtures"
import { getPreviewIdentityId, normalizePreviewDraft } from "./identity"
import { resolvePreviewPlan } from "./preview-resolve"
import { getCompiledPreviewManifest } from "./manifest"
import { previewStageMetadataSchema } from "./stage-metadata-schema"
import {
  derivePreviewStageMetadata,
  assertBoundPreviewStageMetadata,
} from "./stage-metadata"

function fixture(show: unknown = authoredFixture(2, 5)) {
  const draft = normalizePreviewDraft(previewInputFixture(show)),
    plan = resolvePreviewPlan(draft)
  const questionId = (key: string) =>
    getPreviewIdentityId(draft.input.identityMap, "questions", key)

  return { draft, plan, questionId }
}

describe("bound current-question stage metadata", () => {
  it("derives actual Q3 ordinal/total and exposes only frozen public fields", () => {
    const { draft, plan, questionId } = fixture(),
      id = questionId("question-3")
    const metadata = derivePreviewStageMetadata(draft, plan, id)
    expect(metadata).toEqual({
      portVersion: 3,
      identityRuleVersion: 2,
      questionId: id,
      ordinal: 3,
      totalQuestions: 5,
    })
    expect(Object.keys(metadata).sort()).toEqual([
      "identityRuleVersion",
      "ordinal",
      "portVersion",
      "questionId",
      "totalQuestions",
    ])
    expect(Object.getOwnPropertySymbols(metadata)).toEqual([])
    expect(Object.isFrozen(metadata)).toBe(true)
    expect(Reflect.set(metadata, "ordinal", 1)).toBe(false)
    expect(() =>
      assertBoundPreviewStageMetadata(draft, plan, id, metadata),
    ).not.toThrow()
    expect(JSON.stringify(metadata)).not.toContain("Synthetic question")
    expect(JSON.stringify(metadata)).not.toContain(questionId("question-4"))
  })
  it("excludes non-question cards from ordinal and total", () => {
    const authored = authoredFixture(2, 3)
    const show = {
      ...authored,
      cards: [
        { key: "opening-media", kind: "media" },
        authored.cards[0],
        { key: "middle-media", kind: "media" },
        ...authored.cards.slice(1),
      ],
    }
    const { draft, plan, questionId } = fixture(show)
    expect(
      derivePreviewStageMetadata(draft, plan, questionId("question-3")),
    ).toMatchObject({ ordinal: 3, totalQuestions: 3 })
    expect(draft.show.cards[0]).toMatchObject({ mediaUrl: "" })
  })
  it("uses actual authored order, independently of sorted identity arrays", () => {
    const show = authoredFixture(2, 5),
      initial = fixture(show)
    show.cards = [
      show.cards[2],
      show.cards[0],
      show.cards[4],
      show.cards[1],
      show.cards[3],
    ]
    const reordered = fixture(show),
      id = reordered.questionId("question-3")
    expect(id).toBe(initial.questionId("question-3"))
    expect(
      derivePreviewStageMetadata(initial.draft, initial.plan, id).ordinal,
    ).toBe(3)
    expect(
      derivePreviewStageMetadata(reordered.draft, reordered.plan, id).ordinal,
    ).toBe(1)
    expect(
      derivePreviewStageMetadata(
        reordered.draft,
        reordered.plan,
        reordered.questionId("question-1"),
      ).ordinal,
    ).toBe(2)
  })
  it("counts actual quiz and survey questions without allocating new identities", () => {
    const show = authoredFixture(2, 2)
    const [, { correctAnswers: _removed, ...second }] = show.cards
    const { draft, plan, questionId } = fixture({
      ...show,
      cards: [
        show.cards[0],
        { ...second, kind: "survey", questionType: "multi" },
      ],
    })
    expect(
      derivePreviewStageMetadata(draft, plan, questionId(second.key)),
    ).toMatchObject({ ordinal: 2, totalQuestions: 2 })
  })
  it("reuses rule2 identities for distinct source-valid lone surrogates", () => {
    const show = authoredFixture(2, 2)
    show.cards[0].key = "\ud800"
    show.cards[1].key = "\ud801"
    const { draft, plan, questionId } = fixture(show)
    const first = derivePreviewStageMetadata(draft, plan, questionId("\ud800"))
    const second = derivePreviewStageMetadata(draft, plan, questionId("\ud801"))
    expect(first.questionId).not.toBe(second.questionId)
    expect([first.ordinal, second.ordinal]).toEqual([1, 2])
  })
  it("rejects unknown, card, scene, authored-key and native-UUID inputs without default ordinal1", () => {
    const show = {
      ...authoredFixture(2, 1),
      cards: [{ key: "scene", kind: "media" }, ...authoredFixture(2, 1).cards],
    }
    const { draft, plan } = fixture(show)
    const card = getPreviewIdentityId(
      draft.input.identityMap,
      "cards",
      "question-1",
    )
    const scene = getPreviewIdentityId(
      draft.input.identityMap,
      "scenes",
      "scene",
    )
    for (const id of [
      `preview-question-${"0".repeat(64)}`,
      card,
      scene,
      "question-1",
      "00000000-0000-4000-8000-000000000000",
      "",
    ]) {
      expect(() => derivePreviewStageMetadata(draft, plan, id)).toThrow(
        "unknown-stage-question",
      )
    }
  })
  it("rejects cloned/forged drafts and cloned/foreign plans", () => {
    const { draft, plan, questionId } = fixture(),
      id = questionId("question-1")
    expect(() => derivePreviewStageMetadata({ ...draft }, plan, id)).toThrow(
      "unvalidated-draft",
    )
    for (const otherPlan of [{ ...plan }, fixture().plan]) {
      expect(() => derivePreviewStageMetadata(draft, otherPlan, id)).toThrow(
        "unbound-preview-plan",
      )
    }
  })
  it("does not let schema parsing, copying, another question or another genuine association manufacture trust", () => {
    const f = fixture(),
      id = f.questionId("question-3"),
      metadata = derivePreviewStageMetadata(f.draft, f.plan, id)
    for (const value of [
      { ...metadata },
      previewStageMetadataSchema.parse(metadata),
      previewStageMetadataSchema.parse({ ...metadata, ordinal: 2 }),
    ]) {
      expect(() =>
        assertBoundPreviewStageMetadata(
          f.draft,
          f.plan,
          id,
          value as typeof metadata,
        ),
      ).toThrow("unbound-stage-metadata")
    }
    expect(() =>
      assertBoundPreviewStageMetadata(
        f.draft,
        f.plan,
        f.questionId("question-2"),
        metadata,
      ),
    ).toThrow("unbound-stage-metadata")
    const other = fixture(),
      otherMetadata = derivePreviewStageMetadata(other.draft, other.plan, id)
    expect(() =>
      assertBoundPreviewStageMetadata(f.draft, f.plan, id, otherMetadata),
    ).toThrow("unbound-stage-metadata")
    expect(() =>
      assertBoundPreviewStageMetadata(other.draft, other.plan, id, metadata),
    ).toThrow("unbound-stage-metadata")
  })
  it("is informational for a genuine unavailable plan and activates no capability or pin", () => {
    const { draft, plan, questionId } = fixture(),
      before = JSON.stringify(plan)
    derivePreviewStageMetadata(draft, plan, questionId("question-5"))
    expect(JSON.stringify(plan)).toBe(before)
    expect(plan.resolution.kind).toBe("unavailable")
    expect(plan.capabilities.localSelection).toBe(false)
    expect(getCompiledPreviewManifest().pins).toHaveLength(0)
  })
  it("keeps the runtime schema leaf free of producer, hashing and compiled-manifest dependencies", () => {
    const source = fs.readFileSync(
      new URL("./stage-metadata-schema.ts", import.meta.url),
      "utf8",
    )
    const assertLeaf = (text: string): void => {
      const parsed = parseSync("stage-metadata-schema.ts", text)
      expect(parsed.errors).toEqual([])
      expect(parsed.module.dynamicImports).toEqual([])
      const dependencies: unknown[] = []
      const visit = (value: unknown): void => {
        if (!value || typeof value !== "object") {
          return
        }

        const node = value as Record<string, unknown>

        if (
          node.type === "ImportDeclaration" ||
          node.type === "ExportNamedDeclaration" ||
          node.type === "ExportAllDeclaration"
        ) {
          const dependency = node.source as { value?: unknown } | null

          if (dependency) {
            dependencies.push(dependency.value)
          }
        }

        expect(node.type).not.toBe("TSImportEqualsDeclaration")

        if (node.type === "CallExpression") {
          const callee = node.callee as { type?: string; name?: string }
          expect(
            callee.type === "Identifier" && callee.name === "require",
          ).toBe(false)
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
      expect(dependencies).toEqual(["zod"])
    }
    assertLeaf(source)
    for (const forbidden of [
      '\nimport { resolvePreviewPlan } from "./preview-resolve"',
      '\nexport * from "./manifest"',
      '\nvoid import("./digest")',
      '\nrequire("./primitives")',
    ]) {
      expect(() => assertLeaf(source + forbidden)).toThrow()
    }
  })
  it.each([
    { ordinal: 0 },
    { ordinal: -1 },
    { ordinal: 1.5 },
    { ordinal: 129 },
    { ordinal: Infinity },
    { ordinal: NaN },
    { totalQuestions: 0 },
    { totalQuestions: 129 },
    { ordinal: 6, totalQuestions: 5 },
    { portVersion: 2 },
    { portVersion: 1 },
    { identityRuleVersion: 1 },
    { questionId: "native-uuid" },
    { futureQuestions: [] },
    { solutions: [1] },
    { draft: {} },
  ])("rejects invalid/private/old-version metadata %#", (patch) => {
    const { draft, plan, questionId } = fixture()
    const metadata = derivePreviewStageMetadata(
      draft,
      plan,
      questionId("question-1"),
    )
    expect(
      previewStageMetadataSchema.safeParse({ ...metadata, ...patch }).success,
    ).toBe(false)
  })
})
