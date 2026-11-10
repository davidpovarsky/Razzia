import { defineConfig, mergeConfig, type Plugin } from "vite"
import { fileURLToPath } from "node:url"
import { readFileSync, mkdirSync, cpSync } from "node:fs"
import { join, resolve } from "node:path"
import webConfig from "../packages/web/vite.config"

const assets = fileURLToPath(new URL("./site-assets", import.meta.url))
const web = fileURLToPath(new URL("../packages/web", import.meta.url))
const entry = fileURLToPath(
  new URL("./src/site/bootstrap.tsx", import.meta.url),
)
const enabled = process.env.TADAZZ_SITE_ENABLED === "true"

/** Supported Vite composition, never a source/generated-router rewrite. */
const siteComposition = (): Plugin => ({
  name: "tadazz-downstream-site",
  transformIndexHtml: {
    order: "pre",
    handler: (html) =>
      html.replace(
        'src="/src/main.tsx"',
        `src="/@fs/${entry.replaceAll("\\", "/")}"`,
      ),
  },
  configureServer(server) {
    server.middlewares.use("/tadazz-design-reference", (req, res, next) => {
      const filename = (req.url ?? "").split("?")[0].slice(1)

      if (!/^[a-z0-9-]+\.(?:css|webp|svg)$/u.test(filename)) {
        return next()
      }

      try {
        res.setHeader(
          "Content-Type",
          (() => {
            if (filename.endsWith(".css")) {
              return "text/css"
            }

            if (filename.endsWith(".svg")) {
              return "image/svg+xml"
            }

            return "image/webp"
          })(),
        )
        res.end(readFileSync(join(assets, filename)))
      } catch {
        next()
      }
    })
  },
  closeBundle() {
    const target = resolve(web, "dist/tadazz-design-reference")
    mkdirSync(target, { recursive: true })
    cpSync(assets, target, { recursive: true })
  },
})

export default defineConfig(
  mergeConfig(webConfig, {
    root: web,
    plugins: enabled ? [siteComposition()] : [],
    server: { host: "127.0.0.1" },
    preview: { host: "127.0.0.1" },
  }),
)
