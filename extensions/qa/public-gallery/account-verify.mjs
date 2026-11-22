/** Real account HTTP integration in a new disposable Linux-native host. */
import assert from "node:assert/strict"
import { PUBLIC_GALLERY_IDS } from "./catalogue-inventory.mjs"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { randomBytes } from "node:crypto"
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  buildMcpOptions,
  createEphemeralOAuthKeys,
  createLoopbackTlsCertificate,
  createPinnedCaFetch,
  installResendVerificationTrap,
  reserveLoopbackPort,
} from "../phase3-native-consent/harness.ts"

assert.equal(
  process.platform,
  "linux",
  "Account acceptance must run on the server",
)
const evidence = resolve(
  process.env.TADAZZ_GALLERY_EVIDENCE ?? "/evidence/account-gallery",
)
mkdirSync(evidence, { recursive: true })
const configRoot = realpathSync(
  mkdtempSync(join(tmpdir(), "tadazz-gallery-account-")),
)
const originalEnv = { ...process.env }
const results = []
const record = (name, detail = {}) => {
  results.push({ name, passed: true, ...detail })
  console.log(
    JSON.stringify({ galleryAccountCheck: name, passed: true, ...detail }),
  )
}
process.env.CONFIG_PATH = configRoot
process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
process.env.TADAZZ_INLINE_GAME_PREVIEW_ENABLED = "true"
process.env.TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED = "true"
process.env.TADAZZ_PACKAGE_INSTALLER_ENABLED = "true"
process.env.JWT_SECRET = randomBytes(48).toString("hex")
process.env.RESEND_API_KEY = "gallery-isolated-mail-trap"
process.env.TADAZZ_AUTH_EMAIL_FROM = "Gallery QA <auth@example.invalid>"
const trap = installResendVerificationTrap()
const tls = createLoopbackTlsCertificate()
const fetchImpl = createPinnedCaFetch(tls.cert)
let host
let server

try {
  const native = await import("../../src/mcp-app/native-host/index.ts")
  const { registerAndLoginAccount } =
    await import("../phase3-native-consent/oauth-flow.ts")
  const { showThemeRegistry } =
    await import("../../src/core/show-themes/registry.ts")
  const { computeCanonicalBaseDigest } =
    await import("../../src/core/digest.ts")
  const port = await reserveLoopbackPort()
  const origin = "https://127.0.0.1:" + port
  host = await native.createNativeConsentHost({
    enabled: true,
    configRoot,
    initializeNativeRuntime: true,
    ...(process.env.TADAZZ_SITE_DIST_DIR
      ? { siteDistDir: process.env.TADAZZ_SITE_DIST_DIR }
      : {
          webFallback: () =>
            new Response("<html><body>Gallery isolated fixture</body></html>", {
              headers: { "Content-Type": "text/html" },
            }),
        }),
    mcp: buildMcpOptions({ origin, keys: createEphemeralOAuthKeys() }),
  })
  server = await native.listenNativeConsentHost(host, {
    host: "127.0.0.1",
    port,
    tls,
    attachSocketServer: true,
  })
  const request = async (path, token, init = {}) =>
    fetchImpl(origin + path, {
      ...init,
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    })
  const json = async (path, token) => {
    const response = await request(path, token)
    assert.equal(response.status, 200, path)
    return response.json()
  }
  const catalog = (await json("/api/extensions/catalogue")).games
  assert.deepEqual(
    catalog.map((game) => game.id).sort(),
    [...PUBLIC_GALLERY_IDS].sort(),
  )
  const beforePublic = new Map()
  for (const game of catalog)
    beforePublic.set(
      game.id,
      JSON.stringify(await json("/api/extensions/preview/public/" + game.id)),
    )
  const denied = await request(
    "/api/extensions/catalogue/family/install",
    undefined,
    { method: "POST", body: "{}" },
  )
  assert.equal(denied.status, 401)
  const alice = await registerAndLoginAccount({
    origin,
    fetchImpl,
    email: "gallery-alice@example.invalid",
    password: randomBytes(24).toString("base64url") + "Aa1!",
    codes: trap.codes,
  })
  const bob = await registerAndLoginAccount({
    origin,
    fetchImpl,
    email: "gallery-bob@example.invalid",
    password: randomBytes(24).toString("base64url") + "Aa1!",
    codes: trap.codes,
  })
  record("real-registration-login-and-anonymous-install-denial")
  const installed = new Map()
  for (const game of catalog) {
    const response = await request(
      "/api/extensions/catalogue/" + game.id + "/install",
      alice.token,
      { method: "POST", body: "{}" },
    )
    assert.equal(response.status, 201, "First account installation: " + game.id)
    const result = await response.json()
    assert.equal(result.created, true)
    assert.equal(result.editorUrl, "/manager/quizz/" + result.quizzId)
    assert.equal(result.launchUrl, "/studio/prepare?quiz=" + result.quizzId)
    const nativeQuiz = await json("/api/quizz/" + result.quizzId, alice.token)
    const extras = await json(
      "/api/extensions/quizzes/" + result.quizzId,
      alice.token,
    )
    assert.equal(nativeQuiz.subject, game.title)
    assert.equal(nativeQuiz.questions.length, game.questionCount)
    assert.equal(extras.extras.defaults.showTheme.id, game.themeId)
    assert(
      showThemeRegistry.get(game.themeId, "1.0.0"),
      "Site-wide registered theme: " + game.themeId,
    )
    const reopenedPreview = await json(
      "/api/extensions/preview/quizzes/" + result.quizzId,
      alice.token,
    )
    assert.equal(reopenedPreview.source.kind, "account-owned")
    assert.equal(reopenedPreview.show.title, game.title)
    assert.equal(reopenedPreview.show.defaults.showTheme.id, game.themeId)
    assert.notEqual(
      (await request("/api/quizz/" + result.quizzId, bob.token)).status,
      200,
    )
    assert.notEqual(
      (
        await request(
          "/api/extensions/preview/quizzes/" + result.quizzId,
          bob.token,
        )
      ).status,
      200,
    )
    installed.set(game.id, result)
  }
  assert.equal(
    (await json("/api/quizz", alice.token)).quizz.length,
    PUBLIC_GALLERY_IDS.length,
  )
  assert.equal((await json("/api/quizz", bob.token)).quizz.length, 0)
  record("all-public-native-installs-reopen-and-tenant-denial", {
    games: PUBLIC_GALLERY_IDS.length,
  })

  const family = installed.get("family")
  const nativeQuiz = await json("/api/quizz/" + family.quizzId, alice.token)
  const extrasReply = await json(
    "/api/extensions/quizzes/" + family.quizzId,
    alice.token,
  )
  const editedTitle = "My private family gallery copy"
  const editedQuiz = { ...nativeQuiz, subject: editedTitle }
  delete editedQuiz.id
  const editedExtras = structuredClone(extrasReply.extras)
  editedExtras.baseDigest = computeCanonicalBaseDigest(editedQuiz)
  editedExtras.defaults.showTheme = {
    id: "tadazz-midnight-club",
    version: "1.0.0",
    overrides: {},
  }
  const saved = await request(
    "/api/extensions/quizzes/" + family.quizzId,
    alice.token,
    {
      method: "PUT",
      body: JSON.stringify({
        expectedRevision: extrasReply.extras.revision,
        quizz: editedQuiz,
        extras: editedExtras,
      }),
    },
  )
  assert.equal(
    saved.status,
    200,
    "Save personal title and another site-wide theme",
  )
  const reinstall = await request(
    "/api/extensions/catalogue/family/install",
    alice.token,
    { method: "POST", body: "{}" },
  )
  assert.equal(reinstall.status, 200)
  const reused = await reinstall.json()
  assert.equal(reused.quizzId, family.quizzId)
  assert.equal(reused.created, false)
  assert.equal(
    (await json("/api/quizz/" + family.quizzId, alice.token)).subject,
    editedTitle,
  )
  assert.equal(
    (await json("/api/extensions/quizzes/" + family.quizzId, alice.token))
      .extras.defaults.showTheme.id,
    "tadazz-midnight-club",
  )
  assert.equal(
    (await json("/api/quizz", alice.token)).quizz.length,
    PUBLIC_GALLERY_IDS.length,
  )
  record("theme-change-save-reload-and-install-idempotency-preserve-edits")

  const other = await request(
    "/api/extensions/catalogue/family/install",
    bob.token,
    { method: "POST", body: "{}" },
  )
  assert.equal(other.status, 201)
  const bobCopy = await other.json()
  assert.notEqual(bobCopy.quizzId, family.quizzId)
  const bobPreview = await json(
    "/api/extensions/preview/quizzes/" + bobCopy.quizzId,
    bob.token,
  )
  assert.equal(
    bobPreview.show.title,
    catalog.find((game) => game.id === "family").title,
  )
  assert.equal(bobPreview.show.defaults.showTheme.id, "tadazz-family-fiesta")
  assert.equal((await json("/api/quizz", bob.token)).quizz.length, 1)
  for (const game of catalog) {
    assert.equal(
      JSON.stringify(await json("/api/extensions/preview/public/" + game.id)),
      beforePublic.get(game.id),
      "Public master remains unchanged",
    )
  }
  record("second-account-independent-copy-and-immutable-public-masters")
  if (process.env.TADAZZ_GALLERY_BROWSER === "true") {
    assert(
      process.env.TADAZZ_SITE_DIST_DIR,
      "Built production site required for editor acceptance",
    )
    let publicBrowserError
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [fileURLToPath(new URL("./browser-verify.mjs", import.meta.url))],
          {
            env: {
              ...process.env,
              TADAZZ_GALLERY_ORIGIN: origin,
              TADAZZ_GALLERY_EVIDENCE: join(evidence, "public-browser"),
            },
            stdio: "inherit",
          },
        )
        child.once("error", reject)
        child.once("exit", (code) =>
          code === 0
            ? resolve()
            : reject(new Error("Candidate public browser exited " + code)),
        )
      })
      record("candidate-public-catalogue-and-legacy-ten-full-play")
    } catch (error) {
      publicBrowserError = error
      results.push({
        name: "candidate-public-catalogue-and-legacy-ten-full-play",
        passed: false,
        error: String(error?.stack ?? error),
      })
    }
    const { verifyGalleryEditor } = await import("./editor-verify.mjs")
    const editorReceipt = await verifyGalleryEditor({
      origin,
      token: alice.token,
      quizId: family.quizzId,
      expectedTitle: editedTitle,
      expectedQuestions: nativeQuiz.questions,
      themeDefinitions: showThemeRegistry.list(),
      evidence,
      readQuiz: () => json("/api/quizz/" + family.quizzId, alice.token),
      readExtras: () =>
        json("/api/extensions/quizzes/" + family.quizzId, alice.token),
    })
    writeFileSync(
      join(evidence, "editor-receipt.json"),
      JSON.stringify(editorReceipt, null, 2) + "\n",
    )
    record(
      "native-editor-global-themes-switch-save-reload-and-catalogue-links",
      { checks: editorReceipt.results.length },
    )
    if (publicBrowserError) throw publicBrowserError
  }
  writeFileSync(
    join(evidence, "receipt.json"),
    JSON.stringify(
      {
        passed: true,
        platform: process.platform,
        sourceSha: process.env.TADAZZ_GALLERY_SOURCE_SHA,
        isolatedNativeHost: true,
        customerMountUsed: false,
        realEmailSent: false,
        results,
      },
      null,
      2,
    ) + "\n",
  )
} catch (error) {
  writeFileSync(
    join(evidence, "receipt.json"),
    JSON.stringify(
      {
        passed: false,
        platform: process.platform,
        sourceSha: process.env.TADAZZ_GALLERY_SOURCE_SHA,
        isolatedNativeHost: true,
        customerMountUsed: false,
        realEmailSent: false,
        results,
        error: String(error?.stack ?? error),
      },
      null,
      2,
    ) + "\n",
  )
  console.error(error)
  process.exitCode = 1
} finally {
  await server?.close()
  if (!server) await host?.close()
  trap.restore()
  for (const key of Object.keys(process.env))
    if (!(key in originalEnv)) delete process.env[key]
  Object.assign(process.env, originalEnv)
  rmSync(configRoot, { recursive: true, force: true })
}
