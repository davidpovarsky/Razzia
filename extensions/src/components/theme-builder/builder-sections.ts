import type { CompositionDocument } from "../../core/show-library/composition-document"
import type { PreviewRole } from "../../core/show-library/primitives"

/** Select the editable section itself, preserving inherited values separately. */
export function builderSections(
  composition: CompositionDocument["composition"],
  role: PreviewRole | "all",
  scopeId?: string,
) {
  const target = scopeId
    ? composition.scopes.find(
        (scope) =>
          scope.scopeId === scopeId &&
          scope.theme.id === composition.baseTheme.id &&
          scope.theme.version === composition.baseTheme.version,
      )
    : composition

  if (!target) {
    return undefined
  }

  if (role === "all") {
    return target.sections
  }

  return target.roles[role]
}
