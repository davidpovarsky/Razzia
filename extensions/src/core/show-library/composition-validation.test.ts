import { describe, expect, it } from "vitest"
import { inspectCompositionReferences } from "./composition-validation"

function fixture() {
  const ref = { id: "native-candidate", version: "1.0.0" }
  const templateRef = { id: "question-template", version: "1.0.0" }

  return {
    document: {
      format: "tadazz-show-composition",
      schemaVersion: 1,
      selection: { id: "tadazz-classic", version: "1.0.0", overrides: {} },
      composition: {
        schemaVersion: 1,
        id: "composition-a",
        version: "1.0.0",
        baseTheme: { id: "tadazz-classic", version: "1.0.0" },
        registry: { id: "native-candidates", version: "1.0.0" },
        sections: { templates: { question: templateRef } },
        roles: {},
        scopes: [],
      },
      scopes: [],
    },
    registry: {
      schemaVersion: 1,
      id: "native-candidates",
      version: "1.0.0",
      motions: [],
      components: [
        {
          ...ref,
          adapterId: "unimplemented",
          availability: "candidate",
          propsProfile: "bounded-view-v1",
          capabilities: {
            questionTypes: ["single"],
            playModes: ["quiz"],
            minAnswers: 2,
            maxAnswers: 5,
            roles: ["spectator"],
            phases: ["question"],
          },
          allowedPorts: ["stage-root"],
          childPorts: [],
          bindings: ["question"],
          motions: [],
          fallback: "safe-hold",
          reducedMotion: "same-theme-static",
          a11yLabelKey: "extensions:test",
          provenance: "synthetic contract counterexample",
        },
      ],
      templates: [
        {
          ...templateRef,
          availability: "candidate",
          phase: "question",
          roles: ["spectator"],
          rootNodeId: "root",
          questionType: "single",
          playMode: "quiz",
          requiredSystemCapabilities: ["current-question"],
          layouts: ["stage-16-9", "safe-4-3", "narrow-player"],
          fallback: "safe-hold",
          nodes: [
            {
              nodeId: "root",
              component: ref,
              port: "stage-root",
              props: {},
              bindings: { question: "question" },
              layout: {
                preset: "flow",
                alignment: "center",
                gap: "small",
                lane: "content",
              },
              motions: [],
              children: {},
            },
          ],
        },
      ],
    },
    request: {
      role: "spectator",
      phase: "question",
      questionType: "single",
      playMode: "quiz",
      answerCount: 5,
    },
  }
}

describe("composition references never grant executable authority", () => {
  it("inspects an exact compatible template without enabling a pin", () => {
    const f = fixture(),
      result = inspectCompositionReferences(f.document, f.registry, f.request)
    expect(result.status).toBe("candidate")
    expect(result.template?.id).toBe("question-template")
    expect(result.executableAcceptance).toBe(false)
    expect(Object.isFrozen(result.template?.nodes)).toBe(true)
  })
  it("does not substitute a similarly named or differently versioned registry", () => {
    const f = fixture()
    f.registry.version = "2.0.0"
    const result = inspectCompositionReferences(
      f.document,
      f.registry,
      f.request,
    )
    expect(result.issues).toContain("registry-ref-mismatch")
    expect(result.template).toBeNull()
  })
  it("denies wrong role, phase, kind, mode and unsupported answer range", () => {
    const f = fixture()
    for (const request of [
      { ...f.request, role: "player" },
      { ...f.request, questionType: "multi" },
      { ...f.request, playMode: "survey" },
      { ...f.request, answerCount: 6 },
    ]) {
      const result = inspectCompositionReferences(
        f.document,
        f.registry,
        request,
      )
      expect(result.status).toBe("incompatible")
      expect(result.template).toBeNull()
    }
    Object.assign(f.document.composition.sections.templates, {
      results: f.document.composition.sections.templates.question,
    })
    expect(
      inspectCompositionReferences(f.document, f.registry, {
        ...f.request,
        phase: "results",
      }).issues,
    ).toContain("template-phase-mismatch")
  })
  it("preserves unknown saved refs while reporting them and supplies no nodes", () => {
    const f = fixture()
    f.document.composition.sections.templates.question.version = "9.0.0"
    const result = inspectCompositionReferences(
      f.document,
      f.registry,
      f.request,
    )
    expect(result.issues).toContain("unknown-template")
    expect(result.requestedTemplate?.version).toBe("9.0.0")
    expect(result.template).toBeNull()
    expect(f.document.composition.sections.templates.question.version).toBe(
      "9.0.0",
    )
  })
  it("resolves role and exact theme scope precedence before inspecting refs", () => {
    const f = fixture()
    Object.assign(f.document.composition.roles, {
      spectator: {
        templates: { question: { id: "missing", version: "1.0.0" } },
      },
    })
    Object.assign(f.document.composition, {
      scopes: [
        {
          scopeId: "card-a",
          theme: { ...f.document.composition.baseTheme },
          sections: {
            templates: {
              question: { id: "question-template", version: "1.0.0" },
            },
          },
          roles: {},
        },
      ],
    })
    expect(
      inspectCompositionReferences(f.document, f.registry, f.request).status,
    ).toBe("incompatible")
    expect(
      inspectCompositionReferences(f.document, f.registry, {
        ...f.request,
        scopeId: "card-a",
      }).status,
    ).toBe("candidate")
    f.document.composition.baseTheme.version = "2.0.0"
    f.document.selection.version = "2.0.0"
    expect(
      inspectCompositionReferences(f.document, f.registry, {
        ...f.request,
        scopeId: "card-a",
      }).status,
    ).toBe("incompatible")
  })
  it("reports unknown motion and never authorizes visual/audio refs by metadata", () => {
    const f = fixture()
    Object.assign(f.document.composition.sections, {
      assets: { backdrop: { assetId: "declared", sha256: "a".repeat(64) } },
      motion: { question: { id: "missing-motion", version: "1.0.0" } },
    })
    const result = inspectCompositionReferences(
      f.document,
      f.registry,
      f.request,
    )
    expect(result.issues).toEqual([
      "asset-authorization-not-evaluated",
      "unknown-motion:question",
    ])
    expect(result.template).toBeNull()
  })
  it("rejects malformed trees and invalid estimation/cardinality combinations", () => {
    const f = fixture()
    f.registry.templates[0].nodes[0].layout.lane = "decoration"
    expect(() =>
      inspectCompositionReferences(f.document, f.registry, f.request),
    ).toThrow("system-content-lane")
    const other = fixture()
    for (const answerCount of [0, 1, 65, null]) {
      expect(() =>
        inspectCompositionReferences(other.document, other.registry, {
          ...other.request,
          answerCount,
        }),
      ).toThrow()
    }
    expect(() =>
      inspectCompositionReferences(other.document, other.registry, {
        ...other.request,
        questionType: "estimation",
      }),
    ).toThrow("request-answer-kind")
  })
  it("keeps missing template selection as native inheritance without inventing nodes", () => {
    const f = fixture()
    f.document.composition.sections.templates =
      {} as typeof f.document.composition.sections.templates
    const result = inspectCompositionReferences(
      f.document,
      f.registry,
      f.request,
    )
    expect(result.status).toBe("inherit-native")
    expect(result.requestedTemplate).toBeNull()
    expect(result.template).toBeNull()
    expect(result.executableAcceptance).toBe(false)
  })
  it("requires separate audio asset authorization while mute/inherit remain declarative", () => {
    const f = fixture()
    Object.assign(f.document.composition.sections, {
      audio: {
        opening: {
          mode: "asset",
          asset: { assetId: "licensed-declaration", sha256: "a".repeat(64) },
          volume: 1,
          loop: false,
          fadeMs: 0,
        },
      },
    })
    expect(
      inspectCompositionReferences(f.document, f.registry, f.request).issues,
    ).toContain("asset-authorization-not-evaluated")
    Object.assign(f.document.composition.sections, {
      audio: { opening: { mode: "mute" } },
    })
    expect(
      inspectCompositionReferences(f.document, f.registry, f.request).status,
    ).toBe("candidate")
    expect(
      inspectCompositionReferences(f.document, f.registry, f.request)
        .executableAcceptance,
    ).toBe(false)
  })
})
