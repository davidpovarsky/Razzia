import ts from "typescript"
import { resolve } from "node:path"

const root = process.cwd()
const config = ts.readConfigFile(
  resolve(root, "tsconfig.json"),
  ts.sys.readFile,
)
if (config.error)
  throw new Error(
    ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
  )
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
const file = resolve(root, "packages/socket/src/api/extensions/game-routes.ts")
const program = ts.createProgram([file], {
  ...parsed.options,
  noEmit: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  skipLibCheck: true,
  allowImportingTsExtensions: true,
  types: ["node"],
  typeRoots: [
    resolve(root, "packages/socket/node_modules/@types"),
    resolve(root, "extensions/node_modules/@types"),
  ],
})
const source = program.getSourceFile(file)
if (!source) throw new Error("Scoped route not loaded")
const diagnostics = [
  ...parsed.errors,
  ...program.getOptionsDiagnostics(),
  ...program.getGlobalDiagnostics(),
  ...program.getSyntacticDiagnostics(source),
  ...program.getSemanticDiagnostics(source),
]
for (const d of diagnostics)
  console.error(
    ts.formatDiagnostic(d, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n",
    }),
  )
console.log(
  JSON.stringify({
    scope: "game-routes.ts syntax/semantics plus global/options",
    typescript: ts.version,
    source_files_loaded: program.getSourceFiles().length,
    diagnostics: diagnostics.length,
    full_project_check: false,
  }),
)
if (diagnostics.length) process.exitCode = 1
