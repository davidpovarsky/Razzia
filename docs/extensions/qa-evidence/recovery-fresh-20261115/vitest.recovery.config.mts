import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Reuse installed dependencies only. All application aliases point to this tree.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const reference = "C:/Users/DAVID/Code/Razzia-worktrees/tadazz-design-system-20261110"
const installed = createRequire(`${reference}/extensions/package.json`)
const lottie = createRequire(installed.resolve("@lottiefiles/dotlottie-react"))
const aliases = Object.fromEntries(["zod", "uuid", "http-status-codes", "hono", "@hono/zod-validator"].map((name) => [name, installed.resolve(name)]))
export default {
  root: path.join(root, "extensions"),
  cacheDir: path.join(root, "docs/extensions/qa-evidence/recovery-fresh-20261115/.vite-cache"),
  resolve: { alias: {
    ...aliases,
    vitest: path.join(path.dirname(installed.resolve("vitest/package.json")), "dist/index.js"),
    "@razzia/common": path.join(root, "packages/common/src"),
    "@razzia/extensions": path.join(root, "extensions/src"),
  } },
  test: {
    include: ["src/server/storage/journal-recovery.test.ts", "src/server/media-library-recovery.test.ts", "src/server/storage/create-recovery.test.ts", "src/server/storage.test.ts", "src/server/media-library.test.ts"],
    maxWorkers: 1,
    fileParallelism: false,
    isolate: true,
    testTimeout: 15000,
    env: { TADAZZ_DOTLOTTIE_WASM_PATH: path.join(path.dirname(lottie.resolve("@lottiefiles/dotlottie-web")), "dotlottie-player.wasm") },
  },
}
