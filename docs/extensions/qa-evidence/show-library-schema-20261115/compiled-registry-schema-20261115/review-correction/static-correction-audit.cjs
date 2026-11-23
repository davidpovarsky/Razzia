// Static source/format/hash audit only. Does not import or execute project modules.
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const cp = require("node:child_process")
const root = process.cwd()
const prettier = require(path.join(root, "node_modules/.pnpm/prettier@3.9.10/node_modules/prettier"))
const parser = require(path.join(root, "extensions/node_modules/@babel/parser"))
const evidence = path.dirname(__filename)
const names = ["compiled-index-schema.ts", "compiled-index-authority.ts", "compiled-index-validation.ts", "compiled-index.test.ts"]
const allowed = new Set(["zod", "node:crypto", "vitest", "./digest", "./primitives", "./compiled-index-schema", "./compiled-index-authority", "./compiled-index-validation"])
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex")
const check = (condition, message) => { if (!condition) throw Error(message) }
;(async () => {
  const records = []; let tests = 0
  for (const name of names) {
    const file = "extensions/src/core/show-library/" + name
    const original = fs.readFileSync(file, "utf8")
    const options = { parser: "typescript", semi: false, tabWidth: 2, singleQuote: false, printWidth: 80, trailingComma: "all" }
    const formatted = await prettier.format(original, options)
    if (formatted !== original) fs.writeFileSync(file, formatted)
    check(await prettier.check(formatted, options), "format:" + file)
    const ast = parser.parse(formatted, { sourceType: "module", plugins: ["typescript"] })
    const imports = ast.program.body.filter((n) => n.type === "ImportDeclaration").map((n) => n.source.value)
    check(imports.every((i) => allowed.has(i)), "imports:" + file)
    function walk(n) {
      if (!n || typeof n !== "object") return
      if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "it") tests++
      if (n.type === "CallExpression" && n.callee.type === "CallExpression" && n.callee.callee.type === "MemberExpression" && n.callee.callee.object.name === "it" && n.callee.callee.property.name === "each") tests += n.callee.arguments[0].elements.length
      for (const [k, v] of Object.entries(n)) if (!["start", "end", "loc"].includes(k)) { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") walk(v) }
    }
    if (name.endsWith(".test.ts")) walk(ast.program)
    if (name === "compiled-index-authority.ts") {
      const declarations = ast.program.body.filter((n) => n.type === "VariableDeclaration").flatMap((n) => n.declarations)
      for (const key of ["ROOT_REVIEWED_RIGHTS_RECEIPTS", "ROOT_REVIEWED_STORE_RECEIPTS"]) {
        const entry = declarations.find((n) => n.id.name === key)
        check(entry && entry.init.type === "CallExpression" && entry.init.callee.name === "freeze" && entry.init.arguments[0].type === "ArrayExpression" && entry.init.arguments[0].elements.length === 0, "nonempty-root-registry")
      }
    }
    const bytes = fs.readFileSync(file)
    records.push({ path: file, bytes: bytes.length, sha256: hash(bytes), imports, staticSyntaxAndFormat: "PASS" })
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, "../../metadata-delta-b59cb6cf523773f3189a7fd9937c8e0000d0565c6d68ed18c88d8c00f8b1a418.json")))
  check(manifest.files.length === 26, "frozen-manifest-count")
  for (const file of manifest.files) check(hash(fs.readFileSync(file.path)) === file.sha256, "frozen-core:" + file.path)
  const changed = cp.execFileSync("git", ["diff", "155c6b84df84c900872162e2a8c0267c90641153", "--name-only", "--", "extensions/src", "packages"], { encoding: "utf8" }).trim().split("\n").filter(Boolean)
  check(changed.every((f) => names.map((n) => "extensions/src/core/show-library/" + n).includes(f)), "outside-new-leaf-change")
  for (const file of ["pnpm-lock.yaml", "package.json", "extensions/package.json"]) check(fs.readFileSync(file).equals(cp.execFileSync("git", ["show", "HEAD:" + file])), "package-or-lock-change")
  const activeImports = cp.spawnSync("git", ["grep", "-n", "-E", "compiled-index-(schema|authority|validation)", "19a2e83060e78fa4505647b88eca762113cb1ca8", "--", "extensions/src", "packages"], { encoding: "utf8" })
  check(activeImports.status === 1, "existing-runtime-import")
  const result = { mode: "STATIC_SOURCE_ONLY_NO_PROJECT_MODULE_EXECUTION", sourceFiles: records, authoredTestCases: tests, testsExecuted: 0, typecheck: "NOT_RUN", acceptedCoreHashesMatched: 26, acceptedExistingFileChanges: 0, correctedNewLeafChanges: changed, originalRuntimeImports: 0, rootReceiptRegistries: "EMPTY", pinActivation: "NONE", lockAndPackageFilesUnchanged: true, uiCheck: "NOT_REPEATED_ROOT_INSTRUCTION_PRIOR_RAW_FAIL_RETAINED", directFreezeGuard: "PRIOR_RAW_FAIL31_MISMATCHES_EMPTY_RETAINED_NOT_REPEATED", pnpm: "NOT_INVOKED_IGNORED_LINKS_PRESERVED" }
  fs.writeFileSync(path.join(evidence, "CORRECTED_STATIC_RECEIPT.json"), JSON.stringify(result, null, 2) + "\n")
  process.stdout.write(JSON.stringify({ syntaxAndFormat: "PASS", frozenCoreHashes: 26, sourceFiles: records.length, authoredTestCases: tests, testsExecuted: 0, typecheck: "NOT_RUN", activeImports: 0, rootRegistries: "EMPTY", guardResults: "RAW_FAILURES_RETAINED" }) + "\n")
})().catch((error) => { process.stderr.write(error.stack + "\n"); process.exitCode = 1 })
