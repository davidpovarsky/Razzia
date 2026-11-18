// Supplemental proof only: actual executed source -> formatter output. Never
// mutates mounted code; no schema or authority replacement is accepted.
import { createRequire } from "node:module"
import { readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
const require = createRequire("/work/extensions/package.json")
const vite = require("vite"), { parse } = require("@babel/parser")
const hash = bytes => createHash("sha256").update(bytes).digest("hex")
const clean = value => Array.isArray(value) ? value.map(clean) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => !["start","end","loc","extra","comments","tokens","leadingComments","trailingComments","innerComments"].includes(key)).map(([key, child]) => [key, clean(child)])) : value
const source = JSON.parse(readFileSync("/out/source-sha256.json", "utf8"))
const receipts = JSON.parse(readFileSync("/out/format-receipts.json", "utf8"))
const results = []
for (const record of receipts) {
  const path = record.path
  const before = readFileSync("/work/" + path, "utf8"), after = readFileSync("/out/formatted/" + path, "utf8")
  if (hash(before) !== source[path]) throw new Error(`Executed source mismatch: ${path}`)
  const lang = path.endsWith(".tsx") ? "tsx" : path.endsWith(".mjs") ? "js" : "ts"
  const emit = async text => (await vite.transformWithOxc(text, "/work/" + path, { lang, jsx: { runtime: "automatic" }, sourcemap: false })).code
  const a = await emit(before), b = await emit(after)
  const sameExecutableAst = JSON.stringify(clean(parse(a, { sourceType: "module" }))) === JSON.stringify(clean(parse(b, { sourceType: "module" })))
  if (!sameExecutableAst) throw new Error(`Formatter changed executable source: ${path}`)
  results.push({ path, beforeSourceSha256: hash(before), afterSourceSha256: hash(after), babelSourceAstEqual: record.sameAst, sameExecutableAst, beforeEmittedJsSha256: hash(a), afterEmittedJsSha256: hash(b) })
}
writeFileSync("/out/native-save-format-bridge.json", JSON.stringify({ vite: vite.version, babel: require("@babel/parser/package.json").version, results, meaning: "Only final own-source formatting after actual TypeScript0/unit10/browser30. Exact executed inputs retained; every emitted executable AST is identical. F DTO leaves were not formatted or changed." }, null, 2))
