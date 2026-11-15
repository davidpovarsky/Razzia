import { describe, expect, it } from "vitest"
import {
  createShowLibraryRegistry,
  inspectCandidateCapabilities,
} from "./registry"

function fixture(questionType: "single" | "estimation") {
  const ref = { id: "locked-answer-candidate", version: "1.0.0" }
  const binding = questionType === "estimation" ? "estimation" : "choices"
  const capability =
    questionType === "estimation"
      ? "valid-estimation-options"
      : "complete-answer-set"

  return {
    schemaVersion: 1,
    id: "locked-candidates",
    version: "1.0.0",
    motions: [],
    components: [
      {
        ...ref,
        adapterId: "unimplemented",
        availability: "candidate",
        propsProfile: "bounded-view-v1",
        capabilities: {
          questionTypes: [questionType],
          playModes: ["quiz"],
          minAnswers: 2,
          maxAnswers: 5,
          roles: ["spectator"],
          phases: ["voteLocked"],
        },
        allowedPorts: ["stage-root"],
        childPorts: [],
        bindings: [binding],
        motions: [],
        fallback: "safe-hold",
        reducedMotion: "same-theme-static",
        a11yLabelKey: "extensions:test",
        provenance: "synthetic locked-phase contract counterexample",
      },
    ],
    templates: [
      {
        id: "locked-template",
        version: "1.0.0",
        availability: "candidate",
        phase: "voteLocked",
        roles: ["spectator"],
        questionType,
        playMode: "quiz",
        rootNodeId: "root",
        requiredSystemCapabilities: [capability],
        layouts: ["stage-16-9", "safe-4-3", "narrow-player"],
        fallback: "safe-hold",
        nodes: [
          {
            nodeId: "root",
            component: ref,
            port: "stage-root",
            props: {},
            bindings: { [binding]: binding },
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
  }
}

describe.each(["single", "estimation"] as const)(
  "locked-phase %s template preserves required answer information",
  (questionType) => {
    it("keeps a complete locked template candidate without execution authority", () => {
      const registry = createShowLibraryRegistry(fixture(questionType))
      const [component] = registry.components

      expect(
        inspectCandidateCapabilities(component, {
          role: "spectator",
          phase: "voteLocked",
          questionType,
          playMode: "quiz",
          answerCount: questionType === "estimation" ? null : 5,
        }),
      ).toEqual({
        compatible: true,
        support: "unavailable",
        reason: "adapter-unimplemented",
      })
    })
    it("rejects a template with no bound answer information", () => {
      const input = fixture(questionType)
      input.templates[0].nodes[0].bindings = {}

      expect(() => createShowLibraryRegistry(input)).toThrow(
        "missing-system-binding",
      )
    })
    it("rejects omitted answer completeness capability", () => {
      const input = fixture(questionType)
      input.templates[0].requiredSystemCapabilities = []

      expect(() => createShowLibraryRegistry(input)).toThrow(
        "missing-system-capability",
      )
    })
    it("continues rejecting mandatory answers hidden in decoration lanes", () => {
      const input = fixture(questionType)
      input.templates[0].nodes[0].layout.lane = "decoration"

      expect(() => createShowLibraryRegistry(input)).toThrow(
        "system-content-lane",
      )
    })
  },
)
