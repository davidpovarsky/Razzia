import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"
import { realpathSync } from "node:fs"
import { sign } from "hono/jwt"

const root = fileURLToPath(new URL("../../../", import.meta.url))

export default defineConfig({
  root: `${root}extensions/qa/theme-builder`,
  publicDir: false,
  cacheDir: `${root}extensions/qa/consolidation/.results/builder-cache`,
  resolve: {
    alias: {
      "@razzia/web": `${root}packages/web/src`,
      "@razzia/common": `${root}packages/common/src`,
      "@razzia/extensions": `${root}extensions/src`,
    },
  },
  server: { fs: { allow: [root, realpathSync(`${root}node_modules/.pnpm`)] } },
  plugins: [
    {
      name: "isolated-account-boundary-fixture",
      async configureServer(server) {
        const token = await sign(
          {
            sub: "synthetic-author-a",
            role: "manager",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 900,
          },
          "synthetic-only-boundary-qa-key",
          "HS256",
        )
        server.middlewares.use((request, response, next) => {
          if (request.url === "/qa/session") {
            response.setHeader("Content-Type", "application/json")
            response.setHeader("Cache-Control", "no-store")
            response.end(JSON.stringify({ token }))
          } else {
            if (request.url === "/") {
              request.url = "/account-boundary.html"
            }

            next()
          }
        })
      },
    },
  ],
})
