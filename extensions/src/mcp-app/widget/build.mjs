import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
const require = createRequire(
  new URL("../../../../extensions/package.json", import.meta.url),
)
const { build } = await import(pathToFileURL(require.resolve("vite")).href)
const fixture = process.argv.includes("--private-fixture")
const host = process.argv.includes("--private-host")
let name = "widget"

if (fixture) {
  name = "fixture"
} else if (host) {
  name = "host"
}

await build({
  configFile: new URL("./vite.config.ts", import.meta.url).pathname.replace(
    /^\/([A-Z]:)/u,
    "$1",
  ),
  configLoader: "runner",
  ...(fixture || host
    ? {
        build: {
          lib: {
            entry: new URL(
              `../../../qa/mcp-widget/${name}-entry.tsx`,
              import.meta.url,
            ).pathname.replace(/^\/([A-Z]:)/u, "$1"),
            name: "TadazzPrivateFixture",
            formats: ["iife"],
            fileName: () => `${name}.js`,
            cssFileName: name,
          },
        },
      }
    : {}),
})

if (host) {
  process.exit(0)
}

const css = await readFile(
  new URL(`./dist/${name}.css`, import.meta.url),
  "utf8",
)
const raw = await readFile(
  new URL(`./dist/${name}.js`, import.meta.url),
  "utf8",
)
const marker = /["'`]__TADAZZ_WIDGET_BUNDLED_CSS_20261115__["'`]/gu

if (fixture && [...raw.matchAll(marker)].length !== 1) {
  throw new Error("widget:missing-style-marker")
}

const js = raw.replace(marker, () => JSON.stringify(css))
// Script/style termination escaping is required for the inline MCP UI resource.
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.replace(/<\/style/giu, "<\\/style")}</style></head><body><div id="tadazz-widget"></div><script>${js.replace(/<\/script/giu, "<\\/script")}</script></body></html>`
await writeFile(new URL(`./dist/${name}.js`, import.meta.url), js)
await writeFile(new URL(`./dist/${name}.html`, import.meta.url), html)
await writeFile(
  new URL(`./dist/${name}-artifact.json`, import.meta.url),
  JSON.stringify(
    {
      resourceUri: "ui://tadazz/quiz-preview/v1.html",
      mimeType: "text/html;profile=mcp-app",
      sdk: "@modelcontextprotocol/ext-apps@2.1.0",
      bytes: Buffer.byteLength(html),
      sha256: createHash("sha256").update(html).digest("hex"),
      admission: fixture
        ? "private synthetic fixture only"
        : "candidate-only; V1 unavailable unchanged",
      externalConnections: [],
    },
    null,
    2,
  ),
)
