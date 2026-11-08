// Isolated host/projector regression; never run against client rooms.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict")
const {
  chromium,
  expect,
} = require("../../packages/e2e/node_modules/@playwright/test")
const base = process.env.NAV_QA_URL,
  secret = process.env.NAV_QA_PHONE_SECRET
assert(base && secret, "Set isolated NAV_QA_URL and NAV_QA_PHONE_SECRET")
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Loopback QA only",
)
const out = path.resolve(
  process.env.NAV_EVIDENCE_DIR || "work/navigation-participation",
)
fs.mkdirSync(out, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ channel: "msedge" })
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  p.setDefaultTimeout(35000)
  let gameId, call2
  const call = { callId: "music-" + crypto.randomUUID(), phone: "+12025550180" }
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  try {
    await p.addInitScript(() => {
      window.__refs = []
      window.__plays = []
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () {
        if (!window.__refs.includes(this)) window.__refs.push(this)
        window.__plays.push({
          src: this.src,
          at: Date.now(),
          paused: this.paused,
        })
        return play.apply(this, arguments)
      }
    })
    await p.addInitScript(() =>
      window.addEventListener(
        "tadazz:sfx",
        (e) => {
          window.__lastSfx = e.detail
        },
        true,
      ),
    )
    if (process.env.AUDIO_FAULT_EPIC === "1")
      await p.route("**/epic-main-menu.mp3", (route) => route.abort("failed"))
    await p.goto(base + "/manager?lng=en")
    await p.getByPlaceholder("Password").fill("e2e-password")
    await p.getByRole("button", { name: "Submit", exact: true }).click()
    await p.waitForURL("**/manager/config")
    const token = await p.evaluate(() => localStorage.getItem("token"))
    const response = await p.request.get(
      base + "/api/extensions/quizzes/0KTcUgc0uvF_vGWYHrpTJ",
      { headers: { Authorization: "Bearer " + token } },
    )
    assert.equal(response.status(), 200)
    const config = (await response.json()).extras
    assert.equal(
      config.audio.soundtrack.results.url,
      "/tadazz-show/music/cutie-patootie.mp3",
    )
    assert.equal(
      config.audio.cues.answersMusic.url,
      "/media/tzila-determined-pursuit-20261105.mp3",
    )
    for (let n = 1; n <= 10; n++)
      assert.equal(
        config.perQuestion[config.questionIds[n - 1]]?.audioCues?.answersMusic
          ?.url,
        [2, 4, 7, 9].includes(n)
          ? "/tadazz-show/music/epic-main-menu.mp3"
          : undefined,
      )
    call.phone = config.roster.participants.find(
      (x) => x.phoneE164 && x.tableNumber >= 1 && x.tableNumber <= 31,
    ).phoneE164
    await p
      .getByRole("button", { name: "Creating Worlds", exact: true })
      .click()
    await p.getByRole("button", { name: "Start game", exact: true }).click()
    await p.getByTestId("tadazz-opening").waitFor()
    gameId = /manager\/([a-f0-9-]{36})/.exec(p.url())[1]
    while (await p.getByTestId("tadazz-opening").count()) {
      await p.getByTestId("tadazz-opening-skip").click()
      await p.waitForTimeout(100)
    }
    await p.evaluate(() => {
      window.__states = []
      window.__socket.on(
        "extensions:state",
        (s) => (
          (window.__state = s),
          window.__states.push({
            phase: s.phase,
            step: s.extras.activeTimelineStep?.kind,
            preset: s.extras.currentScene?.preset,
            sceneAudio: s.extras.sceneAudio,
            at: Date.now(),
          })
        ),
      )
    })
    async function phone(action = "join_or_poll", extra = {}) {
      const r = await p.request.post(base + "/api/games/pilot-phone", {
        headers: { "x-tada-pilot-secret": secret },
        data: { action, gameId, ...call, ...extra },
      })
      assert.equal(r.status(), 200)
      return r.json()
    }
    async function next() {
      const b = p.getByTestId("host-next-screen-btn")
      const start = p.getByRole("button", { name: "Start", exact: true })
      if (await b.isVisible()) {
        await expect(b).toBeEnabled()
        await b.click()
      } else if (await start.isVisible()) {
        await start.click()
      } else {
        await p.evaluate(() => document.activeElement?.blur())
        await p.keyboard.press("ArrowRight")
        await p.waitForTimeout(65)
        await p.keyboard.press("ArrowRight")
      }
      await p.waitForTimeout(250)
    }
    async function waitOpen() {
      for (let i = 0; i < 200; i++) {
        const s = await phone()
        if (s.state.acceptingAnswers) return s
        await p.waitForTimeout(80)
      }
      throw Error("Voting never opened")
    }

    let display
    call2 = {
      callId: "nav-second-" + crypto.randomUUID(),
      phone: config.roster.participants.find(
        (x) =>
          x.phoneE164 &&
          x.phoneE164 !== call.phone &&
          x.tableNumber >= 1 &&
          x.tableNumber <= 31,
      ).phoneE164,
    }
    async function command(action, payload = {}) {
      return p.evaluate(
        ({ action, payload }) =>
          new Promise((resolve) =>
            window.__socket.emit(
              "extensions:command",
              {
                v: 1,
                gameId: window.__state.gameId,
                requestId: crypto.randomUUID(),
                action,
                payload: { ...payload, epoch: window.__state.epoch },
              },
              resolve,
            ),
          ),
        { action, payload },
      )
    }
    async function second(action = "join_or_poll", extra = {}) {
      const r = await p.request.post(base + "/api/games/pilot-phone", {
        headers: { "x-tada-pilot-secret": secret },
        data: { action, gameId, ...call2, ...extra },
      })
      assert.equal(r.status(), 200)
      return r.json()
    }
    async function count(connected, answered) {
      for (const page of [p, display]) {
        await expect(page.getByTestId("tadazz-live-connected")).toHaveAttribute(
          "data-count",
          String(connected),
        )
        await expect(
          page.getByTestId("tadazz-live-participation"),
        ).toBeVisible()
        if (answered !== undefined)
          await expect(
            page.getByTestId("tadazz-live-answered"),
          ).toHaveAttribute("data-count", String(answered))
      }
    }
    async function clock() {
      for (const page of [p, display]) {
        await expect(page.locator('[data-v4-scene="countdown"]')).toBeVisible()
        await expect(page.locator(".countdown-floater")).toBeVisible()
        const sweep = await page
          .locator(".timer-progress")
          .evaluate((e) =>
            e.getAnimations().some((a) => a.playState === "running"),
          )
        assert(sweep, "circular timer must animate")
      }
    }
    async function music(page, url) {
      await page.waitForFunction(
        (u) =>
          window.__refs.some(
            (a) =>
              !a.paused &&
              a.volume > 0.02 &&
              a.currentTime > 0.1 &&
              a.src.endsWith(u),
          ),
        url,
        { timeout: 15000 },
      )
    }
    await phone()
    await second()
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    })
    display = await ctx.newPage()
    display.on("pageerror", (e) => errors.push(e.message))
    await display.addInitScript(() => {
      window.__refs = []
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () {
        if (!window.__refs.includes(this)) window.__refs.push(this)
        return play.apply(this, arguments)
      }
    })
    await display.goto(base + "/display/" + gameId + "?lng=en")
    await display.getByTestId("tadazz-opening").waitFor()
    if (await display.getByTestId("tadazz-opening-skip").isVisible())
      await display.getByTestId("tadazz-opening-skip").click()
    else
      await display
        .getByTestId("tadazz-opening")
        .waitFor({ state: "detached", timeout: 45000 })
    await count(2)
    await p.screenshot({ path: path.join(out, "host-lobby.png") })
    await display.screenshot({ path: path.join(out, "projector-lobby.png") })
    await next()
    await expect(p.locator('[data-v4-scene="round-one"]')).toBeVisible()
    await next()
    await waitOpen()
    await clock()
    await count(2, 0)
    assert(
      (
        await phone("answer", {
          answerIndex: 1,
          epoch: (await phone()).state.epoch,
        })
      ).accepted,
    )
    await count(2, 1)
    assert(
      !(
        await phone("answer", {
          answerIndex: 1,
          epoch: (await phone()).state.epoch,
        })
      ).accepted,
    )
    await count(2, 1)
    await second("hangup")
    await count(1, 1)
    await second()
    await count(2, 1)
    assert(
      (
        await second("answer", {
          answerIndex: 1,
          epoch: (await phone()).state.epoch,
        })
      ).accepted,
    )
    await count(2, 2)
    await p.screenshot({ path: path.join(out, "host-voting.png") })
    await display.screenshot({ path: path.join(out, "projector-voting.png") })
    await command("END_ANSWER_TIMER")
    await expect(p.locator('[data-v4-scene="survey-results"]')).toBeVisible()
    await command("PREVIOUS_SCREEN", { confirmed: true })
    await waitOpen()
    await clock()
    await count(2, 0)
    for (let i = 0; i < 3; i++) {
      await command("PREVIOUS_SCREEN", { confirmed: true })
      await p.waitForFunction(
        () => window.__state?.extras.currentScene?.preset === "round-one",
      )
      await command("NEXT_SCREEN")
      await waitOpen()
      await clock()
      await count(2, 0)
      console.log("Previous/Next circular timer pass", i + 1)
    }
    const report = []
    for (let n = 1; n <= 6; n++) {
      await p.waitForFunction(
        (n) => window.__state?.extras.activeTimelineStep?.questionOrdinal === n,
        n,
      )
      const state = await waitOpen()
      await clock()
      await count(2, 0)
      assert(
        (await phone("answer", { answerIndex: 1, epoch: state.state.epoch }))
          .accepted,
      )
      await count(2, 1)
      await command("END_ANSWER_TIMER")
      await p.waitForFunction(
        () => window.__state?.extras.currentScene?.preset === "top-pick",
      )
      await expect(p.locator('[data-v4-scene="top-pick"]')).toBeVisible()
      await count(2)
      if (n < 6) await next()
      report.push({
        question: n,
        circularClockBoth: true,
        connected: 2,
        answered: 1,
      })
      if (n === 5) {
        await expect(p.locator('[data-v4-scene="round-recap"]')).toBeVisible()
        for (const page of [p, display]) {
          await count(2)
          await music(page, "/media/tadazz-fantasy-orchestral-20261106.mp3")
        }
        await next()
        await p.getByTestId("tadazz-story-mixer").waitFor()
        for (const page of [p, display])
          await music(page, "/tadazz-show/story/672dd07f229b8c36.mp3")
        await next()
        await p.getByTestId("tadazz-story-reveal").waitFor()
        for (const page of [p, display])
          await music(page, "/media/tadazz-fantasy-orchestral-20261106.mp3")
        await p.waitForTimeout(6500)
        for (const page of [p, display])
          await music(page, "/media/tadazz-fantasy-orchestral-20261106.mp3")
        await display.screenshot({
          path: path.join(out, "projector-story-reading.png"),
        })
        await next()
        await expect(p.locator('[data-v4-scene="round-two"]')).toBeVisible()
        await count(2)
        await next()
      }
    }
    // Replay the reported second-round question, then restore it by Previous/Next.
    await command("PREVIOUS_SCREEN", { confirmed: true })
    await waitOpen()
    await clock()
    await count(2, 0)
    await command("PREVIOUS_SCREEN", { confirmed: true })
    await p.waitForFunction(() => window.__state?.phase === "scene")
    await command("NEXT_SCREEN")
    await waitOpen()
    await clock()
    await count(2, 0)
    await display.screenshot({
      path: path.join(out, "projector-q6-restored.png"),
    })
    await p.screenshot({ path: path.join(out, "host-q6-restored.png") })
    for (const lng of ["en", "fr", "de", "es", "it", "ja", "tr", "vi"]) {
      await display.goto(base + "/display/" + gameId + "?lng=" + lng)
      await expect(
        display.getByTestId("tadazz-live-connected"),
      ).toHaveAttribute("data-count", "2")
      const text = await display
        .getByTestId("tadazz-live-participation")
        .innerText()
      assert(!text.includes("participation."))
    }
    await p.setViewportSize({ width: 1000, height: 700 })
    await p.screenshot({ path: path.join(out, "host-narrow.png") })
    const bounds = await p
      .getByTestId("tadazz-live-participation")
      .boundingBox()
    assert(
      bounds.x >= 0 &&
        bounds.x + bounds.width <= 1000 &&
        bounds.y + bounds.height <= 700,
    )
    assert.deepEqual(errors, [])
    fs.writeFileSync(
      path.join(out, "verification.json"),
      JSON.stringify(
        {
          passed: true,
          report,
          previousNextCycles: 4,
          publicCountsBothScreens: true,
          duplicateVoteStable: true,
          disconnectReconnect: true,
          storyReadingRecapMusicBeyondIdent: true,
          mixerUnchanged: true,
          locales: 8,
          narrowViewport: true,
          pageErrors: errors,
        },
        null,
        2,
      ),
    )
    console.log(
      "Navigation, both public counters, story music and localization passed",
    )
    await second("hangup")
    await ctx.close()
  } catch (e) {
    await p.screenshot({ path: path.join(out, "failure.png") }).catch(() => {})
    throw e
  } finally {
    if (gameId) {
      if (call2)
        await p.request
          .post(base + "/api/games/pilot-phone", {
            headers: { "x-tada-pilot-secret": secret },
            data: { action: "hangup", gameId, ...call2 },
          })
          .catch(() => {})
      await p.request
        .post(base + "/api/games/pilot-phone", {
          headers: { "x-tada-pilot-secret": secret },
          data: { action: "hangup", gameId, ...call },
        })
        .catch(() => {})
      await p
        .evaluate(
          (id) => window.__socket?.emit("manager:leave", { gameId: id }),
          gameId,
        )
        .catch(() => {})
    }
    await browser.close()
  }
})().catch((e) => {
  console.error(e.stack)
  process.exitCode = 1
})
