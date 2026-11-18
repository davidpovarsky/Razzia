// oxlint-disable no-await-in-loop -- Deterministic physical file traversal binds one ordered manifest before the build.
import { readFile, writeFile, readdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { pathToFileURL, fileURLToPath } from "node:url"
import { resolve, relative, join } from "node:path"
const require = createRequire(
  new URL("../../../../extensions/package.json", import.meta.url),
)
const { build } = await import(pathToFileURL(require.resolve("vite")).href)
const root = fileURLToPath(new URL("../../../../", import.meta.url))
const hash = (value) => createHash("sha256").update(value).digest("hex")
const sources = []
const publicAssets = []
async function walk(folder, output, filter) {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git"].includes(item.name)) {
      continue
    }

    const path = join(folder, item.name)

    if (item.isDirectory()) {
      await walk(path, output, filter)
    } else if (item.isFile() && filter(path)) {
      const bytes = await readFile(path)
      output.push({
        path: relative(root, path).replaceAll("\\", "/"),
        sha256: hash(bytes),
        bytes: bytes.length,
      })
    }
  }
}
for (const folder of [
  "extensions/src/mcp-app",
  "extensions/src/presentation",
  "extensions/src/core",
  "packages/web/src",
  "packages/common/src",
]) {
  await walk(resolve(root, folder), sources, (path) =>
    /\.(?:ts|tsx|json|css|mjs)$/u.test(path),
  )
}
await walk(resolve(root, "packages/web/public"), publicAssets, () => true)
sources.sort((a, b) => a.path.localeCompare(b.path))
publicAssets.sort((a, b) => a.path.localeCompare(b.path))
const rendererBuildId = hash(JSON.stringify(sources))
await build({
  configFile: fileURLToPath(new URL("./vite.config.ts", import.meta.url)),
  configLoader: "runner",
  define: { __TADAZZ_FULL_SHOW_BUILD_ID__: JSON.stringify(rendererBuildId) },
  build: {
    lib: {
      entry: fileURLToPath(new URL("./full-show-entry.tsx", import.meta.url)),
      name: "TadazzFullShowV3",
      formats: ["iife"],
      fileName: () => "full-show.js",
      cssFileName: "full-show",
    },
  },
})
const css = await readFile(
  new URL("./dist/full-show.css", import.meta.url),
  "utf8",
)
const raw = await readFile(
  new URL("./dist/full-show.js", import.meta.url),
  "utf8",
)
const marker = /["'`]__TADAZZ_WIDGET_BUNDLED_CSS_20261115__["'`]/gu

if ([...raw.matchAll(marker)].length !== 1) {
  throw new Error("full-show:style-marker")
}

const js = raw.replace(marker, () => JSON.stringify(css))
const origin = process.env.TADAZZ_WIDGET_PUBLIC_ORIGIN ?? "https://tadazz.com"
const parsed = new URL(origin)

if (parsed.protocol !== "https:" || parsed.origin !== origin) {
  throw new Error("Exact HTTPS public origin required")
}

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${
  origin
}/"><style>${css.replace(
  /<\/style/giu,
  "<\\/style",
)}</style></head><body><div id="tadazz-widget"></div><script>${js.replace(
  /<\/script/giu,
  "<\\/script",
)}</script></body></html>`

if (Buffer.byteLength(JSON.stringify(html)) > 4_000_000) {
  throw new Error("MCP static resource exceeds bound")
}

await writeFile(new URL("./dist/full-show.html", import.meta.url), html)
await writeFile(new URL("./dist/full-show.js", import.meta.url), js)
await writeFile(
  new URL("./dist/full-show-artifact.json", import.meta.url),
  JSON.stringify(
    {
      resourceUri: "ui://tadazz/full-show/v3.html",
      mimeType: "text/html;profile=mcp-app",
      rendererBuildId,
      sha256: hash(html),
      bytes: Buffer.byteLength(html),
      origin,
      csp: {
        connectDomains: [origin],
        resourceDomains: [origin],
        frameDomains: [],
        baseUriDomains: [origin],
      },
      physicalSources: sources,
      publicAssets,
      acceptance: "requires-native-browser-and-host-qualification",
    },
    null,
    2,
  ),
)
console.log(
  JSON.stringify({
    rendererBuildId,
    sha256: hash(html),
    bytes: Buffer.byteLength(html),
    publicAssets: publicAssets.length,
  }),
)
