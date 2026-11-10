import { readFileSync, existsSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve, dirname } from "node:path"
import { CATALOG_COMPONENTS } from "../src/platform-ui/catalog/registry.ts"
const root = fileURLToPath(new URL("../../", import.meta.url))
for (const module of Object.values(CATALOG_COMPONENTS).flatMap(
  (entry) => entry.modules,
))
  if (!existsSync(resolve(root, "extensions/src/platform-ui", module)))
    throw new Error(`Orphan component source: ${module}`)
const directory = resolve(root, "extensions/src/platform-ui/catalog")
for (const name of readdirSync(directory).filter((name) =>
  name.endsWith(".tsx"),
)) {
  const source = readFileSync(resolve(directory, name), "utf8")
  if (/<(?:button|dialog|input|select)\b/u.test(source))
    throw new Error(`Catalog must import canonical controls: ${name}`)
  if (/\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(/u.test(source))
    throw new Error(`Catalog has no transport ownership: ${name}`)
}
const walk = (path) =>
  readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(resolve(path, entry.name))
      : [resolve(path, entry.name)],
  )
const sources = [
  ...walk(resolve(root, "extensions/src")),
  ...walk(resolve(root, "packages/web/src")),
].filter((path) => /\.[cm]?tsx?$/u.test(path) && !path.startsWith(directory))
for (const path of sources) {
  const source = readFileSync(path, "utf8")
  for (const match of source.matchAll(
    /(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/gu,
  )) {
    const specifier = match[1]
    if (
      (specifier.startsWith(".") &&
        resolve(dirname(path), specifier).startsWith(directory)) ||
      specifier.startsWith("@razzia/extensions/platform-ui/catalog")
    )
      throw new Error(`Catalog leaked into application source: ${path}`)
  }
}
const vite = readFileSync(
  resolve(root, "extensions/tds.catalog.vite.config.ts"),
  "utf8",
)
if (
  !vite.includes('host: "127.0.0.1"') ||
  !vite.includes("publicDir: false") ||
  !vite.includes("envDir: false")
)
  throw new Error("Catalog must stay a separate loopback-only artifact")
console.log(
  JSON.stringify(
    {
      status: "PASS",
      applicationSourcesChecked: sources.length,
      stories: Object.keys(CATALOG_COMPONENTS),
      productionExports: Object.values(CATALOG_COMPONENTS).flatMap(
        (entry) => entry.exports,
      ),
      scope:
        "internal localhost catalog; no public application import or transport",
    },
    null,
    2,
  ),
)
