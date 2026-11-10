import { defineConfig, mergeConfig, type Plugin } from "vite"
import { fileURLToPath } from "node:url"
import { readFileSync, readdirSync, mkdirSync, cpSync } from "node:fs"
import { createHash } from "node:crypto"
import { join, resolve } from "node:path"
import webConfig from "../packages/web/vite.config"

const assets = fileURLToPath(new URL("./site-assets", import.meta.url))
const web = fileURLToPath(new URL("../packages/web", import.meta.url))
const entry = fileURLToPath(
  new URL("./src/site/bootstrap.tsx", import.meta.url),
)
const enabled = process.env.TADAZZ_SITE_ENABLED === "true"
const referenceImages = new Map(
  readdirSync(assets)
    .filter((name) => name.endsWith(".webp"))
    .map((name) => [
      createHash("sha256")
        .update(readFileSync(join(assets, name)))
        .digest("hex"),
      `/tadazz-design-reference/${name}`,
    ]),
)

/** Supported Vite composition, never a source/generated-router rewrite. */
const siteComposition = (): Plugin => ({
  name: "tadazz-downstream-site",
  enforce: "pre",
  transform(code, id) {
    if (
      id.split("?")[0].replaceAll("\\", "/") !==
      join(assets, "studio.css").replaceAll("\\", "/")
    ) {
      return
    }

    // The immutable reference repeats ~1.9 MB of base64 images that already
    // exist byte-for-byte in site-assets. Production uses those same files.
    return code.replace(
      /data:image\/webp;base64,([A-Za-z0-9+/=]+)/gu,
      (original, base64: string) =>
        referenceImages.get(
          createHash("sha256")
            .update(Buffer.from(base64, "base64"))
            .digest("hex"),
        ) ?? original,
    )
  },
  transformIndexHtml: {
    order: "pre",
    handler: (html) => ({
      html: html.replace(
        'src="/src/main.tsx"',
        `src="/@fs/${entry.replaceAll("\\", "/")}"`,
      ),
      tags: [
        {
          tag: "link",
          attrs: {
            rel: "preload",
            as: "font",
            type: "font/woff2",
            crossorigin: "anonymous",
            href: "/node_modules/@fontsource-variable/rubik/files/rubik-latin-wght-normal.woff2",
          },
          injectTo: "head",
        },
      ],
    }),
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
