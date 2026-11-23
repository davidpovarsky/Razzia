// Dependency-free Node 24 loader for scoped tests of local TypeScript modules.
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import { fileURLToPath } from "node:url"

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const target = new URL(specifier, context.parentURL)
      for (const suffix of [".ts", "/index.ts"]) {
        const candidate = new URL(target.href + suffix)

        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context)
        }
      }
    }

    return nextResolve(specifier, context)
  },
})
