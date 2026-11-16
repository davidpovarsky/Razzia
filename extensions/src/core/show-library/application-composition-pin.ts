import { z } from "zod"
import { digestSchema, exactRefSchema, identifierSchema } from "./primitives"
import {
  scopedThemeOverridesSchema,
  type ThemeOverrides,
} from "../show-themes/selection"

/** An immutable private workspace configuration reference, never a code grant. */
export const applicationCompositionPinSchema = z.strictObject({
  workspaceId: z.uuid(),
  documentId: identifierSchema,
  version: exactRefSchema.shape.version,
  digest: digestSchema,
  rendererBuildSha256: digestSchema,
})

export type ApplicationCompositionPin = z.infer<
  typeof applicationCompositionPinSchema
>

export type ApplicationCompositionAppearance = z.infer<
  typeof import("./application-preview-schema").applicationAppearanceSchema
>

export function applicationCardScopeId(
  nativeId: string | undefined,
  aliases: unknown,
): string | undefined {
  if (
    !nativeId ||
    !aliases ||
    typeof aliases !== "object" ||
    Array.isArray(aliases)
  ) {
    return nativeId
  }

  const alias = (aliases as Record<string, unknown>)[nativeId]

  return z.uuid().safeParse(alias).success ? (alias as string) : nativeId
}

export function cloneApplicationCardScope<
  T extends {
    showComposition?: unknown
    showCompositionScopeAliases?: Record<string, string>
  },
>(defaults: T, sourceId: string, newId: string): T {
  return defaults.showComposition
    ? {
        ...defaults,
        showCompositionScopeAliases: {
          ...defaults.showCompositionScopeAliases,
          [newId]: defaults.showCompositionScopeAliases?.[sourceId] ?? sourceId,
        },
      }
    : defaults
}

/** Authored card choices keep precedence over the published theme's card defaults. */
export function applicationCardThemeScope(
  appearance: ApplicationCompositionAppearance,
  scopeId: string | undefined,
  original: unknown,
) {
  const base = appearance.document.scopes.find(
    (scope) => scope.scopeId === scopeId,
  )?.selection

  if (!base) {
    return original
  }

  const parsed = scopedThemeOverridesSchema.safeParse(original)
  const card = parsed.success
    ? [parsed.data, ...(parsed.data.history ?? [])].find(
        (scope) =>
          scope.themeId === base.themeId &&
          scope.themeVersion === base.themeVersion,
      )
    : undefined

  if (!card) {
    return base
  }

  const merge = (
    a: Pick<ThemeOverrides, "slots" | "audio">,
    b: Pick<ThemeOverrides, "slots" | "audio">,
  ) => ({
    slots: { ...a.slots, ...b.slots },
    audio: { ...a.audio, ...b.audio },
  })
  const roles: ThemeOverrides["roles"] = {}
  for (const role of ["manager", "player", "spectator"] as const) {
    if (base.overrides.roles?.[role] || card.overrides.roles?.[role]) {
      roles[role] = merge(
        base.overrides.roles?.[role] ?? {},
        card.overrides.roles?.[role] ?? {},
      )
    }
  }

  return {
    ...base,
    overrides: { ...merge(base.overrides, card.overrides), roles },
  }
}

/** The manager's layout/media choices never enter an audience snapshot. */
export function projectApplicationComposition(
  appearance: ApplicationCompositionAppearance,
  manager: boolean,
): ApplicationCompositionAppearance {
  const copy = structuredClone(appearance)

  if (manager) {
    return copy
  }

  const publicRoles = (value: {
    roles?: { manager?: unknown; player?: unknown; spectator?: unknown }
  }) => {
    if (value.roles) {
      delete value.roles.manager
    }
  }
  publicRoles(copy.document.selection.overrides)
  publicRoles(copy.document.composition)
  for (const scope of copy.document.composition.scopes) {
    publicRoles(scope)
  }
  for (const scope of copy.document.scopes) {
    publicRoles(scope.selection.overrides)
    for (const previous of scope.selection.history ?? []) {
      publicRoles(previous.overrides)
    }
  }
  copy.registry.templates = copy.registry.templates.filter((template) =>
    template.roles.some((role) => role !== "manager"),
  )

  return copy
}

/** Exact room assets from the audience projection; manager-only templates grant nothing. */
export function publicApplicationCompositionMediaNames(
  appearance: ApplicationCompositionAppearance,
): readonly string[] {
  const names = new Set<string>()
  const visit = (value: unknown, key = "") => {
    if (typeof value === "string" && /url$/iu.test(key)) {
      const match = /^\/media\/([A-Za-z0-9_-]+\.[a-z0-9]+)$/u.exec(value)

      if (match) {
        names.add(match[1])
      }
    } else if (Array.isArray(value)) {
      value.forEach((item) => {
        visit(item)
      })
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([name, item]) => {
        visit(item, name)
      })
    }
  }
  visit(projectApplicationComposition(appearance, false))

  return [...names].sort()
}
