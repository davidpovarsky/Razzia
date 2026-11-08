import classicManifest from "./classic.manifest.json" with { type: "json" }
import {
  showThemeDefinitionSchema,
  type ShowThemeDefinition,
} from "./definition"
import { CLASSIC_THEME_ID, CLASSIC_THEME_VERSION } from "./selection"

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value)
    for (const child of Object.values(value)) {
      freeze(child)
    }
  }

  return value
}

/** Only trusted source-controlled code may create registries; JSON never registers code. */
export class ShowThemeRegistry {
  private readonly definitions = new Map<string, ShowThemeDefinition>()

  register(input: unknown): void {
    const definition = showThemeDefinitionSchema.parse(input)
    const key = `${definition.id}@${definition.version}`

    if (this.definitions.has(key)) {
      throw new Error(`Duplicate theme version: ${key}`)
    }

    this.definitions.set(key, freeze(definition))
  }

  get(id: string, version: string): ShowThemeDefinition | undefined {
    return this.definitions.get(`${id}@${version}`)
  }

  list(): readonly ShowThemeDefinition[] {
    return [...this.definitions.values()]
  }

  classic(): ShowThemeDefinition {
    const definition = this.get(CLASSIC_THEME_ID, CLASSIC_THEME_VERSION)

    if (!definition) {
      throw new Error("Classic fallback must be registered")
    }

    return definition
  }
}

export const showThemeRegistry = new ShowThemeRegistry()

showThemeRegistry.register(classicManifest)

/** Per-tenant/per-room registry; never mutate the global bundled catalog. */
export function createShowThemeRegistry(definitions: readonly unknown[] = []) {
  const registry = new ShowThemeRegistry()
  for (const definition of showThemeRegistry.list())
    {registry.register(definition)}
  for (const definition of definitions) {registry.register(definition)}

  return registry
}
