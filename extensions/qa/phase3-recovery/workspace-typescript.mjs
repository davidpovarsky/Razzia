// Test-only Node 24 resolver for the repository's existing tsconfig paths.
// It never changes production imports, bundles, dependency files or aliases.
import { existsSync, readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { resolve } from "node:path"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const { paths } = JSON.parse(
  readFileSync(resolve(root, "tsconfig.json"), "utf8"),
).compilerOptions
registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = null
    for (const [pattern, destinations] of Object.entries(paths)) {
      const star = pattern.indexOf("*")

      if (
        star < 0
          ? specifier === pattern
          : specifier.startsWith(pattern.slice(0, star)) &&
            specifier.endsWith(pattern.slice(star + 1))
      ) {
        const part =
          star < 0
            ? ""
            : specifier.slice(
                star,
                specifier.length - (pattern.length - star - 1),
              )
        target = pathToFileURL(
          resolve(root, destinations[0].replace("*", part)),
        )

        break
      }
    }

    if (
      !target &&
      specifier.startsWith(".") &&
      context.parentURL?.startsWith("file:")
    ) {
      target = new URL(specifier, context.parentURL)
    }

    if (target) {
      if (
        target.pathname.endsWith(".js") &&
        !existsSync(fileURLToPath(target))
      ) {
        target = new URL(`${target.href.slice(0, -3)}.ts`)
      }

      for (const suffix of ["", ".ts", "/index.ts"]) {
        const candidate = new URL(target.href + suffix)

        if (
          existsSync(fileURLToPath(candidate)) &&
          /\.m?[jt]s$/u.test(candidate.pathname)
        ) {
          return nextResolve(candidate.href, context)
        }
      }
    }

    return nextResolve(specifier, context)
  },
})
