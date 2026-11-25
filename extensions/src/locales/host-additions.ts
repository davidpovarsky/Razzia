import additions from "./host-additions.json" with { type: "json" }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Upstream owns existing keys, including keys introduced by later updates. */
function addMissing(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(source)) {
    if (!Object.hasOwn(target, key)) {
      target[key] = structuredClone(value)
    } else if (isRecord(target[key]) && isRecord(value)) {
      addMissing(target[key], value)
    }
  }
}

/** Adds downstream labels without editing sixteen upstream translation files. */
export function registerHostLocaleAdditions(
  resources: Record<string, Record<string, unknown>>,
): void {
  for (const [language, namespaces] of Object.entries(additions)) {
    resources[language] ??= {}
    addMissing(resources[language], namespaces)
  }
}
