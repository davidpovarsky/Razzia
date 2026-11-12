import { defineConfig, mergeConfig, type Plugin } from "vite"
import { fileURLToPath } from "node:url"
import webConfig from "../packages/web/vite.config"

if (process.env.TADAZZ_REMOTE_QA !== "1" || process.platform !== "linux") {
  throw new Error("Isolated remote QA only")
}

let fixtureEntry = "./qa/tds-fixture.tsx"

if (process.env.TDS_FIXTURE === "stage") {
  fixtureEntry = "./qa/tds-stage-fixture.tsx"
} else if (process.env.TDS_FIXTURE === "components") {
  fixtureEntry = "./qa/tds-components-fixture.tsx"
}

const entry = fileURLToPath(new URL(fixtureEntry, import.meta.url))

export default defineConfig(
  mergeConfig(webConfig, {
    root: fileURLToPath(new URL("../packages/web", import.meta.url)),
    plugins: [
      {
        name: "tds-isolated-react-fixture",
        configureServer(server) {
          if (process.env.TDS_FIXTURE !== "stage") {
            return
          }

          // A real HTTP response also verifies the browser's own cookie handling.
          server.middlewares.use((request, response, next) => {
            if (request.url !== "/__tds-credential-probe") {
              return next()
            }

            response.setHeader("Content-Type", "application/json")
            response.setHeader(
              "Set-Cookie",
              "native-probe=must-not-accept; Path=/",
            )
            response.end(
              JSON.stringify({ cookie: request.headers.cookie ?? null }),
            )
          })
        },
        transformIndexHtml: {
          order: "pre",
          handler: (html: string) =>
            html.replace('src="/src/main.tsx"', `src="/@fs/${entry}"`),
        },
      } satisfies Plugin,
    ],
    server: { host: "127.0.0.1", port: 4330, strictPort: true },
  }),
)
