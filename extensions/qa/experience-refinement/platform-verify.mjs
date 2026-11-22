/** Built-candidate acceptance. Creates only disposable quizzes and rooms on the isolated Linux host. */
import assert from "node:assert/strict"
import {
  watchNativeQuestionSequence,
  readNativeQuestionSequence,
} from "./question-sequence-verify.mjs"
import { randomUUID } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

const require = createRequire(import.meta.url)
const { expect } = require("@playwright/test")
const INTRO = "/tadazz-show/music/platform/tadazz-production-intro-20261106.wav"
const VOTING =
  "/tadazz-show/music/platform/tzila-determined-pursuit-20261105.mp3"
const LOBBY = "/tadazz-show/music/platform/tadazz-exploration-20261106.mp3"
const RESULTS = "/tadazz-show/music/cutie-patootie.mp3"
const FINALE = "/tadazz-show/music/platform/tadazz-epic-endgame-20261106.mp3"
const CONFIRM = "/sounds/tadazz-confirm-20261108.mp3"
const TRANSITION = "/sounds/tadazz-silky-transition-20261108.mp3"
const REVEAL = "/sounds/tadazz-reveal-bright-20261108.mp3"

function recordMedia() {
  const trace = { elements: [], plays: [], events: [] }
  window.__platformAudioTrace = trace
  const snapshot = (element) => ({
    requestedSrc: element.getAttribute("src") ?? "",
    currentSrc: element.currentSrc,
    paused: element.paused,
    ended: element.ended,
    muted: element.muted,
    volume: element.volume,
    loop: element.loop,
    currentTime: element.currentTime,
    duration: Number.isFinite(element.duration) ? element.duration : null,
    readyState: element.readyState,
    networkState: element.networkState,
    error: element.error
      ? { code: element.error.code, message: element.error.message }
      : null,
  })
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function () {
    let attempt
    if (this instanceof HTMLAudioElement) {
      if (!trace.elements.includes(this)) trace.elements.push(this)
      attempt = {
        url: new URL(this.currentSrc || this.src, location.href).pathname,
        requestedUrl: new URL(this.src || location.href, location.href)
          .pathname,
        element: trace.elements.indexOf(this),
        at: performance.now(),
        volume: this.volume,
        loop: this.loop,
        outcome: "pending",
        before: snapshot(this),
      }
      trace.plays.push(attempt)
    }
    try {
      const result = play.call(this)
      if (attempt) {
        result.then(
          () => {
            attempt.outcome = "fulfilled"
            attempt.settledAt = performance.now()
            attempt.after = snapshot(this)
          },
          (error) => {
            attempt.outcome = "rejected"
            attempt.settledAt = performance.now()
            attempt.error = { name: error?.name, message: error?.message }
            attempt.after = snapshot(this)
          },
        )
      }
      return result
    } catch (error) {
      if (attempt) {
        attempt.outcome = "threw"
        attempt.error = { name: error?.name, message: error?.message }
        attempt.after = snapshot(this)
      }
      throw error
    }
  }
  window.addEventListener(
    "tadazz:sfx",
    (event) => {
      trace.events.push({
        name: event.detail?.name,
        identity: event.detail?.identity,
        at: performance.now(),
      })
    },
    true,
  )
}

const mediaState = (page) =>
  page.evaluate(() => {
    const trace = window.__platformAudioTrace
    const elements = (trace?.elements ?? []).map((element, index) => ({
      element: index,
      url: new URL(
        element.currentSrc || element.src || location.href,
        location.href,
      ).pathname,
      requestedSrc: element.getAttribute("src") ?? "",
      currentSrc: element.currentSrc,
      paused: element.paused,
      ended: element.ended,
      muted: element.muted,
      time: element.currentTime,
      duration: Number.isFinite(element.duration) ? element.duration : null,
      volume: element.volume,
      loop: element.loop,
      ready: element.readyState,
      network: element.networkState,
      error: element.error
        ? { code: element.error.code, message: element.error.message }
        : null,
    }))
    return {
      active: elements.filter(
        (element) => !element.paused && !element.ended && element.volume > 0,
      ),
      elements,
      plays: trace?.plays ?? [],
      events: trace?.events ?? [],
    }
  })

/** options: the same browser/context/token/origin/evidence as verifyGalleryEditor. */
export async function verifyPlatformDefaults(options) {
  assert.equal(process.platform, "linux", "Run acceptance on the Linux server")
  const { origin, token, browser, context } = options
  assert.equal(
    new URL(origin).hostname,
    "127.0.0.1",
    "Disposable candidate only",
  )
  assert(token && browser && context, "Existing authenticated fixture required")
  const evidence = join(options.evidence, "platform-refinement")
  mkdirSync(evidence, { recursive: true })
  const headers = { Authorization: "Bearer " + token }
  const results = []
  const created = []
  const errors = []
  const failedMedia = []
  const mediaResponses = []
  const pages = []
  const pageRoles = new Map()
  const contexts = []
  const { computeCanonicalBaseDigest } =
    await import("../../src/core/digest.ts")
  const record = (name, detail = {}) =>
    results.push({ name, passed: true, ...detail })
  const post = async (path, body) => {
    const response = await context.request.post(origin + path, {
      headers,
      data: body,
    })
    assert.equal(
      response.status(),
      201,
      path + ": " + (await response.text()).slice(0, 500),
    )
    return response.json()
  }
  const watch = async (page, role) => {
    pages.push(page)
    pageRoles.set(page, role)
    await page.addInitScript(recordMedia)
    await page.emulateMedia({ reducedMotion: "no-preference" })
    page.on("pageerror", (error) => errors.push(role + ": " + error.message))
    page.on("response", (response) => {
      const path = new URL(response.url()).pathname
      if (/^\/(?:sounds|tadazz-show\/music)\//u.test(path)) {
        const headers = response.headers()
        mediaResponses.push({
          role,
          path,
          status: response.status(),
          contentType: headers["content-type"],
          contentLength: headers["content-length"],
        })
      }
      if (
        response.status() >= 400 &&
        /^\/(?:sounds|tadazz-show\/music)\//u.test(path)
      ) {
        failedMedia.push({ role, path, status: response.status() })
      }
    })
    page.on("requestfailed", (request) => {
      const path = new URL(request.url()).pathname
      if (/^\/(?:sounds|tadazz-show\/music)\//u.test(path)) {
        mediaResponses.push({
          role,
          path,
          failure: request.failure()?.errorText,
        })
      }
    })
    return page
  }
  const anonymous = async (role, viewport = { width: 1280, height: 720 }) => {
    const owned = await browser.newContext({
      viewport,
      locale: "en-GB",
      ignoreHTTPSErrors: true,
      reducedMotion: "no-preference",
    })
    contexts.push(owned)
    await owned.addInitScript(() => localStorage.setItem("i18nextLng", "en"))
    return watch(await owned.newPage(), role)
  }
  const fixture = async ({
    theme,
    finale = false,
    legacy = false,
    opening,
  }) => {
    const quizz = {
      subject: "Platform acceptance " + theme + " " + randomUUID(),
      gameMode: "quiz",
      questions: [
        {
          type: "single",
          question: "Which answer is correct?",
          answers: ["One", "Two", "Three", "Four"],
          solutions: [0],
          cooldown: 3,
          time: 20,
        },
      ],
    }
    const questionId = randomUUID()
    const extras = {
      schemaVersion: 2,
      revision: 1,
      quizId: "draft",
      baseDigest: computeCanonicalBaseDigest(quizz),
      questionIds: [questionId],
      timeline: [{ id: randomUUID(), kind: "question", questionId }],
      scenes: {},
      defaults: {
        showTheme: { id: theme, version: "1.0.0", overrides: {} },
        advanceMode: "auto",
        leaderboardPolicy: "disabled",
      },
    }
    if (finale) {
      const sceneId = randomUUID()
      extras.scenes[sceneId] = {
        id: sceneId,
        kind: "animation",
        preset: "grand-finale",
        durationMs: 9200,
        advance: "auto",
      }
      extras.timeline.push({ id: randomUUID(), kind: "animation", sceneId })
    }
    if (opening === "custom") {
      const ids = [
        "start",
        "showQuestion",
        "answersMusic",
        "answerPressed",
        "revealResults",
        "leaderboard",
        "podium1",
        "podium2",
        "podium3",
      ]
      extras.audio = {
        cues: Object.fromEntries(
          ids.map((id) => [
            id,
            {
              source: "default",
              volume: id === "answersMusic" ? 0.38 : 0.8,
              enabled: true,
              loop: id === "answersMusic",
            },
          ]),
        ),
        soundtrack: {
          openingIntro: {
            mode: "media",
            url: LOBBY,
            volume: 0.11,
            loop: true,
            fadeMs: 0,
            startOffsetSeconds: 0.4,
            maxDurationMs: 12000,
          },
        },
      }
    }
    if (opening === "mute") {
      extras.defaults.showTheme.overrides = {
        audio: { opening: { muted: true } },
      }
    }
    const saved = await post(
      legacy ? "/api/quizz" : "/api/extensions/quizzes",
      legacy ? quizz : { quizz, extras },
    )
    const quizId = saved.quizId ?? saved.id
    assert(quizId, "Saved disposable quiz ID")
    const room = await post("/api/games", { quizzId: quizId })
    const settings = await context.request.patch(
      origin + "/api/games/" + room.gameId + "/settings",
      {
        headers,
        data: {
          endOnAllAnswered: true,
          autoAdvance: { enable: true, responsesDelay: 4, leaderboardDelay: 3 },
        },
      },
    )
    assert.equal(
      settings.status(),
      200,
      "Bounded progression in this disposable room",
    )
    const policy = await context.request.patch(
      origin + "/api/games/" + room.gameId + "/roster/settings",
      { headers, data: { allowUnregisteredPlayers: true } },
    )
    assert.equal(policy.status(), 200, "Open only this disposable room")
    created.push({
      quizId,
      gameId: room.gameId,
      theme,
      legacy,
      finale,
      opening,
    })
    const host = await watch(await context.newPage(), "host-" + theme)
    await host.goto(origin + "/party/manager/" + room.gameId + "?lng=en")
    await expect(host.getByTestId("platform-opening-start")).toBeEnabled({
      timeout: 30_000,
    })
    await expect(host.getByTestId("host-guest-join-toggle")).toHaveCount(1)
    return { host, room, quizId }
  }
  const enter = async (room, name) => {
    const player = await anonymous(name, { width: 390, height: 844 })
    await player.goto(
      origin + "/game?pin=" + encodeURIComponent(room.inviteCode),
    )
    await expect(player.getByPlaceholder("Username here")).toBeVisible({
      timeout: 30_000,
    })
    await player.getByPlaceholder("Username here").fill(name)
    const joined = player.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/games/join" &&
        response.request().method() === "POST",
    )
    await player.getByRole("button", { name: "Submit", exact: true }).click()
    assert.equal((await joined).status(), 200, "Disposable player joins")
    await expect(player).toHaveURL(origin + "/party/" + room.gameId)
    return player
  }
  const activeUrls = async (page) =>
    (await mediaState(page)).active.map((item) => item.url)
  const assertSingleIntro = async (host, url) => {
    await expect(host.getByTestId("audio-cue-player-state")).toHaveAttribute(
      "data-audio-url",
      url,
    )
    await expect
      .poll(() => activeUrls(host), { timeout: 10_000 })
      .toEqual([url])
  }
  const readFinalePlayback = async (page) => {
    const owner = page.getByTestId("audio-cue-player-state")
    await expect(owner).toHaveCount(1)
    for (const [name, value] of Object.entries({
      "data-soundtrack-slot": "finale",
      "data-audio-url": FINALE,
      "data-should-play": "true",
      "data-audio-loop": "true",
      "data-audio-blocked": "false",
      "data-audio-error": "false",
      "data-audio-paused": "false",
    })) {
      await expect(owner).toHaveAttribute(name, value)
    }
    await expect.poll(() => activeUrls(page)).toEqual([FINALE])
    const state = await mediaState(page)
    assert.equal(state.active.length, 1, "Exactly one active finale element")
    const audio = state.active[0]
    assert.equal(audio.url, FINALE)
    assert.equal(audio.loop, true)
    assert.equal(audio.muted, false)
    assert.equal(audio.error, null)
    const identity = await owner.getAttribute("data-audio-identity")
    assert(identity, "Finale has an authoritative playback identity")
    return {
      identity,
      element: audio.element,
      url: audio.url,
      time: audio.time,
      loop: audio.loop,
      plays: state.plays.filter(
        (item) => item.url === FINALE || item.requestedUrl === FINALE,
      ).length,
    }
  }
  const assertFinaleContinues = (before, after) => {
    assert.equal(after.identity, before.identity, "Finale identity is retained")
    assert.equal(
      after.element,
      before.element,
      "The same audio element continues",
    )
    assert.equal(after.url, before.url)
    assert.equal(
      after.plays,
      before.plays,
      "Closing must not replay the finale",
    )
    assert(after.time > before.time + 0.1, "Real finale playback time advances")
    assert.equal(after.loop, true)
  }

  try {
    for (const [theme, legacy, finale] of [
      ["razzia-original", true, false],
      ["tadazz-classic", false, true],
    ]) {
      const { host, room } = await fixture({ theme, legacy, finale })
      const display = await anonymous("display-" + theme)
      await display.goto(origin + "/display/" + room.gameId + "?lng=en")
      await expect(
        display.getByTestId("platform-game-opening"),
      ).toHaveAttribute("data-platform-opening-stage", "standby")
      await expect(display.getByTestId("host-guest-join-toggle")).toHaveCount(0)
      await host.getByTestId("platform-opening-start").click()
      await assertSingleIntro(host, INTRO)

      if (legacy) {
        const video = host.getByTestId("tadazz-opening-video")
        await expect
          .poll(() => video.evaluate((element) => element.currentTime))
          .toBeGreaterThan(0.5)
        assert.equal(await video.evaluate((element) => element.muted), true)
        await host.getByTestId("host-pause-resume-btn").click()
        await expect(host.getByTestId("platform-game-opening")).toHaveAttribute(
          "data-game-paused",
          "true",
        )
        const frozenVideo = await video.evaluate(
          (element) => element.currentTime,
        )
        await host.waitForTimeout(650)
        expect(
          Math.abs(
            (await video.evaluate((element) => element.currentTime)) -
              frozenVideo,
          ),
        ).toBeLessThan(0.2)
        await expect.poll(() => activeUrls(host)).toEqual([])
        await display.reload()
        await expect(
          display.getByTestId("platform-game-opening"),
        ).toHaveAttribute("data-game-paused", "true")
        const displayVideo = display.getByTestId("tadazz-opening-video")
        await expect
          .poll(() => displayVideo.evaluate((element) => element.readyState))
          .toBeGreaterThanOrEqual(2)
        expect(
          Math.abs(
            (await displayVideo.evaluate((element) => element.currentTime)) -
              frozenVideo,
          ),
        ).toBeLessThan(0.8)
        await host.getByTestId("host-pause-resume-btn").click()
        await expect(host.getByTestId("platform-game-opening")).toHaveCount(0, {
          timeout: 15_000,
        })
        await expect(
          host.getByTestId("audio-cue-player-state"),
        ).toHaveAttribute("data-audio-url", LOBBY)
        record(
          "legacy-full-opening-single-audio-owner-and-paused-display-reconnect",
        )
      } else {
        await host.getByTestId("platform-opening-skip").click()
        await expect(host.getByTestId("platform-game-opening")).toHaveCount(0)
      }

      const player = await enter(room, "Platform " + theme)

      if (legacy) {
        const previousPlays = (await mediaState(host)).plays.length
        await host.evaluate(() => {
          for (const [name, suffix] of [
            ["story-begin", "first"],
            ["story-assembled", "second"],
          ]) {
            window.dispatchEvent(
              new CustomEvent("tadazz:sfx", {
                detail: {
                  name,
                  identity: "platform-qa-interruption-" + suffix,
                },
              }),
            )
          }
        })
        const interruptedEffects = async () =>
          (await mediaState(host)).plays.slice(previousPlays)
        await expect
          .poll(async () =>
            (await interruptedEffects()).map((item) => item.outcome),
          )
          .toEqual(["rejected", "fulfilled"])
        const interrupted = await interruptedEffects()
        assert.deepEqual(
          interrupted.map((item) => item.requestedUrl),
          [TRANSITION, REVEAL],
        )
        assert.equal(interrupted[0].element, interrupted[1].element)
        assert.equal(interrupted[0].error?.name, "AbortError")
        await expect(
          host.getByTestId("audio-cue-player-state"),
        ).toHaveAttribute("data-audio-blocked", "false")
        await expect(host.getByTestId("host-enable-audio")).toHaveCount(0)
        await expect.poll(() => activeUrls(host)).toEqual([LOBBY])
        record("interrupted-stale-effect-keeps-live-background-audio-unblocked")
      }
      if (legacy) {
        await watchNativeQuestionSequence(host)
        await watchNativeQuestionSequence(display)
        await watchNativeQuestionSequence(player)
      }
      await host
        .getByTestId("manager-control-toolbar")
        .getByRole("button", { name: "Start", exact: true })
        .click()
      const choice = player
        .locator("button")
        .filter({ has: player.getByTestId("answer-badge-0") })
      await expect(choice).toBeEnabled({ timeout: 30_000 })
      await expect(host.getByTestId("audio-cue-player-state")).toHaveAttribute(
        "data-audio-url",
        VOTING,
      )
      await expect.poll(() => activeUrls(host)).toEqual([VOTING])

      if (legacy) {
        const phaseCues = (await mediaState(host)).events
          .filter((event) => event.name === "phase-showQuestion")
          .map((event) => event.identity)
        assert.deepEqual(phaseCues, [room.gameId + ":1:phase:showQuestion"])
        record("native-question-handoff-emits-one-authoritative-phase-cue")
      }
      if (legacy) {
        for (const [role, surface] of [
          ["host", host],
          ["display", display],
          ["player", player],
        ]) {
          const sequence = await readNativeQuestionSequence(surface)
          writeFileSync(
            join(evidence, "native-question-" + role + "-voting.json"),
            JSON.stringify(sequence, null, 2) + String.fromCharCode(10),
          )
          record(
            "native-" +
              role +
              "-question-2s-then-answers-and-timer-with-stable-heading",
          )
        }
      }
      await choice.click()
      await expect
        .poll(
          async () =>
            (await mediaState(player)).events.filter(
              (event) => event.name === "answer-submitted",
            ).length,
        )
        .toBe(1)
      await player.waitForTimeout(650)
      const accepted = await mediaState(player)
      assert.equal(
        accepted.plays.filter((item) => item.url === CONFIRM).length,
        1,
        "One accepted answer, one confirmation",
      )
      assert.equal(
        accepted.events.filter((event) => event.name === "answer-submitted")
          .length,
        1,
      )
      await expect(host.getByTestId("audio-cue-player-state")).toHaveAttribute(
        "data-audio-url",
        RESULTS,
        { timeout: 15_000 },
      )
      if (legacy) {
        for (const [role, surface] of [
          ["host", host],
          ["display", display],
        ]) {
          await expect(
            surface.locator("[data-native-question-round]"),
          ).toHaveAttribute("data-question-phase", "results")
          const sequence = await readNativeQuestionSequence(surface, {
            results: true,
          })
          writeFileSync(
            join(evidence, "native-question-" + role + "-results.json"),
            JSON.stringify(sequence, null, 2) + String.fromCharCode(10),
          )
          record("native-" + role + "-question-heading-remains-through-results")
        }
      }
      record(theme + "-shared-voting-results-and-single-accepted-answer-effect")

      const curtain = host.getByTestId("platform-game-closing")
      await expect(curtain).toBeVisible({ timeout: 60_000 })
      await expect(curtain).toHaveCount(1)
      await expect(host.locator(".full-curtain")).toHaveCount(0)
      await host.getByTestId("host-pause-resume-btn").click()
      await host.waitForTimeout(200)
      const frozen = Number(await curtain.getAttribute("data-elapsed-ms"))
      await host.waitForTimeout(650)
      expect(
        Math.abs(
          Number(await curtain.getAttribute("data-elapsed-ms")) - frozen,
        ),
      ).toBeLessThan(150)
      await display.reload()
      const audienceCurtain = display.getByTestId("platform-game-closing")
      await expect(audienceCurtain).toBeVisible()
      expect(
        Math.abs(
          Number(await audienceCurtain.getAttribute("data-elapsed-ms")) -
            frozen,
        ),
      ).toBeLessThan(250)
      await expect(display.locator(".full-curtain")).toHaveCount(0)
      await host.screenshot({
        path: join(evidence, theme + "-paused-curtain.png"),
      })
      await host.getByTestId("host-pause-resume-btn").click()
      const finaleSurfaces = [
        ["host", host],
        ["display", display],
      ]
      const finaleContinuity = {}
      for (const [role, surface] of finaleSurfaces) {
        await expect(
          surface.getByTestId("platform-closing-boundary"),
        ).toHaveAttribute("data-closing-stage", "closing")
        finaleContinuity[role] = { before: await readFinalePlayback(surface) }
      }
      await expect(
        host.getByTestId("platform-closing-boundary"),
      ).toHaveAttribute("data-closing-stage", "closed", { timeout: 15_000 })
      for (const [role, surface] of finaleSurfaces) {
        await expect(
          surface.getByTestId("platform-closing-boundary"),
        ).toHaveAttribute("data-closing-stage", "closed")
        finaleContinuity[role].closed = await readFinalePlayback(surface)
      }
      // Let an authored finale's 9.2-second timeline finish as well: its onFinish
      // must retain the existing closed curtain rather than start a second one.
      await host.waitForTimeout(900)
      await expect(
        host.getByTestId("platform-closing-boundary"),
      ).toHaveAttribute("data-closing-stage", "closed")
      for (const [role, surface] of finaleSurfaces) {
        await expect(
          surface.getByTestId("platform-closing-boundary"),
        ).toHaveAttribute("data-closing-stage", "closed")
        await expect(surface.getByTestId("platform-game-closing")).toHaveCount(
          1,
        )
        finaleContinuity[role].after = await readFinalePlayback(surface)
      }
      writeFileSync(
        join(evidence, theme + "-finale-continuity.json"),
        JSON.stringify(finaleContinuity, null, 2) + "\n",
      )
      for (const state of Object.values(finaleContinuity)) {
        assertFinaleContinues(state.before, state.closed)
        assertFinaleContinues(state.closed, state.after)
      }
      await host.reload()
      await expect(
        host.getByTestId("platform-closing-boundary"),
      ).toHaveAttribute("data-closing-stage", "closed", { timeout: 30_000 })
      await expect(host.getByTestId("platform-game-opening")).toHaveCount(0)
      await expect(host.getByTestId("platform-game-closing")).toHaveCount(1)
      await host.screenshot({
        path: join(evidence, theme + "-closed-reconnect.png"),
      })
      writeFileSync(
        join(evidence, theme + "-accepted-audio.json"),
        JSON.stringify(accepted, null, 2) + "\n",
      )
      record(theme + "-one-final-curtain-pause-reconnect-and-no-second-close", {
        finaleContinuity,
      })
      await host.close()
      await display.close()
      await player.close()
    }

    for (const opening of ["custom", "mute"]) {
      const { host } = await fixture({ theme: "tadazz-classic", opening })
      await host.getByTestId("platform-opening-start").click()
      if (opening === "custom") {
        await assertSingleIntro(host, LOBBY)
        const state = (await mediaState(host)).active[0]
        expect(state.volume).toBeCloseTo(0.11, 2)
        assert.equal(state.loop, true)
        expect(state.time).toBeGreaterThanOrEqual(0.35)
        assert(
          !(await mediaState(host)).plays.some((item) => item.url === INTRO),
        )
      } else {
        await expect(
          host.getByTestId("audio-cue-player-state"),
        ).toHaveAttribute("data-audio-url", "")
        await host.waitForTimeout(600)
        assert.deepEqual(await activeUrls(host), [])
        assert.equal((await mediaState(host)).plays.length, 0)
      }
      await host.screenshot({
        path: join(evidence, "opening-" + opening + ".png"),
      })
      record("explicit-opening-" + opening + "-overrides-platform-default")
      await host.close()
    }

    assert.deepEqual(errors, [], "No platform page errors")
    assert.deepEqual(
      failedMedia,
      [],
      "All requested platform recordings served",
    )
    record("platform-runtime-no-page-errors-or-missing-audio")
    const output = { passed: true, results, created, failedMedia }
    writeFileSync(
      join(evidence, "report.json"),
      JSON.stringify(output, null, 2) + "\n",
    )
    return output
  } catch (error) {
    const diagnosticPages = []
    for (const [index, page] of pages.entries()) {
      if (page.isClosed()) continue
      const role = pageRoles.get(page) ?? "unknown"
      const media = await mediaState(page).catch((failure) => ({
        error: String(failure),
      }))
      const state = await page
        .evaluate(() => ({
          visibility: document.visibilityState,
          focused: document.hasFocus(),
          activation: navigator.userActivation
            ? {
                isActive: navigator.userActivation.isActive,
                hasBeenActive: navigator.userActivation.hasBeenActive,
              }
            : null,
          controls: [
            ...document.querySelectorAll(
              '[data-testid="audio-cue-player-state"], [data-testid="host-audio-controls"], [data-testid="host-toggle-audio-mute"], [data-testid="host-toggle-audio-pause"], [data-testid="host-enable-audio"], [data-testid="manager-control-toolbar"], [data-testid="platform-game-opening"], [data-testid="platform-closing-boundary"], [data-testid="tadazz-show"]',
            ),
          ].map((element) => ({
            attributes: Object.fromEntries(
              [...element.attributes]
                .filter((attribute) =>
                  /^(data-|aria-|disabled)/u.test(attribute.name),
                )
                .map((attribute) => [attribute.name, attribute.value]),
            ),
            text:
              element.getAttribute("data-testid") === "audio-cue-player-state"
                ? ""
                : element.textContent?.trim().slice(0, 800),
          })),
        }))
        .catch((failure) => ({ error: String(failure) }))
      const screenshot = "failure-page-" + index + ".png"
      await page
        .screenshot({ path: join(evidence, screenshot) })
        .catch(() => {})
      diagnosticPages.push({ role, url: page.url(), screenshot, media, state })
    }
    writeFileSync(
      join(evidence, "failure.json"),
      JSON.stringify(
        {
          passed: false,
          message: String(error),
          results,
          created,
          errors,
          failedMedia,
          mediaResponses,
          diagnosticPages,
          pages: pages
            .filter((page) => !page.isClosed())
            .map((page) => page.url()),
        },
        null,
        2,
      ) + "\n",
    )
    throw error
  } finally {
    for (const page of pages)
      if (!page.isClosed()) await page.close().catch(() => {})
    for (const owned of contexts) await owned.close().catch(() => {})
  }
}
