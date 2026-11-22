/** Real disposable native host, reusing the established account/TLS/mail-trap lifecycle. */
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
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
import { ids, legacyIds } from "./contract.mjs"

assert.equal(
  process.platform,
  "linux",
  "Original-family acceptance runs on the Linux server",
)
assert(
  process.env.TADAZZ_SITE_DIST_DIR,
  "A successful immutable native build is required",
)
const evidence = resolve(
  process.env.TADAZZ_ORIGINALS_EVIDENCE ?? "/evidence/browser",
)
mkdirSync(evidence, { recursive: true })
const configRoot = realpathSync(
  mkdtempSync(join(tmpdir(), "tadazz-originals-")),
)
const originalEnv = { ...process.env }
Object.assign(process.env, {
  CONFIG_PATH: configRoot,
  TADAZZ_ACCOUNTS_ENABLED: "true",
  TADAZZ_INLINE_GAME_PREVIEW_ENABLED: "true",
  TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED: "true",
  JWT_SECRET: randomBytes(48).toString("hex"),
  RESEND_API_KEY: "originals-isolated-mail-trap",
  TADAZZ_AUTH_EMAIL_FROM: "Originals QA <auth@example.invalid>",
})
const trap = installResendVerificationTrap()
const tls = createLoopbackTlsCertificate()
const fetchImpl = createPinnedCaFetch(tls.cert)
const results = []
const record = (name, detail = {}) => {
  const value = { name, passed: true, ...detail }
  results.push(value)
  console.log(JSON.stringify({ originalThemeCheck: value }))
}
let host = undefined,
  server = undefined

try {
  const native = await import("../../src/mcp-app/native-host/index.ts")
  const { registerAndLoginAccount } =
    await import("../phase3-native-consent/oauth-flow.ts")
  const { computeCanonicalBaseDigest } =
    await import("../../src/core/digest.ts")
  const { createDefaultQuizExtrasV2 } =
    await import("../../src/core/studio-timeline-schema.ts")
  const { showThemeRegistry } =
    await import("../../src/core/show-themes/registry.ts")
  const port = await reserveLoopbackPort()
  const origin = `https://127.0.0.1:${port}`
  host = await native.createNativeConsentHost({
    enabled: true,
    configRoot,
    initializeNativeRuntime: true,
    siteDistDir: process.env.TADAZZ_SITE_DIST_DIR,
    mcp: buildMcpOptions({ origin, keys: createEphemeralOAuthKeys() }),
  })
  server = await native.listenNativeConsentHost(host, {
    host: "127.0.0.1",
    port,
    tls,
    attachSocketServer: true,
  })
  const request = (path, token, init = {}) =>
    fetchImpl(origin + path, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    })
  const read = async (path, token) => {
    const response = await request(path, token)
    assert.equal(response.status, 200, path)

    return response.json()
  }
  const catalogue = (await read("/api/extensions/catalogue")).games
  assert.equal(catalogue.length, 18, "Ten existing games plus eight originals")
  assert.deepEqual(
    catalogue.map((game) => game.id).sort(),
    [...legacyIds, ...ids].sort(),
  )
  assert.equal(
    catalogue
      .filter((game) => !ids.includes(game.id))
      .reduce((sum, game) => sum + game.questionCount, 0),
    77,
  )
  assert.equal(
    catalogue.reduce((sum, game) => sum + game.questionCount, 0),
    125,
  )
  const previews = new Map()
  for (const id of ids) {
    const item = catalogue.find((game) => game.id === id)
    assert(item, `Public original ${id}`)
    assert.equal(item.themeId, id)
    assert.equal(item.questionCount, 6)
    previews.set(id, await read(`/api/extensions/preview/public/${id}`))
  }
  const masters = JSON.stringify([...previews])
  const owner = await registerAndLoginAccount({
    origin,
    fetchImpl,
    email: "originals-owner@example.invalid",
    password: `${randomBytes(24).toString("base64url")}Aa1!`,
    codes: trap.codes,
  })
  const other = await registerAndLoginAccount({
    origin,
    fetchImpl,
    email: "originals-other@example.invalid",
    password: `${randomBytes(24).toString("base64url")}Aa1!`,
    codes: trap.codes,
  })
  const installed = new Map()
  const fixtures = new Map()
  for (const id of ids) {
    assert.equal(
      (
        await request(`/api/extensions/catalogue/${id}/install`, undefined, {
          method: "POST",
          body: "{}",
        })
      ).status,
      401,
    )
    const response = await request(
      `/api/extensions/catalogue/${id}/install`,
      owner.token,
      { method: "POST", body: "{}" },
    )
    assert.equal(response.status, 201)
    const install = await response.json()
    assert.equal(install.created, true)
    const quizz = await read(`/api/quizz/${install.quizzId}`, owner.token)
    const stored = await read(
      `/api/extensions/quizzes/${install.quizzId}`,
      owner.token,
    )
    assert.equal(quizz.questions.length, 6)
    assert.equal(stored.extras.defaults.showTheme.id, id)
    assert.notEqual(
      (await request(`/api/quizz/${install.quizzId}`, other.token)).status,
      200,
    )
    installed.set(id, { ...install, quizz, extras: stored.extras })

    const questionIds = Array.from({ length: 4 }, () => randomUUID())
    const questionScenarios = [
      "an authored correct answer",
      "a real tie",
      "no votes",
      "an authored correct answer",
    ]
    const matrixQuiz = {
      subject: `Original acceptance ${id}`,
      gameMode: "quiz",
      questions: [2, 3, 4, 5].map((count, index) => ({
        type: "single",
        playMode: index === 1 || index === 2 ? "survey" : "quiz",
        question: `${id}: ${count} choices, ${questionScenarios[index]}`,
        answers: Array.from(
          { length: count },
          (_, answer) =>
            count === 5 && answer === 0
              ? "The explorer follows the lantern-lit path through the ancient forest to the observatory."
              : `Choice ${answer + 1}`,
        ),
        solutions: index === 1 || index === 2 ? [] : [count - 1],
        cooldown: 2,
        time: 30,
        ...(index === 3
          ? {
              media: {
                type: "image",
                url: `${origin}/tadazz-show/originals/${id}/poster.png`,
              },
            }
          : {}),
      })),
    }
    const extras = createDefaultQuizExtrasV2(
      "temp-new",
      questionIds,
      computeCanonicalBaseDigest(matrixQuiz),
    )
    extras.defaults.advanceMode = "manual"
    extras.defaults.leaderboardPolicy = "disabled"
    extras.defaults.showTheme = { id, version: "1.0.0", overrides: {} }
    for (const [index, questionId] of questionIds.entries()) {
      extras.perQuestion[questionId] = {
        answerVisuals: Array.from({ length: index + 2 }, (_, answerIndex) => {
          const shape = ["circle", "square", "triangle", "star"][answerIndex]

          return {
            answerIndex,
            display: "both",
            alt: shape ?? "Original family poster",
            url:
              origin +
              (shape
                ? `/tadazz-show/gallery/picture-${shape}.png`
                : `/tadazz-show/originals/${id}/poster.png`),
          }
        }),
      }
    }
    const saved = await request("/api/extensions/quizzes", owner.token, {
      method: "POST",
      body: JSON.stringify({ quizz: matrixQuiz, extras }),
    })
    assert([200, 201].includes(saved.status))
    fixtures.set(id, {
      quizId: (await saved.json()).quizId,
      quizz: matrixQuiz,
      extras,
    })
  }
  record("eight-native-installs-and-isolated-two-to-five-choice-fixtures", {
    originals: 8,
    rounds: 32,
    anonymousInstallDenied: true,
    crossAccountReadDenied: true,
  })
  const { verifyOriginalThemeBrowser } = await import("./browser-verify.mjs")
  await verifyOriginalThemeBrowser({
    origin,
    token: owner.token,
    installed,
    fixtures,
    previews,
    evidence,
    record,
    definitions: ids.map((id) => showThemeRegistry.get(id, "1.0.0")),
    read: (path) => read(path, owner.token),
  })
  const after = new Map()
  for (const id of ids) {
    after.set(id, await read(`/api/extensions/preview/public/${id}`))
  }
  assert.equal(
    JSON.stringify([...after]),
    masters,
    "All public masters remain unchanged",
  )
  record("immutable-public-masters-after-editor-and-live-games")
  writeFileSync(
    join(evidence, "receipt.json"),
    `${JSON.stringify(
      {
        passed: true,
        platform: process.platform,
        sourceSha: process.env.TADAZZ_ORIGINALS_SOURCE_SHA,
        isolatedNativeHost: true,
        customerMountUsed: false,
        realEmailSent: false,
        manualListeningPerformed: false,
        results,
      },
      null,
      2,
    )}\n`,
  )
} catch (error) {
  writeFileSync(
    join(evidence, "receipt.json"),
    `${JSON.stringify(
      {
        passed: false,
        sourceSha: process.env.TADAZZ_ORIGINALS_SOURCE_SHA,
        isolatedNativeHost: true,
        customerMountUsed: false,
        realEmailSent: false,
        manualListeningPerformed: false,
        results,
        error: String(error?.stack ?? error),
      },
      null,
      2,
    )}\n`,
  )
  console.error(error)
  process.exitCode = 1
} finally {
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
}
