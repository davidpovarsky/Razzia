import { describe, expect, it } from "vitest"
import {
  createShowLibraryRegistry,
  inspectCandidateCapabilities,
} from "./registry"

const componentRef = { id: "answer-candidate", version: "1.0.0" }
const motionRef = { id: "entrance-candidate", version: "1.0.0" }
function fixture() {
  return {
    schemaVersion: 1,
    id: "motion-reference-candidates",
    version: "1.0.0",
    components: [
      {
        ...componentRef,
        adapterId: "unimplemented",
        availability: "candidate",
        propsProfile: "bounded-view-v1",
        capabilities: {
          questionTypes: ["single"],
          playModes: ["quiz"],
          minAnswers: 2,
          maxAnswers: 5,
          roles: ["spectator"],
          phases: ["voting"],
        },
        allowedPorts: ["stage-root"],
        childPorts: [],
        bindings: ["choices", "clock"],
        motions: [motionRef],
        fallback: "safe-hold",
        reducedMotion: "same-theme-static",
        a11yLabelKey: "extensions:test",
        provenance: "synthetic closed-reference counterexample",
      },
    ],
    templates: [],
    motions: [
      {
        ...motionRef,
        kind: "element",
        availability: "candidate",
        ports: ["stage-root"],
        components: [componentRef],
        durationMs: 800,
        staggerMs: 0,
        seek: "unavailable",
        reducedMotion: "same-theme-static",
      },
    ],
  }
}

describe("motion compatibility references form a closed candidate registry", () => {
  it("accepts exact reciprocal references without claiming a runnable adapter", () => {
    const registry = createShowLibraryRegistry(fixture())
    const [component] = registry.components

    expect(registry.motions[0].components).toEqual([componentRef])
    expect(Object.isFrozen(registry.motions[0].components)).toBe(true)
    expect(
      inspectCandidateCapabilities(component, {
        role: "spectator",
        phase: "voting",
        questionType: "single",
        playMode: "quiz",
        answerCount: 5,
      }).support,
    ).toBe("unavailable")
  })
  it.each([
    { id: "missing-component", version: "1.0.0" },
    { id: "answer-candidate", version: "9.0.0" },
  ])(
    "rejects an unregistered exact motion component $id@$version",
    (missing) => {
      const input = fixture()
      input.motions[0].components.push(missing)

      expect(() => createShowLibraryRegistry(input)).toThrow(
        "unknown-motion-component",
      )
    },
  )
  it("checks unselected motions rather than waiting for a template to use them", () => {
    const input = fixture()
    input.components[0].motions = []
    input.motions[0].components = [{ id: "future-missing", version: "1.0.0" }]

    expect(() => createShowLibraryRegistry(input)).toThrow(
      "unknown-motion-component",
    )
  })
  it("rejects a motion-only registry claiming an absent component", () => {
    const input = fixture()
    input.components = []

    expect(() => createShowLibraryRegistry(input)).toThrow(
      "unknown-motion-component",
    )
  })
  it("allows a known compatibility target to defer opting into an unused motion", () => {
    const input = fixture()
    input.components[0].motions = []
    const registry = createShowLibraryRegistry(input)

    expect(registry.motions[0].components).toEqual([componentRef])
    expect(registry.components[0].motions).toEqual([])
  })
  it("keeps the existing rejection when a component opts into a motion that excludes it", () => {
    const input = fixture()
    input.motions[0].components = []

    expect(() => createShowLibraryRegistry(input)).toThrow(
      "incompatible-motion",
    )
  })
})
