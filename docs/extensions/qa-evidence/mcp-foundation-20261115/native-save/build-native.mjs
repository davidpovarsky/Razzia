import fs from "node:fs"
import path from "node:path"
import cp from "node:child_process"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { build } from "file:///C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-recovery-fresh-20261115/node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/lib/main.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = cp
  .execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" })
  .trim()
const bRoot =
  "C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-recovery-fresh-20261115"
const bPin = "1909da2f653377c545923b2e91dd2f4b1a2cf802"
const privateRoot = path.resolve(
  here,
  "../consent-boundary/local-overlay-01/extensions/src/mcp-app",
)
const label = process.argv[2] ?? "native-candidate-01"
if (!/^native-candidate-\d{2}$/.test(label))
  throw new Error("Invalid immutable bundle label")
const out = path.join(here, label + ".mjs")
if (fs.existsSync(out)) throw new Error("Preserve prior immutable bundle")
const pinned = new Map()
const directPackages = Object.keys({
  ...JSON.parse(fs.readFileSync(path.join(privateRoot, "package.json")))
    .dependencies,
  ...JSON.parse(fs.readFileSync(path.join(privateRoot, "package.json")))
    .devDependencies,
})
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const result = await build({
  entryPoints: [path.join(here, "native-save-tests.ts")],
  bundle: true,
  write: false,
  metafile: true,
  platform: "node",
  format: "esm",
  target: "node24",
  tsconfig: path.join(bRoot, "tsconfig.json"),
  nodePaths: [
    path.join(privateRoot, "node_modules"),
    path.join(bRoot, "packages/socket/node_modules"),
    path.join(bRoot, "packages/common/node_modules"),
    path.join(bRoot, "node_modules"),
  ],
  banner: {
    js: 'import {createRequire as __nativeFixtureCreateRequire} from "node:module"; const require=__nativeFixtureCreateRequire(import.meta.url);',
  },
  plugins: [
    {
      name: "exact-native-source-and-existing-private-dependencies",
      setup(builder) {
        builder.onResolve({ filter: /^@tadazz\/native-c1-source$/ }, () => ({
          path: path.join(
            bRoot,
            "extensions/src/server/storage/creation-reservation.ts",
          ),
        }))
        builder.onResolve({ filter: /^[^./]/ }, async (args) => {
          if (
            args.pluginData?.directPrivate ||
            !directPackages.some(
              (name) => args.path === name || args.path.startsWith(name + "/"),
            )
          )
            return
          return builder.resolve(args.path, {
            kind: args.kind,
            resolveDir: privateRoot,
            pluginData: { directPrivate: true },
          })
        })
        builder.onLoad({ filter: /\.(ts|tsx|json)$/ }, (args) => {
          const relative = path.relative(bRoot, args.path)
          if (
            relative.startsWith("..") ||
            path.isAbsolute(relative) ||
            relative.split(path.sep).includes("node_modules")
          )
            return
          const name = relative.split(path.sep).join("/")
          const bytes = cp.execFileSync("git", ["show", bPin + ":" + name], {
            cwd: root,
          })
          pinned.set(path.resolve(args.path).toLowerCase(), {
            path: name,
            bytes,
          })
          return {
            contents: bytes,
            loader: args.path.endsWith(".json")
              ? "json"
              : args.path.endsWith(".tsx")
                ? "tsx"
                : "ts",
            resolveDir: path.dirname(args.path),
          }
        })
      },
    },
  ],
})
const rows = Object.keys(result.metafile.inputs).map((file) => {
  const absolute = path.resolve(file)
  const selected = pinned.get(absolute.toLowerCase())
  const bytes = selected?.bytes ?? fs.readFileSync(absolute)
  return {
    file: absolute,
    bytes: bytes.length,
    sha256: hash(bytes),
    source: selected
      ? `git:${bPin}:${selected.path}`
      : "immutable-build-input-bytes",
  }
})
fs.writeFileSync(out, result.outputFiles[0].contents, { flag: "wx" })
fs.writeFileSync(
  path.join(here, label + ".inputs.json"),
  JSON.stringify(
    {
      BPin: bPin,
      compiler: "existing esbuild0.28.2",
      target: "node24",
      platform: "node",
      format: "esm",
      bundleSha256: hash(result.outputFiles[0].contents),
      warnings: result.warnings,
      publicDirectDependenciesFromExistingFrozenQaGraph: true,
      noAuthorityOrSchemaShim: true,
      inputs: rows,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
)
console.log(
  JSON.stringify({
    bundle: out,
    bytes: result.outputFiles[0].contents.length,
    inputs: rows.length,
    sha256: hash(result.outputFiles[0].contents),
  }),
)
