// Server-only source formatting/AST comparison. Never imports the application.
import fs from "node:fs"
import path from "node:path"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const ts = require("/ram/work/extensions/src/mcp-app/node_modules/typescript")
const prettier = require("/cleanup/node_modules/prettier")
const root = "/ram/work"
const moduleRoot = "extensions/src/mcp-app/"
const files = [
  "first-party/schema-manifest.ts",
  "first-party/schema.ts",
  "tests/first-party/abort.nodecheck.ts",
  "tests/first-party/compatibility.observation.ts",
  "tests/first-party/review-evidence.fixture.ts",
  "tests/first-party/schema-ad895.fixture.ts",
  "tests/first-party/schema.nodecheck.ts",
  "tests/first-party/store.nodecheck.ts",
]
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex")
const options = {
  semi: false, tabWidth: 2, singleQuote: false, printWidth: 80,
  trailingComma: "all", parser: "typescript",
}
function staticName(parent, node) {
  return parent?.name === node && (
    ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) ||
    ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent) ||
    ts.isMethodSignature(parent) || ts.isGetAccessor(parent) ||
    ts.isSetAccessor(parent) || ts.isEnumMember(parent)
  ) && (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node))
}
function canonical(node, parent) {
  if (ts.isParenthesizedExpression(node) || ts.isParenthesizedTypeNode(node))
    return canonical(node.expression ?? node.type, parent)
  if (staticName(parent, node)) return { kind: "StaticPropertyName", value: node.text }
  const children = []
  ts.forEachChild(node, (child) => { children.push(canonical(child, node)) })
  const result = { kind: ts.SyntaxKind[node.kind], children }
  if (!ts.isSourceFile(node) && typeof node.text === "string") result.text = node.text
  if (typeof node.isTypeOnly === "boolean") result.isTypeOnly = node.isTypeOnly
  // Preserve semantic declaration/chain flags, not parser context or positions.
  const relevant = ts.NodeFlags.Let | ts.NodeFlags.Const | ts.NodeFlags.Using |
    ts.NodeFlags.AwaitUsing | ts.NodeFlags.OptionalChain | ts.NodeFlags.Namespace |
    ts.NodeFlags.GlobalAugmentation
  result.flags = node.flags & relevant
  // Raw template spelling matters to tagged templates; never discard it.
  if (typeof node.rawText === "string") result.rawText = node.rawText
  return result
}
function parse(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  assert.equal(source.parseDiagnostics.length, 0, "Parse diagnostics: " + file)
  return canonical(source)
}
const manifest = JSON.parse(fs.readFileSync("/predecessor/final-input-manifest.json", "utf8"))
const rows = new Map(manifest.files.map((row) => [row.path, row]))
const proof = []
const replacements = []
for (const relative of files) {
  const file = path.join(root, moduleRoot, relative)
  const before = fs.readFileSync(file)
  const expected = rows.get(moduleRoot + relative)
  assert.equal(sha(before), expected.sha256)
  const formatted = await prettier.format(before.toString("utf8"), { ...options, filepath: file })
  assert.equal(await prettier.check(formatted, { ...options, filepath: file }), true)
  const beforeTree = parse(before.toString("utf8"), file)
  const afterTree = parse(formatted, file)
  assert.deepEqual(afterTree, beforeTree, "Semantic AST mismatch: " + relative)
  const after = Buffer.from(formatted)
  assert.notEqual(sha(before), sha(after), "Expected a reported formatting correction")
  proof.push({ path: moduleRoot + relative, beforeSha256: sha(before), afterSha256: sha(after),
    beforeBytes: before.length, afterBytes: after.length,
    canonicalAstSha256: sha(JSON.stringify(beforeTree)), equalSemanticAst: true,
    syntaxDiagnostics: 0, prettierCheck: true })
  replacements.push({ file, after, relative })
}
// Do not write any candidate until every one of the eight comparisons passes.
fs.mkdirSync("/evidence/formatted", { recursive: true, mode: 0o700 })
for (const { file, after, relative } of replacements) {
  fs.chmodSync(file, 0o600)
  fs.writeFileSync(file, after)
  const output = path.join("/evidence/formatted", relative)
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 })
  fs.writeFileSync(output, after, { mode: 0o600 })
}
const changed = new Set(proof.map((row) => row.path))
const finalRows = manifest.files.map((row) => {
  const bytes = fs.readFileSync(path.join(root, row.path))
  if (!changed.has(row.path)) assert.equal(sha(bytes), row.sha256, row.path)
  return { path: row.path, bytes: bytes.length, sha256: sha(bytes) }
})
const successor = {
  kind: "AGENT_ISSUED_FORMATTED_SOURCE_SUCCESSOR",
  issuedByThread: "01a1dfaa-0f10-77b2-aa65-462ca5fe0a90",
  parentAuthorization: "SINGLE_MANAGER_WAVE_RESTART_20261115",
  sourceCommitStatus: "server-formatted bytes; local Git candidate follows verification",
  predecessorSource: "bfb796c72495f0f9d99442066f825a74ebd054d4",
  predecessorManifestSha256: "4c02c37421191cd8ea2fe46e35c0b8a37467a7d89708a11bf8cd68047bac29ab",
  deltaPaths: manifest.deltaPaths, files: finalRows,
}
const result = {
  kind: "FORMAT_ONLY_SEMANTIC_AST_EQUIVALENCE",
  typescriptVersion: ts.version, prettierVersion: prettier.version,
  normalization: "Ignore source positions/trivia; unwrap grouping parentheses; normalize noncomputed static property-name spelling; preserve node kind/children/decoded text/type-only and declaration/optional-chain flags/raw template text.",
  files: proof, changedFiles: 8, unchangedOtherInputs: 152,
  applicationImported: false,
}
fs.writeFileSync("/evidence/formatted-input-manifest.json", JSON.stringify(successor, null, 2) + "\n")
fs.writeFileSync("/evidence/semantic-equivalence.json", JSON.stringify(result, null, 2) + "\n")
console.log(JSON.stringify({ changedFiles: 8, unchangedOtherInputs: 152,
  equalSemanticAst: true, syntaxDiagnostics: 0, typescriptVersion: ts.version,
  prettierVersion: prettier.version }))
