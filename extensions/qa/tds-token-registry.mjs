import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  PLATFORM_TOKEN_VERSION,
  PRIMITIVE_TOKENS,
  SEMANTIC_TOKENS,
  LIGHT_SEMANTIC_TOKENS,
  COMPONENT_TOKENS,
  INDEPENDENT_CONTEXTS,
  PLATFORM_CONTEXTS,
  platformVariables,
} from "../src/platform-ui/tokens.ts"

const target = fileURLToPath(
  new URL("../../docs/extensions/plans/tds-tokens.json", import.meta.url),
)
const generated = `${JSON.stringify(
  {
    version: PLATFORM_TOKEN_VERSION,
    primitives: PRIMITIVE_TOKENS,
    semantics: SEMANTIC_TOKENS,
    platformLightPreview: LIGHT_SEMANTIC_TOKENS,
    components: COMPONENT_TOKENS,
    independent: INDEPENDENT_CONTEXTS,
    generatedVariables: Object.fromEntries(
      PLATFORM_CONTEXTS.map((context) => [context, platformVariables(context)]),
    ),
  },
  null,
  2,
)}\n`

if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== generated) {
    throw new Error(
      "Token registry is stale; run pnpm --dir extensions ui:tokens",
    )
  }
} else {
  writeFileSync(target, generated)
}

console.log(
  `Token registry ${PLATFORM_TOKEN_VERSION}: ${process.argv.includes("--check") ? "PASS" : "generated from production source"}`,
)
