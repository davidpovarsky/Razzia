import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = fileURLToPath(new URL("../../../../../", import.meta.url))
const integration = "C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-integration-20261115"
const baseline = "6b82e051b5e6a208bb935b24c89d2676a5c90936"
const git = (...args) => execFileSync("git", args, { cwd: root })
const provenance = JSON.parse(readFileSync(new URL("../wave-C-20261115/source-provenance.json", import.meta.url), "utf8"))
const prettier = await import(pathToFileURL(resolve(integration, "node_modules/prettier/index.mjs")))
const configPath = resolve(integration, ".prettierrc.json")
const config = JSON.parse(readFileSync(configPath, "utf8"))
const require = createRequire(resolve(integration, "package.json"))
const options = { ...config, plugins: config.plugins.map(plugin => require.resolve(plugin)), parser: "typescript" }
const hash = bytes => createHash("sha256").update(bytes).digest("hex")
const nonsemantic = new Set(["loc", "range", "start", "end", "__contentStart", "__contentEnd", "comments", "leadingComments", "trailingComments", "innerComments", "tokens", "extra", "raw", "parent"])
function canonical(value) {
  if (Array.isArray(value)) return value.filter(item => item?.type !== "EmptyStatement").map(canonical)
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort()
    .filter(key => !nonsemantic.has(key)).map(key => [key, canonical(value[key])]))
  return typeof value === "bigint" ? String(value) : value
}
async function ast(text) {
  const result = await prettier.__debug.parse(text, options)
  return JSON.stringify(canonical(result.ast))
}
function firstDifference(a, b, path = "$view") {
  if (Object.is(a, b)) return undefined
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return { path, before: a, after: b }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
  for (const key of keys) {
    const result = firstDifference(a[key], b[key], path + "." + key)
    if (result) return result
  }
}
const rows = []
for (const entry of provenance.production_files) {
  const path = resolve(root, entry.path)
  const before = String(git("show", baseline + ":" + entry.path))
  const current = readFileSync(path, "utf8")
  const originalAST = await ast(before)
  assert.equal(await ast(current), originalAST, "Preexisting semantic change: " + entry.path)
  const formatted = await prettier.format(current, { ...options, filepath: path })
  const formattedAST = await ast(formatted)
  assert.equal(hash(formattedAST), hash(originalAST), "Formatter AST change: " + entry.path + " " +
    JSON.stringify(firstDifference(JSON.parse(originalAST), JSON.parse(formattedAST))))
  if (process.argv.includes("--write") && formatted !== current) writeFileSync(path, formatted)
  const actual = readFileSync(path, "utf8")
  assert.equal(await ast(actual), originalAST)
  const formatPass = await prettier.check(actual, { ...options, filepath: path })
  assert.equal(formatPass, true, "Unformatted source: " + entry.path)
  rows.push({ path: entry.path, original_sha256: hash(before), successor_sha256: hash(actual),
    normalized_ast_sha256: hash(originalAST), semantic_ast_equal: true, format_pass: formatPass,
    bytes_changed: before !== actual })
}
for (const entry of provenance.unchanged_accepted_core) {
  assert.deepEqual(readFileSync(resolve(root, entry.path)), git("show", "0ad2f09e25daf56dee3fa3c17d7b67b3b8407894:" + entry.path))
}
const evidence = new URL("../formatter-successor-20261115/", import.meta.url)
mkdirSync(evidence, { recursive: true })
const receipt = { baseline, formatter: prettier.version, config: configPath,
  config_sha256: hash(readFileSync(configPath)), plugin_paths: options.plugins,
  normalization: "Ignore only positions/comments/raw spellings/parent links and empty statements; retain all typed executable AST fields.",
  accepted_four_core_files_unchanged: true, production_files: rows }
writeFileSync(new URL("semantic-format.json", evidence), JSON.stringify(receipt, null, 2) + "\n")
console.log(JSON.stringify({ formatter: prettier.version, files: rows.length,
  changed: rows.filter(row => row.bytes_changed).length, semantic_ast_equal: true, format_pass: true }))
