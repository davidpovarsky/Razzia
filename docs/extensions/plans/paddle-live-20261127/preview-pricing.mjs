import { createRequire } from "node:module"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const [repo, deps, evidence, scope = "pricing"] = process.argv.slice(2)

if (!repo || !deps || !evidence) {
  throw new Error(
    "Usage: node preview-pricing.mjs <repo> <dependencies> <evidence>",
  )
}

const require = createRequire(path.join(deps, "extensions/package.json"))
const { createServer } = await import(require.resolve("vite"))
fs.mkdirSync(evidence, { recursive: true })
const offers = [
  { participants: 20, amountMinor: 7200 },
  { participants: 50, amountMinor: 10000 },
  { participants: 100, amountMinor: 12800 },
  { participants: 250, amountMinor: 20000 },
]
const catalog = {
  enabled: false,
  configured: false,
  pricingPublished: true,
  environment: "live",
  currencies: ["GBP"],
  plans: offers.map(({ participants, amountMinor }) => ({
    id: `single-${participants}`,
    version: 1,
    kind: "single",
    participants,
    games: 1,
    phoneMinutes: 0,
    prices: [{ currency: "GBP", amountMinor }],
  })),
}
const marketing = execFileSync(
  "git",
  ["-C", repo, "show", "HEAD:extensions/site-assets/marketing.css"],
  { encoding: "utf8" },
)
fs.writeFileSync(path.join(evidence, "marketing.css"), marketing)
const rootPath = JSON.stringify(repo)
const harness = `
import { createRoot } from "react-dom/client"
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router"
import { Pricing } from ${JSON.stringify(path.join(repo, "extensions/src/site/web/marketing/Pricing.tsx"))}
import { ReferenceCanvas } from ${JSON.stringify(path.join(repo, "extensions/src/site/web/shared/ReferenceCanvas.tsx"))}
import styles from "./marketing.css?inline"
function Preview() {
  return <ReferenceCanvas variant="marketing" styles={styles}><Pricing custom={() => {}} /></ReferenceCanvas>
}
const rootRoute = createRootRoute({ component: Outlet })
const index = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Preview })
const router = createRouter({ routeTree: rootRoute.addChildren([index]) })
createRoot(document.getElementById("root")).render(<RouterProvider router={router} />)
`
const siteHarness = `
import { createRoot } from "react-dom/client"
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider, useRouterState } from "@tanstack/react-router"
import { useEffect } from "react"
import { MarketingSite } from ${JSON.stringify(path.join(repo, "extensions/src/site/web/marketing/MarketingSite.tsx"))}
import { resolveSiteMetadata } from ${JSON.stringify(path.join(repo, "extensions/src/site/web/shared/site-metadata-policy.ts"))}
function Preview() {
  const search = useRouterState({select: state => state.location.searchStr})
  const metadata = resolveSiteMetadata({pathname:"/", search, origin:window.location.origin, products:[]})
  useEffect(() => {
    document.title = metadata.titleKey + " | Tadazz"
    document.querySelector('link[rel="canonical"]')?.setAttribute("href",metadata.canonical)
  },[metadata.titleKey,metadata.canonical])
  return <MarketingSite />
}
const rootRoute = createRootRoute({ component: Outlet })
const index = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Preview, validateSearch: search => search })
const router = createRouter({ routeTree: rootRoute.addChildren([index]) })
createRoot(document.getElementById("root")).render(<RouterProvider router={router} />)
`

if (!["pricing", "site"].includes(scope)) {
  throw new Error("Preview scope must be pricing or site")
}

fs.writeFileSync(
  path.join(evidence, "harness.tsx"),
  scope === "site" ? siteHarness : harness,
)
const font = path.join(
  deps,
  "extensions/node_modules/@fontsource-variable/rubik/files/rubik-latin-wght-normal.woff2",
)
fs.writeFileSync(
  path.join(evidence, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="/"><title>Tadazz preview — checkout closed</title><style>@font-face{font-family:Rubik;src:url(/@fs/${font}) format("woff2");font-weight:300 900}body{margin:0;background:#090616;font-family:Rubik,Arial,sans-serif}</style></head><body><div id="root"></div><script type="module" src="/harness.tsx"></script></body></html>`,
)
const server = await createServer({
  configFile: false,
  root: evidence,
  cacheDir: path.join(evidence, "browser-vite-cache"),
  resolve: {
    alias: {
      "@razzia/extensions/platform-ui": path.join(
        repo,
        "extensions/src/platform-ui/index.ts",
      ),
      "@razzia/extensions": path.join(repo, "extensions/src"),
      "@razzia/web": path.join(repo, "packages/web/src"),
      "@razzia/common": path.join(repo, "packages/common/src"),
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom/client",
      "@tanstack/react-router",
      "react-i18next",
      "i18next",
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 38819,
    strictPort: true,
    fs: { allow: [repo, deps, evidence] },
  },
  plugins: [
    {
      name: "synthetic-pricing-response",
      configureServer(instance) {
        instance.middlewares.use("/api/billing/catalog", (_req, res) => {
          res.setHeader("Content-Type", "application/json")
          res.setHeader("Cache-Control", "no-store")
          res.end(JSON.stringify(catalog))
        })
      },
    },
  ],
})
await server.listen()
const files = [
  "extensions/src/core/billing/contracts.ts",
  "extensions/src/server/billing/config.ts",
  "extensions/src/server/billing/public-catalog.ts",
  "extensions/src/site/web/marketing/Pricing.tsx",
  "extensions/src/site/web/marketing/legal-policies.public.ts",
]
fs.writeFileSync(
  path.join(evidence, "browser-source.json"),
  JSON.stringify(
    {
      scope:
        "Actual Pricing, translations, platform components and router with a synthetic catalog; no production configuration or payments.",
      base: execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      files: Object.fromEntries(
        files.map((file) => [
          file,
          createHash("sha256")
            .update(fs.readFileSync(path.join(repo, file)))
            .digest("hex"),
        ]),
      ),
      port: 38819,
      pid: process.pid,
      root: JSON.parse(rootPath),
    },
    null,
    2,
  ),
)
console.log(
  JSON.stringify({
    url: "http://127.0.0.1:38819",
    scope: "Synthetic catalog, actual Pricing component, no payments",
  }),
)
process.once("SIGTERM", async () => {
  await server.close()
  process.exit(0)
})
process.once("SIGINT", async () => {
  await server.close()
  process.exit(0)
})
