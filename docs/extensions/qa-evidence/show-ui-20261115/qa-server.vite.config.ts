// Build only the isolated QA host; never imported into renderer payload.
import { fileURLToPath } from "node:url"
import { defineConfig } from "../../../../extensions/node_modules/vite/dist/node/index.js"

export default defineConfig({
  root: "/work/extensions",
  publicDir: false,
  envDir: false,
  resolve: { tsconfigPaths: true },
  ssr: { noExternal: true },
  build: {
    ssr: fileURLToPath(new URL("./qa-fixture-server.ts", import.meta.url)),
    outDir: "/out/harness-server-build",
    emptyOutDir: false,
    target: "node24",
  },
})
