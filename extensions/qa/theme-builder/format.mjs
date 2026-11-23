// QA-only formatter output. Never writes through the read-only source mounts.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname } from "node:path"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
const require = createRequire("/work/extensions/package.json")
const { parse } = require("@babel/parser")
const manifest = JSON.parse(readFileSync("/out/source-sha256.json", "utf8"))
const files = Object.keys(manifest)
  .filter(
    (path) =>
      /\.(tsx?|mjs|css)$/u.test(path) &&
      !path.startsWith("extensions/src/core/") &&
      !path.endsWith("/session.ts"),
  )
  .filter((path) => !/\/(PreviewPanel|PreviewControls)\.tsx$/u.test(path))
const settings = JSON.parse(readFileSync("/work/.prettierrc.json", "utf8"))
settings.plugins = [
  "/work/node_modules/.pnpm/prettier-plugin-tailwindcss@0.8.1_prettier@3.9.10/node_modules/prettier-plugin-tailwindcss/dist/index.mjs",
]
writeFileSync("/out/prettier.json", JSON.stringify(settings))
const clean = (value) => {
  if (Array.isArray(value)) {
    return value.map(clean)
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
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
  }

  return value
}
const receipts = []
const sourceRoot = process.env.TADAZZ_FORMAT_SOURCE_ROOT ?? "/work"
for (const path of files) {
  if (
    existsSync("/out/format-scope.json") &&
    !JSON.parse(readFileSync("/out/format-scope.json", "utf8")).includes(path)
  ) {
    continue
  }

  const before = readFileSync(`${sourceRoot}/${path}`, "utf8")
  const result = spawnSync(
    process.execPath,
    [
      "/work/node_modules/.pnpm/prettier@3.9.10/node_modules/prettier/bin/prettier.cjs",
      "--config",
      "/out/prettier.json",
      "--stdin-filepath",
      `/work/${path}`,
    ],
    { input: before, encoding: "utf8" },
  )

  if (result.status !== 0) {
    throw new Error(`Formatter failed: ${path}: ${result.stderr}`)
  }

  const plugins = path.endsWith(".mjs") ? [] : ["typescript", "jsx"]
  // Tailwind class order is the only permitted semantic string change.
  const ast = (source) =>
    JSON.stringify(clean(parse(source, { sourceType: "module", plugins })))
  const sameAst = path.endsWith(".css")
    ? null
    : ast(before) === ast(result.stdout)
  // Any class-order change is reported for review, not asserted equivalent.
  const output = `/out/formatted/${path}`
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, result.stdout)
  receipts.push({ path, sameAst, changed: before !== result.stdout })
}
writeFileSync("/out/format-receipts.json", JSON.stringify(receipts, null, 2))
