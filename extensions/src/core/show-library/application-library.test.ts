import { describe, expect, it } from "vitest"
import {
  getApplicationShowLibrary,
  resolveApplicationTemplate,
} from "./application-library"
import { RUNTIME_PHASES } from "../packages/protocol"
import type { applicationAppearanceSchema } from "./application-preview-schema"
import type { z } from "zod"

function appearance(): z.infer<typeof applicationAppearanceSchema> {
  const registry = structuredClone(getApplicationShowLibrary())
  const ref = { id: registry.id, version: registry.version }

  return {
    registry,
    document: {
      format: "tadazz-show-composition",
      schemaVersion: 1,
      selection: { id: "tadazz-classic", version: "1.0.0", overrides: {} },
      scopes: [],
      composition: {
        schemaVersion: 1,
        id: "authoring-test",
        version: "1.0.0",
        baseTheme: { id: "tadazz-classic", version: "1.0.0" },
        registry: ref,
        sections: {},
        roles: {},
        scopes: [],
      },
    },
  }
}
describe("compiled first-party application composition", () => {
  it("has both original renderers and two structural layouts without losing system bindings", () => {
    const a = appearance()
    for (const phase of RUNTIME_PHASES) {
      const role = phase === "personalResult" ? "player" : "spectator"
      expect(
        a.registry.templates.filter((t) => t.phase === phase),
      ).toHaveLength(4)
      expect(resolveApplicationTemplate(a, role, phase).id).toBe(
        `native.${phase}.flow`,
      )
      a.document.composition.sections.templates = {
        [phase]: { id: `native.${phase}.grid`, version: "1.0.0" },
      }
      expect(resolveApplicationTemplate(a, role, phase).nodes).toHaveLength(3)
      for (const renderer of ["original", "cinematic"]) {
        a.document.composition.sections.templates = {
          [phase]: { id: `native.${phase}.${renderer}`, version: "1.0.0" },
        }
        expect(
          resolveApplicationTemplate(a, role, phase).nodes[0].component.id,
        ).toBe(`native.${renderer}-stage`)
      }
    }
  })
  it("renders a role-specific template without leaking the player's selected state to spectator", () => {
    const a = appearance()
    a.document.composition.roles.manager = {
      templates: { question: { id: "native.question.grid", version: "1.0.0" } },
    }
    expect(
      resolveApplicationTemplate(a, "manager", "question").nodes,
    ).toHaveLength(3)
    expect(
      resolveApplicationTemplate(a, "spectator", "question").nodes,
    ).toHaveLength(1)
    expect(() =>
      resolveApplicationTemplate(a, "spectator", "personalResult"),
    ).toThrow()
  })
  it("rejects executable adapter substitution and unknown references", () => {
    const a = appearance()
    a.registry.components[0].adapterId = "caller-code"
    expect(() =>
      resolveApplicationTemplate(a, "spectator", "question"),
    ).toThrow("Unsupported component registry")
    const b = appearance()
    b.document.composition.sections.templates = {
      question: { id: "not-installed", version: "1.0.0" },
    }
    expect(() =>
      resolveApplicationTemplate(b, "spectator", "question"),
    ).toThrow("Unsupported screen template")
  })
  it("rejects removal of required question content and graph cycles before mounting", () => {
    const a = appearance()
    a.registry.templates.find(
      (t) => t.id === "native.question.flow",
    )!.nodes[0].bindings = {}
    expect(() =>
      resolveApplicationTemplate(a, "spectator", "question"),
    ).toThrow("missing-system-binding")
    const b = appearance()
    b.registry.templates.find(
      (t) => t.id === "native.question.flow",
    )!.nodes[0].children.decoration = ["stage"]
    expect(() =>
      resolveApplicationTemplate(b, "spectator", "question"),
    ).toThrow()
  })
})
