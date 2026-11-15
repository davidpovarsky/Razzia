import { describe, expect, it } from "vitest"
import {
  createShowLibraryRegistry,
  ImmutableRegistryCatalog,
  inspectCandidateCapabilities,
} from "./registry"
import {
  componentDefinitionSchema,
  propsSchema,
  themeCompositionSchema,
} from "./schemas"
import {
  checkAssetReference,
  resolveCompositionSections,
  resetCompositionSection,
} from "./assets"

const ref = { id: "candidate-view", version: "1.0.0" }
function registryFixture() {
  return {
    schemaVersion: 1,
    id: "test-library",
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
          phases: ["voting"],
        },
        allowedPorts: ["stage-root"],
        childPorts: [],
        bindings: ["choices", "clock"],
        motions: [],
        fallback: "safe-hold",
        reducedMotion: "same-theme-static",
        a11yLabelKey: "extensions:test",
        provenance: "synthetic fixture",
      },
    ],
    templates: [
      {
        id: "test-template",
        version: "1.0.0",
        availability: "candidate",
        phase: "voting",
        roles: ["spectator"],
        rootNodeId: "root",
        requiredSystemCapabilities: ["complete-answer-set", "server-clock"],
        layouts: ["stage-16-9", "safe-4-3", "narrow-player"],
        fallback: "safe-hold",
        nodes: [
          {
            nodeId: "root",
            component: ref,
            port: "stage-root",
            props: {},
            bindings: { choices: "choices", clock: "clock" },
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
describe("bounded candidate registry, never executable registration", () => {
  it("accepts immutable contracts but does not report an adapter ready", () => {
    const registry = createShowLibraryRegistry(registryFixture())
    const result = inspectCandidateCapabilities(registry.components[0], {
      role: "spectator",
      phase: "voting",
      questionType: "single",
      playMode: "quiz",
      answerCount: 5,
    })
    expect(result).toEqual({
      compatible: true,
      support: "unavailable",
      reason: "adapter-unimplemented",
    })
    expect(Object.isFrozen(registry.templates[0].nodes)).toBe(true)
    expect(
      inspectCandidateCapabilities(registry.components[0], {
        role: "spectator",
        phase: "voting",
        questionType: "single",
        playMode: "quiz",
        answerCount: 64,
      }).compatible,
    ).toBe(false)
  })
  it("rejects undeclared CSS/code props and forged implementation readiness", () => {
    expect(propsSchema.safeParse({ style: "position:fixed" }).success).toBe(
      false,
    )
    expect(propsSchema.safeParse({ html: "<script>" }).success).toBe(false)
    expect(
      componentDefinitionSchema.safeParse({
        ...registryFixture().components[0],
        availability: "ready",
      }).success,
    ).toBe(false)
  })
  it("rejects missing required bindings/system capabilities, aliases and foreign components", () => {
    const one = registryFixture()
    one.templates[0].nodes[0].bindings = {
      choices: "choices",
      clock: "choices",
    }
    expect(() => createShowLibraryRegistry(one)).toThrow()
    const two = registryFixture()
    two.templates[0].requiredSystemCapabilities = []
    expect(() => createShowLibraryRegistry(two)).toThrow(
      "missing-system-capability",
    )
    const three = registryFixture()
    three.templates[0].nodes[0].component = { ...ref, id: "foreign" }
    expect(() => createShowLibraryRegistry(three)).toThrow()
  })
  it("rejects forbidden role/phase binding and role capability", () => {
    const input = registryFixture()
    input.templates[0].roles = ["player"]
    expect(() => createShowLibraryRegistry(input)).toThrow("role-capability")
    const other = registryFixture()
    other.components[0].bindings.push("personal-result")
    Object.assign(other.templates[0].nodes[0].bindings, {
      "personal-result": "personal-result",
    })
    expect(() => createShowLibraryRegistry(other)).toThrow("binding-role-phase")
  })
  it("rejects duplicate versions, unreachable nodes, over-budget trees and object cycles", () => {
    const duplicate = registryFixture()
    duplicate.components.push(duplicate.components[0])
    expect(() => createShowLibraryRegistry(duplicate)).toThrow(
      "duplicate-version",
    )
    const disconnected = registryFixture()
    disconnected.templates[0].nodes.push({
      ...disconnected.templates[0].nodes[0],
      nodeId: "orphan",
    })
    expect(() => createShowLibraryRegistry(disconnected)).toThrow("unreachable")
    const large = registryFixture()
    large.templates[0].nodes = Array.from({ length: 129 }, (_, i) => ({
      ...large.templates[0].nodes[0],
      nodeId: `node-${i}`,
    }))
    expect(() => createShowLibraryRegistry(large)).toThrow()
    const cyclic: { value?: unknown } = {}
    cyclic.value = cyclic
    expect(() => createShowLibraryRegistry(cyclic)).toThrow("cycle")
  })
  it("preserves immutable version bytes across registration", () => {
    const catalog = new ImmutableRegistryCatalog(),
      first = registryFixture()
    const accepted = catalog.register(first)
    expect(catalog.register(first)).toBe(accepted)
    first.components[0].provenance = "changed"
    expect(() => catalog.register(first)).toThrow("immutable-version-conflict")
  })
  it("rejects functional system bindings placed into decoration lanes", () => {
    const input = registryFixture()
    input.templates[0].nodes[0].layout.lane = "decoration"
    expect(() => createShowLibraryRegistry(input)).toThrow(
      "system-content-lane",
    )
  })
  it("rejects a real cyclic child graph, depth overflow and 33 children", () => {
    const makeChain = (length: number) => {
      const input = registryFixture()
      input.components[0].allowedPorts.push("question")
      Object.assign(input.components[0], {
        childPorts: [
          { id: "question", allowedComponents: [ref], maxChildren: 32 },
        ],
      })
      input.templates[0].nodes = Array.from({ length }, (_, i) => ({
        ...input.templates[0].nodes[0],
        nodeId: i === 0 ? "root" : `child-${i}`,
        port: i === 0 ? "stage-root" : "question",
        children: i + 1 < length ? { question: [`child-${i + 1}`] } : {},
      }))
      return input
    }
    expect(() => createShowLibraryRegistry(makeChain(9))).toThrow("graph-depth")
    const cyclic = makeChain(3)
    cyclic.templates[0].nodes[2].children = { question: ["child-1"] }
    expect(() => createShowLibraryRegistry(cyclic)).toThrow()
    const wide = makeChain(2)
    wide.templates[0].nodes[0].children = {
      question: Array.from({ length: 33 }, () => "child-1"),
    }
    expect(() => createShowLibraryRegistry(wide)).toThrow()
  })
})

describe("independent asset/audio/template/motion section data", () => {
  const asset = { assetId: "sample", sha256: "a".repeat(64) }
  const composition = () => ({
    schemaVersion: 1,
    id: "composition",
    version: "1.0.0",
    baseTheme: { id: "tadazz-classic", version: "1.0.0" },
    registry: { id: "test-library", version: "1.0.0" },
    sections: {
      assets: { background: asset },
      audio: { opening: { mode: "mute" } },
    },
    roles: {},
    scopes: [],
  })
  it("resetting audio retains asset/layout data and leaves original immutable input intact", () => {
    const input = composition(),
      reset = resetCompositionSection(input, "audio")
    expect(reset.sections.audio).toBeUndefined()
    expect(reset.sections.assets).toEqual(input.sections.assets)
    expect(input.sections.audio.opening.mode).toBe("mute")
  })
  it("resolves exact role/scope precedence and ignores foreign theme scope", () => {
    const input = themeCompositionSchema.parse(composition())
    input.roles.player = { audio: { opening: { mode: "inherit" } } }
    input.scopes = [
      {
        scopeId: "q1",
        theme: input.baseTheme,
        sections: { audio: { opening: { mode: "mute" } } },
        roles: {
          player: {
            audio: {
              opening: {
                mode: "asset",
                asset,
                volume: 0,
                loop: false,
                fadeMs: 0,
              },
            },
          },
        },
      },
    ]
    expect(
      resolveCompositionSections(input, "player", "q1").audio?.opening?.mode,
    ).toBe("asset")
    input.scopes[0].theme = { id: "other-theme", version: "1.0.0" }
    expect(
      resolveCompositionSections(input, "player", "q1").audio?.opening?.mode,
    ).toBe("inherit")
  })
  it("denies foreign tenant, prohibited export and referenced deletion metadata", () => {
    const descriptor = {
      ...asset,
      version: "1.0.0",
      kind: "image",
      bytes: 123,
      rights: "owner-authorized",
      provenance: "synthetic",
      owner: { scope: "tenant", tenantId: "tenant-a" },
      exportPermitted: false,
      referenceCount: 1,
    }
    expect(
      checkAssetReference(descriptor, {
        tenantId: "tenant-b",
        operation: "read",
      }).allowed,
    ).toBe(false)
    expect(
      checkAssetReference(descriptor, {
        tenantId: "tenant-a",
        operation: "export",
      }).allowed,
    ).toBe(false)
    expect(
      checkAssetReference(descriptor, {
        tenantId: "tenant-a",
        operation: "delete",
      }).allowed,
    ).toBe(false)
    expect(() =>
      checkAssetReference(descriptor, {
        tenantId: "tenant-a",
        operation: "unknown",
      }),
    ).toThrow()
    expect(() =>
      resolveCompositionSections(composition(), "invalid-role" as never),
    ).toThrow()
  })
})
