import cosmicV1 from "./demo-themes/cosmic.v1.manifest.json"
import jadeV1 from "./demo-themes/jade.v1.manifest.json"
/** Reviewed repository demos only. Not an upload or publication bypass. */
import cosmic from "./demo-themes/cosmic.manifest.json"
import jade from "./demo-themes/jade.manifest.json"
import { createShowThemeRegistry } from "../../core/show-themes/registry"

// The registry validates references, deep freezes definitions, and stays local.
const registry = createShowThemeRegistry([cosmicV1, cosmic, jadeV1, jade])

export const demoThemeDefinitions = Object.freeze(
  registry
    .list()
    .filter(
      (theme) =>
        theme.id === "tadazz-demo-cosmic" || theme.id === "tadazz-demo-jade",
    ),
)
