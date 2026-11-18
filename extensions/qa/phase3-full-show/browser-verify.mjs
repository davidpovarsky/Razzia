import { execFileSync } from "node:child_process"
// Real issuer + repository + MCP SDK + AppBridge, isolated browsers and public asset bytes.
// No production accounts, hosts, files or privileges are used by this harness.
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import {
  fixture,
  key,
  origin,
  policy,
  show,
} from "../../src/mcp-app/tests/first-party/fixtures.ts"
import { createFirstPartyOAuth } from "../../src/mcp-app/first-party/oauth.ts"
import {
  buildMcpOptions,
  createEphemeralOAuthKeys,
} from "../phase3-native-consent/harness.ts"
import { authorizePkceGrant } from "../phase3-native-consent/oauth-flow.ts"
import {
  Client,
  StreamableHTTPClientTransport,
} from "../phase3-mcp-service/mcp-client.ts"
import { createFullShowPreviewPortV3 } from "../../src/mcp-app/server/full-show-frame.ts"
import { FULL_SHOW_RESOURCE_V3 } from "../../src/mcp-app/contracts/full-show-frame.ts"
import { normalizeDraft } from "../../src/mcp-app/server/authoring.ts"
import { hashJson } from "../../src/mcp-app/contracts/canonical.ts"
import { tadaShowV1Schema } from "../../src/core/show-authoring-schema.ts"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const require = createRequire(new URL("../../package.json", import.meta.url))
const { build } = require("esbuild")
const { chromium, webkit } = require("@playwright/test")
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex")
const dist = path.join(root, "extensions/src/mcp-app/widget/dist")
const manifestBytes = fs.readFileSync(
  path.join(dist, "full-show-artifact.json"),
)
const manifest = JSON.parse(manifestBytes.toString("utf8"))
const html = fs.readFileSync(path.join(dist, "full-show.html"), "utf8")
assert.equal(digest(html), manifest.sha256)
const sourceSha =
  process.env.TADAZZ_FULL_SHOW_SOURCE_SHA ??
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim()
assert(/^[a-f0-9]{40}$/u.test(sourceSha))
function assertManifestPins() {
  for (const entry of [...manifest.physicalSources, ...manifest.publicAssets]) {
    const target = path.join(root, entry.path)
    const stat = fs.lstatSync(target)
    assert(stat.isFile() && !stat.isSymbolicLink())
    const data = fs.readFileSync(target)
    assert.equal(data.length, entry.bytes, `${entry.path} size changed`)
    assert.equal(digest(data), entry.sha256, `${entry.path} bytes changed`)
  }
}
assertManifestPins()
const evidence =
  process.env.TADAZZ_FULL_SHOW_EVIDENCE ??
  path.join(
    root,
    `docs/extensions/plans/phase3-takeover-20261117/full-show-v3-browser-${Date.now()}`,
  )
fs.mkdirSync(evidence, { recursive: true })
const assets = new Map()
for (const entry of manifest.publicAssets) {
  assert(entry.path.startsWith("packages/web/public/"))
  const file = path.join(root, entry.path)
  assert(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink())
  const data = fs.readFileSync(file)
  assert.equal(digest(data), entry.sha256)
  assert.equal(data.length, entry.bytes)
  assets.set(`/${entry.path.slice("packages/web/public/".length)}`, data)
}
const mime = new Map([
  [".webp", "image/webp"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".json", "application/json"],
  [".woff2", "font/woff2"],
  [".woff", "font/woff"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".wav", "audio/wav"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
])
const bundled = await build({
  entryPoints: [fileURLToPath(new URL("./browser-host.ts", import.meta.url))],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  write: false,
})
const hostJs = bundled.outputFiles[0].text
const inlineScripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gu)]
const scriptHashes = inlineScripts
  .map(
    (match) =>
      `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`,
  )
  .join(" ")
assert(inlineScripts.length > 0)
const csp =
  `default-src 'none'; script-src ${
    scriptHashes
  }; style-src 'unsafe-inline'; img-src data: https://tadazz.com; font-src data: https://tadazz.com;` +
  ` media-src https://tadazz.com; connect-src https://tadazz.com; base-uri https://tadazz.com; object-src 'none'; frame-src 'none'`
const f = await fixture()
const issuer = await createFirstPartyOAuth({
  ...buildMcpOptions({ origin, keys: createEphemeralOAuthKeys() }),
  nativeSave: undefined,
  configRoot: f.root,
})
const grant = await authorizePkceGrant({
  origin,
  nativeToken: f.sessions[0].token,
  scopes: ["tadazz.drafts.read", "tadazz.drafts.write"],
  verifyConsentHead: false,
  fetchImpl: (input, init) => {
    const request = new Request(input, init)
    request.headers.set("host", new URL(origin).host)

    return issuer.fetch(request)
  },
})
const principal = await issuer.verifyAccessToken(grant.accessToken)
const scenarios = new Map()
const entries = []
const errors = []
const calls = []
const resources = []
const engines = []
const outboundDenied = []
let sourceHashesUnchanged = false
const network = []
let browser = null
const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    res.setHeader("Cache-Control", "no-store")
    res.setHeader("X-Content-Type-Options", "nosniff")

    if (url.pathname === "/favicon.ico") {
      res.writeHead(204)
      res.end()

      return
    }

    if (url.pathname === "/widget") {
      res.setHeader("Content-Security-Policy", csp)
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.end(html)

      return
    }

    if (url.pathname === "/host.js") {
      res.setHeader("Content-Type", "text/javascript")
      res.end(hostJs)

      return
    }

    if (url.pathname === "/host") {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-src 'self'; base-uri 'none'; object-src 'none'",
      )
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.end(
        '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><script src="/host.js"></script></body></html>',
      )

      return
    }

    const scenario = scenarios.get(url.searchParams.get("scenario"))

    if (!scenario) {
      res.writeHead(404)
      res.end()

      return
    }

    if (url.pathname === "/qa/initial" && req.method === "GET") {
      const result = await scenario.client.callTool({
        name: "preview_show",
        arguments: scenario.selection,
      })
      assert.notEqual(result.isError, true)
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify({ selection: scenario.selection, result }))

      return
    }

    if (url.pathname === "/qa/call" && req.method === "POST") {
      let body = ""
      for await (const chunk of req) {
        body += chunk

        if (body.length > 16384) {
          throw new Error("oversized QA request")
        }
      }
      const call = JSON.parse(body)
      assert(
        [
          "preview_show",
          "get_game_draft_summary",
          "update_game_title",
        ].includes(call.name),
      )
      const result = await scenario.client.callTool(call)
      calls.push({
        name: call.name,
        inputRevision: call.arguments?.expectedRevision,
        result: result.structuredContent,
        isError: result.isError,
      })
      assert.doesNotMatch(
        JSON.stringify(result),
        /PRIVATE_NOTE_|private-opening|authoredShowJson|accountId|grantId/u,
      )
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify(result))

      return
    }

    res.writeHead(404)
    res.end()
  })().catch((error) => {
    errors.push(`Backend: ${error.message}`)

    if (!res.headersSent) {
      res.writeHead(500)
    }

    res.end("QA error")
  })
})
async function scenarioFor(theme, engine) {
  const original = show(`Full show ${theme} ${engine}`)
  const authored = {
    ...original,
    cards: [
      { key: "private-opening", kind: "opening", title: `Opening ${theme}` },
      ...original.cards.map((card, i) => ({
        ...card,
        note: `PRIVATE_NOTE_${i}`,
        question: `SELECTED_QUESTION_${i}`,
      })),
      {
        key: "private-transition",
        kind: "transition",
        title: `Transition ${theme}`,
      },
      { key: "private-closing", kind: "closing", title: `Closing ${theme}` },
    ],
  }
  const trustedDefaults = tadaShowV1Schema.parse({
    ...authored,
    defaults: { showTheme: { id: theme, version: "1.0.0" } },
  }).defaults
  const authoring = { ...policy, trustedDefaults }
  const repository = issuer.draftRepository(authoring)
  const normalized = normalizeDraft(JSON.stringify(authored), authoring)
  const idempotencyKey = key()
  const record = await repository.create(principal, normalized, {
    idempotencyKey,
    correlationId: key(),
    inputDigest: hashJson({
      contractVersion: "0.1.0",
      authoredShowJson: normalized.authoredShowJson,
      idempotencyKey,
    }),
  })
  const preview = createFullShowPreviewPortV3(
    { drafts: repository, authoring },
    {
      rendererBuildId: manifest.rendererBuildId,
      assertAssets(p, requestedTheme, urls) {
        assert.equal(p.accountId, principal.accountId)
        assert.equal(requestedTheme.id, theme)
        assert.deepEqual(urls, [])
        assert.equal(assets.size, manifest.publicAssets.length)

        return Promise.resolve()
      },
    },
  )
  const instance = issuer.remote({
    allowedOrigins: [],
    dependencies: {
      authoring,
      drafts: repository,
      rateLimit: () => Promise.resolve(true),
      fullShowPreviewV3: preview,
      fullShowUiResourceV3: {
        html,
        sha256: manifest.sha256,
        csp: manifest.csp,
        canServe: () =>
          digest(html) === manifest.sha256 &&
          assets.size === manifest.publicAssets.length,
      },
    },
  })
  const client = new Client({ name: "native-v3-browser-qa", version: "3" })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      authProvider: { token: () => Promise.resolve(grant.accessToken) },
      fetch: (input, init) => {
        const request = new Request(input, init)
        request.headers.set("host", new URL(origin).host)

        return instance.fetch(request)
      },
    }),
  )
  const resource = await client.readResource({ uri: FULL_SHOW_RESOURCE_V3 })
  assert.equal(resource.contents.length, 1)
  assert.equal(resource.contents[0].text, html)
  assert.deepEqual(resource.contents[0]._meta.ui.csp, manifest.csp)
  const selection = {
    contractVersion: "0.1.0",
    selectionVersion: 3,
    draftId: record.draftId,
    expectedRevision: 1,
    context: {
      mode: "demo",
      role: "spectator",
      locale: "en",
      reducedMotion: true,
      join: "unavailable-demo",
      actions: "synthetic-only",
    },
  }
  const { contractVersion: _version, ...selectedInput } = selection
  const first = await preview.render(principal, selectedInput)
  const id = key()
  const scenario = {
    client,
    instance,
    repository,
    record,
    selection,
    chapters: first.inventory.chapters,
  }
  scenarios.set(id, scenario)

  return { id, ...scenario }
}
async function run(name, operation) {
  const start = Date.now()

  try {
    await operation()
    entries.push({ name, status: "PASS", ms: Date.now() - start })
  } catch (error) {
    entries.push({
      name,
      status: "FAIL",
      error: String(error),
      stack: error.stack?.slice(0, 3500),
      ms: Date.now() - start,
    })
    console.error(`${name}: ${error.message}`)
  }
}
let base = ""

try {
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  base = `http://127.0.0.1:${server.address().port}`
  for (const engine of (
    process.env.TADAZZ_FULL_SHOW_BROWSERS ?? "chromium,webkit"
  ).split(",")) {
    browser = await (engine === "webkit" ? webkit : chromium).launch(
      engine === "chromium" && process.platform === "win32"
        ? { channel: "msedge", headless: true }
        : { headless: true },
    )
    const browserVersion = browser.version()
    engines.push({ name: engine, version: browserVersion })
    for (const theme of ["tadazz-classic", "razzia-original"]) {
      const scenario = await scenarioFor(theme, engine)
      const context = await browser.newContext({
        viewport: { width: 1280, height: 1200 },
        reducedMotion: "reduce",
      })
      await context.addInitScript(() => {
        window.__cspViolations = []
        document.addEventListener("securitypolicyviolation", (event) =>
          window.__cspViolations.push({
            directive: event.effectiveDirective,
            blocked: event.blockedURI,
            source: event.sourceFile,
          }),
        )
      })
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      const caseErrors = []
      page.on("pageerror", (error) => caseErrors.push(error.message))
      page.on("request", (request) => {
        if (
          !request.url().startsWith(base) &&
          !request.url().startsWith("data:")
        ) {
          network.push({ engine, theme, url: request.url() })
        }
      })
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url())

        if (url.origin === base) {
          await route.continue()

          return
        }

        if (url.origin !== "https://tadazz.com") {
          outboundDenied.push(url.href)
          await route.abort("blockedbyclient")

          return
        }

        const data = !url.search ? assets.get(url.pathname) : undefined
        resources.push({
          engine,
          theme,
          path: url.pathname,
          admitted: Boolean(data),
        })

        if (!data) {
          await route.abort("blockedbyclient")

          return
        }

        await route.fulfill({
          status: 200,
          contentType:
            mime.get(path.extname(url.pathname)) ?? "application/octet-stream",
          headers: {
            "access-control-allow-origin": "*",
            "cache-control": "no-store",
          },
          body: data,
        })
      })
      await run(
        `${engine} / ${
          theme
        } native opening, five phases, transitions and closing`,
        async () => {
          await page.goto(`${base}/host?scenario=${scenario.id}`)
          await page.locator("html[data-host-ready=true]").waitFor()
          const iframe = page.frameLocator("iframe")
          const stage = iframe.locator("[data-full-show-chapter]")
          for (const [index, chapter] of scenario.chapters.entries()) {
            if (index) {
              await iframe
                .getByRole("button", { name: "Next card", exact: true })
                .click()
            }

            await iframe
              .locator(`[data-full-show-chapter="${chapter.id}"]`)
              .waitFor()
            await iframe.locator(".widget-native-stage").evaluate(async () => {
              await document.fonts.ready
              await new Promise(requestAnimationFrame)
              await new Promise(requestAnimationFrame)
            })
            const content = await iframe
              .locator(".widget-native-stage")
              .innerText()
            assert(
              content.trim().length > 0,
              `Native stage empty for ${chapter.kind}`,
            )
            assert.doesNotMatch(content, /PRIVATE_NOTE_|authoredShowJson/u)
            const box = await iframe
              .locator(".widget-native-stage")
              .boundingBox()
            assert(
              box && box.width > 100 && box.height > 100,
              "Native stage has no useful size",
            )
            const actualFamily = await stage.getAttribute(
              "data-full-show-theme",
            )

            if (actualFamily) {
              assert.equal(actualFamily, theme)
            }

            if (chapter.questionOrdinal) {
              for (let i = 0; i < 5; i += 1) {
                if (i !== chapter.questionOrdinal - 1) {
                  assert(
                    !content.includes(`SELECTED_QUESTION_${i}`),
                    "Future question reached iframe",
                  )
                }
              }
            }

            if ([0, 1, 4, 5, 26, 27].includes(index)) {
              await page.screenshot({
                path: path.join(evidence, `${engine}-${theme}-${index}.png`),
              })
            }
          }
          assert.equal(
            await iframe
              .getByRole("button", { name: "Next card", exact: true })
              .isDisabled(),
            true,
          )
          const current = await scenario.repository.get(
            principal,
            scenario.record.draftId,
          )
          assert.equal(current.revision, 1)
          assert.equal(
            current.authoredShowJson,
            scenario.record.authoredShowJson,
          )
        },
      )
      await run(
        `${engine} / ${
          theme
        } title edit CAS and summary refresh through AppBridge`,
        async () => {
          const iframe = page.frameLocator("iframe")
          await iframe
            .getByLabel("Draft title", { exact: true })
            .fill(`Edited title ${theme}`)
          await iframe
            .getByRole("button", { name: "Apply draft edit", exact: true })
            .click()
          await iframe
            .getByRole("heading", {
              name: `Edited title ${theme}`,
              exact: true,
            })
            .waitFor()
          const current = await scenario.repository.get(
            principal,
            scenario.record.draftId,
          )
          assert.equal(current.revision, 2)
          assert.deepEqual(
            JSON.parse(current.authoredShowJson).cards,
            JSON.parse(scenario.record.authoredShowJson).cards,
          )
          await iframe
            .getByRole("button", { name: "Refresh draft", exact: true })
            .click()
          await iframe.locator("[data-full-show-chapter]").waitFor()
          const uiCalls = await page.evaluate(() => window.__host.calls())
          assert(
            uiCalls.includes("update_game_title") &&
              uiCalls.includes("get_game_draft_summary"),
          )
          assert(
            !uiCalls.includes("get_game_draft") &&
              !uiCalls.includes("update_game_draft"),
          )
        },
      )
      await run(
        `${engine} / ${theme} tamper, cancellation and tool-context teardown`,
        async () => {
          const iframe = page.frameLocator("iframe")
          await page.evaluate(() => window.__host.tamper(true))
          await iframe
            .getByRole("button", { name: "Replay", exact: true })
            .click()
          await iframe
            .getByRole("status")
            .filter({ hasText: "Preview unavailable" })
            .waitFor()
          assert.equal(
            await iframe.locator("[data-full-show-chapter]").count(),
            0,
          )
          await page.evaluate(() => window.__host.tamper(false))
          await iframe
            .getByRole("button", { name: "Refresh draft", exact: true })
            .click()
          await iframe.locator("[data-full-show-chapter]").waitFor()
          await page.evaluate(() => window.__host.hold(true))
          await iframe
            .getByRole("button", { name: "Replay", exact: true })
            .click()
          await page.evaluate(() => window.__host.cancel())
          await iframe
            .getByRole("status")
            .filter({ hasText: "Cancelled" })
            .waitFor()
          await page.evaluate(() => window.__host.hold(false))
          await iframe
            .getByRole("status")
            .filter({ hasText: "Cancelled" })
            .waitFor()
          assert.equal(
            await iframe.locator("[data-full-show-chapter]").count(),
            0,
          )
          await iframe
            .getByRole("button", { name: "Refresh draft", exact: true })
            .click()
          await iframe.locator("[data-full-show-chapter]").waitFor()
          await page.evaluate(() => window.__host.toolChange())
          await iframe
            .getByRole("status")
            .filter({ hasText: "Preview closed" })
            .waitFor()
          assert.equal(
            await iframe.locator("[data-full-show-chapter]").count(),
            0,
          )
        },
      )
      await run(
        `${engine} / ${theme} CSP, native media resources and browser errors`,
        async () => {
          const violations = []
          for (const frame of page.frames()) {
            violations.push(
              ...(await frame.evaluate(() => window.__cspViolations ?? [])),
            )
          }
          assert.deepEqual(violations, [])
          assert.deepEqual(caseErrors, [])
          assert.equal(
            resources.some(
              (r) => r.engine === engine && r.theme === theme && !r.admitted,
            ),
            false,
          )
          assert.equal(
            network.some((r) => !r.url.startsWith("https://tadazz.com/")),
            false,
          )
        },
      )
      fs.writeFileSync(
        path.join(evidence, `${engine}-${theme}-browser.json`),
        JSON.stringify(
          {
            browserVersion,
            caseErrors,
            entries: entries.filter((e) =>
              e.name.startsWith(`${engine} / ${theme}`),
            ),
          },
          null,
          2,
        ),
      )
      await context.close()
    }
    await browser.close()
    browser = null
  }
} finally {
  if (browser) {
    await browser.close()
  }

  for (const scenario of scenarios.values()) {
    await scenario.client.close()
    await scenario.instance.close()
  }
  await new Promise((resolve) => {
    server.close(resolve)
  })
  f.close()

  try {
    assertManifestPins()
    sourceHashesUnchanged = true
  } catch (error) {
    errors.push(`Source integrity: ${error.message}`)
  }

  fs.writeFileSync(
    path.join(evidence, "receipt.json"),
    JSON.stringify(
      {
        kind: "real issuer + official MCP client + AppBridge + sandboxed native Stage",
        claim:
          "Isolated fixture validation; not ChatGPT installation or production consent",
        sha: sourceSha,
        widgetManifestSha256: digest(manifestBytes),
        widgetHtmlSha256: manifest.sha256,
        sourceHashesUnchanged,
        productionChanged: false,
        customerMountAccessed: false,
        network: "none",
        transport:
          "Loopback HTTP plus exact hash-verified public-asset interception; no outbound network",
        outboundDenied,
        engines: engines.map((engine) => ({
          ...engine,
          outcomes: entries.filter((entry) =>
            entry.name.startsWith(`${engine.name} / `),
          ),
        })),
        requiredChecks: ["chromium", "webkit"].flatMap((engine) =>
          ["tadazz-classic", "razzia-original"].flatMap((theme) =>
            [
              "native opening, five phases, transitions and closing",
              "title edit CAS and summary refresh through AppBridge",
              "tamper, cancellation and tool-context teardown",
              "CSP, native media resources and browser errors",
            ].map((check) => `${engine} / ${theme} ${check}`),
          ),
        ),
        failureCount:
          entries.filter((entry) => entry.status !== "PASS").length +
          errors.length +
          outboundDenied.length,
        rendererBuildId: manifest.rendererBuildId,
        artifactSha256: manifest.sha256,
        entries,
        calls,
        errors,
        resources,
        requests: network,
      },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify({
      evidence,
      results: entries.map(({ name, status, error }) => ({
        name,
        status,
        error,
      })),
      errors,
    }),
  )
}

if (entries.some((entry) => entry.status !== "PASS") || errors.length) {
  process.exitCode = 1
}
