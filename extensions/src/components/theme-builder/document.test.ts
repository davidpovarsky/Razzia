import { describe, expect, it } from "vitest"
import { builderDocumentFixture } from "./document.fixture"
import {
  applyBuilderEdit,
  builderDigest,
  createBuilderHistory,
  editBuilderDocument,
  parseBuilderDocument,
  redoBuilderEdit,
  undoBuilderEdit,
} from "./document"

describe("Theme Builder atomic bounded authoring", () => {
  it("edits a copy and preserves system bindings through undo/redo", () => {
    const source = builderDocumentFixture(),
      history = createBuilderHistory(source)
    const changed = applyBuilderEdit(history, {
      type: "props",
      templateId: "test-template",
      nodeId: "first",
      value: { alignment: "end" },
    })
    expect(source.registry.templates[0].nodes[1].props).toEqual({})
    expect(undoBuilderEdit(changed).present).toEqual(source)
    expect(redoBuilderEdit(undoBuilderEdit(changed)).present).toEqual(
      changed.present,
    )
    expect(changed.present.registry.templates[0].nodes[0].bindings).toEqual({
      choices: "choices",
      clock: "clock",
    })
  })
  it("reorders siblings with the same operation used by drag and keyboard", () => {
    const source = builderDocumentFixture()
    const moved = editBuilderDocument(source, {
      type: "move",
      templateId: "test-template",
      nodeId: "second",
      parentId: "root",
      port: "decoration",
      index: 0,
    })
    expect(moved.registry.templates[0].nodes[0].children.decoration).toEqual([
      "second",
      "first",
    ])
    expect(source.registry.templates[0].nodes[0].children.decoration).toEqual([
      "first",
      "second",
    ])
  })
  it("rejects foreign components, root deletion, cycles and invalid parent ports", () => {
    const source = builderDocumentFixture()
    expect(() =>
      editBuilderDocument(source, {
        type: "remove",
        templateId: "test-template",
        nodeId: "root",
      }),
    ).toThrow()
    expect(() =>
      editBuilderDocument(source, {
        type: "move",
        templateId: "test-template",
        nodeId: "first",
        parentId: "first",
        port: "decoration",
        index: 0,
      }),
    ).toThrow()
    expect(() =>
      editBuilderDocument(source, {
        type: "add",
        templateId: "test-template",
        parentId: "root",
        port: "overlay",
        nodeId: "new",
        component: { id: "decoration-view", version: "1.0.0" },
      }),
    ).toThrow()
    expect(() =>
      editBuilderDocument(source, {
        type: "add",
        templateId: "test-template",
        parentId: "root",
        port: "decoration",
        nodeId: "new",
        component: { id: "foreign", version: "1.0.0" },
      }),
    ).toThrow()
  })
  it("adds/removes allowed decoration without changing content bindings", () => {
    const added = editBuilderDocument(builderDocumentFixture(), {
      type: "add",
      templateId: "test-template",
      parentId: "root",
      port: "decoration",
      nodeId: "new",
      component: { id: "decoration-view", version: "1.0.0" },
    })
    expect(added.registry.templates[0].nodes).toHaveLength(4)
    expect(
      editBuilderDocument(added, {
        type: "remove",
        templateId: "test-template",
        nodeId: "new",
      }),
    ).toEqual(builderDocumentFixture())
  })
  it("rejects executable props, arbitrary coordinates and forged readiness", () => {
    const source = builderDocumentFixture()
    expect(() =>
      editBuilderDocument(source, {
        type: "props",
        templateId: "test-template",
        nodeId: "first",
        value: { html: "<script>" },
      }),
    ).toThrow()
    expect(() =>
      editBuilderDocument(source, {
        type: "layout",
        templateId: "test-template",
        nodeId: "first",
        value: { ...source.registry.templates[0].nodes[1].layout, x: -1000 },
      }),
    ).toThrow()
    expect(() =>
      parseBuilderDocument({
        ...source,
        registry: {
          ...source.registry,
          components: [
            { ...source.registry.components[0], availability: "ready" },
          ],
        },
      }),
    ).toThrow()
  })
  it("keeps role overrides separate and preserves unknown stored template references", () => {
    const source = builderDocumentFixture()
    const next = editBuilderDocument(source, {
      type: "sections",
      role: "manager",
      value: { audio: { opening: { mode: "mute" } } },
    })
    expect(next.content.composition.roles.spectator).toBeUndefined()
    expect(next.content.composition.sections).toEqual(
      source.content.composition.sections,
    )
    expect(
      editBuilderDocument(source, {
        type: "sections",
        role: "all",
        value: { templates: { voting: { id: "foreign", version: "1.0.0" } } },
      }).content.composition.sections.templates?.voting,
    ).toEqual({ id: "foreign", version: "1.0.0" })
  })
  it("bounds history and preserves the save fingerprint when editing after save begins", () => {
    let history = createBuilderHistory(builderDocumentFixture())
    const saving = builderDigest(history.present)
    for (let i = 0; i < 60; i++)
      history = applyBuilderEdit(history, { type: "rename", name: `Edit ${i}` })
    expect(history.past).toHaveLength(50)
    expect(history.savedDigest).toBe(saving)
    expect(builderDigest(history.present)).not.toBe(saving)
    expect(
      applyBuilderEdit(undoBuilderEdit(history), {
        type: "rename",
        name: "Fork",
      }).future,
    ).toEqual([])
  })
})
