/* oxlint-disable no-await-in-loop -- Builds are intentionally sequential to bound decoder/compiler memory. */
/* oxlint-disable typescript/no-non-null-assertion -- The immutable inventory is verified before indexed file and entry lookups. */
/** Trusted toolchain worker. Run ONLY inside the operator's networkless sandbox. */
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import {
  inspectPackage,
  packageSha,
  packageThemeDefinitions,
  packageMediaName,
} from "../src/server/packages/index"
import { relativePackagePath } from "../src/core/packages/paths"
import { probePackageMedia } from "./package-media-probe"
import { parse } from "@babel/parser"

if (process.env.TADAZZ_BUILD_SANDBOX !== "1" || process.platform !== "linux") {
  throw new Error("Isolated Linux build sandbox required")
}

const [input, output] = process.argv.slice(2)

if (!input || !output) {
  throw new Error("package-builder.ts SOURCE.tadazz OUTPUT_DIRECTORY")
}

const root = path.resolve(import.meta.dirname, "../..")
const req = createRequire(path.join(root, "packages/web/package.json"))
const toolReq = createRequire(req.resolve("vite"))
// Pinned by the platform lockfile, never resolved from package contents.
const esbuild = toolReq("esbuild") as typeof import("esbuild")

if (esbuild.version !== "0.28.2") {
  throw new Error("Pinned esbuild 0.28.2 required")
}

const bytes = fs.readFileSync(input)
const { pkg } = inspectPackage(bytes)
const sdk = path.join(
  root,
  "extensions/src/presentation/package-runtime/sdk.tsx",
)
const bundle: Record<
  string,
  { js: string; css: string; assets: Record<string, string> }
> = {}
const mime: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  woff2: "font/woff2",
  json: "application/json",
  lottie: "application/zip",
}

try {
  probePackageMedia(pkg)
  for (const theme of packageThemeDefinitions(pkg).filter((d) => d.sandbox)) {
    const { entry } = theme.sandbox!
    const assets: Record<string, string> = {}
    const requested = new Set(theme.sandbox!.assetPaths ?? [])
    for (const reference of requested) {
      if (
        !pkg.manifest.files.some(
          (f) =>
            f.path === reference &&
            ["image", "font", "lottie"].includes(f.kind),
        )
      ) {
        throw new Error("Unapproved SDK asset")
      }
    }
    for (const file of pkg.manifest.files.filter(
      (f) =>
        ["image", "font", "lottie"].includes(f.kind) &&
        (requested.has(f.path) ||
          theme.assets.some(
            (a) => a.url === `/media/${packageMediaName(pkg, f.path)}`,
          )),
    )) {
      const type = mime[file.path.split(".").at(-1)!]

      if (!type) {
        throw new Error("Unsupported sandbox embedded asset")
      }

      assets[file.path] =
        `data:${type};base64,${pkg.files.get(file.path)!.toString("base64")}`
    }
    const result = await esbuild.build({
      stdin: {
        contents: `import {mount} from ${JSON.stringify(sdk)}; import Theme from "tadazz-entry"; mount(Theme, ${JSON.stringify(assets)});`,
        resolveDir: root,
        sourcefile: "tadazz-bootstrap.tsx",
        loader: "tsx",
      },
      bundle: true,
      platform: "browser",
      format: "iife",
      write: false,
      target: ["chrome120", "safari17"],
      jsx: "automatic",
      minify: true,
      define: { "process.env.NODE_ENV": '"production"' },
      legalComments: "inline",
      charset: "ascii",
      outdir: "/tmp/tadazz-build",
      plugins: [
        {
          name: "tadazz-package-boundary",
          setup(build) {
            build.onResolve({ filter: /^tadazz-entry$/ }, () => ({
              path: entry,
              namespace: "tadazz",
            }))
            build.onResolve({ filter: /.*/, namespace: "tadazz" }, (args) => {
              if (
                ["react", "react/jsx-runtime", "react-dom/client"].includes(
                  args.path,
                )
              ) {
                return { path: req.resolve(args.path) }
              }

              if (args.path === "@tadazz/theme-sdk") {
                return { path: sdk }
              }

              if (!args.path.startsWith(".")) {
                throw new Error(`Dependency not allowed: ${args.path}`)
              }

              const resolved = relativePackagePath(args.importer, args.path)
              const file = [
                resolved,
                `${resolved}.tsx`,
                `${resolved}.ts`,
                `${resolved}/index.tsx`,
              ].find((f) => pkg.files.has(f))

              if (!file) {
                throw new Error(`Missing import: ${resolved}`)
              }

              return { path: file, namespace: "tadazz" }
            })
            build.onLoad({ filter: /.*/, namespace: "tadazz" }, (args) => {
              const file = pkg.manifest.files.find((f) => f.path === args.path)!
              const contents = pkg.files.get(args.path)!

              if (file.kind === "source") {
                const ast = parse(contents.toString("utf8"), {
                  sourceType: "module",
                  plugins: ["typescript", "jsx"],
                  createImportExpressions: true,
                })
                const inspect = (value: unknown) => {
                  if (Array.isArray(value)) {
                    value.forEach(inspect)

                    return
                  }

                  if (!value || typeof value !== "object") {
                    return
                  }

                  const node = value as Record<string, unknown>

                  if (
                    node.type === "ImportExpression" &&
                    (node.source as { type?: string } | undefined)?.type !==
                      "StringLiteral"
                  ) {
                    throw new Error("Dynamic dependency not allowed")
                  }

                  const callee = node.callee as
                    { type?: string; name?: string } | undefined

                  if (
                    node.type === "CallExpression" &&
                    callee?.type === "Identifier" &&
                    callee.name === "require"
                  ) {
                    throw new Error("Node require not allowed")
                  }

                  Object.values(node).forEach(inspect)
                }
                inspect(ast)

                return {
                  contents,
                  loader: args.path.endsWith("x") ? "tsx" : "ts",
                }
              }

              if (file.kind === "style") {
                if (
                  /<\/style|@import|expression\s*\(|-moz-binding/iu.test(
                    contents.toString(),
                  )
                ) {
                  throw new Error("Unsupported CSS")
                }

                return { contents, loader: "css" }
              }

              if (["image", "font"].includes(file.kind)) {
                return { contents, loader: "dataurl" }
              }

              throw new Error("Import kind not allowed")
            })
          },
        },
      ],
    })
    const js =
      result.outputFiles.find((f) => f.path.endsWith(".js"))?.text ?? ""
    const css =
      result.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? ""

    if (
      !js ||
      js.length + css.length > 3_000_000 ||
      /<\/script/iu.test(js) ||
      /<\/style/iu.test(css)
    ) {
      throw new Error("Build output budget/HTML boundary")
    }

    bundle[theme.id] = { js, css, assets }
  }
  const data = Buffer.from(JSON.stringify(bundle))

  if (data.length > 8_000_000) {
    throw new Error("Build total budget")
  }

  fs.writeFileSync(path.join(output, "bundle.json"), data)
  fs.writeFileSync(
    path.join(output, "result.json"),
    JSON.stringify({
      sourceDigest: packageSha(bytes),
      outputDigest: packageSha(data),
      mediaValidated: true,
      toolchain: "esbuild@0.28.2;react@19.3.0;ffmpeg@5.1.9",
    }),
  )
} catch (error) {
  console.error(
    "TADAZZ_BUILD_REJECTED",
    error instanceof Error ? error.message.slice(0, 500) : "Invalid build",
  )
  fs.writeFileSync(
    path.join(output, "result.json"),
    JSON.stringify({
      sourceDigest: packageSha(bytes),
      error: "BUILD_REJECTED",
    }),
  )
  process.exitCode = 1
}
