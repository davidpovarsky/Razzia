import { createRequire } from "node:module"
import { readFileSync, existsSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
const require = createRequire("/work/extensions/package.json")
function packageInfo(name, lookup = require) {
  try {
    let path
    try {
      path = lookup.resolve(`${name}/package.json`)
    } catch {
      let directory = dirname(lookup.resolve(name))
      for (let depth = 0; depth < 12; depth++) {
        const candidate = join(directory, "package.json")
        if (
          existsSync(candidate) &&
          JSON.parse(readFileSync(candidate, "utf8")).name === name
        ) {
          path = candidate
          break
        }
        directory = dirname(directory)
      }
    }
    if (!path) return { name, status: "not-resolved" }
    const value = JSON.parse(readFileSync(path, "utf8"))
    return { name, version: value.version, packageJson: path }
  } catch (error) {
    return { name, status: "not-resolved", code: error.code }
  }
}
const vite = packageInfo("vite")
const packages = [
  "vite",
  "typescript",
  "react",
  "react-dom",
  "zod",
  "@babel/parser",
  "esbuild",
  "playwright",
].map((name) => packageInfo(name))
if (vite.packageJson)
  packages.push(packageInfo("rolldown", createRequire(vite.packageJson)))
writeFileSync(
  "/out/runtime-toolchain.json",
  JSON.stringify(
    {
      node: process.versions,
      arch: process.arch,
      platform: process.platform,
      packages,
      rendererBuild: {
        cwd: "/work/extensions",
        argv: [
          "node",
          "node_modules/vite/bin/vite.js",
          "build",
          "--config",
          "../docs/extensions/qa-evidence/show-ui-20261115/qa-native-receipt.vite.config.ts",
          "--configLoader",
          "native",
          "--outDir",
          "/out/native-candidate",
        ],
      },
    },
    null,
    2,
  ),
)
