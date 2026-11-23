import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import { createHash } from "node:crypto"
const require = createRequire("/work/extensions/package.json")
const { parse } = require("@babel/parser")
const clean = value => Array.isArray(value) ? value.map(clean) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => !["start", "end", "loc", "extra", "comments", "tokens", "leadingComments", "trailingComments", "innerComments"].includes(key)).map(([key, child]) => [key, clean(child)])) : value
const ast = source => JSON.stringify(clean(parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] })))
const sha = source => createHash("sha256").update(source).digest("hex")
const formatted = readFileSync("/out/font26/formatted-spec.ts", "utf8")
const canonical = readFileSync("/out/font26/canonical-spec.ts", "utf8")
if (ast(canonical) !== ast(formatted)) throw new Error("font:changed-final-spec-ast")
const format = JSON.parse(readFileSync("/out/format-receipts.json", "utf8"))
if (format.length !== 8 || format.some(row => !row.sameAst)) throw new Error("font:changed-initial-source-ast")
writeFileSync("/out/font26/final-format-receipt.json", JSON.stringify({ initialEightFilesSameAst: true, finalCorrectedSpecSameAst: true, canonicalSpecSha256: sha(canonical), formattedSpecSha256: sha(formatted), distinction: "Exact resource bytes and tested raw source hashes retained. Final source formatting is normalized AST equivalence, not a claim of identical source or harness SRI bytes." }, null, 2))
const css = readFileSync("/tmp/native-font-fixture/fonts/rubik-wght.css", "utf8")
const ranges = [...css.matchAll(/unicode-range:\s*([^;]+);/gu)].flatMap(match => match[1].split(",").map(range => {
  const [low, high] = range.trim().replace(/^U\+/u, "").split("-").map(value => Number.parseInt(value, 16))
  return [low, high ?? low]
}))
const proof = []
for (const path of readdirSync("/out/font26-browser-results", { recursive: true })) {
  if (!path.endsWith("decoded-font-use.json") || path.includes("/attachments/")) continue
  const evidence = JSON.parse(readFileSync(`/out/font26-browser-results/${path}`, "utf8"))
  if (evidence.observations.length !== 8 || evidence.errors.length || evidence.csp.length || evidence.external.length) throw new Error("font:incomplete-final-browser-proof")
  proof.push({ browser: evidence.browserName, locales: evidence.observations.map(({ locale, paint, platformFonts }) => ({ locale, notCoveredByUpstreamCss: [...paint.text].filter(character => !ranges.some(([low, high]) => character.codePointAt(0) >= low && character.codePointAt(0) <= high)).map(character => ({ character, codePoint: `U+${character.codePointAt(0).toString(16).toUpperCase()}` })), nativePlatformFonts: platformFonts, decodedByteAliasRasterEqual: paint.raster === paint.aliasRaster, sameCloneMetricsDelta: Math.abs(paint.nativeCloneWidth - paint.aliasWidth), originalRangeMetricsDelta: Math.abs(paint.actualWidth - paint.nativeCloneWidth) })) })
}
if (proof.length !== 2) throw new Error("font:two-engines-required")
const vi = proof.find(row => row.browser === "chromium").locales.find(row => row.locale === "vi")
if (vi.notCoveredByUpstreamCss.map(row => row.character).join("") !== "ạ") throw new Error("font:unexpected-vietnamese-coverage")
writeFileSync("/out/font26/locale-coverage.json", JSON.stringify({ cssSha256: sha(css), proof, limits: "The unchanged upstream six-face CSS excludes Japanese CJK/fullwidth punctuation and Vietnamese U+1EA1. Chromium reports actual custom/OS glyph counts; attribution of its single Vietnamese fallback glyph to U+1EA1 is an inference joining those counts to CSS coverage. WebKit proves decode, same-clone metrics and exact composite raster/alias behavior; its exact platform fallback family was not observed. No system font was installed and no coverage range was altered." }, null, 2))
// Original font23 checksum index remains untouched; supplemental custody index
// covers corrected runs and their preserved failures before extraction.
const rows = []
for (const path of readdirSync("/out", { recursive: true })) {
  if (["evidence-sha256.txt", "supplemental-font-sha256.txt"].includes(path)) continue
  try { rows.push(`${sha(readFileSync(`/out/${path}`))}  /out/${path}`) } catch (error) { if (error.code !== "EISDIR") throw error }
}
writeFileSync("/out/supplemental-font-sha256.txt", rows.join("\n") + "\n")
console.log(JSON.stringify({ engines: proof.length, localesPerEngine: 8, finalPositiveCases: 2, originalNegativeCases: 4, supplementalHashRows: rows.length, finalAstEquivalent: true }))
