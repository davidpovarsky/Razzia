// Reuse exact executed16 artifacts only after checking every real input/output.
import { createRequire } from "node:module"
import { readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
const require = createRequire("/work/extensions/package.json")
const vite = require("vite")
const { parse } = require("@babel/parser")
const hash = bytes => createHash("sha256").update(bytes).digest("hex")
const entry = "/work/extensions/src/presentation/show-library-preview/renderer-entry-v2.tsx"
const original = "/home/ubuntu/tadazz-hq-qa-20261115/source/show-ui-E-native16/input/extensions/src/presentation/show-library-preview/renderer-entry-v2.tsx"
const clean = value => Array.isArray(value) ? value.map(clean) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => !["start","end","loc","extra","comments","tokens","leadingComments","trailingComments","innerComments"].includes(key)).map(([key, child]) => [key, clean(child)])) : value
const emit = async source => (await vite.transformWithOxc(source, entry, { lang: "tsx", jsx: { runtime: "automatic" }, sourcemap: false })).code
const before = readFileSync("/original-v2-entry.tsx", "utf8")
const after = readFileSync(entry, "utf8")
const beforeJs = await emit(before), afterJs = await emit(after)
const sameEmittedAst = JSON.stringify(clean(parse(beforeJs, { sourceType: "module" }))) === JSON.stringify(clean(parse(afterJs, { sourceType: "module" })))
if (!sameEmittedAst) throw new Error("Native V2 executable AST changed")
const receipt = JSON.parse(readFileSync("/tmp/retained16/native-v2-build-receipt.json", "utf8"))
let checkedInputs = 0
for (const input of receipt.inputs) {
  if (!input.sha256) continue
  const bytes = readFileSync(input.observedRealpath)
  if (input.observedRealpath === entry) {
    if (hash(before) !== input.sha256) throw new Error("Original executed entry mismatch")
  } else if (bytes.length !== input.bytes || hash(bytes) !== input.sha256) throw new Error(`Changed native input: ${input.id}`)
  checkedInputs++
}
for (const output of receipt.outputs) {
  const bytes = readFileSync(`/tmp/retained16/native-v2-candidate/${output.path}`)
  if (bytes.length !== output.bytes || hash(bytes) !== output.sha256) throw new Error(`Changed executed output: ${output.path}`)
}
writeFileSync("/out/native-v2-type-bridge.json", JSON.stringify({ originalPhysicalSource: original, beforeSourceSha256: hash(before), afterSourceSha256: hash(after), beforeEmittedJsSha256: hash(beforeJs), afterEmittedJsSha256: hash(afterJs), sameEmittedAst, vite: vite.version, babel: require("@babel/parser/package.json").version, checkedInputs, outputs: receipt.outputs, meaning: "Exact native16 browser4 artifact retained after all-input/output hashes and type-only/formatting executable-AST equivalence. No browser rerun or new renderer pin." }, null, 2))
