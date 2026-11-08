/* oxlint-disable no-await-in-loop -- Browser actions and assertions intentionally follow the authoritative game sequentially. */
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  quizExtrasV2Schema,
} from "../../../extensions/src/core"
import { join } from "node:path"

async function seed(
  request: APIRequestContext,
  page: Page,
  options: { legacy?: boolean; detailed?: boolean; unknown?: boolean } = {},
) {
  const { legacy = false, detailed = false } = options
  const login = await request.post("/api/auth/manager", {
    data: { password: "e2e-password" },
  })
  expect(login.ok()).toBe(true)
  const { token } = (await login.json()) as { token: string }
  const questionId = crypto.randomUUID()
  const quizz = {
    subject: `Isolated cleanup ${crypto.randomUUID()}`,
    gameMode: "quiz",
    questions: [
      {
        type: "single",
        question: "Which city is in France?",
        answers: ["Paris", "London"],
        solutions: [0],
        time: 30,
        cooldown: 3,
      },
    ],
  }
  const extras = createDefaultQuizExtrasV2(
    "draft",
    [questionId],
    computeCanonicalBaseDigest(quizz),
  )

  if (detailed) {
    extras.scenes = {}
    quizz.questions = [2, 3, 4, 5].map((count, i) => ({
      type: "single",
      question: `Theme question ${i + 1}`,
      answers: Array.from({ length: count }, (_, j) => `Choice ${j + 1}`),
      solutions: [0],
      time: 400,
      cooldown: 3,
    }))
    extras.questionIds = quizz.questions.map(() => crypto.randomUUID())
    extras.timeline = extras.questionIds.map((stableQuestionId) => ({
      id: crypto.randomUUID(),
      kind: "question",
      questionId: stableQuestionId,
    }))
    extras.perQuestion = Object.fromEntries(
      extras.questionIds.map((id, i) => [
        id,
        {
          answerVisuals: quizz.questions[i].answers.map((_, answerIndex) => ({
            answerIndex,
            url: "/media/theme-answer.png",
            display: "both",
            alt: `Choice ${answerIndex + 1}`,
          })),
        },
      ]),
    )
    extras.baseDigest = computeCanonicalBaseDigest(quizz)
  }

  if (legacy) {
    extras.defaults.motionKit = "legacy"
    delete extras.defaults.showTheme
  }

  const sceneId = crypto.randomUUID()
  extras.scenes[sceneId] = {
    id: sceneId,
    kind: "transition",
    title: "Isolated scene",
    durationMs: 5000,
    advance: "manual",
  }

  if (!detailed) {
    extras.timeline.unshift({
      id: crypto.randomUUID(),
      kind: "transition",
      sceneId,
    })
  }

  if (options.unknown) {
    extras.defaults.showTheme = {
      id: "uninstalled-client",
      version: "9.0.0",
      overrides: {},
    }
  }

  const headers = { Authorization: `Bearer ${token}` }
  const saved = await request.post("/api/extensions/quizzes", {
    headers,
    data: { quizz, extras },
  })
  expect(saved.ok(), await saved.text()).toBe(true)
  const { quizId } = (await saved.json()) as { quizId: string }
  const created = await request.post("/api/games", {
    headers,
    data: { quizzId: quizId },
  })
  expect(created.ok(), await created.text()).toBe(true)
  const game = (await created.json()) as { gameId: string; inviteCode: string }
  await page.addInitScript(
    (tokenValue) => localStorage.setItem("token", tokenValue),
    token,
  )
  await page.goto(`/party/manager/${game.gameId}`)

  return { ...game, quizId, token, extras, quizz }
}

test("Classic host, player and display keep the current lobby and authoritative pause/roster", async ({
  page,
  browser,
  request,
}, testInfo) => {
  const game = await seed(request, page)
  const skip = page.getByTestId("tadazz-opening-skip")

  if (await skip.isVisible().catch(() => false)) {
    await skip.click()
  }

  await expect(page.getByTestId("tadazz-show")).toBeVisible()
  await expect(page.getByTestId("tadazz-lobby-pin")).toHaveText(game.inviteCode)
  const playerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const player = await playerContext.newPage()
  await player.goto(`http://127.0.0.1:3170/?pin=${game.inviteCode}`)
  await player.getByPlaceholder("Username here").fill("Cleanup Alice")
  await player.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(page.getByTestId("host-connected-counter")).toHaveText("1 / 1")
  const displayContext = await browser.newContext({
    viewport: { width: 800, height: 600 },
  })
  const display = await displayContext.newPage()
  await display.goto(`http://127.0.0.1:3170/display/${game.gameId}`)
  await expect(display.getByTestId("tadazz-lobby-pin")).toHaveText(
    game.inviteCode,
  )
  await expect(display.getByTestId("manager-control-toolbar")).toHaveCount(0)
  await expect(display.locator('img[alt="background"], iframe')).toHaveCount(0)
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await expect(page.getByTestId("host-pause-resume-btn")).toBeVisible()
  await page.getByTestId("host-pause-resume-btn").click()
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-game-paused",
    "true",
  )
  await page.getByTestId("host-pause-resume-btn").click()
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-game-paused",
    "false",
  )
  await page.screenshot({ path: join(testInfo.outputDir, "classic-host.png") })
  await display.screenshot({
    path: join(testInfo.outputDir, "classic-display.png"),
  })
  await playerContext.close()
  await displayContext.close()
})

test("explicit rollback uses extracted scene presenter and original Studio controls", async ({
  page,
  request,
  browser,
}, testInfo) => {
  const game = await seed(request, page, { legacy: true })
  await expect(page.getByTestId("manager-control-toolbar")).toBeVisible()
  const participantContext = await browser.newContext()
  const participant = await participantContext.newPage()
  await participant.goto(`http://127.0.0.1:3170/?pin=${game.inviteCode}`)
  await participant.getByPlaceholder("Username here").fill("Rollback Alice")
  await participant.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(
    page.getByText("Rollback Alice", { exact: true }).first(),
  ).toBeVisible()
  await page.evaluate(
    (id) =>
      (
        window as unknown as {
          __socket: { emit(event: string, data: unknown): void }
        }
      ).__socket.emit("manager:startGame", { gameId: id }),
    game.gameId,
  )
  await expect(page.getByTestId("studio-scene-presenter")).toBeVisible()
  await expect(page.getByText("Isolated scene", { exact: true })).toBeVisible()
  await page.screenshot({
    path: join(testInfo.outputDir, "rollback-scene.png"),
  })
  await page.goto(`/manager/quizz/${game.quizId}`)
  await expect(page.getByTestId("studio-card-type-bar")).toBeVisible()
  await expect(
    page.getByText("Isolated scene", { exact: true }).first(),
  ).toBeVisible()
  await page.getByTestId("editor-save-btn").click()
  await expect(page).toHaveURL(/\/manager\/config$/u)
  await participantContext.close()
})

async function installProbes(page: Page) {
  await page.addInitScript(() => {
    const state = {
      plays: [] as Array<{ url: string; time: number }>,
      resets: [] as string[],
      cues: [] as Array<{ name: string; identity: string }>,
      frames: 0,
      legacy: 0,
      wrongBackground: 0,
    }
    Object.assign(window, { __themeProbe: state })
    // oxlint-disable-next-line typescript/unbound-method -- Invoke with the actual element as this below.
    const { play } = HTMLMediaElement.prototype
    HTMLMediaElement.prototype.play = function tracePlay(
      this: HTMLMediaElement,
    ) {
      state.plays.push({ url: this.src, time: this.currentTime })

      return play.call(this)
    }
    const time = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "currentTime",
    )
    // oxlint-disable-next-line typescript/unbound-method -- Rebound with call to the inspected media element below.
    const setTime = time?.set as
      ((this: HTMLMediaElement, value: number) => void) | undefined

    if (!setTime) {
      throw new Error("Media time setter unavailable")
    }

    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
      ...time,
      set(this: HTMLMediaElement, value: number) {
        if (value === 0) {
          state.resets.push(this.src)
        }

        setTime.call(this, value)
      },
    })
    window.addEventListener("tadazz:sfx", (event) => {
      const { detail } = event as CustomEvent<{
        name: string
        identity: string
      }>
      state.cues.push({ name: detail.name, identity: detail.identity })
    })
    const sample = () => {
      state.frames += 1

      if (document.querySelector('img[alt="background"], iframe')) {
        state.legacy += 1
      }

      if (
        (location.pathname.startsWith("/party") ||
          location.pathname.startsWith("/display")) &&
        getComputedStyle(document.documentElement).backgroundColor !==
          "rgb(8, 1, 26)"
      ) {
        state.wrongBackground += 1
      }

      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
}
function probe(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __themeProbe: {
            plays: Array<{ url: string; time: number }>
            resets: string[]
            cues: Array<{ name: string; identity: string }>
            frames: number
            legacy: number
            wrongBackground: number
          }
        }
      ).__themeProbe,
  )
}
async function skipOpening(page: Page) {
  await expect(page.getByTestId("tadazz-show")).toBeVisible()
  const skip = page.getByTestId("tadazz-opening-skip")

  if (await skip.isVisible()) {
    await skip.click()
  }
}

test("unknown versions preserve stored identity and warn only the manager", async ({
  page,
  browser,
  request,
}) => {
  const game = await seed(request, page, { unknown: true })
  await skipOpening(page)
  await expect(page.getByTestId("show-theme-warning")).toBeVisible()
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-theme-fallback",
    "true",
  )
  const context = await browser.newContext()
  const display = await context.newPage()
  await display.goto(`http://127.0.0.1:3170/display/${game.gameId}`)
  await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
    "data-show-theme",
    "tadazz-classic",
  )
  await expect(display.getByTestId("show-theme-warning")).toHaveCount(0)
  const saved = await request.get(`/api/extensions/quizzes/${game.quizId}`, {
    headers: { Authorization: `Bearer ${game.token}` },
  })
  const stored = (await saved.json()) as { extras: unknown }
  expect(quizExtrasV2Schema.parse(stored.extras).defaults.showTheme?.id).toBe(
    "uninstalled-client",
  )
  await context.close()
})

test("blocked audio waits for a user gesture without retrying on ticks", async ({
  page,
  request,
  browser,
}, testInfo) => {
  await installProbes(page)
  await page.addInitScript(() => {
    Object.assign(window, {
      __permitThemeAudio: false,
      __blockedThemeAttempts: 0,
    })
    // oxlint-disable-next-line typescript/unbound-method -- Invoke with the actual element as this below.
    const { play } = HTMLMediaElement.prototype
    HTMLMediaElement.prototype.play = function gestureGatedPlay(
      this: HTMLMediaElement,
    ) {
      const state = window as unknown as {
        __permitThemeAudio: boolean
        __blockedThemeAttempts: number
      }

      if (!state.__permitThemeAudio) {
        state.__blockedThemeAttempts += 1

        return Promise.reject(
          new DOMException("Test gesture required", "NotAllowedError"),
        )
      }

      return play.call(this)
    }
  })
  const game = await seed(request, page, { detailed: true })
  await skipOpening(page)
  const context = await browser.newContext()
  const player = await context.newPage()
  await player.goto(`http://127.0.0.1:3170/?pin=${game.inviteCode}`)
  await player.getByPlaceholder("Username here").fill("Gesture Alice")
  await player.getByRole("button", { name: "Submit", exact: true }).click()
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-voting-open",
    "true",
    { timeout: 30_000 },
  )
  await expect(page.getByTestId("host-enable-audio")).toBeVisible()
  const attempts = () =>
    page.evaluate(
      () =>
        (window as unknown as { __blockedThemeAttempts: number })
          .__blockedThemeAttempts,
    )
  await page.waitForTimeout(200)
  const before = await attempts()
  await page.waitForTimeout(1200)
  expect(await attempts()).toBe(before)
  await page.evaluate(() => {
    Object.assign(window, { __permitThemeAudio: true })
  })
  await page.getByTestId("host-enable-audio").click()
  await expect(page.getByTestId("audio-cue-player-state")).toHaveAttribute(
    "data-audio-blocked",
    "false",
  )
  expect(
    (await probe(page)).plays.filter((item) =>
      item.url.endsWith("/sounds/answersMusic.mp3"),
    ),
  ).toHaveLength(1)
  await testInfo.attach("autoplay-recovery.json", {
    body: JSON.stringify({
      blockedAttemptsBeforeGesture: before,
      probe: await probe(page),
    }),
    contentType: "application/json",
  })
  await context.close()
})

test("Studio shows only registered Classic choices, previews locally, and persists explicit mute", async ({
  page,
  request,
}, testInfo) => {
  await installProbes(page)
  const game = await seed(request, page, { detailed: true })
  await page.goto(`/manager/quizz/${game.quizId}`)
  await page.getByTestId("studio-tab-settings").click()
  const settings = page.getByTestId("show-theme-settings")
  await expect(settings.getByTestId("show-theme-tadazz-classic")).toBeVisible()
  await expect(settings.locator('[data-testid^="show-theme-"]')).toHaveCount(1)
  await page.screenshot({
    path: join(testInfo.outputDir, "studio-theme-family-picker.png"),
  })
  await settings.getByRole("button", { name: "Preview", exact: true }).click()
  await expect(
    page.getByTestId("show-theme-preview").getByTestId("tadazz-stage"),
  ).toBeVisible()
  await page
    .getByTestId("show-theme-preview")
    .getByRole("button", { name: "Results", exact: true })
    .click()
  await expect(
    page.getByTestId("show-theme-preview").getByTestId("tadazz-stage"),
  ).toHaveAttribute("data-v4-scene", "survey-results")
  expect((await probe(page)).plays).toEqual([])
  await settings.locator("summary").filter({ hasText: "Audio" }).click()
  const audio = settings.getByTestId("theme-audio-answersMusic")
  await audio.getByRole("combobox").click()
  await page.getByRole("option", { name: "Silent", exact: true }).click()
  await expect(
    audio.getByRole("button", { name: "Preview", exact: true }),
  ).toBeDisabled()
  await page.screenshot({
    path: join(testInfo.outputDir, "studio-theme-settings.png"),
  })
  await page.getByTestId("editor-save-btn").click()
  await expect(page).toHaveURL(/\/manager\/config$/u)
  const saved = await request.get(`/api/extensions/quizzes/${game.quizId}`, {
    headers: { Authorization: `Bearer ${game.token}` },
  })
  const data = (await saved.json()) as { extras: unknown }
  expect(
    quizExtrasV2Schema.parse(data.extras).defaults.showTheme?.overrides.audio
      ?.answersMusic?.variantId,
  ).toBe("tadazz-classic.audio.answersMusic.silent")
  await page.goto(`/manager/quizz/${game.quizId}`)
  await page.getByTestId("studio-tab-settings").click()
  await page
    .getByTestId("show-theme-settings")
    .locator("summary")
    .filter({ hasText: "Audio" })
    .click()
  await expect(
    page.getByTestId("theme-audio-answersMusic").getByRole("combobox"),
  ).toHaveText("Silent")
})

test("live theme shares all roles, fits five viewports, and restarts voting music only for a new question", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.setTimeout(150_000)
  await installProbes(page)
  const game = await seed(request, page, { detailed: true })
  await skipOpening(page)
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const player = await context.newPage()
  await installProbes(player)
  await player.goto(`http://127.0.0.1:3170/?pin=${game.inviteCode}`)
  await player.getByPlaceholder("Username here").fill("Theme Alice")
  await player.getByRole("button", { name: "Submit", exact: true }).click()
  const displayContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  })
  const display = await displayContext.newPage()
  await installProbes(display)
  await display.goto(`http://127.0.0.1:3170/display/${game.gameId}`)
  for (const surface of [page, player, display]) {
    await expect(surface.getByTestId("tadazz-show")).toHaveAttribute(
      "data-show-theme",
      "tadazz-classic",
    )
  }
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-voting-open",
    "true",
    { timeout: 30_000 },
  )
  await expect(
    page.locator('.choice-slot[data-testid^="tadazz-card-"]'),
  ).toHaveCount(2)
  await expect(page.getByTestId("audio-cue-player-state")).toHaveAttribute(
    "data-audio-url",
    /answersMusic\.mp3/u,
  )
  const enable = page.getByTestId("host-enable-audio")

  if (await enable.isVisible()) {
    await enable.click()
  }

  const musicBefore = (await probe(page)).plays.filter(
    (item) => item.url.endsWith("/sounds/answersMusic.mp3") && item.time < 0.2,
  ).length
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [800, 600],
    [390, 844],
    [320, 568],
  ]) {
    await page.setViewportSize({ width, height })
    const dimensions = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
    }))
    expect(dimensions.scrollW).toBeLessThanOrEqual(dimensions.width)
    expect(dimensions.scrollH).toBeLessThanOrEqual(dimensions.height)
    const photo = page.getByTestId("tadazz-card-0").locator(".tz-photo-frame")
    const shape = await photo.evaluate((element) => {
      const style = getComputedStyle(element)

      return {
        width: parseFloat(style.width),
        height: parseFloat(style.height),
      }
    })
    expect(Math.abs(shape.width - shape.height)).toBeLessThan(1)
    await page.screenshot({
      path: join(testInfo.outputDir, `question-2-cards-${width}.png`),
    })
  }
  await page.setViewportSize({ width: 1366, height: 768 })
  await expect(player.getByTestId("tadazz-pad-option-0")).toBeEnabled()
  await player.getByTestId("tadazz-pad-option-0").click()
  await expect
    .poll(
      async () =>
        (await probe(player)).cues.filter(
          (cue) => cue.name === "answer-submitted",
        ).length,
    )
    .toBe(1)
  await page.waitForTimeout(1200)
  expect(
    (await probe(page)).plays.filter(
      (item) =>
        item.url.endsWith("/sounds/answersMusic.mp3") && item.time < 0.2,
    ),
  ).toHaveLength(musicBefore)
  expect(
    (await probe(player)).cues.filter((cue) => cue.name === "answer-submitted"),
  ).toHaveLength(1)
  await page.getByTestId("host-end-timer-btn").click()
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-show-scene",
    "results",
  )
  expect(
    (await probe(page)).cues.filter((cue) => cue.name === "timer-ended"),
  ).toHaveLength(0)
  expect(
    (await probe(page)).cues.filter((cue) => cue.name === "vote-locked"),
  ).toHaveLength(1)
  expect((await probe(page)).plays.filter(item => item.url.includes("tadazz-timer-end-"))).toHaveLength(0)
  for (let i = 0; i < 3; i += 1) {
    if (
      (await page
        .getByTestId("tadazz-show")
        .getAttribute("data-show-scene")) === "voting"
    ) {
      break
    }

    await page.getByTestId("host-next-screen-btn").click()
    await page.waitForTimeout(700)
  }
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-voting-open",
    "true",
    { timeout: 30_000 },
  )
  await expect(
    page.locator('.choice-slot[data-testid^="tadazz-card-"]'),
  ).toHaveCount(3)
  const musicAfter = (await probe(page)).plays.filter(
    (item) => item.url.endsWith("/sounds/answersMusic.mp3") && item.time < 0.2,
  ).length
  await testInfo.attach("audio-question-transitions.json", {
    body: JSON.stringify(await probe(page), null, 2),
    contentType: "application/json",
  })
  expect(musicAfter).toBe(musicBefore + 1)
  await display.reload()
  await expect(display.getByTestId("tadazz-show")).toHaveAttribute(
    "data-show-theme",
    "tadazz-classic",
  )
  await expect(
    display.locator('.choice-slot[data-testid^="tadazz-card-"]'),
  ).toHaveCount(3)
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-show-scene",
    "results",
    { timeout: 30_000 },
  )
  expect(
    (await probe(page)).cues.filter((cue) => cue.name === "timer-ended"),
  ).toHaveLength(1)
  expect((await probe(page)).plays.filter(item => item.url.includes("tadazz-timer-end-"))).toHaveLength(1)
  for (const surface of [page, player, display]) {
    const evidence = await probe(surface)
    expect(evidence.frames).toBeGreaterThan(0)
    expect(evidence.legacy).toBe(0)
    expect(evidence.wrongBackground).toBe(0)
  }
  await page.screenshot({
    path: join(testInfo.outputDir, "question-3-cards-zero-results.png"),
  })
  for (let index = 0; index < 3; index += 1) {
    if (
      (await page
        .getByTestId("tadazz-show")
        .getAttribute("data-show-scene")) === "voting"
    ) {
      break
    }

    await page.getByTestId("host-next-screen-btn").click()
    await page.waitForTimeout(700)
  }
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-voting-open",
    "true",
    { timeout: 30_000 },
  )
  await expect(
    page.locator('.choice-slot[data-testid^="tadazz-card-"]'),
  ).toHaveCount(4)
  const identityBeforePause = await page
    .getByTestId("audio-cue-player-state")
    .getAttribute("data-audio-identity")
  await page.getByTestId("host-pause-resume-btn").click()
  await expect(page.getByTestId("audio-cue-player-state")).toHaveAttribute(
    "data-audio-paused",
    "true",
  )
  await page.getByTestId("host-pause-resume-btn").click()
  await expect(page.getByTestId("audio-cue-player-state")).toHaveAttribute(
    "data-audio-paused",
    "false",
  )
  expect(
    await page
      .getByTestId("audio-cue-player-state")
      .getAttribute("data-audio-identity"),
  ).toBe(identityBeforePause)
  await page.getByTestId("host-restart-question-btn").click()
  await page.getByTestId("confirm-restart-question-btn").click()
  await expect(page.getByTestId("audio-cue-player-state")).not.toHaveAttribute(
    "data-audio-identity",
    identityBeforePause ?? "missing-identity",
  )
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-voting-open",
    "true",
    { timeout: 30_000 },
  )
  await expect(
    page.locator('.choice-slot[data-testid^="tadazz-card-"]'),
  ).toHaveCount(4)
  await page.getByTestId("host-skip-question-btn").click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Skip Question", exact: true })
    .click()
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-voting-open",
    "true",
    { timeout: 30_000 },
  )
  await expect(
    page.locator('.choice-slot[data-testid^="tadazz-card-"]'),
  ).toHaveCount(5)
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [800, 600],
    [390, 844],
    [320, 568],
  ]) {
    await display.setViewportSize({ width, height })
    await expect(
      display.locator('.choice-slot[data-testid^="tadazz-card-"]'),
    ).toHaveCount(5)
    await expect(display.getByTestId("tadazz-question-panel")).toContainText(
      "Theme question 4",
    )
    await expect
      .poll(() =>
        display.getByTestId("tadazz-card-4").evaluate((element) => {
          let opacity = 1
          for (
            let node: Element | null = element;
            node;
            node = node.parentElement
          )
            {opacity *= Number(getComputedStyle(node).opacity)}

          return opacity
        }),
      )
      .toBeGreaterThan(0.98)
    await display.screenshot({
      path: join(testInfo.outputDir, `question-5-cards-${width}.png`),
    })
    expect(
      await display.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true)
  }
  expect(
    (await probe(page)).cues.filter((cue) => cue.name === "timer-ended"),
  ).toHaveLength(1)
  await testInfo.attach("complete-audio-trace.json", {
    body: JSON.stringify(
      {
        host: await probe(page),
        player: await probe(player),
        display: await probe(display),
      },
      null,
      2,
    ),
    contentType: "application/json",
  })
  await context.close()
  await displayContext.close()
})
