/** Full authored-version acceptance. Private fixtures are mounted, never committed. */
import assert from "node:assert/strict"
import { createHash, randomBytes } from "node:crypto"
import { createRequire } from "node:module"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import {
  buildMcpOptions,
  createEphemeralOAuthKeys,
  createLoopbackTlsCertificate,
  createPinnedCaFetch,
  installResendVerificationTrap,
  reserveLoopbackPort,
} from "../phase3-native-consent/harness.ts"
import { verifyStoredGameBrowser } from "./browser.mjs"

assert.equal(
  process.platform,
  "linux",
  "Stored games require the isolated Linux candidate",
)
assert.equal(process.env.TADAZZ_QA_OWNED_RUN_DIR, "1")
const fixturePath = resolve(process.env.TADAZZ_PRIVATE_GAME_FIXTURES ?? "")
assert.equal(
  dirname(fixturePath),
  "/fixtures",
  "Read-only fixture mount required",
)
assert.match(basename(fixturePath), /^games(?:\.runtime-v[0-9]+)?\.json$/)
const fixtureBytes = readFileSync(fixturePath)
const fixtureSha256 = createHash("sha256").update(fixtureBytes).digest("hex")
assert.equal(fixtureSha256, process.env.TADAZZ_PRIVATE_GAME_FIXTURES_SHA256)
const externalMediaPath = join(dirname(fixturePath), "external-assets.json")
const externalMediaSha256 = createHash("sha256")
  .update(readFileSync(externalMediaPath))
  .digest("hex")
assert.equal(
  externalMediaSha256,
  process.env.TADAZZ_PRIVATE_EXTERNAL_MEDIA_SHA256,
  "Externally verified public media manifest must be pinned",
)
const fixtures = JSON.parse(fixtureBytes.toString("utf8"))
assert.equal(fixtures.schemaVersion, 1)
assert(Array.isArray(fixtures.games) && fixtures.games.length > 0)
assert.equal(
  new Set(fixtures.games.map((fixture) => fixture.fixtureId)).size,
  fixtures.games.length,
)
const evidence = resolve(
  process.env.TADAZZ_STORED_GAMES_EVIDENCE ?? "/evidence/browser",
)
mkdirSync(evidence, { recursive: true, mode: 0o700 })
const configRoot = realpathSync(
  mkdtempSync(join(tmpdir(), "tadazz-stored-games-")),
)
const originalEnv = { ...process.env }
process.env.CONFIG_PATH = configRoot
process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
process.env.TADAZZ_BILLING_ENABLED = "false"
process.env.TADAZZ_INLINE_GAME_PREVIEW_ENABLED = "true"
process.env.TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED = "true"
process.env.TADAZZ_PACKAGE_INSTALLER_ENABLED = "true"
process.env.TADAZZ_PACKAGE_RUNTIME_ENABLED = "true"
process.env.JWT_SECRET = randomBytes(48).toString("hex")
process.env.RESEND_API_KEY = "stored-games-isolated-mail-trap"
process.env.TADAZZ_AUTH_EMAIL_FROM = "Stored games QA <auth@example.invalid>"
const trap = installResendVerificationTrap()
const tls = createLoopbackTlsCertificate()
const fetchImpl = createPinnedCaFetch(tls.cert)
const require = createRequire("/cleanup/extensions/package.json")
const { chromium } = require("@playwright/test")
const receipts = []
let structural = undefined

let host = undefined

let server = undefined

let browser = undefined

let context = undefined

let fatalError = undefined

const mediaIngress = {
  route: "/media/:name -> /api/media/raw/:name",
  nativeAuthorizationPreserved: true,
  browserCookieFromNativeLogin: false,
  rewrittenRequests: 0,
  anonymousDeniedRequests: 0,
}
const writeReceipt = () => {
  const report = {
    passed:
      !fatalError &&
      structural?.passed === true &&
      receipts.length === fixtures.games.length &&
      receipts.every((receipt) => receipt.passed),
    sourceSha: process.env.TADAZZ_GALLERY_SOURCE_SHA,
    fixtureSha256,
    externalMediaSha256,
    fixtures: fixtures.games.length,
    completed: receipts.length,
    passedGames: receipts.filter((receipt) => receipt.passed).length,
    originalPreviewFailures: receipts.filter(
      (receipt) => receipt.originalPreviewQualified === false,
    ).length,
    repairedCopiesQualified: receipts.filter(
      (receipt) => receipt.passed && receipt.externalMediaRepair?.passed,
    ).length,
    isolatedNativeHost: true,
    originalIdsRetained: true,
    productionChanged: false,
    privateFixtureContentInReceipt: false,
    mediaIngress,
    structural,
    games: receipts,
    ...(fatalError ? { error: fatalError } : {}),
  }
  writeFileSync(
    join(evidence, "receipt.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  )

  return report
}

try {
  const { verifyStoredStructure } = await import("./structural.mjs")
  const { seedStoredGameMedia } = await import("./package-fixtures.mjs")
  structural = verifyStoredStructure(fixtures.games)
  writeReceipt()
  const native = await import("../../src/mcp-app/native-host/index.ts")
  const { registerAndLoginAccount } =
    await import("../phase3-native-consent/oauth-flow.ts")
  const port = await reserveLoopbackPort()
  const origin = `https://127.0.0.1:${port}`
  assert(
    process.env.TADAZZ_SITE_DIST_DIR,
    "Actual built candidate web bundle required",
  )
  const mcp = buildMcpOptions({ origin, keys: createEphemeralOAuthKeys() })
  assert.match(
    readFileSync(
      new URL("../../deployment/nginx-server.conf", import.meta.url),
      "utf8",
    ),
    /location \/media\/ \{[^}]*proxy_pass http:\/\/127\.0\.0\.1:3001\/api\/media\/raw\/;[^}]*proxy_set_header Cookie \$http_cookie;/u,
    "The QA media bridge must match the candidate's deployed route and cookie forwarding",
  )
  const serveSite = native.createSiteDistHandler(
    process.env.TADAZZ_SITE_DIST_DIR,
    { isMachinePath: native.createMachineRouteMatcher(mcp.config) },
  )
  host = await native.createNativeConsentHost({
    enabled: true,
    configRoot,
    initializeNativeRuntime: true,
    // The deployed reverse proxy rewrites public media URLs to this native
    // route. Keep its real cookie/room authorization and byte response here.
    webFallback: async (request) => {
      const url = new URL(request.url)
      const media = /^\/media\/([^/]+)$/u.exec(url.pathname)

      if (!media) {
        return serveSite(request)
      }

      assert(["GET", "HEAD"].includes(request.method))
      url.pathname = `/api/media/raw/${media[1]}`
      const { app } = await import("@razzia/socket/app")
      mediaIngress.rewrittenRequests += 1

      return app.fetch(new Request(url, request))
    },
    mcp,
  })
  server = await native.listenNativeConsentHost(host, {
    host: "127.0.0.1",
    port,
    tls,
    attachSocketServer: true,
  })
  const credentials = {
    email: "stored-games-qa@example.invalid",
    password: `${randomBytes(24).toString("base64url")}Aa1!`,
  }
  const registeredOwner = await registerAndLoginAccount({
    origin,
    fetchImpl,
    ...credentials,
    codes: trap.codes,
  })
  const { default: Registry } = await import("@razzia/socket/services/registry")
  const registry = Registry.getInstance()
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  })
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "en-GB",
    ignoreHTTPSErrors: true,
  })
  // A real login in this browser context also installs the native HttpOnly
  // media cookie; copying only the bearer token into localStorage loses it.
  const browserLogin = await context.request.post(
    `${origin}/api/accounts/login`,
    { data: credentials },
  )
  assert.equal(browserLogin.status(), 200)
  const browserSession = await browserLogin.json()
  assert.equal(typeof browserSession.token, "string")
  const browserOwner = await context.request.get(`${origin}/api/accounts/me`, {
    headers: { Authorization: `Bearer ${browserSession.token}` },
  })
  assert.equal(browserOwner.status(), 200)
  assert.equal((await browserOwner.json()).id, registeredOwner.accountId)
  const owner = { ...registeredOwner, token: browserSession.token }
  const mediaCookie = (await context.cookies(`${origin}/media/qa.png`)).find(
    (cookie) => cookie.name === "tdz_media_auth",
  )
  assert(mediaCookie?.httpOnly && mediaCookie.path === "/media")
  assert.equal(mediaCookie.value, owner.token)
  mediaIngress.browserCookieFromNativeLogin = true
  await context.addInitScript((token) => {
    localStorage.setItem("token", token)
    localStorage.setItem("i18nextLng", "en")
  }, owner.token)
  const tenantRoot = join(configRoot, "tenants", owner.accountId)
  assert(tenantRoot.startsWith(`${configRoot}/tenants/`))
  for (const fixture of fixtures.games) {
    let receipt = undefined

    try {
      assert.match(fixture.quizz.id, /^[A-Za-z0-9_-]{1,200}$/)
      // This tenant was just created by this run. Previous fixture games/pages
      // were disposed before reusing it for another authored version of an ID.
      rmSync(tenantRoot, { recursive: true, force: true })
      for (const directory of [
        "quizz",
        "results",
        "media",
        "extensions/quizzes",
      ]) {
        mkdirSync(join(tenantRoot, directory), { recursive: true, mode: 0o700 })
      }
      const media = await seedStoredGameMedia({
        fixtureRoot: dirname(fixturePath),
        fixture,
        packageRecords: fixtures.packageRecords ?? [],
        configRoot,
        accountId: owner.accountId,
      })
      for (const item of media.externalAssets) {
        if (!item.mirror) {
          continue
        }

        const anonymous = await fetchImpl(origin + item.mirror.nativeUrl)
        assert.equal(
          anonymous.status,
          401,
          "The media rewrite must retain native anonymous denial",
        )
        await anonymous.arrayBuffer()
        mediaIngress.anonymousDeniedRequests += 1
      }
      writeFileSync(
        join(tenantRoot, "quizz", `${fixture.quizz.id}.json`),
        JSON.stringify(fixture.quizz),
        { mode: 0o600 },
      )

      if (fixture.extras) {
        assert.equal(fixture.extras.quizId, fixture.quizz.id)
        writeFileSync(
          join(tenantRoot, "extensions/quizzes", `${fixture.quizz.id}.json`),
          JSON.stringify(fixture.extras),
          { mode: 0o600 },
        )
      }

      receipt = await verifyStoredGameBrowser({
        fixture,
        origin,
        token: owner.token,
        accountId: owner.accountId,
        browser,
        context,
        registry,
        externalAssets: media.externalAssets,
        evidenceDirectory: evidence,
      })
      receipt.media = media
    } catch (error) {
      console.error("Stored fixture setup failed", fixture.fixtureId, error)
      receipt = {
        fixtureId: fixture.fixtureId,
        passed: false,
        error: `fixture-setup: ${error?.name ?? "Error"}`,
        errorDigest: createHash("sha256")
          .update(String(error?.message ?? error))
          .digest("hex"),
      }
    }

    receipts.push(receipt)
    writeReceipt()
    console.log(
      JSON.stringify({
        storedGameCompleted: fixture.fixtureId,
        passed: receipt.passed,
        completed: receipts.length,
        total: fixtures.games.length,
      }),
    )
  }
  assert.equal(
    createHash("sha256").update(readFileSync(fixturePath)).digest("hex"),
    fixtureSha256,
    "Private fixtures remain unchanged",
  )
  assert.equal(
    createHash("sha256").update(readFileSync(externalMediaPath)).digest("hex"),
    externalMediaSha256,
    "External media manifest remains unchanged",
  )
} catch (error) {
  console.error("Stored game runner failed", error)
  fatalError = {
    name: error?.name ?? "Error",
    digest: createHash("sha256")
      .update(String(error?.message ?? error))
      .digest("hex"),
  }
} finally {
  await context?.close()
  await browser?.close()
  await server?.close()

  if (!server) {
    await host?.close()
  }

  trap.restore()
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, originalEnv)
  rmSync(configRoot, { recursive: true, force: true })
  const report = writeReceipt()
  console.log(
    JSON.stringify({
      storedGamesPassed: report.passed,
      completed: report.completed,
      total: report.fixtures,
      passedGames: report.passedGames,
    }),
  )

  if (!report.passed) {
    process.exitCode = 1
  }
}
