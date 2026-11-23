import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import http from "node:http"
import { createRequire } from "node:module"
import path from "node:path"

const source = process.env.TADAZZ_PACKAGE_SAVE_SOURCE
const dependencies = process.env.TADAZZ_PACKAGE_SAVE_DEPS
const evidence = process.env.TADAZZ_PACKAGE_SAVE_EVIDENCE

if (
  !source ||
  !dependencies ||
  !evidence ||
  ![source, dependencies, evidence].every((value) => path.isAbsolute(value))
) {
  throw new Error(
    "Explicit absolute lifecycle source, dependency and evidence paths required",
  )
}

const componentDirectory = path.join(
  source,
  "packages/web/src/features/manager/components/packages",
)
const component =
  process.env.TADAZZ_PACKAGE_SAVE_COMPONENT ||
  path.join(componentDirectory, "PackageSaveConsent.tsx")
const fixture = path.join(
  source,
  "packages/web/src/test/package-save-consent-lifecycle-fixture.tsx",
)
const requireWeb = createRequire(
  path.join(dependencies, "packages/web/package.json"),
)
const { build } = createRequire(
  path.join(dependencies, "extensions/package.json"),
)("esbuild")
const { chromium, expect } = createRequire(
  path.join(dependencies, "packages/e2e/package.json"),
)("@playwright/test")
await fs.mkdir(evidence, { recursive: true })
const componentBytes = await fs.readFile(component)
await build({
  entryPoints: [fixture],
  outfile: path.join(evidence, "fixture.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  logLevel: "silent",
  plugins: [
    {
      name: "package-consent-lifecycle-services",
      setup(builder) {
        builder.onResolve({ filter: /PackageSaveConsent$/ }, () => ({
          path: component,
          namespace: "consent-component",
        }))
        builder.onLoad(
          { filter: /.*/, namespace: "consent-component" },
          () => ({
            contents: componentBytes.toString("utf8"),
            loader: "tsx",
            resolveDir: componentDirectory,
          }),
        )
        builder.onResolve({ filter: /^@razzia\/web\/lib\/session$/ }, () => ({
          path: fixture,
        }))
        builder.onResolve(
          { filter: /^@razzia\/extensions\/platform-ui$/ },
          () => ({
            path: path.join(source, "extensions/src/platform-ui/index.ts"),
          }),
        )
        builder.onResolve({ filter: /^react-i18next$/ }, () => ({
          path: "translations",
          namespace: "lifecycle-service",
        }))
        builder.onLoad(
          { filter: /.*/, namespace: "lifecycle-service" },
          () => ({
            contents:
              'const i18n={language:"en",resolvedLanguage:"en"};export function useTranslation(){return {i18n,t:(key)=>key}}',
            loader: "ts",
          }),
        )
        builder.onResolve(
          { filter: /^(?:react(?:-dom)?(?:\/.*)?|@razzia\/common\/.*)$/ },
          (args) => ({
            path: requireWeb.resolve(args.path),
          }),
        )
      },
    },
  ],
})
const bundle = await fs.readFile(path.join(evidence, "fixture.js"))
const css = await fs
  .readFile(path.join(evidence, "fixture.css"))
  .catch(() => Buffer.from(""))
const firstRequest = "a".repeat(36)
const nextRequest = "b".repeat(36)
const expectedCases = [
  "uncertain-token-change",
  "uncertain-owner-change",
  "uncertain-role-change",
  "uncertain-session-expiry",
  "uncertain-consent-expiry",
  "explicit-committed-reconciliation",
  "stale-inspection-after-request-change",
  "stale-approval-after-identity-change",
]
const result = {
  format: "tadazz-package-save-consent-lifecycle-v1",
  component,
  componentSha256: createHash("sha256").update(componentBytes).digest("hex"),
  fixture:
    "actual PackageSaveConsent and package API; synthetic session and loopback HTTP",
  network: "loopback-only",
  customerData: false,
  expectedCases,
  cases: [],
}
function freshScenario(options = {}) {
  return {
    mode: options.mode ?? "truncate",
    expiresIn: options.expiresIn ?? 600_000,
    holdInspection: options.holdInspection ?? false,
    gets: 0,
    posts: 0,
    committed: new Set(),
    held: [],
    requests: [],
  }
}
let scenario = freshScenario()

function outcome(requestId) {
  return {
    uploadId: (requestId === firstRequest ? "u" : "v").repeat(36),
    revision: 2,
    installedGameIds: ["synthetic-installed-game"],
  }
}

function inspection(requestId) {
  return {
    requestId,
    uploadId: outcome(requestId).uploadId,
    revision: 2,
    sourceDigest: "1".repeat(64),
    buildDigest: "2".repeat(64),
    title:
      requestId === firstRequest ? "Private package A" : "Private package B",
    contents: [{ id: "fixture-game", kind: "game" }],
    reviewed: true,
    canInstall: true,
    expiresAt: new Date(Date.now() + scenario.expiresIn).toISOString(),
    outcome: scenario.committed.has(requestId) ? outcome(requestId) : null,
  }
}

function json(response, value) {
  response.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  })
  response.end(JSON.stringify(value))
}

function releaseHeld() {
  for (const held of scenario.held.splice(0)) {
    if (!held.response.destroyed) {
      json(held.response, held.value)
    }
  }
}

async function serve(request, response) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1")
  const match =
    /^\/api\/packages\/save-consents\/([A-Za-z0-9_-]+)(\/approve)?$/u.exec(
      url.pathname,
    )

  if (match) {
    const [, requestId, approve] = match
    assert.ok(requestId === firstRequest || requestId === nextRequest)
    assert.match(
      request.headers.authorization ?? "",
      /^Bearer synthetic-session-/u,
    )
    scenario.requests.push({ method: request.method, requestId })

    if (!approve && request.method === "GET") {
      scenario.gets += 1
      const value = inspection(requestId)

      if (scenario.holdInspection && requestId === firstRequest) {
        scenario.held.push({ response, value })
      } else {
        json(response, value)
      }

      return
    }

    if (approve && request.method === "POST") {
      let body = ""

      for await (const chunk of request) {
        body += chunk.toString("utf8")
        assert.ok(body.length < 4096)
      }

      assert.deepEqual(JSON.parse(body), {
        decision: "approve",
        expectedRevision: 2,
        sourceDigest: "1".repeat(64),
      })
      scenario.posts += 1
      scenario.committed.add(requestId)

      if (scenario.mode === "hold") {
        scenario.held.push({ response, value: outcome(requestId) })
      } else {
        // The server committed, but the actual fetch/JSON parser receives no outcome.
        response.writeHead(200, { "Content-Type": "application/json" })
        response.end('{"uploadId":')
      }

      return
    }

    response.writeHead(405)
    response.end()

    return
  }

  if (url.pathname === "/fixture.js" || url.pathname === "/fixture.css") {
    const javascript = url.pathname.endsWith(".js")
    response.writeHead(200, {
      "Content-Type": javascript ? "text/javascript" : "text/css",
    })
    response.end(javascript ? bundle : css)

    return
  }

  response.writeHead(200, { "Content-Type": "text/html" })
  response.end(
    '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>',
  )
}

const serverErrors = []
const server = http.createServer((request, response) => {
  void serve(request, response).catch((error) => {
    serverErrors.push(String(error))

    if (!response.headersSent) {
      response.writeHead(500)
    }

    response.end()
  })
})
await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", resolve)
})
const address = server.address()

if (!address || typeof address === "string") {
  throw new Error("Lifecycle loopback listener unavailable")
}

const origin = `http://127.0.0.1:${address.port}`
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
})

async function runCase(name, options, verify) {
  scenario = freshScenario(options)
  const page = await browser.newPage()
  const browserErrors = []
  const externalRequests = []
  page.on("pageerror", (error) => browserErrors.push(error.message))
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === origin) {
      return route.continue()
    }

    externalRequests.push(route.request().url())

    return route.abort()
  })

  try {
    await page.clock.install()
    await page.goto(`${origin}/studio/package-save-consent/${firstRequest}`)
    await page.waitForFunction(() =>
      Boolean(window.__packageSaveConsentLifecycleFixture),
    )
    const labels = await page.evaluate(
      () => window.__packageSaveConsentLifecycleFixture.labels,
    )
    await verify(page, labels)
    assert.deepEqual(browserErrors, [])
    assert.deepEqual(externalRequests, [])
    assert.deepEqual(serverErrors, [])
    result.cases.push({
      name,
      passed: true,
      gets: scenario.gets,
      posts: scenario.posts,
    })
  } catch (error) {
    result.cases.push({
      name,
      passed: false,
      error: String(error),
      browserErrors,
      externalRequests,
      requests: scenario.requests,
    })
    await page.screenshot({ path: path.join(evidence, `${name}.png`) })
  } finally {
    releaseHeld()
    await page.close()
  }
}

async function loseApproval(page, labels) {
  const approve = page.getByTestId("package-save-approve")
  await expect(approve).toBeEnabled()
  await approve.click()
  await expect(page.getByTestId("package-save-status")).toHaveText(
    labels.uncertain,
  )
  await expect(page.getByTestId("package-save-title")).toHaveText(
    "Private package A",
  )
  assert.equal(scenario.posts, 1)
  assert.equal(scenario.gets, 1)
}

async function privateDataGone(page, labels) {
  await expect(page.getByTestId("package-save-title")).toHaveCount(0)
  await expect(page.getByTestId("package-save-contents")).toHaveCount(0)
  await expect(page.locator('a[href^="/studio/package-preview/"]')).toHaveCount(
    0,
  )
  await expect(page.getByTestId("package-save-approve")).toBeDisabled()
  await expect(page.getByTestId("package-save-status")).toHaveText(
    labels.uncertain,
  )
  assert.equal(scenario.posts, 1)
  assert.equal(scenario.gets, 1)
}

try {
  const changes = [
    {
      name: expectedCases[0],
      patch: { token: "synthetic-session-b" },
      notification: "none",
    },
    {
      name: expectedCases[1],
      patch: { owner: "synthetic-owner-b" },
      notification: "focus",
    },
    {
      name: expectedCases[2],
      patch: { role: "player" },
      notification: "storage",
    },
    { name: expectedCases[3], patch: { expired: true }, notification: "none" },
  ]

  for (const change of changes) {
    await runCase(change.name, {}, async (page, labels) => {
      await loseApproval(page, labels)
      await page.evaluate(({ patch, notification }) => {
        window.__packageSaveConsentLifecycleFixture.setSession(
          patch,
          notification,
        )
      }, change)
      await page.clock.runFor(1100)
      await privateDataGone(page, labels)
    })
  }

  await runCase(expectedCases[4], { expiresIn: 5000 }, async (page, labels) => {
    await loseApproval(page, labels)
    await page.clock.runFor(6000)
    await privateDataGone(page, labels)
  })
  await runCase(expectedCases[5], {}, async (page, labels) => {
    await loseApproval(page, labels)
    await page.getByTestId("package-save-check").click()
    await expect(page.getByTestId("package-save-status")).toHaveText(
      labels.saved,
    )
    await expect(page.getByTestId("package-save-approve")).toHaveCount(0)
    assert.equal(scenario.posts, 1)
    assert.equal(scenario.gets, 2)
  })
  await runCase(expectedCases[6], { holdInspection: true }, async (page) => {
    await expect.poll(() => scenario.gets).toBe(1)
    await page.evaluate((requestId) => {
      window.__packageSaveConsentLifecycleFixture.render(requestId)
    }, nextRequest)
    await expect(page.getByTestId("package-save-title")).toHaveText(
      "Private package B",
    )
    releaseHeld()
    await page.clock.runFor(1100)
    await expect(page.getByTestId("package-save-title")).toHaveText(
      "Private package B",
    )
    assert.equal(scenario.posts, 0)
    assert.equal(scenario.gets, 2)
  })
  await runCase(expectedCases[7], { mode: "hold" }, async (page, labels) => {
    await expect(page.getByTestId("package-save-approve")).toBeEnabled()
    await page.getByTestId("package-save-approve").click()
    await expect.poll(() => scenario.posts).toBe(1)
    await page.evaluate(() => {
      window.__packageSaveConsentLifecycleFixture.setSession({
        token: "synthetic-session-b",
      })
    })
    await page.clock.runFor(1100)
    releaseHeld()
    await page.clock.runFor(1100)
    await privateDataGone(page, labels)
  })
} finally {
  releaseHeld()
  await browser.close()
  server.closeAllConnections()
  await new Promise((resolve) => {
    server.close(resolve)
  })
}

result.passed =
  result.cases.length === expectedCases.length &&
  result.cases.every(
    (item, index) => item.name === expectedCases[index] && item.passed,
  )
await fs.writeFile(
  path.join(evidence, "receipt.json"),
  `${JSON.stringify(result, null, 2)}\n`,
)
console.log(JSON.stringify(result))

if (!result.passed) {
  process.exitCode = 1
}
