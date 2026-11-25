import { tadaShowV1Schema } from "../show-authoring-schema"

/** Shared readonly projection for saved and unsaved owner previews. No contact book. */
export function sanitizeAuthoredShowForPreview(input: unknown) {
  // Existing native converters use explicit undefined optionals in memory.
  const raw: unknown = JSON.parse(JSON.stringify(input))

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid authored preview")
  }

  const value = raw as Record<string, unknown>

  if (Array.isArray(value.settings)) {
    value.settings = value.settings.filter(
      (setting: unknown) =>
        !setting ||
        typeof setting !== "object" ||
        (setting as Record<string, unknown>).scope !== "roster",
    )
  }

  if (Array.isArray(value.cards)) {
    value.cards = value.cards.map((card: unknown) => {
      if (
        !card ||
        typeof card !== "object" ||
        Array.isArray(card) ||
        (card as Record<string, unknown>).kind !== "animation"
      ) {
        return card
      }

      const safe = { ...(card as Record<string, unknown>) }
      for (const field of [
        "dialNumber",
        "representatives",
        "connectedTables",
      ]) {
        Reflect.deleteProperty(safe, field)
      }

      return safe
    })
  }

  return tadaShowV1Schema.parse(value)
}
