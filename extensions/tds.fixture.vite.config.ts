import { defineConfig, mergeConfig } from "vite"
import { fileURLToPath } from "node:url"
import webConfig from "../packages/web/vite.config"

if (process.env.TADAZZ_REMOTE_QA !== "1" || process.platform !== "linux")
  throw new Error("Isolated remote QA only")
const entry = fileURLToPath(new URL("./qa/tds-fixture.tsx", import.meta.url))
export default defineConfig(
  mergeConfig(webConfig, {
    root: fileURLToPath(new URL("../packages/web", import.meta.url)),
    plugins: [
      {
        name: "tds-isolated-react-fixture",
        transformIndexHtml: {
          order: "pre",
          handler: (html: string) =>
            html.replace('src="/src/main.tsx"', `src="/@fs/${entry}"`),
        },
      },
    ],
    server: { host: "127.0.0.1", port: 4330, strictPort: true },
  }),
)
