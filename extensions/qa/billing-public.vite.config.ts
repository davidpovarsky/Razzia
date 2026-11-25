// Isolated local browser verification, preserving the production site composition.
import { mergeConfig } from "vite"
import { realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"
import siteConfig from "../site.vite.config"

const root = fileURLToPath(new URL("../../", import.meta.url))
const dependencies = realpathSync(`${root}node_modules/.pnpm`)
const rubik = realpathSync(
  `${root}packages/web/node_modules/@fontsource-variable/rubik`,
)

export default mergeConfig(siteConfig, {
  server: {
    fs: { allow: [root, dependencies, rubik] },
  },
})
