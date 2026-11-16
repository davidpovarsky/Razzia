import { defineConfig, mergeConfig, type Plugin } from "vite"
import { fileURLToPath } from "node:url"
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  cpSync,
  writeFileSync,
  existsSync,
} from "node:fs"
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
const siteComposition = (): Plugin => {
  let outputDirectory = resolve(web, "dist")

  return {
    name: "tadazz-downstream-site",
    enforce: "pre",
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir)
    },
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
      handler: (html: string) => ({
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

        if (!/^[a-z0-9-]+\.(?:css|webp|svg|png)$/u.test(filename)) {
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

              if (filename.endsWith(".png")) {
                return "image/png"
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
      const target = resolve(outputDirectory, "tadazz-design-reference")
      mkdirSync(target, { recursive: true })
      cpSync(assets, target, { recursive: true })
      const buildPath = fileURLToPath(
        new URL(
          "./src/core/show-library/application-preview-build.json",
          import.meta.url,
        ),
      )

      if (!existsSync(buildPath)) {
        return
      }

      const preview = JSON.parse(readFileSync(buildPath, "utf8")) as {
        available: boolean
        files: Array<{ name: string; bytes: number; sha256: string }>
      }

      if (!preview.available) {
        return
      }

      const runtime = fileURLToPath(
        new URL("./dist/application-preview/", import.meta.url),
      )
      const destination = resolve(outputDirectory, "tadazz-application-runtime")
      mkdirSync(destination, { recursive: true })
      for (const name of ["renderer.mjs", "renderer.css"]) {
        const expected = preview.files.find((file) => file.name === name)
        const bytes = readFileSync(join(runtime, name))

        if (
          !expected ||
          bytes.length !== expected.bytes ||
          createHash("sha256").update(bytes).digest("hex") !== expected.sha256
        ) {
          throw new Error("Application preview build changed before packaging")
        }

        writeFileSync(join(destination, name), bytes)
      }
    },
  }
}

export default defineConfig(
  mergeConfig(webConfig, {
    root: web,
    plugins: enabled
      ? [
          siteComposition(),
          {
            name: "tadazz-small-browser-icon",
            transformIndexHtml: {
              order: "post",
              handler: (html: string) =>
                html.replace(
                  'href="/tadazz-favicon-z-20261108.png"',
                  'href="/tadazz-design-reference/favicon-z-64-20261110.png"',
                ),
            },
          },
        ]
      : [],
    server: { host: "127.0.0.1" },
    preview: { host: "127.0.0.1" },
  }),
)
