import {
  SHOW_PREVIEW_PORT_VERSION,
  SHOW_PREVIEW_IDENTITY_RULE_VERSION,
} from "./identity-rule"
import {
  previewDraftInputSchema,
  previewPlanSchema,
  compiledPreviewPinSchema,
  compiledPreviewManifestSchema,
} from "./preview-schemas"
import {
  demoPresentationSnapshotSchema,
  showProjectionSchema,
} from "./projection-schema"
import { snapshotFixture } from "./preview-fixtures"
import { projectShowBindings } from "./projection"
import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import fs from "node:fs"
import { diagnostic } from "./primitives"
import { normalizePreviewDraft } from "./identity"
import {
  previewInputFixture,
  authoredFixture,
  sharedPreviewFixtures,
} from "./preview-fixtures"
import { resolvePreviewPlan, getPreviewDigestContent } from "./preview-resolve"
import {
  getCompiledPreviewManifest,
  verifyCompiledPreviewManifest,
  PreviewManifestCatalog,
} from "./manifest"
import { canonicalJson, sha256 } from "./digest"

const pin = {
  portVersion: 3,
  identityRuleVersion: 2 as const,
  registry: { id: "compiled-preview", version: "1.0.0" },
  registrySha256: "a".repeat(64),
  renderer: { id: "compiled-stage", version: "1.0.0" },
  rendererBuildSha256: "b".repeat(64),
}
describe("no forged executable preview readiness", () => {
  it.each(["en", "fr", "de", "es", "it", "ja", "tr", "vi"])(
    "uses existing diagnostic translations in %s without shared resource edits",
    (locale) => {
      const errors = JSON.parse(
        fs.readFileSync(
          new URL(
            `../../../../packages/web/src/locales/${locale}/errors.json`,
            import.meta.url,
          ),
          "utf8",
        ),
      )
      for (const code of [
        "adapter-unimplemented",
        "unknown-theme",
        "invalid-selection",
      ]) {
        const key = diagnostic(code)
          .messageKey.replace(/^errors:/u, "")
          .split(".")
        let value: unknown = errors
        for (const part of key)
          value =
            typeof value === "object" && value !== null
              ? Reflect.get(value, part)
              : undefined
        expect(typeof value).toBe("string")
      }
    },
  )
  it("ships an empty immutable compiled manifest and unavailable plans", () => {
    expect(getCompiledPreviewManifest().pins).toEqual([])
    const draft = normalizePreviewDraft(previewInputFixture()),
      plan = resolvePreviewPlan(draft)
    expect(plan.resolution).toEqual({
      kind: "unavailable",
      requested: { id: "tadazz-classic", version: "1.0.0" },
      effective: null,
      pin: null,
    })
    expect(plan.capabilities.localSelection).toBe(false)
    expect(plan.capabilities.questions).toHaveLength(5)
    expect(
      plan.capabilities.questions.every((q) => q.support === "unavailable"),
    ).toBe(true)
    expect(() =>
      resolvePreviewPlan(draft, {
        portVersion: 3,
        identityRuleVersion: 2 as const,
        pins: [pin],
      }),
    ).toThrow("unaccepted-compiled-manifest")
  })
  it("preserves unknown requested theme and reports actual resolver diagnostics", () => {
    const show = {
      ...authoredFixture(),
      defaults: {
        showTheme: { id: "missing-family", version: "1.0.0", overrides: {} },
      },
    }
    const plan = resolvePreviewPlan(
      normalizePreviewDraft(previewInputFixture(show)),
    )
    expect(plan.resolution.requested.id).toBe("missing-family")
    expect(plan.resolution.effective).toBeNull()
    expect(plan.diagnostics.map((d) => d.code)).toContain("unknown-theme")
  })
  it("rejects a forged draft or foreign plan instead of trusting TypeScript casts", () => {
    expect(() => resolvePreviewPlan({} as never)).toThrow("unvalidated-draft")
    const a = normalizePreviewDraft(previewInputFixture()),
      b = normalizePreviewDraft(previewInputFixture())
    expect(() => getPreviewDigestContent(a, resolvePreviewPlan(b))).toThrow(
      "unbound-preview-plan",
    )
    expect(() =>
      verifyCompiledPreviewManifest({
        portVersion: 3,
        identityRuleVersion: 2 as const,
        pins: [pin],
      }),
    ).toThrow()
  })
  it("enforces registry/renderer/manifest version immutability transactionally", () => {
    const catalog = new PreviewManifestCatalog()
    catalog.register({
      portVersion: 3,
      identityRuleVersion: 2 as const,
      pins: [pin],
    })
    expect(() =>
      catalog.register({
        portVersion: 3,
        identityRuleVersion: 2 as const,
        pins: [{ ...pin, registrySha256: "c".repeat(64) }],
      }),
    ).toThrow()
    expect(() =>
      catalog.register({
        portVersion: 3,
        identityRuleVersion: 2 as const,
        pins: [
          pin,
          { ...pin, renderer: { id: "second-stage", version: "1.0.0" } },
        ],
      }),
    ).toThrow("immutable-manifest-version")
    expect(
      catalog.register({
        portVersion: 3,
        identityRuleVersion: 2 as const,
        pins: [pin],
      }).pins,
    ).toHaveLength(1)
  })
  it("provides deterministic producer digest-content vectors without an MCP serializer", () => {
    const draft = normalizePreviewDraft(previewInputFixture()),
      content = getPreviewDigestContent(draft, resolvePreviewPlan(draft))
    const bytes = canonicalJson(content)
    expect(sha256(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"))
    expect(content.compiledPin).toBeNull()
    expect(content.identityRuleVersion).toBe(2)
    expect(sharedPreviewFixtures[0].checkpoints[0].clock.deadlineMs).toBe(20000)
  })
})

it("rejects all older/mixed internal versions while authored format stays v1", () => {
  expect(SHOW_PREVIEW_PORT_VERSION).toBe(3)
  expect(SHOW_PREVIEW_IDENTITY_RULE_VERSION).toBe(2)
  const input = previewInputFixture(),
    draft = normalizePreviewDraft(input)
  const cases = [
    [previewDraftInputSchema, input],
    [previewPlanSchema, resolvePreviewPlan(draft)],
    [compiledPreviewPinSchema, pin],
    [compiledPreviewManifestSchema, getCompiledPreviewManifest()],
    [demoPresentationSnapshotSchema, snapshotFixture()],
    [
      showProjectionSchema,
      projectShowBindings(snapshotFixture(), input.context),
    ],
  ] as const
  for (const [schema, value] of cases) {
    expect(schema.safeParse(value).success).toBe(true)
    for (const portVersion of [1, 2])
      expect(schema.safeParse({ ...value, portVersion }).success).toBe(false)
    expect(schema.safeParse({ ...value, identityRuleVersion: 1 }).success).toBe(
      false,
    )
  }
  expect(draft.show.version).toBe(1)
})
