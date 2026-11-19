import {
  closeWorkspaceDrawers,
  openWorkspacePanel,
  observeHostLifecycle,
  prepareHostNavigation,
  verifyWorkspaceControls,
} from "./workspace-controls.mjs"
import { runLayoutDiagnostic } from "./layout-diagnostic.mjs"
import { verifyHostControls } from "./host-controls.mjs"
import {
  installPhaseContinuityProbe,
  verifyPhaseContinuity,
} from "./phase-continuity.mjs"
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
  fixture as createFixture,
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
import { createRefreshingPkceSession } from "../phase3-native-consent/oauth-refresh-session.ts"
import {
  Client,
  StreamableHTTPClientTransport,
} from "../phase3-mcp-service/mcp-client.ts"
import { createFullShowPreviewPortV3 } from "../../src/mcp-app/server/full-show-frame.ts"
import {
  FULL_SHOW_RESOURCE_V3,
  FULL_SHOW_META_V3,
} from "../../src/mcp-app/contracts/full-show-frame.ts"
import {
  createNativeResultParityFixtures,
  createAdditionalNativeSceneFixtures,
} from "./native-parity-fixtures.ts"
import { createBuiltinAssetResolver } from "../../src/mcp-app/native-host/builtin-asset-policy.ts"
import { previewNativeLabels } from "../../src/presentation/show-library-preview/i18n.ts"
import {
  resources as widgetLabels,
  locales as widgetLocales,
} from "../../src/mcp-app/widget/i18n.ts"
import { normalizeDraft } from "../../src/mcp-app/server/authoring.ts"
import { hashJson } from "../../src/mcp-app/contracts/canonical.ts"
import { tadaShowV1Schema } from "../../src/core/show-authoring-schema.ts"

const expectedLocaleText = {
  he: { previous: "הכרטיס הקודם", editing: "עריכת הטיוטה הזו" },
  en: {
    previous: "Previous card",
    editing: "Edit this draft",
  },
  fr: {
    previous: "Carte précédente",
    editing: "Modifier ce brouillon",
  },
  de: {
    previous: "Vorherige Karte",
    editing: "Diesen Entwurf bearbeiten",
  },
  es: {
    previous: "Tarjeta anterior",
    editing: "Editar este borrador",
  },
  it: {
    previous: "Scheda precedente",
    editing: "Modifica questa bozza",
  },
  ja: {
    previous: "前のカード",
    editing: "この下書きを編集",
  },
  tr: {
    previous: "Önceki kart",
    editing: "Bu taslağı düzenle",
  },
  vi: {
    previous: "Thẻ trước",
    editing: "Chỉnh sửa bản nháp này",
  },
}
const expectedTransportText = {
  he: ["השהיית המופע", "יחס ממדים"],
  en: ["Pause show", "Aspect ratio"],
  fr: ["Mettre en pause", "Format d\u2019image"],
  de: ["Show pausieren", "Seitenverh\u00e4ltnis"],
  es: ["Pausar espect\u00e1culo", "Relaci\u00f3n de aspecto"],
  it: ["Metti in pausa", "Formato immagine"],
  ja: [
    "\u30b7\u30e7\u30fc\u3092\u4e00\u6642\u505c\u6b62",
    "\u753b\u9762\u6bd4\u7387",
  ],
  tr: ["G\u00f6steriyi duraklat", "En boy oran\u0131"],
  vi: [
    "T\u1ea1m d\u1eebng ch\u01b0\u01a1ng tr\u00ecnh",
    "T\u1ef7 l\u1ec7 khung h\u00ecnh",
  ],
}
assert.equal(widgetLocales.length, 9)
assert.deepEqual(
  [...widgetLocales].sort(),
  Object.keys(expectedLocaleText).sort(),
)
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
const semanticAssets = createBuiltinAssetResolver({
  origin: "https://tadazz.com",
  publicAssets: manifest.publicAssets,
  verifyCurrentAsset(entry) {
    try {
      const file = path.join(root, entry.path),
        stat = fs.lstatSync(file)

      if (!stat.isFile() || stat.isSymbolicLink()) {
        return false
      }

      const bytes = fs.readFileSync(file)

      return bytes.length === entry.bytes && digest(bytes) === entry.sha256
    } catch {
      return false
    }
  },
})
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
const f = await createFixture()
const issuer = await createFirstPartyOAuth({
  ...buildMcpOptions({ origin, keys: createEphemeralOAuthKeys() }),
  nativeSave: undefined,
  configRoot: f.root,
})
const oauthFetch = (input, init) => {
  const request = new Request(input, init)
  request.headers.set("host", new URL(origin).host)

  return issuer.fetch(request)
}
const grant = await authorizePkceGrant({
  origin,
  nativeToken: f.sessions[0].token,
  scopes: ["tadazz.drafts.read", "tadazz.drafts.write", "tadazz.catalog.read"],
  verifyConsentHead: false,
  fetchImpl: oauthFetch,
})
const qaSession = await createRefreshingPkceSession({
  origin,
  clientId: "tadazz-chatgpt-client",
  grant,
  fetchImpl: oauthFetch,
  verifyAccessToken: issuer.verifyAccessToken,
})
const { accountId } = await qaSession.principal()
const scenarios = new Map()
const entries = []
const observations = []
const rendererFixtures = []
const errors = []
const calls = []
const resources = []
const engines = []
const outboundDenied = []
let sourceHashesUnchanged = false
const network = []
const requestFailures = []
const pageErrorEvents = []
const qaRequestEvents = []
const activity = { check: null, step: null }
const failureStateDiagnostic =
  process.env.TADAZZ_FULL_SHOW_DIAGNOSTIC === "failure-state"
let captureActiveFailure = null
function writeProgress(active) {
  activity.step = active ?? activity.check
  fs.writeFileSync(
    path.join(evidence, "progress.json"),
    JSON.stringify(
      {
        active,
        at: new Date().toISOString(),
        oauthSession: qaSession.evidence(),
        entries,
        observations,
        rendererFixtures,
        calls,
        errors,
        resources,
        requestFailures,
        pageErrorEvents,
        qaRequestEvents,
        requests: network,
      },
      null,
      2,
    ),
  )
}
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
      if (scenario.rendererFixture) {
        const { frame } = scenario.rendererFixture
        const result = structuredClone(scenario.lastPreviewResult)
        result._meta[FULL_SHOW_META_V3] = frame
        Object.assign(result.structuredContent.data, {
          draftId: frame.inventory.draftId,
          revision: frame.inventory.revision,
          title: frame.inventory.title,
          selectedChapterId: frame.inventory.selectedChapterId,
          chapterCount: frame.inventory.chapters.length,
          frameDigest: hashJson(frame),
        })
        const selection = {
          ...scenario.selection,
          expectedRevision: frame.inventory.revision,
          chapterId: frame.inventory.selectedChapterId,
          context: frame.inventory.context,
        }
        res.setHeader("Content-Type", "application/json")
        res.end(JSON.stringify({ selection, result }))

        return
      }

      const current = await scenario.repository.get(
        await qaSession.principal(),
        scenario.record.draftId,
      )
      scenario.selection.expectedRevision = current.revision
      const result = await scenario.client.callTool({
        name: "preview_show",
        arguments: scenario.selection,
      })
      assert.notEqual(result.isError, true)
      scenario.lastPreviewResult = result
      if (failureStateDiagnostic) {
        scenario.lastInitialPreview = {
          acknowledgedAt: new Date().toISOString(),
          requestedChapterId: scenario.selection.chapterId,
          frame: result.structuredContent?.data,
        }
      }
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
          "apply_game_edit",
          "undo_game_edit",
          "list_editing_assets",
          "list_themes",
        ].includes(call.name),
      )
      const result = await scenario.client.callTool(call)

      if (call.name === "preview_show" && result.isError !== true) {
        scenario.lastPreviewResult = result
      }

      calls.push({
        name: call.name,
        ...(failureStateDiagnostic
          ? {
              completedAt: new Date().toISOString(),
              requestedChapterId: call.arguments?.chapterId,
            }
          : {}),
        inputRevision: call.arguments?.expectedRevision,
        inputDigest: hashJson(call.arguments),
        patchKind: call.arguments?.patch?.kind,
        result: result.structuredContent,
        isError: result.isError,
      })
      writeProgress(`HTTP ${call.name}`)
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
        // Q3 hosts real audio edits across slower browser engines. Other cards
        // retain their short authored timers for automatic progression checks.
        timeSeconds: i === 2 ? 120 : card.timeSeconds,
        note: `PRIVATE_NOTE_${i}`,
        question: `SELECTED_QUESTION_${i}`,
        answers: ["A", "B", "C", "D", "E"].map((text) => ({ text })),
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
    defaults: {
      showTheme: { id: theme, version: "1.0.0" },
      // Native appearance is host-owned trusted configuration. Raw model-authored
      // cards remain subject to the unchanged presentation-field deny policy.
      ...(process.env.TADAZZ_FULL_SHOW_DIAGNOSTIC === "phase-continuity"
        ? {
            stageAnimations: {
              questionEntrance: { preset: "slide-up", durationMs: 600 },
              answerEntrance: {
                preset: "cascade",
                durationMs: 650,
                timing: "sequential",
                staggerMs: 90,
              },
              resultsRevealEntrance: { preset: "zoom-soft", durationMs: 700 },
            },
          }
        : {}),
    },
  }).defaults
  const authoring = {
    ...policy,
    trustedDefaults,
    semantic: { assets: semanticAssets },
  }
  const repository = issuer.draftRepository(authoring)
  const normalized = normalizeDraft(JSON.stringify(authored), authoring)
  const idempotencyKey = key()
  const record = await repository.create(
    await qaSession.principal(),
    normalized,
    {
      idempotencyKey,
      correlationId: key(),
      inputDigest: hashJson({
        contractVersion: "0.1.0",
        authoredShowJson: normalized.authoredShowJson,
        idempotencyKey,
      }),
    },
  )
  const preview = createFullShowPreviewPortV3(
    { drafts: repository, authoring },
    {
      rendererBuildId: manifest.rendererBuildId,
      assertAssets(p, requestedTheme, urls) {
        assert.equal(p.accountId, accountId)
        assert(
          ["tadazz-classic", "razzia-original"].includes(requestedTheme.id),
        )
        for (const url of urls) {
          assert(
            ["background", "answer-image", "audio"].some((purpose) =>
              semanticAssets.resolveStoredUrl(url, {
                theme: requestedTheme,
                purpose,
                operation: "preview",
              }),
            ),
          )
          assert(assets.has(new URL(url).pathname))
        }
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
      semanticDrafts: issuer.semanticDraftRepository(authoring),
      catalog: issuer.catalog({
        locale: () => "en",
        translate: (messageKey, language) =>
          String(previewNativeLabels(language).i18n.t(messageKey)),
      }),
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
  let nextHttpSlot = 0
  const client = new Client({ name: "native-v3-browser-qa", version: "3" })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      authProvider: { token: qaSession.token },
      fetch: async (input, init) => {
        // Respect the real anonymous 120/minute ingress budget; do not weaken it for QA.
        const wait = Math.max(0, nextHttpSlot - Date.now())
        nextHttpSlot = Math.max(nextHttpSlot, Date.now()) + 520

        if (wait) {
          await new Promise((resolve) => {
            setTimeout(resolve, wait)
          })
        }

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
  const first = await preview.render(await qaSession.principal(), selectedInput)
  const id = key()
  const scenario = {
    id,
    client,
    instance,
    repository,
    authoring,
    record,
    selection,
    chapters: first.inventory.chapters,
  }
  scenarios.set(id, scenario)

  return scenario
}
async function run(name, operation, budgetMs = 120000) {
  activity.check = name
  const start = Date.now()
  writeProgress(name)
  console.log(`START ${name}`)
  let timeout = null

  try {
    await qaSession.principal()
    await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`QA_CHECK_TIMEOUT: ${name}`)),
          budgetMs,
        )
      }),
    ])
    entries.push({ name, status: "PASS", budgetMs, ms: Date.now() - start })
  } catch (error) {
    entries.push({
      name,
      status: "FAIL",
      error: String(error),
      stack: error.stack?.slice(0, 3500),
      budgetMs,
      ms: Date.now() - start,
    })
    console.error(`${name}: ${error.message}`)
    if (captureActiveFailure) {
      await captureActiveFailure("check failure", {
        check: name,
        error: String(error),
      })
    }

    if (error.message.startsWith("QA_CHECK_TIMEOUT")) {
      throw error
    }
  } finally {
    clearTimeout(timeout)
    activity.check = null
    writeProgress(null)
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
    for (const theme of (
      process.env.TADAZZ_FULL_SHOW_THEMES ?? "tadazz-classic,razzia-original"
    ).split(",")) {
      assert(["tadazz-classic", "razzia-original"].includes(theme))
      const scenario = await scenarioFor(theme, engine)
      const context = await browser.newContext({
        viewport: { width: 1280, height: 1200 },
        reducedMotion: "reduce",
      })
      await context.addInitScript(() => {
        window.__nativeAudio = []
        window.__nativePlayCalls = []
        const originalPlay = HTMLMediaElement.prototype.play
        HTMLMediaElement.prototype.play = function play(...args) {
          if (!window.__nativeAudio.includes(this)) {
            window.__nativeAudio.push(this)
          }

          window.__nativePlayCalls.push({
            index: window.__nativeAudio.indexOf(this),
            userGesture: navigator.userActivation?.isActive ?? null,
          })

          return originalPlay.apply(this, args)
        }
        window.__cspViolations = []
        document.addEventListener("securitypolicyviolation", (event) =>
          window.__cspViolations.push({
            directive: event.effectiveDirective,
            blocked: event.blockedURI,
            source: event.sourceFile,
          }),
        )
      })
      if (failureStateDiagnostic) {
        await context.addInitScript(() => {
          window.__failureUiEvents = []
          for (const type of ["pointerdown", "pointerup", "click"]) {
            document.addEventListener(
              type,
              (event) => {
                const target = event
                  .composedPath()
                  .find(
                    (node) =>
                      node instanceof Element &&
                      node.matches(
                        '[data-testid="full-show-undo"],[data-testid="full-show-demo-reveal"]',
                      ),
                  )
                if (!target) return
                const native = document.querySelector(
                  '[data-testid="full-show-native-surface"]',
                )?.shadowRoot
                const stage = native?.querySelector("[data-full-show-chapter]")
                window.__failureUiEvents.push({
                  at: new Date().toISOString(),
                  eventTimestamp: event.timeStamp,
                  type: event.type,
                  trusted: event.isTrusted,
                  target: target.getAttribute("data-testid"),
                  disabled: target.disabled ?? null,
                  ariaDisabled: target.getAttribute("aria-disabled"),
                  chapter: stage?.getAttribute("data-full-show-chapter"),
                  elapsed: stage?.getAttribute("data-playback-elapsed"),
                  paused: stage?.getAttribute("data-playback-paused"),
                  epoch: stage?.getAttribute("data-playback-epoch"),
                  revision: document.querySelector(
                    '[data-testid="full-show-revision"]',
                  )?.textContent,
                })
                if (window.__failureUiEvents.length > 20)
                  window.__failureUiEvents.shift()
              },
              { capture: true, passive: true },
            )
          }
        })
      }
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      const caseErrors = []
      let diagnosticSequence = 0
      const captureFailureState = async (reason, detail = {}) => {
        if (!failureStateDiagnostic) return
        const sequence = ++diagnosticSequence
        const stem = `${engine}-${theme}-failure-state-${sequence}`
        const capture = {
          at: new Date().toISOString(),
          engine,
          theme,
          reason,
          check: activity.check,
          step: activity.step,
          detail,
          requestedChapterId: scenario.selection.chapterId,
          initialFrame: scenario.lastInitialPreview,
          lastAcknowledgedPreview:
            scenario.lastPreviewResult?.structuredContent?.data,
          hostUrl: page.url(),
        }
        const bounded = async (operation) => {
          let timer
          try {
            return await Promise.race([
              operation,
              new Promise((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error("capture budget")),
                  3000,
                )
              }),
            ])
          } catch (error) {
            return { captureError: String(error) }
          } finally {
            clearTimeout(timer)
          }
        }
        const child = page
          .frames()
          .find((frame) => frame.url().endsWith("/widget"))
        capture.widget = child
          ? await bounded(
              child.evaluate(() => {
                const host = document.querySelector(
                  '[data-testid="full-show-native-surface"]',
                )
                const shadow = host?.shadowRoot
                const describe = (element) => {
                  if (!element) return null
                  const rect = element.getBoundingClientRect()
                  const style = getComputedStyle(element)
                  return {
                    attributes: Object.fromEntries(
                      [...element.attributes].map((a) => [a.name, a.value]),
                    ),
                    rect: {
                      x: rect.x,
                      y: rect.y,
                      width: rect.width,
                      height: rect.height,
                    },
                    clientSize: {
                      width: element.clientWidth,
                      height: element.clientHeight,
                    },
                    scrollSize: {
                      width: element.scrollWidth,
                      height: element.scrollHeight,
                    },
                    style: {
                      display: style.display,
                      visibility: style.visibility,
                      opacity: style.opacity,
                      transform: style.transform,
                      overflow: style.overflow,
                    },
                    text: element.innerText?.slice(0, 3000) ?? null,
                    textContent: element.textContent?.slice(0, 3000) ?? null,
                  }
                }
                const native = shadow?.querySelector(".widget-native-stage")
                const stage = shadow?.querySelector("[data-full-show-chapter]")
                const renderer = shadow?.querySelector(
                  '[data-testid="tadazz-stage"],[data-testid="native-razzia-preview-v2"]',
                )
                return {
                  capturedAt: new Date().toISOString(),
                  uiEvents: window.__failureUiEvents?.slice() ?? [],
                  documentReady: document.readyState,
                  visibilityState: document.visibilityState,
                  uiText: document.body.innerText.slice(0, 7000),
                  revision: document.querySelector(
                    '[data-testid="full-show-revision"]',
                  )?.textContent,
                  status: [...document.querySelectorAll('[role="status"]')].map(
                    (x) => x.textContent,
                  ),
                  pause: describe(
                    document.querySelector('[data-testid="full-show-pause"]'),
                  ),
                  host: describe(host),
                  layoutAncestors: (() => {
                    const result = []
                    let element = host?.parentElement
                    while (element && result.length < 5) {
                      result.push(describe(element))
                      element = element.parentElement
                    }
                    return result
                  })(),
                  native: describe(native),
                  stage: describe(stage),
                  renderer: describe(renderer),
                  preview: describe(
                    shadow?.querySelector(
                      '[data-testid="native-preview-surface"]',
                    ),
                  ),
                  fit: describe(
                    shadow?.querySelector(
                      '[data-testid="native-stage-viewport"]',
                    ),
                  ),
                  question: describe(
                    shadow?.querySelector(
                      '[data-testid="tadazz-question-panel"],[data-testid="native-razzia-question"]',
                    ),
                  ),
                  answers: [
                    ...(shadow?.querySelectorAll(
                      '[data-testid^="tadazz-card-"],[data-testid^="native-razzia-answer-"],[data-testid^="photo-card-choice-"]',
                    ) ?? []),
                  ].map(describe),
                  nativeMarkup: native?.outerHTML.slice(0, 20000) ?? null,
                }
              }),
            )
          : {
              missingWidgetFrame: true,
              frames: page.frames().map((frame) => frame.url()),
            }
        capture.host = await bounded(
          page.evaluate(() => ({
            capturedAt: new Date().toISOString(),
            ready: document.documentElement.getAttribute("data-host-ready"),
            calls: window.__host?.calls?.(),
            lifecycle: window.__host?.lifecycle?.(),
            iframe: [...document.querySelectorAll("iframe")].map((frame) => ({
              src: frame.src,
              rect: {
                width: frame.getBoundingClientRect().width,
                height: frame.getBoundingClientRect().height,
              },
              visibility: getComputedStyle(frame).visibility,
              display: getComputedStyle(frame).display,
            })),
          })),
        )
        capture.requests = qaRequestEvents
          .filter((event) => event.engine === engine && event.theme === theme)
          .slice(-12)
        capture.calls = calls.slice(-12)
        capture.screenshot = await bounded(
          page
            .screenshot({
              path: path.join(evidence, `${stem}.png`),
              timeout: 3000,
            })
            .then(() => `${stem}.png`),
        )
        fs.writeFileSync(
          path.join(evidence, `${stem}.json`),
          JSON.stringify(capture, null, 2),
        )
        observations.push({
          engine,
          theme,
          check: "diagnostic failure state",
          reason,
          file: `${stem}.json`,
          at: capture.at,
        })
        writeProgress(activity.step)
      }
      captureActiveFailure = failureStateDiagnostic ? captureFailureState : null
      observeHostLifecycle(page, (event) => {
        observations.push({
          engine,
          theme,
          check: "host document lifecycle",
          ...event,
        })
        writeProgress(activity.step)
      })
      const qaRequests = new WeakMap()
      page.on("pageerror", (error) => {
        caseErrors.push(error.message)
        pageErrorEvents.push({
          at: new Date().toISOString(),
          engine,
          theme,
          activeCheck: activity.check,
          activeStep: activity.step,
          url: page.url(),
          message: error.message,
          stack: error.stack,
        })
        writeProgress(activity.step)
      })
      page.on("requestfailed", (request) => {
        requestFailures.push({
          engine,
          theme,
          failed: true,
          at: new Date().toISOString(),
          activeCheck: activity.check,
          activeStep: activity.step,
          documentUrl: page.url(),
          requestStarted: qaRequests.get(request),
          url: request.url(),
          error: request.failure()?.errorText,
        })
      })
      page.on("request", (request) => {
        if (request.url().startsWith(`${base}/qa/`)) {
          const event = {
            at: new Date().toISOString(),
            engine,
            theme,
            activeCheck: activity.check,
            activeStep: activity.step,
            documentUrl: page.url(),
            url: request.url(),
            method: request.method(),
          }
          if (failureStateDiagnostic && request.method() === "POST") {
            try {
              const call = request.postDataJSON()
              event.tool = call?.name
              event.requestedChapterId = call?.arguments?.chapterId
              event.expectedRevision = call?.arguments?.expectedRevision
              event.patchKind = call?.arguments?.patch?.kind
            } catch {
              event.postDataUnparsed = true
            }
          }
          qaRequests.set(request, event)
          qaRequestEvents.push(event)
        }

        if (
          !request.url().startsWith(base) &&
          !request.url().startsWith("data:")
        ) {
          network.push({ engine, theme, url: request.url() })
        }
      })
      page.on("response", (response) => {
        const event = qaRequests.get(response.request())

        if (event) {
          const headers = response.headers()
          event.responseAt = new Date().toISOString()
          event.status = response.status()
          event.contentType = headers["content-type"]
          event.allowOrigin = headers["access-control-allow-origin"] ?? null
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
      // Explicit native-phase inspections use a fresh, real tool invocation.
      // The production Next/Previous controls navigate logical cards; their
      // complete timed-question flow is asserted by verifyWorkspaceControls.
      const loadNativeChapter = async (chapter) => {
        assert(chapter)
        const diagnosticLoad = failureStateDiagnostic
          ? {
              engine,
              theme,
              check: "explicit native chapter load",
              chapterId: chapter.id,
              kind: chapter.kind,
              startedAt: new Date().toISOString(),
            }
          : null
        if (diagnosticLoad) observations.push(diagnosticLoad)
        try {
          scenario.selection.chapterId = chapter.id
          await prepareHostNavigation(page, "navigate host")
          await page.goto(`${base}/host?scenario=${scenario.id}`)
          await page.locator("html[data-host-ready=true]").waitFor()
          await page
            .frameLocator("iframe")
            .locator(`[data-full-show-chapter="${chapter.id}"]`)
            .waitFor()
          const child = page
            .frames()
            .find((value) => value.url().endsWith("/widget"))
          assert(child)
          // The acknowledged frame mounts before native transitions and viewport
          // fitting finish. Wait for actual visible content, not a fixed delay.
          await child.waitForFunction(
            (chapterId) => {
              const native = document.querySelector(
                '[data-testid="full-show-native-surface"]',
              )?.shadowRoot
              const selected = native?.querySelector("[data-full-show-chapter]")
              const viewport = native?.querySelector(
                '[data-testid="native-stage-viewport"]',
              )

              return (
                selected?.getAttribute("data-full-show-chapter") ===
                  chapterId &&
                Boolean(
                  native
                    ?.querySelector(".widget-native-stage")
                    ?.innerText.trim(),
                ) &&
                (!viewport ||
                  viewport.getAttribute("data-fit-ready") === "true")
              )
            },
            chapter.id,
            { timeout: 10000 },
          )
          if (diagnosticLoad)
            diagnosticLoad.completedAt = new Date().toISOString()
        } catch (error) {
          if (diagnosticLoad) {
            diagnosticLoad.failedAt = new Date().toISOString()
            diagnosticLoad.error = String(error)
            await captureFailureState(
              "native chapter load failure",
              diagnosticLoad,
            )
          }
          throw error
        }
      }

      if (process.env.TADAZZ_FULL_SHOW_DIAGNOSTIC === "phase-continuity") {
        await installPhaseContinuityProbe(page)
        for (const reducedMotion of [false, true]) {
          await run(
            `${engine} / ${theme} phase continuity ${
              reducedMotion ? "reduced motion" : "normal motion"
            }`,
            async () => {
              observations.push(
                await verifyPhaseContinuity({
                  page,
                  base,
                  scenario,
                  engine,
                  theme,
                  evidence,
                  reducedMotion,
                  readRecord: async () =>
                    scenario.repository.get(
                      await qaSession.principal(),
                      scenario.record.draftId,
                    ),
                }),
              )
              assert.deepEqual(caseErrors, [])
            },
            60000,
          )
        }
        await prepareHostNavigation(page, "close continuity context")
        await context.close()

        continue
      }

      if (process.env.TADAZZ_FULL_SHOW_DIAGNOSTIC === "workspace") {
        await run(
          `${engine} / ${theme} shared workspace and logical card navigation`,
          async () => {
            observations.push(
              await verifyWorkspaceControls({
                page,
                base,
                scenario,
                engine,
                theme,
                evidence,
                readRecord: async () =>
                  scenario.repository.get(
                    await qaSession.principal(),
                    scenario.record.draftId,
                  ),
              }),
            )
            await prepareHostNavigation(page, "browser error assertion")
            assert.deepEqual(caseErrors, [])
          },
        )
        await prepareHostNavigation(page, "close context")
        await context.close()

        continue
      }

      if (process.env.TADAZZ_FULL_SHOW_DIAGNOSTIC === "layout") {
        await run(
          `${engine} / ${theme} development viewport diagnostic`,
          async () => {
            observations.push(
              await runLayoutDiagnostic({
                scenario,
                page,
                base,
                evidence,
                theme,
                engine,
              }),
            )
          },
        )
        await prepareHostNavigation(page, "close context")
        await context.close()

        continue
      }

      if (process.env.TADAZZ_FULL_SHOW_DIAGNOSTIC === "host-controls") {
        await run(
          `${engine} / ${theme} synthetic host UI controls`,
          async () => {
            await prepareHostNavigation(page, "navigate host")
            await page.goto(`${base}/host?scenario=${scenario.id}`)
            await page.locator("html[data-host-ready=true]").waitFor()
            await page
              .frameLocator("iframe")
              .locator("[data-full-show-chapter]")
              .waitFor()
            observations.push(
              await verifyHostControls({
                page,
                base,
                scenario,
                engine,
                theme,
                evidence,
                readRecord: async () =>
                  scenario.repository.get(
                    await qaSession.principal(),
                    scenario.record.draftId,
                  ),
              }),
            )
          },
        )
        await prepareHostNavigation(page, "close context")
        await context.close()

        continue
      }

      await run(
        failureStateDiagnostic
          ? `${engine} / ${theme} diagnostic workspace and logical card navigation`
          : `${engine} / ${theme} native opening, five phases, transitions and closing`,
        async () => {
          observations.push(
            await verifyWorkspaceControls({
              page,
              base,
              scenario,
              engine,
              theme,
              evidence,
              readRecord: async () =>
                scenario.repository.get(
                  await qaSession.principal(),
                  scenario.record.draftId,
                ),
            }),
          )
          if (failureStateDiagnostic) return
          await page.setViewportSize({ width: 1280, height: 1200 })
          const iframe = page.frameLocator("iframe")
          const stage = iframe.locator("[data-full-show-chapter]")
          const nativePhaseEvidence = {
            engine,
            theme,
            check: "native chapter rendering",
            expectedPhases: scenario.chapters.length,
            completedPhases: [],
          }
          observations.push(nativePhaseEvidence)
          for (const [index, chapter] of scenario.chapters.entries()) {
            const phaseStarted = Date.now()
            await loadNativeChapter(chapter)

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

            nativePhaseEvidence.completedPhases.push({
              position: index + 1,
              chapterId: chapter.id,
              kind: chapter.kind,
              milliseconds: Date.now() - phaseStarted,
            })
            writeProgress(
              `${engine} / ${theme} native chapter ${index + 1}/${scenario.chapters.length}`,
            )
          }
          assert.equal(
            await iframe.getByTestId("full-show-next").isDisabled(),
            true,
          )
          const current = await scenario.repository.get(
            await qaSession.principal(),
            scenario.record.draftId,
          )
          assert.equal(current.revision, 1)
          assert.equal(
            current.authoredShowJson,
            scenario.record.authoredShowJson,
          )
        },
        // Twenty-eight fresh tool invocations plus responsive workspace checks
        // need the same one-CPU budget as the compound semantic editing check.
        300000,
      )
      await run(
        `${engine} / ${
          theme
        } title edit CAS and summary refresh through AppBridge`,
        async () => {
          const iframe = page.frameLocator("iframe")
          await openWorkspacePanel(page, "edit")
          await iframe
            .getByLabel("Draft title", { exact: true })
            .fill(`Edited title ${theme}`)
          await iframe.getByTestId("full-show-apply-title").click()
          await iframe
            .getByRole("heading", {
              name: `Edited title ${theme}`,
              exact: true,
            })
            .waitFor()
          const current = await scenario.repository.get(
            await qaSession.principal(),
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
            uiCalls.includes("apply_game_edit") &&
              uiCalls.includes("get_game_draft_summary"),
          )
          assert(
            !uiCalls.includes("get_game_draft") &&
              !uiCalls.includes("update_game_draft"),
          )
        },
      )

      await run(
        `${engine} / ${theme} semantic question, lost ACK retry, reconnect undo, purple background, five pictures and theme preservation`,
        async () => {
          const iframe = page.frameLocator("iframe")
          const currentRecord = async () =>
            scenario.repository.get(
              await qaSession.principal(),
              scenario.record.draftId,
            )
          const revision = async () => (await currentRecord()).revision
          const waitRevision = async (value) => {
            await iframe
              .getByTestId("full-show-revision")
              .filter({ hasText: new RegExp(`^Revision ${value}$`) })
              .waitFor()
            await iframe
              .getByTestId("full-show-replay")
              .waitFor({ state: "visible" })
          }
          const go = async (kind, ordinal) => {
            const target = scenario.chapters.find(
              (chapter) =>
                chapter.kind === kind && chapter.questionOrdinal === ordinal,
            )
            await loadNativeChapter(target)
          }
          const loadAssets = async () => {
            await openWorkspacePanel(page, "edit")
            const details = iframe.locator(".widget-editor details")

            if (!(await details.getAttribute("open"))) {
              if (!(await details.evaluate((element) => element.open))) {
                await details.locator("summary").click()
              }
            }

            await iframe.getByTestId("full-show-load-assets").click()
            await iframe.getByTestId("full-show-background").waitFor()
          }
          const verifyDemoSelection = async (pictures) => {
            await go("answerCards", 3)
            const before = await currentRecord()
            const beforeCalls = await page.evaluate(() => window.__host.calls())
            const choice =
              theme === "tadazz-classic"
                ? iframe.getByTestId("tadazz-card-0")
                : iframe.getByTestId(
                    pictures ? "photo-card-choice-0" : "native-razzia-answer-0",
                  )
            await choice.focus()
            await choice.press("Enter")
            await iframe
              .locator(
                '[data-testid="full-show-demo-controls"][data-demo-selected-index="0"]',
              )
              .waitFor()

            if (theme === "tadazz-classic" || !pictures) {
              assert.equal(await choice.getAttribute("aria-pressed"), "true")
            } else {
              assert.equal(await choice.locator("svg.lucide-check").count(), 1)
            }

            assert.deepEqual(
              await page.evaluate(() => window.__host.calls()),
              beforeCalls,
              "Choosing a demo answer must not invoke any server tool",
            )
            const resultChapter = scenario.chapters.find(
              (item) => item.kind === "results" && item.questionOrdinal === 3,
            )
            assert(resultChapter)
            await iframe.getByTestId("full-show-demo-reveal").click()
            await iframe
              .locator(`[data-full-show-chapter="${resultChapter.id}"]`)
              .waitFor()
            await iframe.getByTestId("full-show-demo-result").waitFor()
            const actualResult =
              scenario.lastPreviewResult._meta[FULL_SHOW_META_V3].content.frame
            assert.equal(actualResult.phase, "results")
            assert(
              actualResult.results.every(
                (item) => item.count === 0 && item.percent === 0,
              ),
              "Local selection must not fabricate vote totals",
            )
            const chosen = actualResult.results.find(
              (item) => item.answerId === actualResult.choices[0].id,
            )
            assert(chosen)
            let expectedOutcome = "survey"

            if (chosen.correct !== undefined) {
              expectedOutcome = chosen.correct ? "correct" : "incorrect"
            }

            assert.equal(
              await iframe
                .getByTestId("full-show-demo-result")
                .getAttribute("data-demo-result"),
              expectedOutcome,
            )
            assert(
              (
                await iframe.getByTestId("full-show-demo-result").innerText()
              ).trim().length > 0,
            )
            const after = await currentRecord()
            assert.equal(after.revision, before.revision)
            assert.equal(after.authoredShowJson, before.authoredShowJson)
            const callsAfter = await page.evaluate(() => window.__host.calls())
            assert.deepEqual(callsAfter.slice(beforeCalls.length), [
              "preview_show",
            ])
            await iframe.getByTestId("full-show-replay").click()
            await iframe
              .locator(
                '[data-testid="full-show-demo-controls"][data-demo-selected-index=""]',
              )
              .waitFor()
            assert.equal(
              await iframe.getByTestId("full-show-demo-result").count(),
              0,
            )
            await go("answerCards", 3)
            await choice.click()
            await iframe
              .locator(
                '[data-testid="full-show-demo-controls"][data-demo-selected-index="0"]',
              )
              .waitFor()
            await go("question", 4)
            await iframe
              .locator(
                '[data-testid="full-show-demo-controls"][data-demo-selected-index=""]',
              )
              .waitFor()
            await go("answerCards", 3)
            await iframe
              .locator(
                '[data-testid="full-show-demo-controls"][data-demo-selected-index=""]',
              )
              .waitFor()
            observations.push({
              engine,
              theme,
              check: "local demo answer selection and authorized reveal",
              surface: pictures ? "five-pictures" : "text",
              keyboard: "Enter on original native card",
              noVoteMutation: true,
              revisionPreserved: true,
              revision: after.revision,
              sourceDraftSha256: digest(before.authoredShowJson),
              resultCounts: actualResult.results.map((item) => item.count),
              chosenOutcome: expectedOutcome,
              resetAfterReplay: true,
              resetAfterQuestionChange: true,
            })
          }
          await verifyDemoSelection(false)
          await go("question", 3)
          await openWorkspacePanel(page, "edit")
          await iframe
            .getByTestId("full-show-question-text")
            .fill("ACK_VERIFIED_QUESTION_THREE")
          await page.evaluate(() => window.__host.dropMutationAck())
          await iframe.getByTestId("full-show-apply-question").click()
          await openWorkspacePanel(page, "save")
          await iframe.getByTestId("full-show-retry-edit").waitFor()
          await iframe
            .getByRole("status")
            .filter({ hasText: "draft changed elsewhere" })
            .waitFor()
          const afterLostAck = await revision()
          observations.push({
            engine,
            theme,
            check: "lost ACK durable revision",
            revision: afterLostAck,
          })
          assert.equal(afterLostAck, 3)
          await iframe.getByTestId("full-show-retry-edit").click()
          await waitRevision(afterLostAck)
          assert.equal(
            await revision(),
            afterLostAck,
            "Retry must replay the durable operation",
          )
          assert.equal(
            JSON.parse((await currentRecord()).authoredShowJson).cards.find(
              (card) => card.key === "q3",
            ).question,
            "ACK_VERIFIED_QUESTION_THREE",
          )
          await prepareHostNavigation(page, "reload host")
          await page.reload()
          await page.locator("html[data-host-ready=true]").waitFor()
          await waitRevision(afterLostAck)
          await openWorkspacePanel(page, "edit")
          await iframe.getByTestId("full-show-undo").click()
          await waitRevision(afterLostAck + 1)
          observations.push({
            engine,
            theme,
            check: "reconnect undo creates next revision",
            revision: afterLostAck + 1,
          })
          assert.equal(
            JSON.parse((await currentRecord()).authoredShowJson).cards.find(
              (card) => card.key === "q3",
            ).question,
            "SELECTED_QUESTION_2",
          )
          await go("question", 3)
          await openWorkspacePanel(page, "edit")
          await iframe
            .getByTestId("full-show-question-text")
            .fill("FINAL_QUESTION_THREE")
          await iframe.getByTestId("full-show-apply-question").click()
          await waitRevision(5)
          await go("answerCards", 3)
          await loadAssets()
          const discovered = await issuer
            .semanticDraftRepository(scenario.authoring)
            .assets(await qaSession.principal(), {
              contractVersion: "0.1.0",
              draftId: scenario.record.draftId,
              expectedRevision: 5,
              purpose: "background",
              locale: "en",
            })
          const purple = discovered.assets.find((asset) =>
            asset.publicUrl.endsWith("/v4/question-bg.webp"),
          )
          assert(purple)
          await iframe
            .getByTestId("full-show-background")
            .selectOption(purple.ref.assetId)
          await iframe.getByTestId("full-show-apply-background").click()
          await waitRevision(6)
          await loadAssets()
          const imageChoices = await issuer
            .semanticDraftRepository(scenario.authoring)
            .assets(await qaSession.principal(), {
              contractVersion: "0.1.0",
              draftId: scenario.record.draftId,
              expectedRevision: 6,
              purpose: "answer-image",
              locale: "en",
            })
          assert.equal(imageChoices.assets.length, 5)
          for (let index = 0; index < 5; index += 1) {
            await iframe
              .getByTestId(`full-show-picture-${index + 1}`)
              .selectOption(imageChoices.assets[index].ref.assetId)
          }
          await iframe.getByTestId("full-show-apply-pictures").click()
          await waitRevision(7)
          const assertImages = async () => {
            const stage = iframe.locator("[data-full-show-chapter]")
            const images = stage.locator('img[src*="/v4/cards/"]')
            await images.nth(4).waitFor({ state: "visible" })
            for (let imageIndex = 0; imageIndex < 5; imageIndex += 1) {
              await images.nth(imageIndex).scrollIntoViewIfNeeded()
            }
            await images.first().scrollIntoViewIfNeeded()
            assert.equal(await images.count(), 5)
            const deadline = Date.now() + 8000
            let loaded = []

            do {
              loaded = await images.evaluateAll((nodes) =>
                nodes.map((image) => ({
                  src: image.src,
                  complete: image.complete,
                  width: image.naturalWidth,
                  alt: image.alt,
                })),
              )

              if (
                loaded.length === 5 &&
                loaded.every(
                  (image) => image.complete && image.width > 0 && image.alt,
                )
              ) {
                break
              }

              await page.waitForTimeout(100)
            } while (Date.now() < deadline)

            assert(
              loaded.length === 5 &&
                loaded.every(
                  (image) => image.complete && image.width > 0 && image.alt,
                ),
              `Native image loading failed: ${JSON.stringify(loaded)}`,
            )
            const backgrounds = await stage.evaluate((element) =>
              [...element.querySelectorAll("*")].map(
                (node) => getComputedStyle(node).backgroundImage,
              ),
            )
            assert(
              backgrounds.some((value) =>
                value.includes("/v4/question-bg.webp"),
              ),
              "Purple native background must be visible",
            )
            const workspaceBackground = await iframe
              .locator(".widget-stage-viewport")
              .evaluate((element) => getComputedStyle(element).backgroundImage)
            assert(
              workspaceBackground.includes("/v4/question-bg.webp"),
              "The workspace surround must follow the same admitted game background",
            )
          }
          await assertImages()
          await verifyDemoSelection(true)
          await iframe.locator(".widget-native-stage").screenshot({
            path: path.join(evidence, `${engine}-${theme}-five-pictures.png`),
          })
          const mediaBeforeTheme = JSON.parse(
            (await currentRecord()).authoredShowJson,
          )
          const original = JSON.parse(scenario.record.authoredShowJson)
          assert.deepEqual(
            mediaBeforeTheme.cards.filter((card) => card.key !== "q3"),
            original.cards.filter((card) => card.key !== "q3"),
          )
          const otherTheme =
            theme === "tadazz-classic" ? "razzia-original" : "tadazz-classic"
          for (const [offset, selectedTheme] of [otherTheme, theme].entries()) {
            await loadAssets()
            await iframe
              .getByTestId("full-show-theme")
              .selectOption(`${selectedTheme}:1.0.0`)
            await iframe.getByTestId("full-show-apply-theme").click()
            await waitRevision(8 + offset)
            await iframe
              .locator(`[data-full-show-theme="${selectedTheme}"]`)
              .waitFor()
            await assertImages()
            const actual = JSON.parse((await currentRecord()).authoredShowJson)
            assert.deepEqual(actual.cards, mediaBeforeTheme.cards)
            assert.deepEqual(
              actual.defaults.tadazzBackground,
              mediaBeforeTheme.defaults.tadazzBackground,
            )
          }
          observations.push({
            engine,
            theme,
            check:
              "Q3, purple background, five native pictures and both theme switches",
            revision: 9,
            pictureCount: 5,
            sourceContentPreserved: true,
          })
          scenario.paritySource = structuredClone(
            scenario.lastPreviewResult._meta[FULL_SHOW_META_V3],
          )
          scenario.semanticRevision = 9
          scenario.go = go
          scenario.loadAssets = loadAssets
        },
        300000,
      )
      if (failureStateDiagnostic) {
        await prepareHostNavigation(
          page,
          "close failure-state diagnostic context",
        )
        captureActiveFailure = null
        await context.close()
        continue
      }
      await run(
        `${engine} / ${theme} nine localized interfaces and non-reduced native motion`,
        async () => {
          const iframe = page.frameLocator("iframe")
          for (const locale of widgetLocales) {
            await openWorkspacePanel(page, "display")
            await iframe.getByTestId("full-show-language").selectOption(locale)
            await iframe
              .locator(
                `[data-testid="full-show-next"][aria-label=${JSON.stringify(widgetLabels[locale].widget.nextChapter)}]`,
              )
              .waitFor()
            assert.equal(
              await iframe.getByTestId("full-show-language").inputValue(),
              locale,
            )
            assert.equal(
              await iframe.getByTestId("full-show-widget").getAttribute("dir"),
              locale === "he" ? "rtl" : "ltr",
            )
            assert.equal(
              await iframe.getByTestId("full-show-widget").getAttribute("lang"),
              locale,
            )
            assert.equal(
              await iframe
                .locator(".widget-editor")
                .evaluate((element) => getComputedStyle(element).direction),
              locale === "he" ? "rtl" : "ltr",
            )
            assert.equal(
              await iframe
                .getByTestId("full-show-previous")
                .getAttribute("aria-label"),
              expectedLocaleText[locale].previous,
            )
            assert.equal(
              await iframe.locator(".widget-editor").getAttribute("aria-label"),
              expectedLocaleText[locale].editing,
            )
            assert.equal(
              await iframe
                .getByTestId("full-show-pause")
                .getAttribute("aria-label"),
              expectedTransportText[locale][0],
            )
            assert.equal(
              await iframe
                .getByTestId("full-show-aspect")
                .evaluate((element) =>
                  element.labels?.[0]?.firstChild?.textContent?.trim(),
                ),
              expectedTransportText[locale][1],
            )

            if (locale === "fr" || locale === "ja" || locale === "he") {
              await closeWorkspaceDrawers(page)
              await iframe.locator(".widget-editor").screenshot({
                path: path.join(
                  evidence,
                  `${engine}-${theme}-${locale}-controls.png`,
                ),
              })
            }

            assert.equal(
              await iframe.locator(".widget-editor summary").innerText(),
              widgetLabels[locale].widget.appearanceAndSound,
            )
          }
          await openWorkspacePanel(page, "display")
          await iframe.getByTestId("full-show-language").selectOption("en")
          await iframe
            .locator('[data-testid="full-show-next"][aria-label="Next card"]')
            .waitFor()
          await closeWorkspaceDrawers(page)

          if (theme === "tadazz-classic") {
            await scenario.go("opening", null)
            await page.emulateMedia({ reducedMotion: "no-preference" })
            await openWorkspacePanel(page, "display")
            await iframe.getByTestId("full-show-reduce-motion").click()
            await iframe
              .locator('[data-testid="full-show-reduce-motion"]:not(:checked)')
              .waitFor()
            await closeWorkspaceDrawers(page)
            await iframe.getByTestId("full-show-replay").click()
            const stage = iframe.locator("[data-full-show-chapter]")
            const first = await stage.screenshot({ animations: "allow" })
            await page.waitForTimeout(180)
            const second = await stage.screenshot({ animations: "allow" })
            assert.notEqual(
              digest(first),
              digest(second),
              "Native animated stage must change pixels with reduced motion off",
            )
            fs.writeFileSync(
              path.join(evidence, `${engine}-${theme}-motion-a.png`),
              first,
            )
            fs.writeFileSync(
              path.join(evidence, `${engine}-${theme}-motion-b.png`),
              second,
            )
            await openWorkspacePanel(page, "display")
            await iframe.getByTestId("full-show-reduce-motion").click()
            await iframe
              .locator('[data-testid="full-show-reduce-motion"]:checked')
              .waitFor()
            await closeWorkspaceDrawers(page)
            await page.emulateMedia({ reducedMotion: "reduce" })
          }
        },
      )
      await run(
        `${engine} / ${theme} native audio gesture, acknowledged music and volume, persistent playback`,
        async () => {
          const iframe = page.frameLocator("iframe")
          const currentRecord = async () =>
            scenario.repository.get(
              await qaSession.principal(),
              scenario.record.draftId,
            )
          await scenario.go("voting", 3)
          await iframe.locator(".widget-native-stage").screenshot({
            path: path.join(
              evidence,
              `${engine}-${theme}-five-pictures-voting.png`,
            ),
          })
          const widgetFrame = page
            .frames()
            .find((value) => value.url().endsWith("/widget"))
          assert(widgetFrame)
          assert(
            await widgetFrame.evaluate(() =>
              window.__nativeAudio.every((element) => element.paused),
            ),
            "No native audio may start before the gesture",
          )
          await openWorkspacePanel(page, "display")
          await iframe.getByTestId("full-show-enable-audio").click()
          await iframe
            .locator('[data-testid="full-show-audio"][data-audio-playing=true]')
            .waitFor({ state: "attached" })
          await page.waitForTimeout(350)
          const before = await widgetFrame.evaluate(() =>
            window.__nativeAudio
              .map((element, index) => ({
                index,
                src: element.currentSrc || element.src,
                paused: element.paused,
                time: element.currentTime,
                volume: element.volume,
              }))
              .filter((value) => !value.paused && value.time > 0),
          )
          assert(before.length > 0, "Real native media time must advance")
          await openWorkspacePanel(page, "edit")
          const audioSettingsDetails = iframe.locator(".widget-editor details")

          if (
            !(await audioSettingsDetails.evaluate((element) => element.open))
          ) {
            await audioSettingsDetails.locator("summary").click()
          }

          await iframe.getByTestId("full-show-voting-volume").fill("20")
          assert.equal(
            await iframe
              .locator("[data-playback-paused]")
              .getAttribute("data-playback-paused"),
            "false",
            "Focusing a live audio field must not pause playback",
          )
          await iframe.getByTestId("full-show-apply-volume").click()
          await iframe
            .getByTestId("full-show-revision")
            .filter({ hasText: "Revision 10" })
            .waitFor()
          await page.waitForTimeout(200)
          const after = await widgetFrame.evaluate(() =>
            window.__nativeAudio
              .map((element, index) => ({
                index,
                src: element.currentSrc || element.src,
                paused: element.paused,
                time: element.currentTime,
                volume: element.volume,
              }))
              .filter((value) => !value.paused && value.time > 0),
          )
          assert(
            after.some((value) =>
              before.some(
                (previous) =>
                  value.index === previous.index &&
                  value.time > previous.time &&
                  value.volume < previous.volume,
              ),
            ),
            "Volume ACK must update the persistent native element without rewinding",
          )
          observations.push({
            engine,
            theme,
            check: "native media playback before and after volume ACK",
            before,
            after,
          })
          const volumeDraft = JSON.parse(
            (await currentRecord()).authoredShowJson,
          )
          assert.equal(
            volumeDraft.defaults.showTheme.overrides.audio.answersMusic.volume,
            0.2,
          )
          await scenario.loadAssets()
          const music = await issuer
            .semanticDraftRepository(scenario.authoring)
            .assets(await qaSession.principal(), {
              contractVersion: "0.1.0",
              draftId: scenario.record.draftId,
              expectedRevision: 10,
              purpose: "audio",
              locale: "en",
            })
          const choice = music.assets.find((value) =>
            value.publicUrl.endsWith("/sounds/answersMusic.mp3"),
          )
          assert(choice)
          await iframe
            .getByTestId("full-show-music")
            .selectOption(choice.ref.assetId)
          await iframe.getByTestId("full-show-apply-music").click()
          await iframe
            .getByTestId("full-show-revision")
            .filter({ hasText: "Revision 11" })
            .waitFor()
          const selectedMusic = JSON.parse(
            (await currentRecord()).authoredShowJson,
          )
          assert.equal(
            selectedMusic.defaults.showTheme.overrides.audio.answersMusic
              .mediaUrl,
            choice.publicUrl,
          )
          assert.equal(
            selectedMusic.defaults.showTheme.overrides.audio.answersMusic
              .volume,
            0.2,
          )
          await openWorkspacePanel(page, "display")

          if (await iframe.getByTestId("full-show-enable-audio").isVisible()) {
            await iframe.getByTestId("full-show-enable-audio").click()
          }

          await iframe
            .locator('[data-testid="full-show-audio"][data-audio-playing=true]')
            .waitFor({ state: "attached" })
          await page.waitForTimeout(250)
          const audioPhase = await iframe
            .locator("[data-full-show-chapter]")
            .evaluate((element) => ({
              chapterId: element.getAttribute("data-full-show-chapter"),
              elapsedMs: Number(element.getAttribute("data-playback-elapsed")),
            }))
          assert(
            audioPhase.chapterId.endsWith(":voting") &&
              audioPhase.elapsedMs < 120000,
            "The authored audio fixture must remain in voting for media assertions",
          )
          observations.push({
            engine,
            theme,
            check: "native audio remains in authored voting phase",
            authoredDurationMs: 120000,
            ...audioPhase,
          })
          assert(
            await widgetFrame.evaluate(
              (expected) =>
                window.__nativeAudio.some(
                  (element) =>
                    !element.paused &&
                    (element.currentSrc || element.src) === expected &&
                    element.currentTime > 0,
                ),
              choice.publicUrl,
            ),
          )
          await iframe.getByTestId("full-show-mute-audio").click()
          assert(
            await widgetFrame.evaluate(() =>
              window.__nativeAudio.every((element) => element.paused),
            ),
          )
          await iframe.getByTestId("full-show-enable-audio").click()
          await iframe
            .locator('[data-testid="full-show-audio"][data-audio-playing=true]')
            .waitFor({ state: "attached" })
          await closeWorkspaceDrawers(page)
          scenario.audioObserved = true
        },
      )

      await run(
        `${engine} / ${theme} native pause, resume, replay and adjacent skip`,
        async () => {
          const iframe = page.frameLocator("iframe")
          const stage = iframe.locator("[data-full-show-chapter]")
          const widgetFrame = page
            .frames()
            .find((value) => value.url().endsWith("/widget"))
          assert(widgetFrame && scenario.audioObserved)
          const media = () =>
            widgetFrame.evaluate(() =>
              window.__nativeAudio.map((element, index) => ({
                index,
                time: element.currentTime,
                paused: element.paused,
                src: element.currentSrc || element.src,
              })),
            )
          await iframe.getByTestId("full-show-pause").focus()
          await iframe.getByTestId("full-show-pause").press("Space")
          await iframe.locator('[data-playback-paused="true"]').waitFor()
          await page.waitForTimeout(100)
          const pausedTime = Number(
            await stage.getAttribute("data-playback-elapsed"),
          )
          const before = await media()
          assert(before.length && before.every((value) => value.paused))
          const nativeClock =
            theme === "tadazz-classic"
              ? iframe.getByTestId("tadazz-timer")
              : iframe.getByTestId("native-razzia-clock")
          const clockText = await nativeClock.innerText()
          await page.waitForTimeout(450)
          const stopped = await media()
          assert.equal(
            Number(await stage.getAttribute("data-playback-elapsed")),
            pausedTime,
          )
          assert.equal(await nativeClock.innerText(), clockText)
          assert(
            stopped.every(
              (value) =>
                value.paused &&
                Math.abs(value.time - before[value.index].time) < 0.04,
            ),
            "Paused native media must not advance",
          )
          const resumeProbe = await widgetFrame.evaluateHandle(
            ({ pausedTime: pausedElapsed, stopped: pausedMedia }) => {
              const nativeElement = document
                .querySelector('[data-testid="full-show-native-surface"]')
                .shadowRoot.querySelector("[data-full-show-chapter]")

              return {
                chapterId: nativeElement.getAttribute("data-full-show-chapter"),
                epoch: nativeElement.getAttribute("data-playback-epoch"),
                pausedTime: pausedElapsed,
                stopped: pausedMedia,
                elements: window.__nativeAudio.slice(),
                startedAt: performance.now(),
                firstClockProgressMs: null,
                firstMediaProgressMs: null,
              }
            },
            { pausedTime, stopped },
          )
          const resumeEvidence = {
            engine,
            theme,
            check: "native resume readiness",
            timeoutMs: 5000,
            status: "waiting",
          }
          observations.push(resumeEvidence)

          try {
            await iframe.getByTestId("full-show-pause").press("Enter")
            await iframe.locator('[data-playback-paused="false"]').waitFor()
            await widgetFrame.waitForFunction(
              (probe) => {
                const nativeElement = document
                  .querySelector('[data-testid="full-show-native-surface"]')
                  ?.shadowRoot?.querySelector("[data-full-show-chapter]")
                const clockAdvanced =
                  nativeElement?.getAttribute("data-full-show-chapter") ===
                    probe.chapterId &&
                  nativeElement?.getAttribute("data-playback-epoch") ===
                    probe.epoch &&
                  nativeElement?.getAttribute("data-playback-paused") ===
                    "false" &&
                  Number(nativeElement?.getAttribute("data-playback-elapsed")) >
                    probe.pausedTime + 200
                const mediaAdvanced = probe.elements.some((element, index) => {
                  const previous = probe.stopped[index]

                  return (
                    previous &&
                    window.__nativeAudio[index] === element &&
                    !element.paused &&
                    (element.currentSrc || element.src) === previous.src &&
                    element.currentTime > previous.time + 0.15
                  )
                })
                const waitedMs = performance.now() - probe.startedAt

                if (clockAdvanced && probe.firstClockProgressMs === null) {
                  probe.firstClockProgressMs = waitedMs
                }

                if (mediaAdvanced && probe.firstMediaProgressMs === null) {
                  probe.firstMediaProgressMs = waitedMs
                }

                return clockAdvanced && mediaAdvanced
              },
              resumeProbe,
              { timeout: 5000, polling: 50 },
            )
            resumeEvidence.status = "ready"
          } catch (error) {
            resumeEvidence.status = "failed"
            resumeEvidence.error = String(error)
            throw error
          } finally {
            try {
              resumeEvidence.snapshot = await resumeProbe.evaluate((probe) => {
                const nativeElement = document
                  .querySelector('[data-testid="full-show-native-surface"]')
                  ?.shadowRoot?.querySelector("[data-full-show-chapter]")

                return {
                  chapterId: probe.chapterId,
                  epoch: probe.epoch,
                  pausedElapsedMs: probe.pausedTime,
                  pausedMedia: probe.stopped,
                  waitedMs: performance.now() - probe.startedAt,
                  firstClockProgressMs: probe.firstClockProgressMs,
                  firstMediaProgressMs: probe.firstMediaProgressMs,
                  renderedChapterId: nativeElement?.getAttribute(
                    "data-full-show-chapter",
                  ),
                  renderedEpoch: nativeElement?.getAttribute(
                    "data-playback-epoch",
                  ),
                  renderedPaused: nativeElement?.getAttribute(
                    "data-playback-paused",
                  ),
                  renderedElapsedMs: Number(
                    nativeElement?.getAttribute("data-playback-elapsed"),
                  ),
                  media: window.__nativeAudio.map((element, index) => ({
                    index,
                    sameElement: probe.elements[index] === element,
                    src: element.currentSrc || element.src,
                    paused: element.paused,
                    time: element.currentTime,
                  })),
                }
              })
            } catch (error) {
              resumeEvidence.snapshotError = String(error)
            }

            await resumeProbe.dispose().catch(() => undefined)
          }

          const resumed = await media()
          assert(
            Number(await stage.getAttribute("data-playback-elapsed")) >
              pausedTime + 200,
          )
          assert(
            resumed.some(
              (value) =>
                !value.paused && value.time > stopped[value.index].time + 0.15,
            ),
            "The same native media must resume continuously",
          )
          const replayed = []
          for (const [kind, ordinal] of [
            ["question", 3],
            ["opening", null],
          ]) {
            await scenario.go(kind, ordinal)
            const beforeEpoch = await stage.getAttribute("data-playback-epoch")
            const node = await stage
              .locator(":scope > div")
              .first()
              .elementHandle()
            assert(node)
            await iframe.getByTestId("full-show-replay").click()
            await iframe
              .locator(
                `[data-full-show-chapter]:not([data-playback-epoch="${beforeEpoch}"])`,
              )
              .waitFor()
            assert.equal(
              await node.evaluate((element) => element.isConnected),
              false,
              "Replay must remount the native question or scene",
            )
            assert(
              Number(await stage.getAttribute("data-playback-elapsed")) < 1000,
            )
            assert((await stage.innerText()).trim().length > 0)
            replayed.push({
              kind,
              previousEpoch: Number(beforeEpoch),
              epoch: Number(await stage.getAttribute("data-playback-epoch")),
            })
            await node.dispose()
          }
          const firstId = await stage.getAttribute("data-full-show-chapter")
          await iframe.getByTestId("full-show-next").focus()
          await iframe.getByTestId("full-show-next").press("Enter")
          await iframe
            .locator(`[data-full-show-chapter="${scenario.chapters[1].id}"]`)
            .waitFor()
          await iframe.getByTestId("full-show-previous").focus()
          await iframe.getByTestId("full-show-previous").press("Space")
          await iframe
            .locator(`[data-full-show-chapter="${firstId}"]`)
            .waitFor()
          observations.push({
            engine,
            theme,
            check: "native pause, resume, replay and adjacent skip",
            pausedTime,
            clockText,
            before,
            stopped,
            resumed,
            replayed,
            adjacentSkip: true,
            singleNativeDemoClock: true,
          })
        },
      )
      await run(
        `${engine} / ${theme} responsive 16:9 and 4:3 keyboard controls`,
        async () => {
          const iframe = page.frameLocator("iframe")
          await scenario.go("answerCards", 3)
          const geometry = []
          for (const width of [390, 1366]) {
            await page.setViewportSize({ width, height: 1200 })
            for (const aspect of ["16 / 9", "4 / 3"]) {
              await openWorkspacePanel(page, "display")
              await iframe.getByTestId("full-show-aspect").selectOption(aspect)
              await closeWorkspaceDrawers(page)
              await page.waitForTimeout(950)

              if (theme === "razzia-original") {
                await iframe
                  .locator(
                    '[data-testid="native-stage-viewport"][data-fit-ready="true"]',
                  )
                  .waitFor()
              }

              const outer = await iframe
                .getByTestId("full-show-native-surface")
                .boundingBox()
              const inner = await iframe
                .locator("[data-full-show-chapter]")
                .boundingBox()
              assert(outer && inner && inner.width > 250 && inner.height > 140)
              const expected = aspect === "16 / 9" ? 16 / 9 : 4 / 3
              assert(Math.abs(outer.width / outer.height - expected) < 0.02)
              assert(
                Math.abs(inner.width - outer.width) < 2 &&
                  Math.abs(inner.height - outer.height) < 2,
              )
              const viewport = await iframe
                .getByTestId("full-show-widget")
                .evaluate(() => ({
                  width: innerWidth,
                  height: innerHeight,
                  scroll: document.documentElement.scrollWidth,
                  scrollHeight: document.documentElement.scrollHeight,
                }))
              assert(
                viewport.scroll <= viewport.width + 1,
                "Widget must not overflow horizontally",
              )
              assert(
                viewport.scrollHeight <= viewport.height + 1,
                "The workspace document must not scroll vertically",
              )
              const images = await iframe
                .locator('[data-full-show-chapter] img[src*="/v4/cards/"]')
                .count()
              assert.equal(images, 5)
              const composition = await iframe
                .locator("[data-full-show-chapter]")
                .evaluate((stage) => {
                  const canvasBounds = stage.getBoundingClientRect()
                  const bounds = (node) => {
                    const rect = node.getBoundingClientRect()

                    return {
                      id:
                        node.getAttribute("data-testid") ??
                        node.getAttribute("data-v4-choice"),
                      x: rect.x,
                      y: rect.y,
                      width: rect.width,
                      height: rect.height,
                      inside:
                        rect.width > 0 &&
                        rect.height > 0 &&
                        rect.left >= canvasBounds.left - 1 &&
                        rect.top >= canvasBounds.top - 1 &&
                        rect.right <= canvasBounds.right + 1 &&
                        rect.bottom <= canvasBounds.bottom + 1,
                    }
                  }

                  return {
                    cards: [
                      ...stage.querySelectorAll(
                        '[data-testid^="photo-card-choice-"], [data-v4-choice]',
                      ),
                    ].map(bounds),
                    images: [
                      ...stage.querySelectorAll('img[src*="/v4/cards/"]'),
                    ].map(bounds),
                  }
                })
              assert.equal(composition.cards.length, 5)
              assert.equal(composition.images.length, 5)
              assert(
                composition.cards.every((item) => item.inside) &&
                  composition.images.every((item) => item.inside),
                `Every native card and image must fit the actual canvas: ${JSON.stringify(
                  composition,
                )}`,
              )
              const audioControl = iframe.locator(
                '[data-testid="full-show-enable-audio"], [data-testid="full-show-mute-audio"]',
              )
              assert.equal(
                await audioControl.isVisible(),
                false,
                "Audio menu must stay closed outside the native composition",
              )
              const displayPanel = await openWorkspacePanel(page, "display")
              const audioBounds = await audioControl.boundingBox()
              const displayBounds = await displayPanel.boundingBox()
              assert(
                audioBounds &&
                  displayBounds &&
                  audioBounds.x >= displayBounds.x - 1 &&
                  audioBounds.x + audioBounds.width <=
                    displayBounds.x + displayBounds.width + 1 &&
                  audioBounds.y >= displayBounds.y - 1 &&
                  audioBounds.y + audioBounds.height <=
                    displayBounds.y + displayBounds.height + 1,
                "Audio control must fit its own display drawer",
              )
              assert.equal(
                await audioControl.evaluate((node) =>
                  Boolean(node.closest('[data-testid="editor-panel-display"]')),
                ),
                true,
              )
              await closeWorkspaceDrawers(page)
              assert.equal(await audioControl.isVisible(), false)
              geometry.push({
                width,
                aspect,
                outer,
                inner,
                viewport,
                imageCount: images,
                composition,
                audioControl: audioBounds,
                audioDrawer: displayBounds,
                audioOutsideComposition: true,
              })

              if (width === 390) {
                await iframe
                  .getByTestId("full-show-native-surface")
                  .screenshot({
                    path: path.join(
                      evidence,
                      `${engine}-${theme}-390-${aspect === "16 / 9" ? "169" : "43"}.png`,
                    ),
                  })
              }
            }
          }
          await iframe.getByTestId("full-show-pause").focus()
          assert(
            await iframe
              .getByTestId("full-show-pause")
              .evaluate((element) => document.activeElement === element),
          )
          await iframe.getByTestId("full-show-pause").press("Space")
          await iframe.locator('[data-playback-paused="true"]').waitFor()
          await iframe.getByTestId("full-show-pause").press("Enter")
          await iframe.locator('[data-playback-paused="false"]').waitFor()
          await iframe.getByTestId("full-show-pause").press("Tab")
          assert(
            await iframe
              .getByTestId("full-show-widget")
              .evaluate(
                (element) =>
                  element.contains(document.activeElement) &&
                  document.activeElement?.tagName === "BUTTON",
              ),
          )
          const unlabeled = await iframe
            .locator("button")
            .evaluateAll(
              (nodes) =>
                nodes.filter(
                  (button) =>
                    !button.textContent?.trim() &&
                    !button.getAttribute("aria-label"),
                ).length,
            )
          assert.equal(unlabeled, 0)
          await page.setViewportSize({ width: 1280, height: 1200 })
          await openWorkspacePanel(page, "display")
          await iframe.getByTestId("full-show-aspect").selectOption("16 / 9")
          await closeWorkspaceDrawers(page)
          const hostControls = await verifyHostControls({
            page,
            base,
            scenario,
            engine,
            theme,
            evidence,
            readRecord: async () =>
              scenario.repository.get(
                await qaSession.principal(),
                scenario.record.draftId,
              ),
          })
          observations.push(hostControls)
          observations.push({
            engine,
            theme,
            check: "responsive 16:9 and 4:3 keyboard controls",
            geometry,
            keyboard: "Space/Enter/Tab-focus semantics on native controls",
            unlabeledButtons: unlabeled,
          })
        },
      )
      await run(
        `${engine} / ${theme} zero-vote, tie and picture result parity with preserved media and motion`,
        async () => {
          assert(scenario.paritySource)
          const fixtures = [
            ...createNativeResultParityFixtures(scenario.paritySource),
            ...createAdditionalNativeSceneFixtures(scenario.paritySource),
          ]

          try {
            for (const fixture of fixtures) {
              scenario.rendererFixture = fixture
              const witness = {
                engine,
                family: theme,
                ...fixture,
                observed: { status: "FAIL" },
              }
              delete witness.frame
              rendererFixtures.push(witness)
              await page.emulateMedia({
                reducedMotion: fixture.frame.inventory.context.reducedMotion
                  ? "reduce"
                  : "no-preference",
              })
              await prepareHostNavigation(page, "reload host")
              await page.reload()
              await page.locator("html[data-host-ready=true]").waitFor()
              const iframe = page.frameLocator("iframe")
              const stage = iframe.locator(
                `[data-full-show-chapter="${fixture.frame.inventory.selectedChapterId}"]`,
              )
              await stage.waitFor()
              const { expected } = fixture
              let observed = {}

              if (expected.imageUrls) {
                // Classic reconstructs question cards before mounting the result
                // scene. Its native play() replaces those earlier image nodes.
                const resultSurface =
                  theme === "tadazz-classic"
                    ? stage.locator('[data-v4-scene="survey-results"]')
                    : stage
                await resultSurface.waitFor({ state: "visible" })
                const nativeReducedMotion =
                  theme === "tadazz-classic"
                    ? await resultSurface.getAttribute("data-reduced-motion")
                    : null

                if (theme === "tadazz-classic") {
                  assert.equal(
                    nativeReducedMotion,
                    String(fixture.frame.inventory.context.reducedMotion),
                    "The native scene must retain the fixture's motion setting",
                  )
                }

                const images = resultSurface.locator('img[src*="/v4/cards/"]')
                await images.nth(4).waitFor({ state: "visible" })
                // Prime lazy images while genuine motion continues. Resolve each
                // node afresh; scrolling need not wait for animation stability.
                for (let imageIndex = 0; imageIndex < 5; imageIndex += 1) {
                  await images.nth(imageIndex).evaluate((image) =>
                    image.scrollIntoView({
                      block: "nearest",
                      inline: "nearest",
                      behavior: "instant",
                    }),
                  )
                }
                await images.first().evaluate((image) =>
                  image.scrollIntoView({
                    block: "nearest",
                    inline: "nearest",
                    behavior: "instant",
                  }),
                )
                const deadline = Date.now() + 8000
                let actual = []

                do {
                  actual = await images.evaluateAll((nodes) =>
                    nodes.map((image) => ({
                      src: image.src,
                      alt: image.alt,
                      loaded: image.complete && image.naturalWidth > 0,
                    })),
                  )

                  if (
                    actual.length === 5 &&
                    actual.every((image) => image.loaded)
                  ) {
                    break
                  }

                  await page.waitForTimeout(100)
                } while (Date.now() < deadline)

                assert.equal(actual.length, 5)
                assert(
                  actual.every((image) => image.loaded),
                  `Fixture native image failed: ${JSON.stringify(actual)}`,
                )
                assert.deepEqual(
                  actual.map((image) => image.src),
                  expected.imageUrls,
                )
                assert.deepEqual(
                  actual.map((image) => image.alt),
                  expected.imageAlts,
                )

                if (theme === "tadazz-classic") {
                  const numbers = stage.locator(".tz-result-number")
                  await numbers.nth(4).waitFor()
                  assert.deepEqual(
                    await numbers.evaluateAll((nodes) =>
                      nodes.map((node) =>
                        Number(node.getAttribute("data-target-percentage")),
                      ),
                    ),
                    expected.percentages,
                  )
                  const winners = await stage
                    .locator("[data-v4-choice].is-favourite")
                    .evaluateAll((nodes) =>
                      nodes.map((node) =>
                        Number(node.getAttribute("data-v4-choice")),
                      ),
                    )
                  assert.deepEqual(winners, expected.winnerIndices)

                  if (expected.imageOnly) {
                    assert(
                      await stage
                        .locator(".answer-title")
                        .evaluateAll((nodes) =>
                          nodes.every(
                            (node) => getComputedStyle(node).display === "none",
                          ),
                        ),
                    )
                  }

                  observed = {
                    images: actual,
                    nativeScene: "survey-results",
                    nativeReducedMotion,
                    percentages: expected.percentages,
                    winnerIndices: winners,
                    countSource:
                      "native adapter receives exact fixture counts; original V4 presents percentages",
                  }
                } else {
                  const results = []
                  for (let index = 0; index < 5; index += 1) {
                    const answer = stage.getByTestId(
                      `photo-card-choice-${index}`,
                    )
                    const overlay = await answer
                      .getByTestId(`photo-card-overlay-${index}`)
                      .innerText()
                    assert(overlay.includes(`${expected.percentages[index]}%`))
                    const countText = await answer.innerText()
                    assert.match(
                      countText,
                      new RegExp(
                        `\\b${expected.counts[index]}\\s+votes?\\b`,
                        "u",
                      ),
                    )
                    const bar = await answer
                      .getByTestId(`photo-card-bar-${index}`)
                      .evaluate((node) => node.style.width)
                    assert.equal(bar, `${expected.percentages[index]}%`)

                    if (expected.imageOnly) {
                      assert.equal(
                        await answer
                          .getByTestId(`photo-card-caption-${index}`)
                          .count(),
                        0,
                      )
                      assert((await answer.locator(".sr-only").count()) > 0)
                    }

                    results.push({
                      index,
                      percentage: expected.percentages[index],
                      count: expected.counts[index],
                      nativeOverlay: overlay,
                      bar,
                    })
                  }
                  const winners = await stage
                    .locator(
                      '[data-testid^="photo-card-choice-"][data-winner="true"]',
                    )
                    .evaluateAll((nodes) =>
                      nodes.map((node) =>
                        Number(node.getAttribute("data-answer-index")),
                      ),
                    )
                  assert.deepEqual(winners, expected.winnerIndices)
                  assert.equal(
                    await stage.getByTestId("zero-votes-notice").count(),
                    expected.isZeroVotes ? 1 : 0,
                  )
                  const badges = await stage
                    .getByTestId("card-winner-badge")
                    .allTextContents()
                  assert.equal(badges.length, expected.winnerIndices.length)

                  if (expected.isTie) {
                    assert(badges.every((text) => text.trim() === "Co-leader"))
                  }

                  observed = {
                    images: actual,
                    results,
                    winnerIndices: winners,
                    winnerBadges: badges,
                    zeroVotesNotice: expected.isZeroVotes,
                    winnerPresentation:
                      "Original PhotoCardGrid rankings, native vote bars and zero-vote/co-leader presentation",
                  }
                }

                if (
                  fixture.id === "tie-five-pictures" ||
                  fixture.id === "image-only-five-pictures"
                ) {
                  await stage.screenshot({
                    path: path.join(
                      evidence,
                      `${engine}-${theme}-${fixture.id}.png`,
                    ),
                  })
                }
              } else {
                const labels = previewNativeLabels(
                  fixture.frame.inventory.context.locale,
                )
                const kind = expected.sceneKind
                const classic = theme === "tadazz-classic"
                let surface = null
                let title = null
                let expectedNativeTitle = expected.sceneTitle
                let nativeScene = null
                let titleContract = "authored-scene-title"
                const emptyCounts = {}
                let emptyText = null
                let countdown = null

                if (classic && kind === "leaderboard") {
                  surface = stage.locator('[data-v4-scene="leaderboard"]')
                  const list = surface.getByTestId("tadazz-leaderboard-screen")
                  await list.waitFor({ state: "attached" })
                  assert.equal(
                    await list.getAttribute("data-total-entries"),
                    "0",
                  )
                  title = list.getByRole("heading", { level: 2 })
                  expectedNativeTitle = labels.v4Labels.teamLeaderboard
                  nativeScene = "leaderboard"
                  titleContract = "native-family-heading"
                  emptyCounts.teamRows = await list.locator(".team-row").count()
                  assert.equal(emptyCounts.teamRows, 0)
                } else if (classic && fixture.id === "animation-spotlight") {
                  surface = stage.locator('[data-v4-scene="top-pick"]')
                  title = surface.locator(".spotlight-top")
                  expectedNativeTitle = labels.v4Labels.mostChosenAnswer
                  nativeScene = "top-pick"
                  titleContract = "native-family-heading"
                  const empty = surface.getByTestId("tadazz-top-pick-name")
                  await empty.waitFor({ state: "visible" })
                  emptyText = (await empty.innerText()).trim()
                  assert.equal(emptyText, labels.v4Labels.noVotes)
                  emptyCounts.portraits = await surface
                    .locator(".spotlight-portrait")
                    .count()
                  emptyCounts.answerCards = await surface
                    .locator('[data-testid^="tadazz-card-"]')
                    .count()
                  assert.equal(emptyCounts.portraits, 0)
                  assert.equal(emptyCounts.answerCards, 0)
                } else if (classic && fixture.id === "animation-interlude") {
                  surface = stage.locator('[data-v4-scene="interlude"]')
                  title = surface
                    .getByTestId("tadazz-screen-interlude")
                    .locator(".interlude-title")
                  nativeScene = "interlude"
                } else {
                  const presenter = `[data-testid="studio-scene-presenter"][data-kind="${
                    kind
                  }"]`
                  surface = classic
                    ? stage
                        .locator(
                          '[data-testid="tadazz-custom-screen"].is-visible',
                        )
                        .locator(presenter)
                    : stage.locator(presenter)
                  await surface.waitFor({ state: "visible" })
                  title = surface.getByRole("heading", { level: 2 })

                  if (kind === "leaderboard") {
                    const expectedEmptyText =
                      labels.sceneLabels.noScores ??
                      labels.i18n.t("extensions:studio.scene.noRankingsYet", {
                        defaultValue: "No scores recorded yet.",
                      })
                    const empty = surface.getByText(expectedEmptyText, {
                      exact: true,
                    })
                    await empty.waitFor({ state: "visible" })
                    emptyText = (await empty.innerText()).trim()
                    assert.equal(emptyText, expectedEmptyText)
                    emptyCounts.leaderboardRows = await surface
                      .getByTestId("leaderboard-scene-row")
                      .count()
                    assert.equal(emptyCounts.leaderboardRows, 0)
                  } else if (kind === "interimResults") {
                    const expectedEmptyText =
                      labels.sceneLabels.noInterimResults ??
                      labels.i18n.t("extensions:studio.scene.noResponsesYet", {
                        defaultValue: "No completed results yet.",
                      })
                    const empty = surface.getByText(expectedEmptyText, {
                      exact: true,
                    })
                    await empty.waitFor({ state: "visible" })
                    emptyText = (await empty.innerText()).trim()
                    assert.equal(emptyText, expectedEmptyText)
                    emptyCounts.interimRows = await surface
                      .getByTestId("interim-option-row")
                      .count()
                    emptyCounts.totalVotePanels = await surface
                      .getByTestId("total-votes")
                      .count()
                    assert.equal(emptyCounts.interimRows, 0)
                    assert.equal(emptyCounts.totalVotePanels, 0)
                  } else if (kind === "answerRecap") {
                    const empty = surface.getByTestId("recap-empty-state")
                    await empty.waitFor({ state: "visible" })
                    emptyText = (await empty.innerText()).trim()
                    assert.equal(
                      emptyText,
                      labels.sceneLabels.noInterimResults ??
                        labels.i18n.t(
                          "extensions:studio.scene.recapNoPrecedingWarning",
                          {
                            defaultValue:
                              "No completed questions to recap yet.",
                          },
                        ),
                    )
                    emptyCounts.recapQuestions = await surface
                      .getByTestId("recap-question-card")
                      .count()
                    emptyCounts.recapAnswers = await surface
                      .getByTestId("recap-winning-option")
                      .count()
                    assert.equal(emptyCounts.recapQuestions, 0)
                    assert.equal(emptyCounts.recapAnswers, 0)
                  } else if (kind === "countdown") {
                    await surface
                      .getByTestId("scene-countdown-circle")
                      .waitFor()
                    countdown = await surface.evaluate((node) => ({
                      displayed: node
                        .querySelector('[data-testid="scene-countdown-circle"]')
                        .textContent.trim(),
                      remaining: node.getAttribute("data-remaining"),
                    }))
                    assert.match(countdown.displayed, /^[0-3]$/u)
                    assert.equal(countdown.remaining, countdown.displayed)
                  } else if (kind === "animation") {
                    const preset = surface.getByTestId(
                      `scene-animation-preset-${expected.scenePreset}`,
                    )
                    await preset
                      .locator(
                        `[data-tada-scene-anim="${expected.scenePreset}"]`,
                      )
                      .waitFor()
                    emptyCounts.answerChoices = await surface
                      .locator("[data-v4-choice]")
                      .count()
                    assert.equal(emptyCounts.answerChoices, 0)
                    for (const testId of [
                      "leaderboard-scene-row",
                      "interim-option-row",
                      "recap-question-card",
                    ]) {
                      emptyCounts[testId] = await surface
                        .getByTestId(testId)
                        .count()
                      assert.equal(emptyCounts[testId], 0)
                    }
                  } else {
                    assert.fail("Unexpected additional native scene kind")
                  }
                }

                // Await the actual native component's title, not only the outer
                // chapter wrapper. Classic intentionally owns two scene headings.
                await title.waitFor({ state: "visible" })
                const visibleTitle = (await title.innerText()).trim()
                assert.equal(visibleTitle, expectedNativeTitle)
                const text = await stage.innerText()
                assert.doesNotMatch(text, /SELECTED_QUESTION_|PRIVATE_NOTE_/u)
                assert.doesNotMatch(
                  await stage.textContent(),
                  /SELECTED_QUESTION_|PRIVATE_NOTE_/u,
                )
                observed = {
                  sceneKind: kind,
                  scenePreset: expected.scenePreset,
                  nativeScene,
                  titleContract,
                  visibleTitle,
                  expectedNativeTitle,
                  authoredTitleRendered: text.includes(expected.sceneTitle),
                  emptyText,
                  emptyCounts,
                  countdown,
                  nativeText: (await surface.innerText()).trim(),
                  emptySceneData: true,
                }
              }

              witness.observed = { status: "PASS", ...observed }
              writeProgress(`renderer fixture ${fixture.id}`)
            }
          } finally {
            scenario.rendererFixture = null
            await page.emulateMedia({ reducedMotion: "reduce" })
          }

          await prepareHostNavigation(page, "reload host")
          await page.reload()
          await page.locator("html[data-host-ready=true]").waitFor()
          await page
            .frameLocator("iframe")
            .locator("[data-full-show-chapter]")
            .waitFor()
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
          const widgetFrame = page
            .frames()
            .find((value) => value.url().endsWith("/widget"))

          if (widgetFrame) {
            assert(
              await widgetFrame.evaluate(() =>
                window.__nativeAudio.every((element) => element.paused),
              ),
              "Rejected frame must stop native media",
            )
          }

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
          await prepareHostNavigation(page, "final CSP and browser errors")
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
            pageErrorEvents: pageErrorEvents.filter(
              (event) => event.engine === engine && event.theme === theme,
            ),
            entries: entries.filter((e) =>
              e.name.startsWith(`${engine} / ${theme}`),
            ),
          },
          null,
          2,
        ),
      )
      await prepareHostNavigation(page, "close context")
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
        diagnosticMode: process.env.TADAZZ_FULL_SHOW_DIAGNOSTIC ?? null,
        productionChanged: false,
        customerMountAccessed: false,
        oauthSession: qaSession.evidence(),
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
              "semantic question, lost ACK retry, reconnect undo, purple background, five pictures and theme preservation",
              "nine localized interfaces and non-reduced native motion",
              "native audio gesture, acknowledged music and volume, persistent playback",
              "native pause, resume, replay and adjacent skip",
              "responsive 16:9 and 4:3 keyboard controls",
              "zero-vote, tie and picture result parity with preserved media and motion",
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
        observations,
        rendererFixtures,
        calls,
        errors,
        resources,
        requestFailures,
        pageErrorEvents,
        qaRequestEvents,
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
