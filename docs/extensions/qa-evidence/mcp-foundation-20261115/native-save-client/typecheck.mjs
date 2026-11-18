import fs from "node:fs"
import path from "node:path"
import cp from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
const here = path.dirname(fileURLToPath(import.meta.url))
const root = cp
  .execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" })
  .trim()
const bRoot =
  "C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-integration-20261115"
const bPin = "6d219d7e75dad725d79db6a55090de91adaa3d59"
const privateRoot = path.resolve(
  here,
  "../consent-boundary/local-overlay-01/extensions/src/mcp-app",
)
const req = createRequire(path.join(privateRoot, "package.json"))
const ts = req("typescript")
const label = process.argv[2] ?? "types-final-01"
if (!/^types-final-\d{2}$/.test(label))
  throw Error("Invalid immutable evidence label")
if (fs.existsSync(path.join(here, label + ".json")))
  throw Error("Preserve existing evidence")
const cfg = ts.readConfigFile(
  path.join(bRoot, "tsconfig.json"),
  ts.sys.readFile,
)
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, bRoot)
const options = {
  ...parsed.options,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  strict: true,
  allowImportingTsExtensions: true,
  skipLibCheck: true,
  types: ["node"],
  typeRoots: [path.join(privateRoot, "node_modules/@types")],
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
}
const host = ts.createCompilerHost(options)
const pinned = new Map()
const originalRead = host.readFile.bind(host)
const eRoot = "C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-ui-20261115",
  ePin = "0a7cdbf3b939f10e15d7c35ef1a482a6bb4a3f6e",
  ePinned = new Map()
host.readFile = (file) => {
  const eRelative = path.relative(eRoot, file)
  if (
    !eRelative.startsWith("..") &&
    !path.isAbsolute(eRelative) &&
    !eRelative.split(path.sep).includes("node_modules")
  ) {
    if (!ePinned.has(file))
      ePinned.set(
        file,
        cp.execFileSync(
          "git",
          ["show", ePin + ":" + eRelative.split(path.sep).join("/")],
          { encoding: "utf8" },
        ),
      )
    return ePinned.get(file)
  }
  const relative = path.relative(bRoot, file)
  if (
    !relative.startsWith("..") &&
    !path.isAbsolute(relative) &&
    !relative.split(path.sep).includes("node_modules") &&
    /\.(ts|tsx|json)$/.test(file)
  ) {
    const name = relative.split(path.sep).join("/")
    if (!pinned.has(file))
      pinned.set(
        file,
        cp.execFileSync("git", ["show", bPin + ":" + name], {
          cwd: root,
          encoding: "utf8",
        }),
      )
    return pinned.get(file)
  }
  return originalRead(file)
}
const packages = JSON.parse(
  fs.readFileSync(path.join(privateRoot, "package.json")),
)
const direct = Object.keys({
  ...packages.dependencies,
  ...packages.devDependencies,
})
const resolutions = []
host.resolveModuleNames = (names, containingFile) =>
  names.map((name) => {
    let resolved
    const relative = name.startsWith(".")
      ? path.resolve(path.dirname(containingFile), name)
      : ""
    const components =
      path.join(root, "extensions/src/components/native-save-consent") +
      path.sep
    if (relative.toLowerCase().startsWith(components.toLowerCase()))
      return ts.resolveModuleName(
        path.join(eRoot, path.relative(root, relative)),
        containingFile,
        options,
        host,
      ).resolvedModule
    const eMcp = path.join(eRoot, "extensions/src/mcp-app") + path.sep
    if (relative.toLowerCase().startsWith(eMcp.toLowerCase()))
      return ts.resolveModuleName(
        path.join(root, path.relative(eRoot, relative)),
        containingFile,
        options,
        host,
      ).resolvedModule
    const server = path.join(root, "extensions/src/server") + path.sep
    if (relative.toLowerCase().startsWith(server.toLowerCase()))
      return ts.resolveModuleName(
        path.join(bRoot, path.relative(root, relative)),
        containingFile,
        options,
        host,
      ).resolvedModule
    const core = path.join(root, "extensions/src/core") + path.sep
    if (relative.toLowerCase().startsWith(core.toLowerCase())) {
      const exact = ts.resolveModuleName(
        path.join(bRoot, path.relative(root, relative)),
        containingFile,
        options,
        host,
      ).resolvedModule
      return exact
    }
    if (
      name === "../../server/storage/creation-operation-types" &&
      containingFile
        .replaceAll("\\", "/")
        .endsWith("/first-party/oauth-native-save.ts")
    )
      resolved = {
        resolvedFileName: path.join(
          bRoot,
          "extensions/src/server/storage/creation-operation-types.ts",
        ),
        extension: ts.Extension.Ts,
      }
    else if (name === "@tadazz/native-c1-source")
      resolved = {
        resolvedFileName: path.join(
          bRoot,
          "extensions/src/server/storage/creation-reservation.ts",
        ),
        extension: ts.Extension.Ts,
      }
    else
      resolved = ts.resolveModuleName(
        name,
        direct.some((p) => name === p || name.startsWith(p + "/"))
          ? path.join(privateRoot, "resolver.ts")
          : containingFile,
        options,
        host,
      ).resolvedModule
    if (resolved)
      resolutions.push({
        specifier: name,
        from: containingFile,
        resolved: resolved.resolvedFileName,
      })
    return resolved
  })
const rootFiles = [
  path.join(
    root,
    "extensions/src/mcp-app/tests/first-party/native-save-client.nodecheck.ts",
  ),
]
const program = ts.createProgram(rootFiles, options, host)
const diagnostics = ts.getPreEmitDiagnostics(program)
const log = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: (f) => f,
  getCurrentDirectory: () => root,
  getNewLine: () => "\n",
})
const inputs = program.getSourceFiles().map((f) => ({
  file: f.fileName,
  sha256: createHash("sha256").update(f.text).digest("hex"),
  source: ePinned.has(f.fileName)
    ? "git:" + ePin
    : pinned.has(f.fileName)
      ? "git:" + bPin
      : "actual-input",
}))
fs.writeFileSync(path.join(here, label + ".log"), log, { flag: "wx" })
fs.writeFileSync(
  path.join(here, label + ".json"),
  JSON.stringify(
    {
      compiler: ts.version,
      diagnostics: diagnostics.length,
      rootFiles,
      BPin: bPin,
      realModuleAliasesOnly: true,
      noTypeOrAuthorityShim: true,
      inputs,
      resolutions,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
)
console.log(
  JSON.stringify({
    diagnostics: diagnostics.length,
    inputs: inputs.length,
    BPin: bPin,
  }),
)
process.exitCode = diagnostics.length ? 1 : 0
