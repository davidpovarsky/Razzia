import { bindingAllowed } from "./binding-policy"
import { libraryRegistrySchema, type ShowComponentDefinition } from "./schemas"
import {
  assertBoundedJson,
  freeze,
  type PreviewPhase,
  type PreviewRole,
} from "./primitives"
import { canonicalJson, sha256 } from "./digest"
import type { z } from "zod"

export type ShowLibraryRegistry = z.infer<typeof libraryRegistrySchema>

const key = (ref: { id: string; version: string }) => `${ref.id}@${ref.version}`

/** A candidate registry validates contracts. It never registers executable code. */
export function createShowLibraryRegistry(
  input: unknown,
): Readonly<ShowLibraryRegistry> {
  assertBoundedJson(input)
  const registry = libraryRegistrySchema.parse(input)
  for (const entries of [
    registry.components,
    registry.templates,
    registry.motions,
  ]) {
    const seen = new Set<string>()
    for (const entry of entries) {
      if (seen.has(key(entry))) {
        throw new Error("show-library:duplicate-version")
      }

      seen.add(key(entry))
    }
  }
  const components = new Map(registry.components.map((c) => [key(c), c]))
  const motions = new Map(registry.motions.map((m) => [key(m), m]))
  for (const motion of registry.motions) {
    for (const ref of motion.components) {
      if (!components.has(key(ref))) {
        throw new Error("show-library:unknown-motion-component")
      }
    }
  }
  for (const component of registry.components) {
    for (const port of component.childPorts) {
      for (const ref of port.allowedComponents) {
        if (!components.has(key(ref))) {
          throw new Error("show-library:unknown-child-component")
        }
      }
    }
    for (const ref of component.motions) {
      const motion = motions.get(key(ref))

      if (
        !motion ||
        !motion.components.some((c) => key(c) === key(component))
      ) {
        throw new Error("show-library:incompatible-motion")
      }
    }
  }
  for (const template of registry.templates) {
    if (new Set(template.layouts).size !== 3) {
      throw new Error("show-library:responsive-layouts")
    }

    const nodes = new Map(template.nodes.map((n) => [n.nodeId, n]))

    if (nodes.size !== template.nodes.length) {
      throw new Error("show-library:duplicate-node")
    }

    const root = nodes.get(template.rootNodeId)

    if (!root || root.port !== "stage-root") {
      throw new Error("show-library:invalid-root")
    }

    const parents = new Map<string, number>()
    const bindings = new Set<string>()
    const visited = new Set<string>(),
      active = new Set<string>()
    const visit = (id: string, depth: number): void => {
      if (depth > 8 || active.has(id)) {
        throw new Error("show-library:graph-depth-or-cycle")
      }

      const node = nodes.get(id)

      if (!node) {
        throw new Error("show-library:unknown-child-node")
      }

      const component = components.get(key(node.component))

      if (!component || !component.allowedPorts.includes(node.port)) {
        throw new Error("show-library:component-port")
      }

      for (const role of template.roles) {
        if (!component.capabilities.roles.includes(role)) {
          throw new Error("show-library:role-capability")
        }
      }

      if (!component.capabilities.phases.includes(template.phase)) {
        throw new Error("show-library:phase-capability")
      }

      if (
        template.questionType &&
        !component.capabilities.questionTypes.includes(template.questionType)
      ) {
        throw new Error("show-library:question-type-capability")
      }

      if (
        template.playMode &&
        !component.capabilities.playModes.includes(template.playMode)
      ) {
        throw new Error("show-library:play-mode-capability")
      }

      for (const [inputName, binding] of Object.entries(node.bindings)) {
        if (
          [
            "join",
            "phone-instructions",
            "question",
            "choices",
            "choice-results",
            "clock",
            "leaderboard",
            "personal-result",
            "estimation",
          ].includes(binding) &&
          node.layout.lane !== "content"
        ) {
          throw new Error("show-library:system-content-lane")
        }

        if (inputName !== binding) {
          throw new Error("show-library:binding-input-name")
        }

        if (!component.bindings.includes(binding)) {
          throw new Error("show-library:binding-whitelist")
        }

        for (const role of template.roles) {
          if (!bindingAllowed(binding, role, template.phase)) {
            throw new Error("show-library:binding-role-phase")
          }
        }
        bindings.add(binding)
      }
      for (const motion of node.motions) {
        const registered = motions.get(key(motion))

        if (
          !registered ||
          !registered.ports.includes(node.port) ||
          !component.motions.some((m) => key(m) === key(motion))
        ) {
          throw new Error("show-library:node-motion")
        }
      }
      active.add(id)
      for (const [port, children] of Object.entries(node.children)) {
        const spec = component.childPorts.find((p) => p.id === port)

        if (!spec || children.length > spec.maxChildren) {
          throw new Error("show-library:child-port")
        }

        for (const child of children) {
          const target = nodes.get(child)

          if (
            !target ||
            target.port !== port ||
            !spec.allowedComponents.some(
              (c) => key(c) === key(target.component),
            )
          ) {
            throw new Error("show-library:child-type")
          }

          parents.set(child, (parents.get(child) ?? 0) + 1)

          if ((parents.get(child) ?? 0) > 1) {
            throw new Error("show-library:multiple-parents")
          }

          visit(child, depth + 1)
        }
      }
      active.delete(id)
      visited.add(id)
    }
    visit(root.nodeId, 1)

    if (parents.has(root.nodeId) || visited.size !== nodes.size) {
      throw new Error("show-library:unreachable-or-root-cycle")
    }

    const answers =
      template.questionType === "estimation" ? "estimation" : "choices"
    const required: Partial<Record<PreviewPhase, string[]>> = {
      lobby: ["join"],
      question: ["question"],
      answerCards: [answers],
      voting: [answers, "clock"],
      voteLocked: [answers],
      results: ["choice-results"],
      leaderboard: ["leaderboard"],
      personalResult: ["personal-result"],
    }
    for (const binding of required[template.phase] ?? []) {
      if (!bindings.has(binding)) {
        throw new Error("show-library:missing-system-binding")
      }
    }
    const answerCapability =
      template.questionType === "estimation"
        ? "valid-estimation-options"
        : "complete-answer-set"
    const system: Partial<Record<PreviewPhase, string[]>> = {
      lobby: ["real-join-and-lock", "phone-if-enabled"],
      question: ["current-question"],
      answerCards: [answerCapability],
      voting: [answerCapability, "server-clock"],
      voteLocked: [answerCapability],
      results: ["authorized-reveal"],
      leaderboard: ["public-leaderboard"],
      personalResult: ["own-player-result"],
    }
    for (const capability of system[template.phase] ?? []) {
      if (!template.requiredSystemCapabilities.some((c) => c === capability)) {
        throw new Error("show-library:missing-system-capability")
      }
    }
  }

  return freeze(registry)
}

/** Within this explicit catalog, an existing version can never change bytes. */
export class ImmutableRegistryCatalog {
  private readonly versions = new Map<
    string,
    { digest: string; registry: Readonly<ShowLibraryRegistry> }
  >()
  register(input: unknown): Readonly<ShowLibraryRegistry> {
    const registry = createShowLibraryRegistry(input)
    const digest = sha256(canonicalJson(registry)),
      previous = this.versions.get(key(registry))

    if (previous && previous.digest !== digest) {
      throw new Error("show-library:immutable-version-conflict")
    }

    if (previous) {
      return previous.registry
    }

    this.versions.set(key(registry), { digest, registry })

    return registry
  }
  get(ref: {
    id: string
    version: string
  }): Readonly<ShowLibraryRegistry> | undefined {
    return this.versions.get(key(ref))?.registry
  }
}

export function inspectCandidateCapabilities(
  component: ShowComponentDefinition,
  request: {
    role: PreviewRole
    phase: PreviewPhase
    questionType: "single" | "multi" | "estimation"
    playMode: "quiz" | "survey"
    answerCount: number | null
  },
) {
  const c = component.capabilities
  const compatible =
    c.roles.includes(request.role) &&
    c.phases.includes(request.phase) &&
    c.questionTypes.includes(request.questionType) &&
    c.playModes.includes(request.playMode) &&
    (request.questionType === "estimation"
      ? request.answerCount === null
      : request.answerCount !== null &&
        request.answerCount >= c.minAnswers &&
        request.answerCount <= c.maxAnswers)

  return freeze({
    compatible,
    support: "unavailable" as const,
    reason: compatible ? "adapter-unimplemented" : "capability-mismatch",
  })
}
