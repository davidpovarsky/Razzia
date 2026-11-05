#!/usr/bin/env node
/**
 * Extracts the raster assets embedded (base64) in Goldy's canonical
 * TADAZZ Motion Showcase HTML into self-hosted files, byte-for-byte.
 *
 * The HTML itself is NEVER loaded at runtime. It is the binding visual
 * reference; the React/TypeScript port lives in
 * extensions/src/presentation/tadazz-show/**.
 *
 * Usage: node scripts/tadazz/extract-motion-assets.mjs [--check]
 */
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const SOURCE = join(
  root,
  "docs/extensions/references/TADAZZ_Motion_Showcase_One_Click_20261105.html",
)
const EXPECTED_SHA =
  "1eea4698bc97080c7fc82f5c0376a6ac8c6efb25a8223a178062628fa14a8669"
const OUT_DIR = join(root, "packages/web/public/tadazz-show/motion")
const PROVENANCE = join(
  root,
  "extensions/src/presentation/tadazz-show/motion-assets.provenance.json",
)

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex")
const check = process.argv.includes("--check")

const raw = readFileSync(SOURCE)
const sourceSha = sha256(raw)
if (sourceSha !== EXPECTED_SHA) {
  console.error(`Canonical HTML hash mismatch: ${sourceSha}`)
  process.exit(1)
}
const html = raw.toString("utf8")

/** Named extraction points, located by the exact surrounding source text. */
const TARGETS = [
  {
    file: "backdrop.webp",
    role: ".tz-backdrop background (CSS line 15)",
    before: ".tz-backdrop { position:absolute; inset:0; background: center/cover no-repeat url(",
  },
  {
    file: "logo.webp",
    role: "TADAZZ! logo used by .tz-win-logo and .tz-intro-logo",
    before: "this.winLogo.src='",
  },
]

const results = []
for (const target of TARGETS) {
  const at = html.indexOf(target.before)
  if (at < 0) throw new Error(`Anchor not found for ${target.file}`)
  const start = at + target.before.length
  const match = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)/.exec(
    html.slice(start, start + 400000),
  )
  if (!match) throw new Error(`No data URI after anchor for ${target.file}`)
  const bytes = Buffer.from(match[2], "base64")
  const hash = sha256(bytes)
  const outPath = join(OUT_DIR, target.file)
  if (check) {
    if (!existsSync(outPath) || sha256(readFileSync(outPath)) !== hash) {
      console.error(`Asset drift: ${target.file}`)
      process.exit(1)
    }
  } else {
    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(outPath, bytes)
  }
  results.push({
    file: `/tadazz-show/motion/${target.file}`,
    role: target.role,
    mime: match[1],
    bytes: bytes.length,
    sha256: hash,
  })
}

// The intro logo must be the identical payload as the finale logo.
const introAnchor = "introLogo.src='"
const introAt = html.indexOf(introAnchor)
const introUri = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)/.exec(
  html.slice(introAt + introAnchor.length, introAt + introAnchor.length + 400000),
)
if (!introUri || sha256(Buffer.from(introUri[1], "base64")) !== results[1].sha256) {
  throw new Error("Intro logo differs from finale logo; extraction needs review")
}

// ── Stylesheet port ─────────────────────────────────────────────────────────
// The canonical <style> block is ported verbatim into a scoped project CSS
// file. Only document-level rules (html/body/#viewport/form reset) and the
// Showcase demo toolbar are dropped, because the stage is mounted inside the
// game shell instead of a standalone page. Embedded backdrop data URI becomes
// the self-hosted file extracted above.
const CSS_OUT = join(
  root,
  "extensions/src/presentation/tadazz-show/tadazz-motion-kit.css",
)
const styleStart = html.indexOf("<style>") + "<style>".length
const styleEnd = html.indexOf("</style>")
const DROPPED_PREFIXES = [
  ":root {",
  "* {",
  "html,body {",
  "button,input {",
  "#viewport {",
  "/* Demo controls",
  ".tz-demo-controls",
  "/* When the stage viewport enters browser fullscreen",
  "#viewport:fullscreen",
]
const dropped = []
const cssLines = html
  .slice(styleStart, styleEnd)
  .split(/\r?\n/)
  .filter((line) => {
    const drop = DROPPED_PREFIXES.some((p) => line.trimStart().startsWith(p))
    if (drop) dropped.push(line.slice(0, 60))
    return !drop
  })
  .map((line) =>
    line.replace(
      /url\(data:image\/webp;base64,[A-Za-z0-9+/=]+\)/g,
      "url(/tadazz-show/motion/backdrop.webp)",
    ),
  )
const cssText =
  "/*\n" +
  " * AUTO-PORTED from the canonical TADAZZ Motion Kit stylesheet\n" +
  ` * (source SHA-256 ${sourceSha}).\n` +
  " * Values are byte-identical to the reference; do not hand-edit — rerun\n" +
  " * scripts/tadazz/extract-motion-assets.mjs. Project adaptations live in\n" +
  " * tadazz-show-adaptations.css.\n" +
  " */\n" +
  cssLines.join("\n").trim() +
  "\n"
if (check) {
  if (!existsSync(CSS_OUT) || readFileSync(CSS_OUT, "utf8") !== cssText) {
    console.error("Stylesheet drift: tadazz-motion-kit.css")
    process.exit(1)
  }
} else {
  writeFileSync(CSS_OUT, cssText)
}

const provenance = {
  source: "docs/extensions/references/TADAZZ_Motion_Showcase_One_Click_20261105.html",
  sourceSha256: sourceSha,
  sourceBytes: raw.length,
  note: "Assets decoded byte-for-byte from the canonical HTML. The HTML is a reference only and is never served or executed.",
  assets: results,
  stylesheet: {
    file: "extensions/src/presentation/tadazz-show/tadazz-motion-kit.css",
    sha256: sha256(Buffer.from(cssText, "utf8")),
    droppedDocumentAndDemoRules: dropped,
  },
}
if (!check) {
  writeFileSync(PROVENANCE, JSON.stringify(provenance, null, 2) + "\n")
}
console.log(JSON.stringify(provenance, null, 2))
