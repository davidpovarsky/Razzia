/** Observe the production editor and game clients against an owned native host. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { usernameValidator } from "@razzia/common/validators/auth"
import { CREATING_WORLDS_PRESETS } from "../../src/core/creating-worlds-show.ts"
import { qualifyOwnerImageRepair } from "./external-media-repair.mjs"
import {
  readQuestionSequence,
  stopQuestionSequence,
  watchQuestionSequence,
} from "../public-gallery/question-sequence-verify.mjs"

// Node observes browser output; importing the React renderer would also import CSS.
// Read its literal contract as data and retain exactly the same scene assertion set.
const secondaryScenePresets = new Set([
  "top-pick",
  "round-recap",
  "interlude",
  "z-wipe",
])
const fullShowScenePresets = CREATING_WORLDS_PRESETS.filter(
  (preset) => !secondaryScenePresets.has(preset),
)
const fullShowSource = readFileSync(
  new URL(
    "../../src/presentation/tadazz-v4/FullShowScenes.tsx",
    import.meta.url,
  ),
  "utf8",
)
const fullShowLiteral = fullShowSource.match(
  /export const FULL_SHOW_SCENES = (\[[\s\S]*?\]) as const/u,
)
assert(
  fullShowLiteral,
  "The immutable renderer must declare its scene contract",
)
const rendererScenePresets = JSON.parse(
  fullShowLiteral[1].replace(/,\s*\]$/u, "]"),
)
assert.equal(new Set(fullShowScenePresets).size, 12)
assert.equal(CREATING_WORLDS_PRESETS.length - fullShowScenePresets.length, 4)
assert.deepEqual(fullShowScenePresets, rendererScenePresets)
assert.match(
  fullShowSource,
  /export const isFullShowScene = \(value: string\): value is FullShowScene =>\s*\(FULL_SHOW_SCENES as readonly string\[\]\)\.includes\(value\)\s*\n\s*export interface/u,
)
const isFullShowScene = (value) => fullShowScenePresets.includes(value)

const require = createRequire("/cleanup/extensions/package.json")
const { expect } = require("@playwright/test")
const digest = (value) =>
  createHash("sha256")
    .update(JSON.stringify(value) ?? "undefined")
    .digest("hex")

/** Keep observations across all playback frames, including errors later replaced by a new cue. */
async function installPlaybackAudit(page) {
  await page.addInitScript(() => {
    const failedTracks = new Set()
    const mediaErrors = new Set()
    const desiredTracks = new Set()
    let armed = false
    let frame
    let samples = 0
    let minOwners = Infinity
    let maxOwners = 0
    let ownerViolations = 0
    let blockedFrames = 0
    const sample = () => {
      if (!armed || !document.querySelector('[data-testid="tadazz-show"]'))
        return
      const owners = [
        ...document.querySelectorAll('[data-testid="audio-cue-player-state"]'),
      ]
      samples++
      minOwners = Math.min(minOwners, owners.length)
      maxOwners = Math.max(maxOwners, owners.length)
      if (owners.length !== 1) ownerViolations++
      for (const owner of owners) {
        if (owner.dataset.shouldPlay === "true")
          desiredTracks.add(owner.dataset.audioUrl ?? "")
        if (owner.dataset.audioBlocked === "true") blockedFrames++
        if (owner.dataset.audioError === "true")
          failedTracks.add(owner.dataset.audioUrl ?? "unknown")
      }
    }
    const tick = () => {
      sample()
      frame = requestAnimationFrame(tick)
    }
    const mutations = new MutationObserver((records) => {
      if (armed) {
        for (const record of records) {
          if (
            record.attributeName === "data-audio-error" &&
            record.oldValue === "true"
          ) {
            failedTracks.add(record.target.dataset.audioUrl ?? "unknown")
          }
        }
        sample()
      }
    })
    mutations.observe(document, {
      attributes: true,
      attributeOldValue: true,
      subtree: true,
      attributeFilter: [
        "data-audio-error",
        "data-audio-url",
        "data-should-play",
      ],
    })
    const onMediaError = (event) => {
      const target = event.target
      if (
        target instanceof HTMLMediaElement ||
        target instanceof HTMLImageElement
      ) {
        mediaErrors.add(
          JSON.stringify({
            kind: target.tagName,
            url: target.currentSrc || target.src,
            code:
              target instanceof HTMLMediaElement ? target.error?.code : null,
          }),
        )
      }
    }
    document.addEventListener("error", onMediaError, true)
    window.__tadazzStoredAudit = {
      arm: () => {
        armed = true
        sample()
      },
      read: () => ({
        samples,
        minOwners: Number.isFinite(minOwners) ? minOwners : null,
        maxOwners,
        ownerViolations,
        blockedFrames,
        desiredTracks: desiredTracks.size,
        failedTracks: [...failedTracks],
        mediaErrors: [...mediaErrors],
      }),
      stop: () => {
        cancelAnimationFrame(frame)
        mutations.disconnect()
        document.removeEventListener("error", onMediaError, true)
      },
    }
    frame = requestAnimationFrame(tick)
  })
}

const sceneTimeout = (snapshot) =>
  Math.max(30_000, Math.min(300_000, snapshot.durationMs ?? 0) + 30_000)

const paintedFrames = (stage) =>
  stage.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )

/** Compare actual coordinator transitions, permitting only its real conditional tie policy. */
function orderedTimelineReceipt(trace, timeline, scenes, terminal) {
  const observed = []
  for (const entry of trace) {
    if (!entry.id) continue
    const previous = observed.at(-1)
    if (!previous || previous.id !== entry.id || previous.epoch !== entry.epoch)
      observed.push(entry)
  }
  const skipped = []
  let expectedIndex = 0
  const allowConditionalSkip = (index, observation) => {
    const item = timeline[index]
    const scene = item?.kind === "animation" ? scenes[item.sceneId] : null
    assert(
      scene?.preset === "tie-break" && observation.unresolvedStoryTie === false,
      "Only a tie-break without an unresolved native story tie may be skipped",
    )
    skipped.push({
      index,
      stepDigest: digest(item.id),
      reason: "no-unresolved-story-tie",
    })
  }
  for (const entry of observed) {
    assert(
      Number.isInteger(entry.stepIndex) && entry.stepIndex >= expectedIndex,
      "Authored steps never repeat or run backwards",
    )
    while (expectedIndex < entry.stepIndex)
      allowConditionalSkip(expectedIndex++, entry)
    const expected = timeline[expectedIndex]
    assert(expected, "No unexpected timeline step")
    assert.equal(
      digest({
        id: entry.id,
        kind: entry.kind,
        questionId: entry.questionId,
        sceneId: entry.sceneId,
      }),
      digest({
        id: expected.id,
        kind: expected.kind,
        questionId: expected.questionId ?? null,
        sceneId: expected.sceneId ?? null,
      }),
      "Each active step exactly matches the next authored card",
    )
    expectedIndex++
  }
  while (expectedIndex < timeline.length)
    allowConditionalSkip(expectedIndex++, terminal)
  return {
    authored: timeline.length,
    observed: observed.length,
    skipped,
    scenes: observed
      .filter((entry) => entry.sceneId)
      .map((entry) => ({
        id: entry.sceneId,
        kind: entry.kind,
        afterQuestion: entry.questionOrdinal,
      })),
  }
}

export async function verifyStoredGameBrowser(options) {
  assert.equal(process.platform, "linux")
  assert.equal(new URL(options.origin).hostname, "127.0.0.1")
  const { fixture, context, browser, origin, token, registry } = options
  const qaUsername = usernameValidator.parse("Stored QA")
  const quizId = fixture.quizz.id
  const headers = { Authorization: "Bearer " + token }
  const host = await context.newPage()
  let playerContext
  let player
  let audio
  let timelineReceipt
  let externalMediaRepair
  let mirrorsAtLaunch = 0
  const repairedImageUrls = new Set()
  const repairedImageQuestions = []
  let mediaErrors = []
  let room
  let traceTimer
  let stage
  let checkpoint = "editor-load"
  const checks = []
  const faults = []
  const assetFailures = new Set()
  const trace = []
  const starts = []
  const accepted = []
  const sceneVisits = []
  const sequences = []
  const previewStatuses = []
  const mirrorChecks = []
  const mirrorRoutes = []
  const knownAssets = new Set(
    (fixture.sourceSummary?.media ?? []).map((asset) => {
      const url = new URL(asset.url, origin)
      return url.origin + url.pathname
    }),
  )
  const isAsset = (request) => {
    const url = new URL(request.url())
    return (
      ["image", "media", "font", "script", "stylesheet"].includes(
        request.resourceType(),
      ) ||
      knownAssets.has(url.origin + url.pathname) ||
      /\.(?:json|wasm|lottie|png|jpe?g|webp|gif|svg|mp[34]|m4a|ogg|wav|webm|woff2?)$/iu.test(
        url.pathname,
      )
    )
  }
  const collectPlaybackAudit = async () => {
    const read = (page) =>
      page?.evaluate(() => window.__tadazzStoredAudit?.read()).catch(() => null)
    const hostAudit = await read(host)
    const playerAudit = await read(player)
    mediaErrors = [
      ...(hostAudit?.mediaErrors ?? []),
      ...(playerAudit?.mediaErrors ?? []),
    ].map(digest)
    if (hostAudit) {
      const { failedTracks, mediaErrors: _media, ...summary } = hostAudit
      audio = { ...summary, failedTracks: failedTracks.map(digest) }
    }
  }
  const addExactMirrors = async (browserContext, role) => {
    for (const item of options.externalAssets ?? []) {
      if (!item.mirror) continue
      const mirror = item.mirror
      assert.match(
        mirror.nativeUrl,
        /^\/media\/qa-external-[a-f0-9]{64}\.png$/u,
      )
      assert.equal(mirror.sourceHttpStatus, 200)
      const response = await context.request.get(origin + mirror.nativeUrl, {
        headers,
      })
      assert.equal(
        response.status(),
        200,
        "Offline mirror uses the actual owned media HTTP route",
      )
      assert.match(
        response.headers()["content-type"] ?? "",
        /^image\/png(?:;|$)/u,
      )
      const body = await response.body()
      assert.equal(body.length, mirror.bytes)
      assert.equal(
        createHash("sha256").update(body).digest("hex"),
        mirror.sha256,
      )
      const check = {
        referenceDigest: item.referenceDigest,
        role,
        sha256: mirror.sha256,
        bytes: body.length,
        nativeHttpStatus: 200,
        sourceHttpStatus: mirror.sourceHttpStatus,
        verifiedAt: mirror.verifiedAt,
        manifestSha256: mirror.manifestSha256,
        requests: 0,
        originalUrlPlayedOverInternet: false,
      }
      mirrorChecks.push(check)
      const exact = (url) => url.href === mirror.sourceUrl
      const handler = async (route) => {
        assert.equal(route.request().method(), "GET")
        check.requests++
        await route.fulfill({ status: 200, body, contentType: "image/png" })
      }
      await browserContext.route(exact, handler)
      mirrorRoutes.push({ browserContext, exact, handler })
    }
  }
  const safeTrace = () =>
    trace.map(({ id, sceneId, questionId, ...entry }) => ({
      ...entry,
      stepDigest: id ? digest(id) : null,
      sceneDigest: sceneId ? digest(sceneId) : null,
      questionDigest: questionId ? digest(questionId) : null,
    }))
  const safeSceneVisits = () =>
    sceneVisits.map(({ id, ...visit }) => ({
      ...visit,
      sceneDigest: digest(id),
    }))
  const record = (name, details = {}) =>
    checks.push({ name, passed: true, ...details })
  const track = (page) => {
    page.on("pageerror", (error) => faults.push(digest(error.message)))
    page.on("requestfailed", (request) => {
      const reason = request.failure()?.errorText ?? "unknown"
      if (reason !== "net::ERR_ABORTED" && isAsset(request)) {
        assetFailures.add(
          digest({ path: new URL(request.url()).pathname, reason }),
        )
      }
    })
    page.on("response", (response) => {
      if (response.status() >= 400 && isAsset(response.request())) {
        assetFailures.add(
          digest({
            path: new URL(response.url()).pathname,
            status: response.status(),
          }),
        )
      }
    })
  }
  track(host)
  const read = async (path) => {
    const response = await context.request.get(origin + path, { headers })
    assert.equal(response.status(), 200, "Owned fixture API read")
    return response.json()
  }
  const openEditor = async () => {
    await host.goto(origin + "/manager/quizz/" + quizId + "?lng=en", {
      waitUntil: "domcontentloaded",
    })
    await expect(host.getByTestId("editor-save-btn")).toBeEnabled({
      timeout: 30_000,
    })
    assert.equal(
      digest(await host.locator('input[name="subject"]').inputValue()),
      digest(fixture.quizz.subject),
      "Stored title renders unchanged",
    )
  }
  const openTimeline = async () => {
    if (!(await host.getByTestId("editor-panel-timeline").isVisible())) {
      await host.getByTestId("editor-panel-toggle-timeline").click()
    }
    await expect(host.getByTestId("editor-panel-timeline")).toBeVisible()
  }
  const controlsReady = async () => {
    const unlock = host.getByTestId("host-enable-audio")
    if (await unlock.isVisible()) await unlock.click()
  }
  try {
    await installPlaybackAudit(host)
    await addExactMirrors(context, "manager")
    const preview = await context.request.get(
      origin + "/api/extensions/preview/quizzes/" + quizId,
      { headers },
    )
    previewStatuses.push(preview.status())
    record("original-native-account-preview", {
      status: preview.status(),
      passed: preview.status() === 200,
    })
    const beforeBase = await read("/api/quizz/" + quizId)
    const beforeExtras = (await read("/api/extensions/quizzes/" + quizId))
      .extras
    await openEditor()
    await openTimeline()
    const timeline = host.getByTestId("editor-timeline")
    await expect(
      timeline.locator('[data-testid^="editor-question-card-"]'),
    ).toHaveCount(beforeBase.questions.length)
    if (beforeExtras?.timeline) {
      await expect(timeline.getByTestId("editor-scene-card")).toHaveCount(
        beforeExtras.timeline.filter((item) => item.kind !== "question").length,
      )
    }
    checkpoint = "editor-save"
    const save = host.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          "/api/extensions/quizzes/" + quizId &&
        response.request().method() === "PUT",
    )
    await host.getByTestId("editor-save-btn").click()
    assert.equal(
      (await save).status(),
      200,
      "Stored game saves through native editor",
    )
    await host.waitForURL(/\/(studio\/games|manager\/config)$/)
    let savedBase = await read("/api/quizz/" + quizId)
    let savedExtras = (await read("/api/extensions/quizzes/" + quizId)).extras
    const savedPreview = await context.request.get(
      origin + "/api/extensions/preview/quizzes/" + quizId,
      { headers },
    )
    previewStatuses.push(savedPreview.status())
    record("saved-native-account-preview", {
      status: savedPreview.status(),
      passed: savedPreview.status() === 200,
    })
    assert.equal(
      digest(savedBase.questions),
      digest(beforeBase.questions),
      "Editor save preserves every authored question field",
    )
    assert.equal(savedBase.id, quizId, "Editor save retains original identity")
    if (beforeExtras?.schemaVersion === 2) {
      for (const key of [
        "questionIds",
        "timeline",
        "scenes",
        "defaults",
        "perQuestion",
        "audio",
      ]) {
        assert.equal(
          digest(savedExtras[key]),
          digest(beforeExtras[key]),
          "Editor preserves authored " + key,
        )
      }
    }
    record("native-editor-displays-saves-and-preserves-authored-game", {
      questions: savedBase.questions.length,
      cards: savedExtras?.timeline?.length ?? savedBase.questions.length,
    })
    if (options.externalAssets?.length) {
      checkpoint = "external-image-owner-repair"
      assert.deepEqual(
        previewStatuses,
        [422, 422],
        "Record the original external-image preview failure before repair",
      )
      const originalFixtureDigest = digest(fixture)
      const repaired = await qualifyOwnerImageRepair({
        request: context.request,
        origin,
        token,
        quizId,
        fixtureId: fixture.fixtureId,
        externalAssets: options.externalAssets,
        evidenceDirectory: options.evidenceDirectory,
      })
      assert.equal(
        digest(fixture),
        originalFixtureDigest,
        "Repair never edits the immutable source fixture",
      )
      externalMediaRepair = repaired.receipt
      externalMediaRepair.originalSidecarAbsent = beforeExtras === null
      savedBase = repaired.base
      savedExtras = repaired.extras
      for (const url of repaired.uploadedUrls) repairedImageUrls.add(url)
      previewStatuses.push(repaired.receipt.repairedPreviewStatus)
      const sourceUrls = new Set(
        options.externalAssets.map((item) => item.mirror.sourceUrl),
      )
      const references = beforeBase.questions.filter(
        (question) =>
          question.media?.type === "image" &&
          sourceUrls.has(question.media.url),
      ).length
      assert.equal(externalMediaRepair.semanticDelta.paths.length, references)
      record("native-owner-upload-and-revisioned-image-repair", {
        references,
        originalPreviewStatus: 422,
        repairedPreviewStatus: 200,
        sourceFixtureUnchanged: true,
        staleRevisionStatus: externalMediaRepair.staleRevisionStatus,
      })
    }
    checkpoint = "editor-reopen"
    await openEditor()
    mirrorsAtLaunch = mirrorChecks.reduce(
      (total, check) => total + check.requests,
      0,
    )
    checkpoint = "saved-game-launch"
    await host.getByTestId("studio-tab-launch").click()
    await expect(host.getByTestId("studio-launch-btn")).toBeEnabled()
    let roomReply
    const captureLaunch = async (route) => {
      if (route.request().method() !== "POST") return route.continue()
      const response = await route.fetch()
      assert([200, 201].includes(response.status()), "Native editor launch")
      roomReply = {
        quizId: route.request().postDataJSON().quizzId,
        body: await response.json(),
      }
      await route.fulfill({ response })
    }
    await host.route(origin + "/api/games", captureLaunch)
    await host.getByTestId("studio-launch-btn").click()
    await expect.poll(() => Boolean(roomReply)).toBe(true)
    room = roomReply.body
    assert.equal(
      roomReply.quizId,
      quizId,
      "Launch uses the saved original identity",
    )
    await host.unroute(origin + "/api/games", captureLaunch)
    await expect(host).toHaveURL(origin + "/party/manager/" + room.gameId)
    const game = registry.getGameById(room.gameId)
    assert(game, "Actual native engine instance exists")
    assert.equal(game.sourceQuizId, quizId)
    const snapshot = () => {
      const step = game.showCoordinator?.getAuthoritativeStepEnvelope("manager")
      return {
        phase: game.showCoordinator?.currentPhase ?? "legacy",
        id: step?.id ?? null,
        kind: step?.kind ?? null,
        sceneId: step?.sceneId ?? null,
        questionId: step?.questionId ?? null,
        stepIndex: step?.stepIndex ?? null,
        questionOrdinal: step?.questionOrdinal ?? null,
        durationMs: step?.durationMs ?? null,
        epoch: step?.epoch ?? null,
        unresolvedStoryTie:
          game.extensionSession?.hasUnresolvedStoryTie() ?? false,
        questionIndex: game.round.currentQuestionIndex,
        status: game.managerStatus?.name ?? null,
      }
    }
    let previousTrace = ""
    const observe = () => {
      const value = snapshot()
      const key = JSON.stringify(value)
      if (key !== previousTrace) {
        trace.push(value)
        previousTrace = key
      }
    }
    traceTimer = setInterval(observe, 16)
    checkpoint = "platform-opening"
    await expect(host.getByTestId("platform-opening-start")).toBeEnabled({
      timeout: 30_000,
    })
    await host.getByTestId("platform-opening-start").click()
    await expect(host.getByTestId("platform-opening-skip")).toBeEnabled()
    await host.getByTestId("platform-opening-skip").click()
    await expect(host.getByTestId("platform-game-opening")).toBeHidden({
      timeout: 30_000,
    })
    stage = host.getByTestId("tadazz-show")
    await expect(stage).toBeVisible()
    await controlsReady()
    await expect(host.getByTestId("audio-cue-player-state")).toHaveCount(1)
    await host.evaluate(() => window.__tadazzStoredAudit.arm())
    await watchQuestionSequence(stage, {
      phaseAttribute: "data-show-scene",
      votingPhase: "voting",
    })
    checkpoint = "native-player-join"
    const guestPolicy = await context.request.patch(
      origin + "/api/games/" + room.gameId + "/roster/settings",
      { headers, data: { allowUnregisteredPlayers: true } },
    )
    assert.equal(
      guestPolicy.status(),
      200,
      "Owner enables one synthetic QA participant",
    )
    playerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "en-GB",
      ignoreHTTPSErrors: true,
    })
    await playerContext.addInitScript(() =>
      localStorage.setItem("i18nextLng", "en"),
    )
    player = await playerContext.newPage()
    await installPlaybackAudit(player)
    await addExactMirrors(playerContext, "player")
    track(player)
    await player.goto(
      origin + "/game?pin=" + encodeURIComponent(room.inviteCode),
    )
    await player.getByPlaceholder("Username here").fill(qaUsername)
    const [joinResponse] = await Promise.all([
      player.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/games/join" &&
          response.request().method() === "POST",
      ),
      player.getByRole("button", { name: "Submit", exact: true }).click(),
    ])
    assert.equal(
      joinResponse.status(),
      200,
      "The real participant join succeeds",
    )
    const joined = await joinResponse.json()
    assert.equal(joined.gameId, room.gameId)
    assert.equal(joined.username, qaUsername)
    assert.equal(typeof joined.ticket, "string")
    assert(
      joined.ticket.length > 0,
      "A fresh participant receives a join ticket",
    )
    await expect(player).toHaveURL(origin + "/party/" + room.gameId)
    await expect
      .poll(
        () =>
          game.players.filter(
            (participant) =>
              participant.connected && participant.username === qaUsername,
          ).length,
      )
      .toBe(1)
    await host.bringToFront()
    const toolbar = host.getByTestId("manager-control-toolbar")
    await toolbar.getByRole("button", { name: "Start", exact: true }).click()
    const nativeTimeline = savedExtras?.timeline ?? []
    const allowedSceneIds = new Set(
      nativeTimeline
        .filter((item) => item.kind !== "question")
        .map((item) => item.sceneId),
    )
    const seenSteps = new Set()
    const seenQuestions = new Set()
    const next = async (expected) => {
      const button = host.getByTestId("host-next-screen-btn")
      const advanced = () =>
        snapshot().id !== expected.id ||
        snapshot().questionIndex !== expected.questionIndex
      await expect
        .poll(
          async () =>
            advanced() ||
            (Boolean(await button.count()) && (await button.isEnabled())),
          { timeout: sceneTimeout(expected) },
        )
        .toBe(true)
      if (
        !advanced() &&
        (await button.isVisible()) &&
        (await button.isEnabled())
      ) {
        await button.click()
      }
    }
    for (
      let guard = 0;
      guard < Math.max(100, nativeTimeline.length * 5);
      guard++
    ) {
      observe()
      const active = snapshot()
      checkpoint = "playback-" + active.phase + "-" + active.questionIndex
      if (active.phase === "finished" || active.status === "FINISHED") break
      if (active.id && !seenSteps.has(active.id)) {
        seenSteps.add(active.id)
        if (active.sceneId) {
          assert(
            allowedSceneIds.has(active.sceneId),
            "Only an authored timeline scene can become active",
          )
          sceneVisits.push({
            id: active.sceneId,
            afterQuestion: starts.length,
            kind: active.kind,
          })
        }
      }
      if (active.phase === "scene") {
        await expect(stage).toHaveAttribute("data-show-scene", "scene", {
          timeout: sceneTimeout(active),
        })
        const authoredScene = savedExtras.scenes[active.sceneId]
        if (
          authoredScene?.kind === "animation" &&
          isFullShowScene(authoredScene.preset)
        ) {
          await expect(stage.locator("[data-full-show-scene]")).toHaveAttribute(
            "data-full-show-scene",
            authoredScene.preset,
          )
          await expect(stage.locator("[data-full-show-scene]")).toBeVisible()
        } else if (
          ["opening", "closing", "media"].includes(authoredScene?.kind) &&
          (authoredScene.mediaUrl ||
            authoredScene.lottieUrl ||
            authoredScene.overlayAnimations?.length)
        ) {
          await expect(stage.locator("[data-scene-id]")).toHaveAttribute(
            "data-scene-id",
            active.sceneId,
          )
        } else if (active.kind === "leaderboard") {
          await expect(
            stage.getByTestId("tadazz-leaderboard-screen"),
          ).toBeVisible()
        }
        await paintedFrames(stage)
        await next(active)
        await expect
          .poll(
            () =>
              snapshot().id !== active.id || snapshot().phase === "finished",
            { timeout: sceneTimeout(active) },
          )
          .toBe(true)
        continue
      }
      const index = active.questionIndex
      if (
        index < 0 ||
        index >= savedBase.questions.length ||
        !["question", "legacy"].includes(active.phase)
      ) {
        await expect
          .poll(
            () =>
              snapshot().phase === "scene" ||
              snapshot().phase === "question" ||
              snapshot().status === "SELECT_ANSWER",
            { timeout: 30_000 },
          )
          .toBe(true)
        continue
      }
      if (!seenQuestions.has(index)) {
        const question = savedBase.questions[index]
        await expect
          .poll(() => game.round.isCurrentlyAcceptingAnswers, {
            timeout: 30_000,
          })
          .toBe(true)
        assert.equal(
          index,
          starts.length,
          "All native questions start once in authored order",
        )
        starts.push(index)
        seenQuestions.add(index)
        await expect(host.getByTestId("host-question-counter")).toHaveText(
          `${index + 1} / ${savedBase.questions.length}`,
        )
        await controlsReady()
        await host.bringToFront()
        await expect(stage).toHaveAttribute("data-show-scene", "voting")
        // Observe the actual host's answer/timer paint before the participant can
        // answer immediately and complete a one-player round in the same tick.
        if (question.type !== "estimation") {
          await readQuestionSequence(stage, index, { throughResults: false })
        } else {
          await paintedFrames(stage)
        }
        if (repairedImageUrls.has(question.media?.url)) {
          await expect
            .poll(() =>
              stage.evaluate(
                (element, url) =>
                  [...element.querySelectorAll("img")].some(
                    (image) =>
                      new URL(image.currentSrc || image.src, location.href)
                        .pathname === url &&
                      image.complete &&
                      image.naturalWidth > 0 &&
                      image.getBoundingClientRect().width > 0,
                  ),
                question.media.url,
              ),
            )
            .toBe(true)
          repairedImageQuestions.push(index)
        }
        const answer = async (answerIndex) => {
          const pad = player.getByTestId("tadazz-pad-option-" + answerIndex)
          if (await pad.isVisible()) {
            await expect(pad).toBeEnabled()
            await pad.click()
          } else {
            const native = player.locator("button").filter({
              has: player.getByTestId("answer-badge-" + answerIndex),
            })
            await expect(native).toHaveCount(1)
            await expect(native).toBeEnabled()
            await native.click()
          }
        }
        if (question.type === "estimation") {
          const slider = player.locator('input[type="range"]:visible')
          if (await slider.count()) {
            await slider.first().focus()
            await slider.first().press("Home")
          } else {
            const input = player
              .locator(
                'input[inputmode="decimal"]:visible, input[type="number"]:visible',
              )
              .first()
            await expect(input).toBeEditable()
            await input.fill(
              String(question.solutions?.[0] ?? question.options.min),
            )
          }
          await player
            .getByRole("button", { name: "Confirm", exact: true })
            .click()
        } else {
          const choices =
            question.type === "multi" && question.solutions?.length
              ? question.solutions
              : [question.solutions?.[0] ?? 0]
          for (const choice of choices) await answer(choice)
          if (question.type === "multi") {
            const submit = player.getByTestId("tadazz-pad-submit")
            if (await submit.isVisible()) await submit.click()
            else
              await player
                .getByRole("button", { name: "Confirm", exact: true })
                .click()
          }
        }
        await expect
          .poll(
            () =>
              game.round.getAnsweredPlayerIds().size > 0 ||
              Boolean(
                game.round.getQuestionLedgerEntry(index)?.answers?.length,
              ),
          )
          .toBe(true)
        accepted.push(index)
        await host.bringToFront()
        if (game.round.isCurrentlyAcceptingAnswers) {
          const end = host.getByTestId("host-end-timer-btn")
          await expect(end).toBeEnabled()
          await end.click()
        }
        await expect
          .poll(() => Boolean(game.round.getQuestionLedgerEntry(index)), {
            timeout: 30_000,
          })
          .toBe(true)
        const authoredResults =
          nativeTimeline[active.stepIndex + 1]?.kind === "interimResults"
        await expect(stage).toHaveAttribute(
          "data-show-scene",
          authoredResults ? "scene" : "results",
          { timeout: 30_000 },
        )
        await paintedFrames(stage)
        if (question.type !== "estimation") {
          const throughResults = !authoredResults
          const sequence = await readQuestionSequence(stage, index, {
            throughResults,
          })
          sequences.push({
            index,
            throughResults,
            leadMs: sequence.leadMs,
            retainedPanel: sequence.retainedPanel,
            retainedHeading: sequence.retainedHeading,
            duplicateHeadings: sequence.duplicateHeadings,
            newQuestionAnimations: sequence.newQuestionAnimations,
          })
        }
        console.log(
          JSON.stringify({
            storedGameProgress: fixture.fixtureId,
            questionsCompleted: accepted.length,
            total: savedBase.questions.length,
          }),
        )
      }
      const current = snapshot()
      if (current.phase === "finished" || current.status === "FINISHED") break
      if (current.phase === "scene") continue
      if (current.questionIndex === index) await next(current)
    }
    checkpoint = "completed-game-assertions"
    observe()
    assert.equal(
      starts.length,
      savedBase.questions.length,
      "Every authored question was displayed",
    )
    assert.equal(
      accepted.length,
      savedBase.questions.length,
      "Every question accepted a real client answer",
    )
    assert(
      snapshot().phase === "finished" || snapshot().status === "FINISHED",
      "Game reaches terminal state",
    )
    await expect(stage).toHaveAttribute("data-show-scene", "finale", {
      timeout: 30_000,
    })
    timelineReceipt = orderedTimelineReceipt(
      trace,
      nativeTimeline,
      savedExtras.scenes ?? {},
      snapshot(),
    )
    sceneVisits.splice(0, sceneVisits.length, ...timelineReceipt.scenes)
    // Scene IDs stay private; the receipt records ordered hashes and counts.
    delete timelineReceipt.scenes
    const unused = new Set(fixture.expected.unusedSceneIds ?? [])
    assert(
      sceneVisits.every((visit) => !unused.has(visit.id)),
      "Unused scene definitions never appear",
    )
    const actualBoards = sceneVisits
      .filter((visit) => visit.kind === "leaderboard")
      .map((visit) => visit.afterQuestion)
    assert.equal(
      digest(actualBoards),
      digest(fixture.expected.leaderboardAfterQuestions ?? []),
      "Authored leaderboards occur at the exact question boundaries",
    )
    if (savedExtras?.defaults?.leaderboardPolicy === "cardOnly") {
      assert(
        !trace.some(
          (entry) =>
            entry.phase === "question" && entry.status === "SHOW_LEADERBOARD",
        ),
        "No automatic duplicate leaderboards",
      )
    }
    await collectPlaybackAudit()
    assert(
      audio?.samples > 0,
      "Observed shared audio ownership throughout playback",
    )
    assert.equal(
      audio.minOwners,
      1,
      "Shared audio owner is never missing during playback",
    )
    assert.equal(
      audio.maxOwners,
      1,
      "No duplicate audio owner at any observed playback frame",
    )
    assert.equal(
      audio.ownerViolations,
      0,
      "One shared audio owner throughout playback",
    )
    assert.equal(
      audio.failedTracks.length,
      0,
      "No earlier or final soundtrack failure",
    )
    assert.equal(
      mediaErrors.length,
      0,
      "No native image/audio/video decode errors",
    )
    assert.equal(faults.length, 0, "No browser JavaScript failures")
    assert.equal(assetFailures.size, 0, "No asset HTTP failures")
    if (externalMediaRepair) {
      assert(
        externalMediaRepair.passed,
        "The original rejection requires a fully qualified owner repair",
      )
      assert.deepEqual(previewStatuses, [422, 422, 200])
      assert.equal(
        repairedImageQuestions.length,
        externalMediaRepair.semanticDelta.paths.length,
        "Every repaired question actually displays the owner-uploaded image",
      )
      assert.equal(
        mirrorChecks.reduce((total, check) => total + check.requests, 0),
        mirrorsAtLaunch,
        "Repaired playback uses owner media, never the offline external-URL mirror",
      )
      externalMediaRepair.playback = {
        passed: true,
        renderedQuestions: repairedImageQuestions.length,
        externalMirrorRequests: 0,
        fullNativeFlowCompleted: true,
      }
    } else {
      assert(
        previewStatuses.every((status) => status === 200),
        "Original and saved native account previews must both succeed; admission failures remain unqualified",
      )
    }
    record("saved-game-full-native-playback", {
      questions: starts.length,
      accepted: accepted.length,
      scenes: sceneVisits.length,
      leaderboards: actualBoards,
      unusedSceneDefinitions: unused.size,
      questionContinuity: sequences.length,
      authoredCards: timelineReceipt.authored,
      observedCards: timelineReceipt.observed,
      conditionalTieSkips: timelineReceipt.skipped.length,
    })
    return {
      fixtureId: fixture.fixtureId,
      passed: true,
      checks,
      trace: safeTrace(),
      sequences,
      audio,
      mediaErrors,
      timelineReceipt,
      previewStatuses,
      originalPreviewQualified: previewStatuses[0] === 200,
      externalMediaRepair,
      mirrorChecks,
      assetFailures: [...assetFailures],
      faults,
    }
  } catch (error) {
    // Detailed Playwright errors can contain authored text. The controller keeps
    // stderr private on Linux and retrieves only this opaque diagnostic receipt.
    console.error("Stored game failed", fixture.fixtureId, checkpoint, error)
    externalMediaRepair ??= error?.repairReceipt
    await collectPlaybackAudit()
    return {
      fixtureId: fixture.fixtureId,
      passed: false,
      checks,
      trace: safeTrace(),
      starts: starts.length,
      accepted: accepted.length,
      sceneVisits: safeSceneVisits(),
      sequences,
      audio,
      mediaErrors,
      timelineReceipt,
      previewStatuses,
      originalPreviewQualified: previewStatuses[0] === 200,
      externalMediaRepair,
      mirrorChecks,
      assetFailures: [...assetFailures],
      faults,
      error: checkpoint + ": " + (error?.name ?? "Error"),
      errorDigest: digest(String(error?.message ?? error)),
    }
  } finally {
    clearInterval(traceTimer)
    if (stage) await stopQuestionSequence(stage).catch(() => {})
    await host
      .evaluate(() => window.__tadazzStoredAudit?.stop())
      .catch(() => {})
    await player
      ?.evaluate(() => window.__tadazzStoredAudit?.stop())
      .catch(() => {})
    for (const { browserContext, exact, handler } of mirrorRoutes) {
      await browserContext.unroute(exact, handler)
    }
    if (playerContext) await playerContext.close()
    await host.close()
    if (room?.gameId) registry.removeGame(room.gameId)
  }
}
