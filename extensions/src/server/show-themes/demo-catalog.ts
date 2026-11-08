/** Reviewed repository demos only. Not an upload or publication bypass. */
import cosmic from "./demo-themes/cosmic.manifest.json"
import jade from "./demo-themes/jade.manifest.json"
import { createShowThemeRegistry } from "../../core/show-themes/registry"

// The registry validates references, deep freezes definitions, and stays local.
const registry = createShowThemeRegistry([cosmic, jade])

export const demoThemeDefinitions = Object.freeze(
  registry.list().filter((theme) => theme.id !== "tadazz-classic"),
)
