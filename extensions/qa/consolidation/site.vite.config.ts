import { defineConfig, mergeConfig } from "vite"
import site from "../../site.vite.config"
import { fileURLToPath } from "node:url"
import { realpathSync } from "node:fs"

const root = fileURLToPath(new URL("../../../", import.meta.url))

// Reuse the existing installed dependency graph without broadening the product
// server policy or admitting another worktree's application sources.
export default defineConfig(
  mergeConfig(site, {
    resolve: { alias: { "@razzia/extensions": `${root}extensions/src` } },
    server: {
      fs: { allow: [root, realpathSync(`${root}node_modules/.pnpm`)] },
    },
  }),
)
