/** Built-candidate acceptance. Creates only disposable quizzes and rooms on the isolated Linux host. */
import assert from "node:assert/strict"
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
const CONFIRM = "/sounds/tadazz-confirm-20261108.mp3"

function recordMedia() {
  const trace = { elements: [], plays: [], events: [] }
  window.__platformAudioTrace = trace
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function () {
    if (this instanceof HTMLAudioElement) {
      if (!trace.elements.includes(this)) trace.elements.push(this)
      trace.plays.push({
        url: new URL(this.currentSrc || this.src, location.href).pathname,
        at: performance.now(),
        volume: this.volume,
        loop: this.loop,
      })
    }
    return play.call(this)
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
    return {
      active: (trace?.elements ?? [])
        .filter(
          (element) => !element.paused && !element.ended && element.volume > 0,
        )
        .map((element) => ({
          url: new URL(element.currentSrc || element.src, location.href)
            .pathname,
          time: element.currentTime,
          volume: element.volume,
          loop: element.loop,
          ready: element.readyState,
        })),
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
  const pages = []
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
    await page.addInitScript(recordMedia)
    await page.emulateMedia({ reducedMotion: "no-preference" })
    page.on("pageerror", (error) => errors.push(role + ": " + error.message))
    page.on("response", (response) => {
      const path = new URL(response.url()).pathname
      if (
        response.status() >= 400 &&
        /^\/(?:sounds|tadazz-show\/music)\//u.test(path)
      ) {
        failedMedia.push({ role, path, status: response.status() })
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
      await expect(
        host.getByTestId("platform-closing-boundary"),
      ).toHaveAttribute("data-closing-stage", "closed", { timeout: 15_000 })
      // Let an authored finale's 9.2-second timeline finish as well: its onFinish
      // must retain the existing closed curtain rather than start a second one.
      await host.waitForTimeout(900)
      await expect(
        host.getByTestId("platform-closing-boundary"),
      ).toHaveAttribute("data-closing-stage", "closed")
      await expect.poll(() => activeUrls(host)).toEqual([])
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
      record(theme + "-one-final-curtain-pause-reconnect-and-no-second-close")
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
