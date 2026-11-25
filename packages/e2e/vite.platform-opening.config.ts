import fs from "node:fs"
import { join, resolve } from "node:path"
import config from "../web/vite.config"

const root = resolve(import.meta.dirname, "../..")
const store = join(root, "node_modules/.pnpm")

export default {
  ...config,
  server: {
    ...config.server,
    fs: {
      allow: [root, ...(fs.existsSync(store) ? [fs.realpathSync(store)] : [])],
    },
  },
}
