import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
import http from "node:http"
import { execFileSync } from "node:child_process"

const [repo, deps, evidence] = process.argv.slice(2)

if (!repo || !deps || !evidence) {
  throw new Error(
    "Usage: node verify-policy-browser.mjs <repo> <dependency-repo> <evidence>",
  )
}

const require = createRequire(path.join(deps, "extensions", "package.json"))
const { build } = require("esbuild")
process.env.PLAYWRIGHT_BROWSERS_PATH =
  "/mnt/development/tooling/tadazz/ms-playwright"
process.env.TMPDIR = path.join(evidence, "browser-tmp")
fs.mkdirSync(process.env.TMPDIR, { recursive: true })
const { chromium, expect } = require("@playwright/test")
fs.mkdirSync(evidence, { recursive: true })
const css = execFileSync(
  "git",
  ["-C", repo, "show", "HEAD:extensions/site-assets/marketing.css"],
  { encoding: "utf8" },
)
fs.writeFileSync(path.join(evidence, "marketing.css"), css)
const harness =
  'import { createRoot } from "react-dom/client"\nimport { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useRouterState } from "@tanstack/react-router"\nimport { useEffect } from "react"\nimport { LegalPolicyLinks, LegalPolicyPage } from "__POLICY_REPO__/extensions/src/site/web/marketing/LegalPolicies.tsx"\nimport { validateLegalPolicies, resolveLegalPolicy } from "__POLICY_REPO__/extensions/src/site/web/marketing/legal-policies.ts"\nimport { publishedLegalPolicies } from "__POLICY_REPO__/extensions/src/site/web/marketing/legal-policies.public.ts"\nimport { resolveSiteMetadata } from "__POLICY_REPO__/extensions/src/site/web/shared/site-metadata-policy.ts"\nimport { ReferenceCanvas } from "__POLICY_REPO__/extensions/src/site/web/shared/ReferenceCanvas.tsx"\nimport marketing from "./marketing.css?inline"\nconst fixture = {"status":"approved","version":"synthetic-browser-fixture-1","effectiveDate":"2026-11-24","approvedAt":"2026-11-24T00:00:00Z","approvedBy":"Synthetic test approver","locale":"en","seller":{"name":"Synthetic test seller — not Tadazz\'s legal identity","address":"Synthetic address for layout acceptance only","contactEmail":"support@example.invalid"},"documents":{"terms":{"title":"Terms and conditions","sections":[{"id":"about","heading":"About this acceptance fixture","paragraphs":["This is synthetic text used only to verify the policy component. It is not an adopted commercial or legal policy.","The component displays the complete approved text without interpreting HTML. Literal text such as <img src=x onerror=alert(1)> remains readable text."]},{"id":"readability","heading":"Readable on a phone and a larger screen","paragraphs":["This paragraph deliberately provides enough text to exercise wrapping, readable spacing and the boundaries of the content column. Terms must remain accessible when the surrounding site is displayed in another language, and links must keep their normal browser behavior."],"bullets":["A real link can be opened directly, copied or revisited.","A long reference like sample.reference.abcdefghijklmnopqrstuvwxyz.abcdefghijklmnopqrstuvwxyz.abcdefghijklmnopqrstuvwxyz.example.invalid must wrap within the content column."]}]},"privacy":{"title":"Privacy policy","sections":[{"id":"about","heading":"About this acceptance fixture","paragraphs":["This is synthetic text used only to verify the policy component. It is not an adopted commercial or legal policy.","The component displays the complete approved text without interpreting HTML. Literal text such as <img src=x onerror=alert(1)> remains readable text."]},{"id":"readability","heading":"Readable on a phone and a larger screen","paragraphs":["This paragraph deliberately provides enough text to exercise wrapping, readable spacing and the boundaries of the content column. Terms must remain accessible when the surrounding site is displayed in another language, and links must keep their normal browser behavior."],"bullets":["A real link can be opened directly, copied or revisited.","A long reference like sample.reference.abcdefghijklmnopqrstuvwxyz.abcdefghijklmnopqrstuvwxyz.abcdefghijklmnopqrstuvwxyz.example.invalid must wrap within the content column."]}]},"refunds":{"title":"Refund policy","sections":[{"id":"about","heading":"About this acceptance fixture","paragraphs":["This is synthetic text used only to verify the policy component. It is not an adopted commercial or legal policy.","The component displays the complete approved text without interpreting HTML. Literal text such as <img src=x onerror=alert(1)> remains readable text."]},{"id":"readability","heading":"Readable on a phone and a larger screen","paragraphs":["This paragraph deliberately provides enough text to exercise wrapping, readable spacing and the boundaries of the content column. Terms must remain accessible when the surrounding site is displayed in another language, and links must keep their normal browser behavior."],"bullets":["A real link can be opened directly, copied or revisited.","A long reference like sample.reference.abcdefghijklmnopqrstuvwxyz.abcdefghijklmnopqrstuvwxyz.abcdefghijklmnopqrstuvwxyz.example.invalid must wrap within the content column."]}]}}}\nfunction Harness() {\n  const search = useRouterState({select: (state) => state.location.searchStr})\n  const params = new URLSearchParams(search)\n  const policies = params.has("unpublished") ? publishedLegalPolicies : validateLegalPolicies(fixture).published\n  const view = resolveLegalPolicy(params.get("view"), policies)\n  const metadata = resolveSiteMetadata({pathname:"/",search,origin:window.location.origin,products:[],legalPolicies:policies})\n  useEffect(() => {\n    document.title = metadata.isHome ? "Fixture home" : metadata.titleKey + " | Tadazz"\n    const canonical = document.querySelector(\'link[rel="canonical"]\')\n    canonical?.setAttribute("href", metadata.canonical)\n  },[metadata.titleKey,metadata.canonical,metadata.isHome])\n  return <ReferenceCanvas variant="marketing" styles={marketing}>\n    <p className="wrap" style={{paddingBlock:16,color:"#e8e2ee"}}>Synthetic acceptance fixture — not published business policies</p>\n    <main>{view && policies ? <LegalPolicyPage policies={policies} kind={view} /> : <section className="section wrap"><h1 className="h1">Fixture home</h1></section>}</main>\n    <footer className="site-footer"><div className="wrap footer-inner"><p>Tadazz</p><LegalPolicyLinks policies={policies}/></div></footer>\n  </ReferenceCanvas>\n}\nconst rootRoute = createRootRoute({component: Outlet})\nconst route = createRoute({getParentRoute:()=>rootRoute,path:"/",component:Harness,validateSearch:(search)=>search})\nconst router = createRouter({routeTree:rootRoute.addChildren([route])})\ncreateRoot(document.getElementById("root")!).render(<RouterProvider router={router}/>)\n'.replaceAll(
    "__POLICY_REPO__",
    repo,
  )
fs.writeFileSync(path.join(evidence, "browser-harness.tsx"), harness)
await build({
  entryPoints: [path.join(evidence, "browser-harness.tsx")],
  outfile: path.join(evidence, "browser-harness.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  target: "es2022",
  tsconfig: path.join(repo, "extensions/tsconfig.json"),
  nodePaths: [path.join(deps, "extensions/node_modules")],
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "inline-css",
      setup(builder) {
        builder.onResolve({ filter: /\.css\?inline$/ }, (args) => ({
          path: path.resolve(
            args.resolveDir,
            args.path.replace(/\?inline$/, ""),
          ),
          namespace: "inline-css",
        }))
        builder.onLoad({ filter: /.*/, namespace: "inline-css" }, (args) => ({
          contents: `export default ${JSON.stringify(fs.readFileSync(args.path, "utf8"))}`,
          loader: "js",
        }))
      },
    },
  ],
})
const font = path.join(
  deps,
  "extensions/node_modules/@fontsource-variable/rubik/files/rubik-latin-wght-normal.woff2",
)
const html =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="canonical" href="/"><style>@font-face{font-family:Rubik;src:url(/rubik.woff2) format("woff2");font-weight:300 900}body{margin:0;background:#090616;font-family:Rubik,Arial,sans-serif}</style></head><body><div id="root"></div><script type="module" src="/browser-harness.js"></script></body></html>'
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost")

  if (url.pathname === "/browser-harness.js") {
    res.setHeader("Content-Type", "text/javascript")
    res.end(fs.readFileSync(path.join(evidence, "browser-harness.js")))

    return
  }

  if (url.pathname === "/rubik.woff2") {
    res.setHeader("Content-Type", "font/woff2")
    res.end(fs.readFileSync(font))

    return
  }

  if (url.pathname === "/favicon.ico") {
    res.writeHead(204)
    res.end()

    return
  }

  res.setHeader("Content-Type", "text/html")
  res.end(html)
})
await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", resolve)
})
const origin = `http://127.0.0.1:${server.address().port}`
const errors = []
const results = []
let browser = null

try {
  browser = await chromium.launch({ headless: true })

  const verifyViewport = async (viewport) => {
    const page = await browser.newPage({ viewport })
    page.on("pageerror", (e) => errors.push(e.message))
    await page.goto(`${origin}/?view=terms`)
    await expect(
      page.getByRole("heading", { name: "Terms and conditions", exact: true }),
    ).toBeVisible()
    await expect(page.locator("article")).toHaveAttribute("lang", "en")
    await expect(page.locator("article")).toHaveAttribute("dir", "ltr")
    await expect(page.locator("article img")).toHaveCount(0)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )

    if (overflow) {
      throw new Error(`Horizontal overflow at ${viewport.width}`)
    }

    const stamp = await page.evaluate(() => performance.timeOrigin)
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Privacy policy", exact: true })
      .click()
    await expect(
      page.getByRole("heading", { name: "Privacy policy", exact: true }),
    ).toBeVisible()

    if ((await page.evaluate(() => performance.timeOrigin)) !== stamp) {
      throw new Error("Footer link reloaded document")
    }

    await expect(page).toHaveTitle("Privacy policy | Tadazz")
    await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
      "href",
      `${origin}/?view=privacy`,
    )
    await page.goBack()
    await expect(
      page.getByRole("heading", { name: "Terms and conditions", exact: true }),
    ).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole("heading", { name: "Terms and conditions", exact: true }),
    ).toBeVisible()
    await page.screenshot({
      path: path.join(evidence, `terms-${viewport.width}.png`),
      fullPage: true,
    })
    await page.goto(`${origin}/?view=refunds`)
    await expect(
      page.getByRole("heading", { name: "Refund policy", exact: true }),
    ).toBeVisible()
    await page.evaluate(() => {
      document.documentElement.lang = "he"
      document.documentElement.dir = "rtl"
    })
    await expect(page.locator("article")).toHaveCSS("direction", "ltr")
    await page.screenshot({
      path: path.join(evidence, `refunds-rtl-shell-${viewport.width}.png`),
      fullPage: true,
    })
    await page.goto(`${origin}/?view=privacy&unpublished=1`)
    await expect(
      page.getByRole("heading", { name: "Fixture home", exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole("navigation", { name: "Policies", exact: true }),
    ).toHaveCount(0)
    await expect(page.locator("article")).toHaveCount(0)
    await page.close()
    results.push({
      viewport,
      passed: true,
      checks: [
        "direct-policy",
        "plain-text-content",
        "lang-dir",
        "no-overflow",
        "footer-client-navigation",
        "metadata",
        "back",
        "refresh",
        "refunds",
        "rtl-shell",
        "unpublished-hidden",
      ],
    })
  }

  await verifyViewport({ width: 1440, height: 1000 })
  await verifyViewport({ width: 390, height: 844 })

  if (errors.length) {
    throw new Error(errors.join("\n"))
  }

  fs.writeFileSync(
    path.join(evidence, "browser-result.json"),
    `${JSON.stringify({ passed: true, scope: "Isolated actual legal components + real SiteLink/router/ReferenceCanvas, synthetic approved fixture; not production or full MarketingSite acceptance", results, errors, generatedAt: new Date().toISOString() }, null, 2)}\n`,
  )
  console.log(
    JSON.stringify({
      passed: true,
      widths: results.map((r) => r.viewport.width),
      assertionGroups: results.length * 11,
      errors,
    }),
  )
} catch (error) {
  fs.writeFileSync(
    path.join(evidence, "browser-result.json"),
    `${JSON.stringify({ passed: false, results, errors, error: String(error) }, null, 2)}\n`,
  )
  throw error
} finally {
  await browser?.close()
  await new Promise((resolve) => {
    server.close(resolve)
  })
}
