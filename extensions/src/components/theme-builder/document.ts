import { z } from "zod"
import {
  compositionDocumentSchema,
  parseCompositionDocument,
} from "../../core/show-library/composition-document"
import {
  assertBoundedJson,
  exactRefSchema,
  identifierSchema,
} from "../../core/show-library/primitives"
import { canonicalJson, sha256 } from "../../core/show-library/digest"
import { createShowLibraryRegistry } from "../../core/show-library/registry"
import {
  libraryRegistrySchema,
  themeCompositionSchema,
  propsSchema,
  layoutSchema,
} from "../../core/show-library/schemas"
import {
  themeOverridesSchema,
  updateScopedTheme,
} from "../../core/show-themes/selection"

/** Editor envelope only. All scene, component, asset and audio contracts belong to core. */
const documentSchema = z.strictObject({
  format: z.literal("tadazz-theme-builder-draft"),
  formatVersion: z.literal(1),
  id: identifierSchema,
  name: z.string().trim().min(1).max(120),
  registry: libraryRegistrySchema,
  content: compositionDocumentSchema,
})

export type BuilderDocument = z.infer<typeof documentSchema>

export type BuilderNode =
  BuilderDocument["registry"]["templates"][number]["nodes"][number]

export type BuilderTemplate = BuilderDocument["registry"]["templates"][number]

const key = (ref: { id: string; version: string }) => `${ref.id}@${ref.version}`

export function parseBuilderDocument(input: unknown): BuilderDocument {
  assertBoundedJson(input)
  const document = documentSchema.parse(input)
  parseCompositionDocument(document.content)
  createShowLibraryRegistry(document.registry)

  if (new TextEncoder().encode(canonicalJson(document)).length > 500_000) {
    throw new Error("theme-builder:document-budget")
  }

  // Unknown saved refs survive roundtrip; core's contextual inspector reports them.
  return document
}

export function builderDigest(input: BuilderDocument): string {
  return sha256(canonicalJson(input))
}

export type BuilderEdit =
  | { type: "rename"; name: string }
  | { type: "props"; templateId: string; nodeId: string; value: unknown }
  | { type: "layout"; templateId: string; nodeId: string; value: unknown }
  | {
      type: "move"
      templateId: string
      nodeId: string
      parentId: string
      port: BuilderNode["port"]
      index: number
    }
  | {
      type: "add"
      templateId: string
      parentId: string
      port: BuilderNode["port"]
      nodeId: string
      component: z.infer<typeof exactRefSchema>
    }
  | { type: "remove"; templateId: string; nodeId: string }
  | {
      type: "motion"
      templateId: string
      nodeId: string
      motion: z.infer<typeof exactRefSchema> | null
    }
  | {
      type: "sections"
      role: "manager" | "player" | "spectator" | "all"
      scopeId?: string
      value: unknown
    }
  | { type: "native-overrides"; scopeId?: string; value: unknown }

/** Atomic validated edits: invalid ports/cycles/system-binding loss never enter history. */
export function editBuilderDocument(
  input: BuilderDocument,
  edit: BuilderEdit,
): BuilderDocument {
  const next = structuredClone(input)

  if (edit.type === "rename") {
    next.name = edit.name
  } else if (edit.type === "native-overrides") {
    const overrides = themeOverridesSchema.parse(edit.value)

    if (!edit.scopeId) {
      next.content.selection.overrides = overrides
    } else {
      const id = identifierSchema.parse(edit.scopeId),
        index = next.content.scopes.findIndex((s) => s.scopeId === id)
      const selection = updateScopedTheme(
        index < 0 ? undefined : next.content.scopes[index].selection,
        next.content.selection,
        overrides,
      )

      if (index < 0) {
        next.content.scopes.push({ scopeId: id, selection })
      } else {
        next.content.scopes[index].selection = selection
      }
    }
  } else if (edit.type === "sections") {
    const candidate = structuredClone(next.content.composition)
    let target: Pick<typeof candidate, "sections" | "roles"> = candidate

    if (edit.scopeId) {
      const id = identifierSchema.parse(edit.scopeId)
      let scope = candidate.scopes.find(
        (s) => s.scopeId === id && key(s.theme) === key(candidate.baseTheme),
      )

      if (!scope) {
        scope = {
          scopeId: id,
          theme: { ...candidate.baseTheme },
          sections: {},
          roles: {},
        }
        candidate.scopes.push(scope)
      }

      target = scope
    }

    if (edit.role === "all") {
      target.sections = edit.value as typeof candidate.sections
    } else {
      target.roles[edit.role] = edit.value as typeof candidate.sections
    }

    next.content.composition = themeCompositionSchema.parse(candidate)
  } else {
    const template = next.registry.templates.find(
      (t) => t.id === edit.templateId,
    )

    if (!template) {
      throw new Error("theme-builder:unknown-template")
    }

    const node =
      "nodeId" in edit
        ? template.nodes.find((n) => n.nodeId === edit.nodeId)
        : undefined

    if (edit.type === "add") {
      if (
        node ||
        !next.registry.components.some((c) => key(c) === key(edit.component))
      ) {
        throw new Error("theme-builder:component-reference")
      }

      const parent = template.nodes.find((n) => n.nodeId === edit.parentId)

      if (!parent) {
        throw new Error("theme-builder:unknown-parent")
      }

      template.nodes.push({
        nodeId: identifierSchema.parse(edit.nodeId),
        component: edit.component,
        port: edit.port,
        props: {},
        bindings: {},
        layout: {
          preset: "flow",
          alignment: "center",
          gap: "small",
          lane: "decoration",
        },
        motions: [],
        children: {},
      })
      ;(parent.children[edit.port] ??= []).push(edit.nodeId)
    } else {
      if (!node) {
        throw new Error("theme-builder:unknown-node")
      }

      if (edit.type === "props") {
        node.props = propsSchema.parse(edit.value)
      }

      if (edit.type === "layout") {
        node.layout = layoutSchema.parse(edit.value)
      }

      if (edit.type === "motion") {
        node.motions = edit.motion ? [exactRefSchema.parse(edit.motion)] : []
      }

      if (edit.type === "move") {
        if (
          node.nodeId === template.rootNodeId ||
          !Number.isInteger(edit.index) ||
          edit.index < 0
        ) {
          throw new Error("theme-builder:invalid-move")
        }

        const parent = template.nodes.find((n) => n.nodeId === edit.parentId)

        if (!parent) {
          throw new Error("theme-builder:unknown-parent")
        }

        for (const n of template.nodes) {
          for (const port of Object.keys(n.children) as Array<
            BuilderNode["port"]
          >) {
            n.children[port] = n.children[port]?.filter(
              (id) => id !== node.nodeId,
            )
          }
        }
        const siblings = parent.children[edit.port] ?? []
        parent.children[edit.port] = siblings

        if (edit.index > siblings.length) {
          throw new Error("theme-builder:invalid-move")
        }

        siblings.splice(edit.index, 0, node.nodeId)
        node.port = edit.port
      }

      if (edit.type === "remove") {
        if (node.nodeId === template.rootNodeId) {
          throw new Error("theme-builder:root-required")
        }

        const removed = new Set<string>()
        const remove = (id: string) => {
          if (removed.has(id)) {
            return
          }

          removed.add(id)
          const item = template.nodes.find((n) => n.nodeId === id)
          for (const child of Object.values(item?.children ?? {}).flat()) {
            remove(child)
          }
        }
        remove(node.nodeId)
        template.nodes = template.nodes.filter((n) => !removed.has(n.nodeId))
        for (const n of template.nodes) {
          for (const port of Object.keys(n.children) as Array<
            BuilderNode["port"]
          >) {
            n.children[port] = n.children[port]?.filter(
              (id) => !removed.has(id),
            )
          }
        }
      }
    }
  }

  return parseBuilderDocument(next)
}

export interface BuilderHistory {
  present: BuilderDocument
  past: BuilderDocument[]
  future: BuilderDocument[]
  savedDigest: string
}

export function createBuilderHistory(input: unknown): BuilderHistory {
  const present = parseBuilderDocument(input)

  return { present, past: [], future: [], savedDigest: builderDigest(present) }
}

export function applyBuilderEdit(
  history: BuilderHistory,
  edit: BuilderEdit,
): BuilderHistory {
  const present = editBuilderDocument(history.present, edit)

  if (builderDigest(present) === builderDigest(history.present)) {
    return history
  }

  return {
    ...history,
    present,
    past: [...history.past, history.present].slice(-50),
    future: [],
  }
}

export function undoBuilderEdit(history: BuilderHistory): BuilderHistory {
  const present = history.past.at(-1)

  return present
    ? {
        ...history,
        present,
        past: history.past.slice(0, -1),
        future: [history.present, ...history.future].slice(0, 50),
      }
    : history
}

export function redoBuilderEdit(history: BuilderHistory): BuilderHistory {
  const present = history.future.at(0)

  return present
    ? {
        ...history,
        present,
        past: [...history.past, history.present].slice(-50),
        future: history.future.slice(1),
      }
    : history
}
