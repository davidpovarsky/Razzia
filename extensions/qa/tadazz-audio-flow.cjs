// Isolated QA only. Requires Playwright dependencies from packages/e2e.
// AUDIO_STRICT=1, AUDIO_MIXED_END=1: ten questions, five natural and five manual ends.
// AUDIO_FAULT_EPIC=1: abort the optional Epic asset and verify original-timer fallback.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict")
const {
  chromium,
  expect,
} = require("../../packages/e2e/node_modules/@playwright/test")
const base = process.env.AUDIO_QA_URL,
  secret = process.env.AUDIO_QA_PHONE_SECRET
assert(
  base && secret,
  "Set AUDIO_QA_URL and AUDIO_QA_PHONE_SECRET for an isolated QA server",
)
assert(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Only an isolated loopback QA server is allowed",
)
const out = path.resolve(process.env.AUDIO_EVIDENCE_DIR || "work/audio-flow")
fs.mkdirSync(out, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ channel: "msedge" })
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  p.setDefaultTimeout(35000)
  let gameId
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
            q: document.querySelector('[data-testid="host-question-counter"]')?.textContent,
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

    await p.evaluate(() => {
      window.__cues = []
      window.__sfx = []
      window.__started = []
      window.__ended = []
      window.__mediaErrors = []
      window.__samples = []
      const counter = () =>
        document.querySelector('[data-testid="host-question-counter"]')
          ?.textContent
      document.addEventListener(
        "tadazz:cue",
        (e) =>
          window.__cues.push({
            ...e.detail,
            q: counter(),
            at: Date.now(),
            phase: window.__state?.phase,
          }),
        true,
      )
      window.addEventListener(
        "tadazz:sfx",
        (e) => {
          window.__lastSfx = e.detail
          window.__sfx.push({ ...e.detail, q: counter(), at: Date.now() })
        },
        true,
      )
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () {
        const a = this,
          url = a.src,
          cue = window.__lastSfx,
          q = counter()
        a.__qaCue = { q, cue: cue?.name }
        if (!a.__qaEnded) {
          a.__qaEnded = true
          a.addEventListener("ended", () =>
            window.__ended.push({
              ...a.__qaCue,
              url: new URL(a.src, location.href).pathname,
              at: Date.now(),
              position: a.currentTime,
            }),
          )
        }
        return play
          .apply(a, arguments)
          .then(() => {
            window.__started.push({
              url: new URL(url, location.href).pathname,
              cue: cue?.name,
              q,
              at: Date.now(),
              volume: a.volume,
              position: a.currentTime,
              ended: a.ended,
              readyState: a.readyState,
            })
          })
          .catch((e) => {
            window.__mediaErrors.push({
              url: new URL(url, location.href).pathname,
              q,
              error: e.name,
              at: Date.now(),
            })
            throw e
          })
      }
      setInterval(() => {
        const e = document.querySelector(
          '[data-testid="audio-cue-player-state"]',
        )
        window.__samples.push({
          q: counter(),
          at: Date.now(),
          phase: window.__state?.phase,
          preset: window.__state?.extras.currentScene?.preset,
          scene: document
            .querySelector("[data-v4-scene]")
            ?.getAttribute("data-v4-scene"),
          selected: e?.dataset.audioUrl,
          playing: window.__refs
            .filter((a) => !a.paused && a.volume > 0.01 && a.currentTime > 0.02)
            .map((a) => ({
              url: new URL(a.src, location.href).pathname,
              volume: a.volume,
              time: a.currentTime,
              error: a.error?.code,
            })),
        })
      }, 100)
    })
    async function actual(url) {
      await p.waitForFunction(
        (u) =>
          window.__refs.some(
            (a) =>
              !a.paused &&
              a.volume > 0.02 &&
              a.currentTime > 0.1 &&
              a.src.endsWith(u),
          ),
        url,
        { timeout: 12000 },
      )
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
    async function story() {
      await expect(p.locator('[data-v4-scene="round-recap"]')).toBeVisible()
      await actual("/media/tadazz-fantasy-orchestral-20261106.mp3")
      await next()
      await p.getByTestId("tadazz-story-mixer").waitFor()
      await actual("/tadazz-show/story/672dd07f229b8c36.mp3")
      await next()
      await p.getByTestId("tadazz-story-reveal").waitFor()
      await actual("/tadazz-show/story/9db4acdc6c4e411c.mp3")
      await p.waitForTimeout(6000)
      await next()
    }
    await phone()
    await next()
    await expect(p.locator('[data-v4-scene="round-one"]')).toBeVisible()
    await next()
    const count = Number(process.env.AUDIO_QUESTIONS || 10),
      report = []
    if (process.env.AUDIO_FAULT_EPIC === "1")
      await p.evaluate(() => (window.__forceEpicFailure = true))
    for (let n = 1; n <= count; n++) {
      console.log("Question", n)
      await p.waitForFunction(
        (n) =>
          window.__state?.extras.activeTimelineStep?.kind === "question" &&
          window.__state.extras.activeTimelineStep.questionOrdinal === n,
        n,
      )
      const state = await waitOpen()
      const expected =
        [2, 4, 7, 9].includes(n) && process.env.AUDIO_FAULT_EPIC !== "1"
          ? "/tadazz-show/music/epic-main-menu.mp3"
          : "/media/tzila-determined-pursuit-20261105.mp3"
      let timerOK = true
      try {
        await actual(expected)
      } catch {
        timerOK = false
      }
      assert.equal(
        (
          await phone("answer", {
            answerIndex: n % 5,
            epoch: state.state.epoch,
          })
        ).accepted,
        true,
      )
      if (
        process.env.AUDIO_RAPID === "1" ||
        (process.env.AUDIO_MIXED_END === "1" && n % 2 === 0)
      )
        await p.getByTestId("host-end-timer-btn").click()
      await p.waitForFunction(
        () => window.__state?.extras.currentScene?.preset === "top-pick",
        null,
        { timeout: 40000 },
      )
      await expect(p.locator('[data-v4-scene="top-pick"]')).toBeVisible()
      await actual("/media/tadazz-determination-20261106.mp3")
      await p.waitForTimeout(2400)
      const evidence = await p.evaluate((n) => {
        const q = `${n} / 10`
        return {
          raw: window.__cues.filter(
            (e) =>
              e.q === q &&
              ["survey-reveal", "scene:top-pick", "top-pick-reveal"].includes(
                e.name,
              ),
          ),
          sfx: window.__sfx.filter(
            (e) =>
              e.q === q &&
              ["timer-ended", "survey-reveal", "top-pick-reveal"].includes(
                e.name,
              ),
          ),
          started: window.__started.filter(
            (e) => e.q === q && e.url.includes("/sounds/"),
          ),
          ended: window.__ended.filter((e) => e.q === q),
          timerSamples: window.__samples.filter(
            (s) =>
              s.q === q &&
              s.playing.some(
                (a) =>
                  a.url ===
                  ([2, 4, 7, 9].includes(n) && !window.__forceEpicFailure
                    ? "/tadazz-show/music/epic-main-menu.mp3"
                    : "/media/tzila-determined-pursuit-20261105.mp3"),
              ),
          ).length,
          resultsSamples: window.__samples.filter(
            (s) =>
              s.q === q &&
              s.playing.some((a) => a.url.endsWith("cutie-patootie.mp3")),
          ).length,
        }
      }, n)
      report.push({ question: n, timerOK, ...evidence })
      fs.writeFileSync(
        path.join(out, "progress.json"),
        JSON.stringify(report, null, 2),
      )
      console.log(
        JSON.stringify({
          question: n,
          timerOK,
          timerSamples: evidence.timerSamples,
          resultsSamples: evidence.resultsSamples,
          raw: evidence.raw.map((e) => e.name),
          sfx: evidence.sfx.map((e) => e.name),
        }),
      )
      if (process.env.AUDIO_STRICT === "1") {
        assert(
          timerOK && evidence.timerSamples > 0 && evidence.resultsSamples > 0,
          `Question ${n}: music missing`,
        )
        for (const name of [
          "timer-ended",
          "survey-reveal",
          "top-pick-reveal",
        ]) {
          const cues = evidence.sfx.filter((e) => e.name === name)
          assert.equal(
            cues.length,
            1,
            `Question ${n}: ${name} must dispatch exactly once`,
          )
          const file =
            name === "timer-ended"
              ? "tadazz-timer-end-368edc1d9522.mp3"
              : name === "survey-reveal"
                ? "tadazz-reveal-bright-20261108.mp3"
                : "tadazz-confirm-20261108.mp3"
          assert.equal(
            evidence.started.filter(
              (e) =>
                e.url.endsWith(file) &&
                e.at >= cues[0].at &&
                e.at - cues[0].at < 3000 &&
                e.volume > 0 &&
                e.readyState >= 2,
            ).length,
            1,
            `Question ${n}: ${name} must actually play exactly once`,
          )
          assert.equal(
            evidence.ended.filter((e) => e.url.endsWith(file) && e.cue === name)
              .length,
            1,
            `Question ${n}: ${name} must finish without interruption`,
          )
        }
      }
      if (n < count || n === 5 || n === 10) await next()
      if (n === 5 && count > 5) {
        await story()
        await expect(p.locator('[data-v4-scene="round-two"]')).toBeVisible()
        await next()
      }
      if (n === 10) {
        await story()
        await expect(p.locator('[data-v4-scene="grand-finale"]')).toBeVisible()
        await actual("/media/tadazz-epic-endgame-20261106.mp3")
      }
    }
    const all = await p.evaluate(() => ({
      cues: window.__cues,
      sfx: window.__sfx,
      started: window.__started,
      ended: window.__ended,
      errors: window.__mediaErrors,
      samples: window.__samples,
    }))
    fs.writeFileSync(path.join(out, "trace.json"), JSON.stringify(all))
    fs.writeFileSync(
      path.join(out, "verification.json"),
      JSON.stringify(
        {
          questions: count,
          strict: process.env.AUDIO_STRICT === "1",
          mixedEnd: process.env.AUDIO_MIXED_END === "1",
          rapidEnd: process.env.AUDIO_RAPID === "1",
          forcedEpicFailure: process.env.AUDIO_FAULT_EPIC === "1",
          report,
          errors,
        },
        null,
        2,
      ),
    )
    console.log("Completed full audio audit", count)
  } catch (e) {
    await p.screenshot({ path: path.join(out, "failure.png") }).catch(() => {})
    fs.writeFileSync(
      path.join(out, "failure-trace.json"),
      JSON.stringify(
        await p.evaluate(() => ({
          cues: window.__cues,
          sfx: window.__sfx,
          started: window.__started,
          errors: window.__mediaErrors,
          samples: window.__samples?.slice(-250),
        })),
      ),
    )
    throw e
  } finally {
    if (gameId) {
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
