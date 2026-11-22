import { createRequire } from "node:module"
import { readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
const require = createRequire("/work/extensions/package.json")
const vite = require("vite"),
  { parse } = require("@babel/parser")
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const stage =
  "/work/extensions/src/presentation/show-library-preview/NativePreviewStage.tsx"
const before = readFileSync("/original-v1-stage.tsx", "utf8"),
  after = readFileSync(stage, "utf8")
const emit = async (source) =>
  (
    await vite.transformWithOxc(source, stage, {
      lang: "tsx",
      jsx: { runtime: "automatic" },
      sourcemap: false,
    })
  ).code
const beforeJs = await emit(before),
  afterJs = await emit(after)
const clean = (value) =>
  Array.isArray(value)
    ? value.map(clean)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .filter(
              ([key]) =>
                ![
                  "start",
                  "end",
                  "loc",
                  "extra",
                  "comments",
                  "tokens",
                  "leadingComments",
                  "trailingComments",
                  "innerComments",
                ].includes(key),
            )
            .map(([key, child]) => [key, clean(child)]),
        )
      : value
const sameEmittedAst =
  JSON.stringify(clean(parse(beforeJs, { sourceType: "module" }))) ===
  JSON.stringify(clean(parse(afterJs, { sourceType: "module" })))
if (!sameEmittedAst) throw new Error("Native V1 executable AST changed")
const receipt = JSON.parse(
  readFileSync("/tmp/retained15/native-build-receipt.json", "utf8"),
)
let checkedInputs = 0
for (const input of receipt.inputs) {
  if (!input.sha256) continue
  const bytes = readFileSync(input.observedRealpath)
  if (input.observedRealpath === stage) {
    if (hash(before) !== input.sha256)
      throw new Error("Original executed stage mismatch")
  } else if (bytes.length !== input.bytes || hash(bytes) !== input.sha256)
    throw new Error(`Changed native input: ${input.id}`)
  checkedInputs++
}
for (const output of receipt.outputs) {
  const bytes = readFileSync(`/tmp/retained15/native-candidate/${output.path}`)
  if (bytes.length !== output.bytes || hash(bytes) !== output.sha256)
    throw new Error(`Changed executed output: ${output.path}`)
}
writeFileSync(
  "/out/native-v1-reuse.json",
  JSON.stringify(
    {
      beforeSourceSha256: hash(before),
      afterSourceSha256: hash(after),
      beforeEmittedJsSha256: hash(beforeJs),
      afterEmittedJsSha256: hash(afterJs),
      sameEmittedAst,
      vite: vite.version,
      babel: require("@babel/parser/package.json").version,
      checkedInputs,
      outputs: receipt.outputs,
      meaning:
        "Exact native15 artifacts admitted after all physical inputs/output hashes and executable-AST check of sole stage formatting change; no new pin.",
    },
    null,
    2,
  ),
)
