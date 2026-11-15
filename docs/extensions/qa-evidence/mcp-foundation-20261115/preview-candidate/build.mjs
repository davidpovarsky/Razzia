import fs from "node:fs"
import path from "node:path"
import cp from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import { build } from "file:///C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-recovery-fresh-20261115/node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/lib/main.js"
const here = path.dirname(fileURLToPath(import.meta.url)),
  root = process.cwd()
const upstream =
    "C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-integration-20261115",
  pin = "36d0e1d3466c53c0fabb168fb58cd67475588aaa"
const privateRoot = path.resolve(
  here,
  "../consent-boundary/local-overlay-01/extensions/src/mcp-app",
)
const bRoot =
  "C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-recovery-fresh-20261115"
const pkg = JSON.parse(fs.readFileSync(path.join(privateRoot, "package.json"))),
  direct = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
const hash = (b) => createHash("sha256").update(b).digest("hex")
const label = process.argv[2]
if (!/^candidate-\d{2}$/.test(label ?? ""))
  throw Error("Use new immutable label")
const output = path.join(here, label)
fs.mkdirSync(output)
for (const [name, entry, browser] of [
  [
    "producer",
    "extensions/src/mcp-app/tests/first-party/preview-candidate.nodecheck.ts",
    false,
  ],
  [
    "protocol",
    "extensions/src/mcp-app/tests/server/protocol.nodecheck.ts",
    false,
  ],
  ["http", "extensions/src/mcp-app/tests/server/http.nodecheck.ts", false],
  ["consumer", "extensions/src/mcp-app/client/preview-candidate-v2.ts", true],
]) {
  const pinned = new Map()
  const result = await build({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    write: false,
    metafile: true,
    platform: browser ? "browser" : "node",
    format: "esm",
    target: browser ? "es2022" : "node22",
    tsconfig: path.join(upstream, "tsconfig.json"),
    nodePaths: [
      path.join(privateRoot, "node_modules"),
      path.join(upstream, "node_modules"),
      path.join(bRoot, "node_modules"),
    ],
    ...(browser
      ? {}
      : {
          banner: {
            js: 'import {createRequire as __qaRequire} from "node:module"; const require=__qaRequire(import.meta.url);',
          },
        }),
    plugins: [
      {
        name: "exact-reviewed-source",
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, async (args) => {
            if (args.path.startsWith(".")) {
              const absolute = path.resolve(args.resolveDir, args.path),
                core = path.join(root, "extensions/src/core") + path.sep
              if (absolute.toLowerCase().startsWith(core.toLowerCase()))
                return builder.resolve(
                  path.join(upstream, path.relative(root, absolute)),
                  { kind: args.kind, resolveDir: args.resolveDir },
                )
            }
            if (
              !args.pluginData?.direct &&
              direct.some(
                (p) => args.path === p || args.path.startsWith(p + "/"),
              )
            ) {
              const resolved = await builder.resolve(args.path, {
                kind: args.kind,
                resolveDir: privateRoot,
                pluginData: { direct: true },
              })
              return browser
                ? resolved
                : { path: pathToFileURL(resolved.path).href, external: true }
            }
          })
          builder.onLoad({ filter: /\.(ts|tsx|json)$/ }, (args) => {
            const relative = path.relative(upstream, args.path)
            if (
              relative.startsWith("..") ||
              path.isAbsolute(relative) ||
              relative.split(path.sep).includes("node_modules")
            )
              return
            const name = relative.split(path.sep).join("/")
            const bytes = cp.execFileSync("git", ["show", pin + ":" + name])
            pinned.set(path.resolve(args.path).toLowerCase(), { name, bytes })
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
    const full = path.resolve(file),
      p = pinned.get(full.toLowerCase()),
      bytes = p?.bytes ?? fs.readFileSync(full)
    return {
      file: full,
      bytes: bytes.length,
      sha256: hash(bytes),
      source: p ? "git:" + pin + ":" + p.name : "actual-build-bytes",
    }
  })
  if (
    browser &&
    rows.some((r) =>
      /\/first-party\/|\/server\/|account-db|composition-preview-v2\.ts|native-preview-renderer-v2\.ts/.test(
        r.file.replaceAll("\\", "/"),
      ),
    )
  )
    throw Error("Forbidden host source in payload")
  fs.writeFileSync(
    path.join(output, name + ".mjs"),
    result.outputFiles[0].contents,
    { flag: "wx" },
  )
  fs.writeFileSync(
    path.join(output, name + ".inputs.json"),
    JSON.stringify(
      {
        upstreamPin: pin,
        compiler: "esbuild0.28.2",
        browser,
        bundleSha256: hash(result.outputFiles[0].contents),
        inputs: rows,
        warnings: result.warnings,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  )
  console.log(
    JSON.stringify({
      name,
      inputs: rows.length,
      sha256: hash(result.outputFiles[0].contents),
    }),
  )
}
