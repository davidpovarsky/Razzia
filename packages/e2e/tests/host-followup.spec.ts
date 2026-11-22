import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test"
import fs from "node:fs"
import { join } from "node:path"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  PLATFORM_AUDIO_URLS,
  PLATFORM_SOUNDTRACK_DEFAULTS,
} from "../../../extensions/src/core"
import { createGame, skipPlatformOpening, startGame } from "../utils/manager"
import { joinGame } from "../utils/player"

const evidence = join(
  import.meta.dirname,
  "../../../docs/extensions/plans/ux-followup-20261119/host-controls",
)
fs.mkdirSync(evidence, { recursive: true })

function serveFixtureAudio(page: Page) {
  return page.route("**/media/qa-host-lobby.mp3", (route) =>
    route.fulfill({
      path: join(
        import.meta.dirname,
        "../../web/public/tadazz-show/music/epic-main-menu.mp3",
      ),
      contentType: "audio/mpeg",
    }),
  )
}

async function openFixture(
  host: Page,
  request: APIRequestContext,
  directory: boolean,
) {
  const quizz = {
    subject: `Host follow-up ${directory ? "Creating Worlds" : "ordinary"} ${Date.now()}`,
    gameMode: "quiz" as const,
    questions: [
      {
        type: "single" as const,
        question: "QA question",
        answers: ["Ready", "Not yet"],
        solutions: [0],
        cooldown: 3,
        time: 30,
      },
    ],
  }
  const extras = createDefaultQuizExtrasV2(
    "draft",
    [crypto.randomUUID()],
    computeCanonicalBaseDigest(quizz),
  )
  extras.defaults.showTheme = {
    id: "tadazz-classic",
    version: "1.0.0",
    overrides: {},
  }
  extras.audio.soundtrack = {
    lobby: {
      mode: "media",
      url: "/media/qa-host-lobby.mp3",
      volume: 0.24,
      loop: true,
      fadeMs: 120,
      startOffsetSeconds: 0,
    },
    results: {
      mode: "media",
      url: "/tadazz-show/music/cutie-patootie.mp3",
      volume: 0.3,
      loop: true,
      fadeMs: 120,
      startOffsetSeconds: 0,
    },
    finale: {
      mode: "media",
      url: "/media/qa-host-missing.mp3",
      volume: 0.24,
      loop: true,
      fadeMs: 120,
      startOffsetSeconds: 0,
    },
  }
  extras.roster.participants = Array.from({ length: 38 }, (_, index) => ({
    rosterPlayerId: `qa-person-${index + 1}`,
    displayName: `QA Table ${String(index + 1).padStart(2, "0")}`,
    phoneE164: `+447700900${String(index + 1).padStart(3, "0")}`,
    tableNumber: (index % 31) + 1,
  }))

  if (directory) {
    const id = crypto.randomUUID()
    extras.scenes[id] = {
      id,
      kind: "animation",
      preset: "representative-directory",
      seatingPlan: true,
      advance: "manual",
      durationMs: 10000,
    }
  }

  const login = await request.post("/api/auth/manager", {
    data: { password: "e2e-password" },
  })
  expect(login.ok()).toBe(true)
  const { token } = (await login.json()) as { token: string }
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
  const { gameId } = (await created.json()) as { gameId: string }
  await host.addInitScript(
    (value) => localStorage.setItem("token", value),
    token,
  )
  await serveFixtureAudio(host)
  await host.goto(`/party/manager/${gameId}`)
  await skipPlatformOpening(host)
  await expect(host.getByTestId("tadazz-show")).toHaveAttribute(
    "data-show-scene",
    "lobby",
  )

  return { gameId, headers }
}

function publicContent(page: Page) {
  return page
    .getByTestId("tadazz-screen-lobby")
    .evaluate((node) => node.textContent.replace(/\s+/gu, " ").trim())
}

function audioState(page: Page, path: string) {
  return page.evaluate((value) => {
    const tracks = (window as unknown as { qaAudio: HTMLAudioElement[] })
      .qaAudio
    const matches = tracks.filter(
      (audio) =>
        new URL(audio.src || "/", location.href).pathname ===
        new URL(value, location.href).pathname,
    )
    const active =
      matches.find((audio) => !audio.paused) ??
      matches.toSorted((a, b) => b.currentTime - a.currentTime).at(0)

    return {
      total: tracks.length,
      element: active ? tracks.indexOf(active) : -1,
      playing: matches.filter((audio) => !audio.paused).length,
      time: active?.currentTime ?? 0,
      volume: active?.volume ?? 0,
    }
  }, path)
}

test("one Creating Worlds stage, real soundtrack choices, and a compact live roster in LTR/RTL", async ({
  page: host,
  browser,
  request,
}) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  const sockets: string[] = []
  host.on("pageerror", (error) => errors.push(error.message))
  host.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname.replace(/\/$/u, "") === "/ws") {
      sockets.push(socket.url())
    }
  })
  await host.addInitScript(() => {
    const target = window as unknown as { qaAudio: HTMLAudioElement[] }
    target.qaAudio = []
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "play",
    )

    if (typeof descriptor?.value !== "function") {
      throw new Error("Native media playback unavailable")
    }

    const original = descriptor.value as (
      this: HTMLMediaElement,
    ) => Promise<void>
    HTMLMediaElement.prototype.play = function observeAudioPlayback() {
      if (this instanceof HTMLAudioElement && !target.qaAudio.includes(this)) {
        target.qaAudio.push(this)
      }

      return original.call(this)
    }
  })
  const room = await openFixture(host, request, true)
  const displayContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  })
  const display = await displayContext.newPage()
  display.on("pageerror", (error) => errors.push(error.message))

  try {
    await serveFixtureAudio(display)
    await display.goto(`/display/${room.gameId}`)
    await expect(display.getByTestId("tadazz-full-directory")).toBeVisible()
    await expect(host.getByTestId("tadazz-full-directory")).toBeVisible()
    const before = await publicContent(host)
    await expect.poll(() => publicContent(display)).toBe(before)
    await expect(
      host.getByTestId("host-audio-track-select"),
    ).toHaveAccessibleName("Music")
    await expect(host.getByTestId("host-audio-track-select")).toHaveValue("")
    const state = host.getByTestId("audio-cue-player-state")
    await expect(state).toHaveAttribute("data-soundtrack-slot", "lobby")
    await host.getByTestId("host-audio-track-select").selectOption("results")
    await expect(state).toHaveAttribute("data-soundtrack-slot", "results")
    await expect(state).toHaveAttribute("data-should-play", "true")
    const track = (await state.getAttribute("data-audio-url")) ?? ""
    expect(track).not.toBe("")
    await expect
      .poll(async () => (await audioState(host, track)).time)
      .toBeGreaterThan(0.15)
    expect((await audioState(host, track)).playing).toBe(1)
    expect(await publicContent(host)).toBe(before)
    await host.getByTestId("host-toggle-audio-pause").click()
    await expect(state).toHaveAttribute("data-audio-paused", "true")
    const pausedAt = (await audioState(host, track)).time
    await host.waitForTimeout(400)
    expect(
      Math.abs((await audioState(host, track)).time - pausedAt),
    ).toBeLessThan(0.15)
    await host.getByTestId("host-audio-track-select").selectOption("lobby")
    await expect(state).toHaveAttribute("data-audio-paused", "false")
    const lobbyTrack = (await state.getAttribute("data-audio-url")) ?? ""
    await expect
      .poll(async () => (await audioState(host, lobbyTrack)).time)
      .toBeGreaterThan(0.15)
    const engineBefore = await audioState(host, lobbyTrack)
    const socketCount = sockets.length
    expect(socketCount).toBe(1)
    await host.screenshot({
      path: join(evidence, "host-directory-controls.png"),
    })
    await host.getByTestId("host-present-from-host-btn").click()
    await expect(host.getByTestId("tadazz-show")).toHaveAttribute(
      "data-host-presenting",
      "true",
    )
    expect(await publicContent(host)).toBe(before)
    await expect(host.getByTestId("manager-control-toolbar")).toHaveCount(0)
    await expect(host.getByTestId("host-audio-controls")).toHaveCount(0)
    expect(sockets.length).toBe(socketCount)
    expect((await audioState(host, lobbyTrack)).total).toBe(engineBefore.total)
    expect((await audioState(host, lobbyTrack)).time).toBeGreaterThanOrEqual(
      engineBefore.time,
    )
    await host.screenshot({
      path: join(evidence, "host-directory-fullscreen.png"),
    })
    await display.screenshot({ path: join(evidence, "audience-directory.png") })
    await host.keyboard.press("Escape")
    await expect(host.getByTestId("host-audio-track-select")).toHaveValue(
      "lobby",
    )
    await host.getByTestId("host-audio-track-select").selectOption("")
    await expect(state).toHaveAttribute("data-soundtrack-slot", "lobby")
    await expect(host.getByTestId("host-audio-track-select")).toHaveValue("")

    await host.getByTestId("host-audio-track-select").selectOption("finale")
    await expect(host.getByTestId("host-music-unavailable")).toBeVisible()
    await expect(
      host
        .getByTestId("host-audio-track-select")
        .locator('option[value="finale"]'),
    ).toBeDisabled()
    await host.getByTestId("host-audio-track-select").selectOption("lobby")
    await expect(host.getByTestId("host-music-unavailable")).toHaveCount(0)
    await expect
      .poll(async () => (await audioState(host, lobbyTrack)).playing)
      .toBe(1)
    expect(await publicContent(host)).toBe(before)

    await host.getByTestId("host-bottom-players-btn").click()
    const modal = host.getByTestId("host-players-modal")
    const rows = modal
      .getByTestId("host-modal-players-table")
      .locator("tbody tr")
    await expect(rows).toHaveCount(38)
    await expect(modal.getByTestId("host-modal-name-input")).toHaveCount(0)
    await expect(modal.getByTestId("host-modal-import-btn")).toHaveCount(0)
    await expect(
      modal.getByTestId("host-modal-players-table").locator("thead th"),
    ).toHaveCount(3)
    await modal.getByTestId("host-modal-search-input").fill("Table 38")
    await expect(rows).toHaveCount(1)
    await modal.getByTestId("host-modal-search-input").fill("")
    await modal.getByTestId("host-modal-filter").selectOption("connected")
    await expect(modal.getByTestId("host-modal-empty")).toBeVisible()
    await modal.getByTestId("host-modal-filter").selectOption("not_joined")
    await expect(rows).toHaveCount(38)
    await modal.getByTestId("host-modal-filter").selectOption("all")
    await modal.getByTestId("host-modal-add-btn").click()
    await expect(modal.getByTestId("host-modal-name-input")).toBeFocused()
    await modal.getByTestId("host-modal-name-input").fill("QA Added player")
    await modal.getByTestId("host-modal-phone-input").fill("+447700900099")
    await modal.getByTestId("host-modal-save-participant-btn").click()
    await expect(rows).toHaveCount(39)
    await expect(modal.getByTestId("host-modal-name-input")).toHaveCount(0)
    await expect(modal.getByTestId("host-modal-add-btn")).toBeFocused()
    const added = rows.filter({ hasText: "QA Added player" })
    await added.locator('[data-testid^="host-player-edit-"]').click()
    await modal.getByTestId("host-modal-name-input").fill("QA Edited player")
    await modal.getByTestId("host-modal-save-participant-btn").click()
    await expect(rows.filter({ hasText: "QA Edited player" })).toHaveCount(1)
    await modal.getByTestId("host-modal-manage-btn").click()
    const policy = modal.getByTestId("host-modal-invite-only-toggle")
    await policy.click()
    await expect(policy).toBeChecked()
    const roster = await request.get(`/api/games/${room.gameId}/roster`, {
      headers: room.headers,
    })
    const rosterState = (await roster.json()) as {
      presence: { phoneInviteOnly: boolean }
    }
    expect(rosterState.presence.phoneInviteOnly).toBe(true)
    await modal.getByTestId("host-modal-manage-btn").click()
    for (const [width, height] of [
      [1440, 900],
      [768, 1024],
      [390, 844],
      [320, 640],
    ]) {
      await host.setViewportSize({ width, height })
      const bounds = await modal.evaluate((element) => {
        const list = element.querySelector(
          '[data-testid="host-roster-list"]',
        ) as HTMLElement
        const rect = element.getBoundingClientRect()

        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: innerWidth,
          height: innerHeight,
          modalOverflow: element.scrollWidth > element.clientWidth + 1,
          listOverflow: list.scrollWidth > list.clientWidth + 1,
          listHeight: list.clientHeight,
        }
      })
      expect(bounds.left).toBeGreaterThanOrEqual(0)
      expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1)
      expect(bounds.top).toBeGreaterThanOrEqual(0)
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.height + 1)
      expect(bounds.modalOverflow).toBe(false)
      expect(bounds.listOverflow).toBe(false)
      expect(bounds.listHeight).toBeGreaterThan(200)
      await host.screenshot({
        path: join(evidence, `roster-${width}x${height}.png`),
      })
    }
    await host.getByTestId("host-players-close-btn").click()
    await host.goto(`/party/manager/${room.gameId}?lng=he`)
    await expect(host.getByTestId("tadazz-full-directory")).toBeVisible()
    await host.getByTestId("host-bottom-players-btn").click()
    await expect(
      modal.locator("xpath=ancestor::*[@dir='rtl'][1]"),
    ).toBeVisible()
    await expect(rows).toHaveCount(39)
    await host.screenshot({ path: join(evidence, "roster-320-hebrew.png") })
    await host.getByTestId("host-players-close-btn").click()
    await display.reload()
    await expect(display.getByTestId("tadazz-full-directory")).toBeVisible()
    expect(errors).toEqual([])
    fs.writeFileSync(
      join(evidence, "browser-proof.json"),
      JSON.stringify(
        {
          ok: true,
          checks: [
            "host/display/fullscreen shared directory",
            "private host chrome removed",
            "one host websocket across fullscreen",
            "one audio engine across fullscreen",
            "actual HTMLAudioElement time progression",
            "manual selection overrides automatic cue policy",
            "pause and explicit selection resumes music",
            "automatic music return",
            "missing track shows an error, is disabled, and permits recovery",
            "authoritative add/edit/policy/reload",
            "compact roster at 1440/768/390/320",
            "Hebrew RTL",
          ],
          browserErrors: errors,
          syntheticOnly: true,
        },
        null,
        2,
      ),
    )
  } finally {
    await displayContext.close()
  }
})

test("ordinary show keeps private roster out of the public lobby in every display mode", async ({
  page: host,
  browser,
  request,
}) => {
  const room = await openFixture(host, request, false)
  const display = await browser.newPage()

  try {
    await serveFixtureAudio(display)
    await display.goto(`/display/${room.gameId}`)
    await expect(host.getByTestId("tadazz-lobby-pin")).toBeVisible()
    await expect(display.getByTestId("tadazz-lobby-pin")).toHaveText(
      (await host.getByTestId("tadazz-lobby-pin").textContent()) ?? "",
    )
    const before = await publicContent(host)
    expect(before).not.toContain("QA Table")
    expect(await publicContent(display)).toBe(before)
    await host.getByTestId("host-present-from-host-btn").click()
    await expect(host.getByTestId("tadazz-show")).toHaveAttribute(
      "data-host-presenting",
      "true",
    )
    expect(await publicContent(host)).toBe(before)
    await expect(host.getByTestId("tadazz-full-directory")).toHaveCount(0)
    await host.keyboard.press("Escape")
    await expect(host.getByTestId("tadazz-full-directory")).toHaveCount(0)
  } finally {
    await display.close()
  }
})

test("manual music expires between authored screens in the same automatic audio group", async ({
  page,
  request,
  browser,
}) => {
  const questionId = crypto.randomUUID()
  const firstSceneId = crypto.randomUUID()
  const secondSceneId = crypto.randomUUID()
  const quizz = {
    subject: `Authored music scope ${Date.now()}`,
    gameMode: "quiz" as const,
    questions: [
      {
        type: "single" as const,
        question: "Music scope question",
        answers: ["Ready", "Later"],
        solutions: [0],
        cooldown: 2,
        time: 120,
      },
    ],
  }
  const extras = createDefaultQuizExtrasV2(
    "draft",
    [questionId],
    computeCanonicalBaseDigest(quizz),
  )
  extras.defaults.showTheme = {
    id: "tadazz-classic",
    version: "1.0.0",
    overrides: {},
  }
  extras.defaults.advanceMode = "manual"
  const automaticUrl = PLATFORM_AUDIO_URLS.recap
  const manualUrl = PLATFORM_SOUNDTRACK_DEFAULTS.results?.url ?? ""
  expect(manualUrl).not.toBe("")
  expect(manualUrl).not.toBe(automaticUrl)
  extras.audio.soundtrack = {
    ...extras.audio.soundtrack,
    recap: {
      mode: "media",
      url: automaticUrl,
      volume: 0.3,
      loop: true,
      fadeMs: 120,
      startOffsetSeconds: 0,
    },
    results: {
      mode: "media",
      url: manualUrl,
      volume: 0.3,
      loop: true,
      fadeMs: 120,
      startOffsetSeconds: 0,
    },
  }
  for (const [index, id] of [firstSceneId, secondSceneId].entries()) {
    extras.scenes[id] = {
      id,
      kind: "answerRecap",
      title: `Authored recap ${index + 1}`,
      startQuestionId: questionId,
      mode: "correctAnswer",
      durationMs: 8000,
      advance: "manual",
    }
    extras.timeline.push({
      id: crypto.randomUUID(),
      kind: "answerRecap",
      sceneId: id,
    })
  }
  const login = await request.post("/api/auth/manager", {
    data: { password: "e2e-password" },
  })
  expect(login.ok()).toBe(true)
  const { token } = (await login.json()) as { token: string }
  const saved = await request.post("/api/extensions/quizzes", {
    headers: { Authorization: `Bearer ${token}` },
    data: { quizz, extras },
  })
  expect(saved.status(), await saved.text()).toBe(201)
  for (const url of [automaticUrl, manualUrl]) {
    const response = await request.get(url)
    expect(response.status(), url).toBe(200)
  }

  const errors: string[] = []
  const scenes: Array<{ sceneId: string; epoch: number }> = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      const raw = payload.toString()

      if (!raw.startsWith("42")) {
        return
      }

      let packet: unknown = null

      try {
        packet = JSON.parse(raw.slice(raw.indexOf("[")))
      } catch {
        return
      }

      if (!Array.isArray(packet)) {
        return
      }

      const event: unknown = packet[0]
      const eventPayload: unknown = packet[1]

      if (event !== "extensions:state") {
        return
      }

      const record = (value: unknown): Record<string, unknown> =>
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {}
      const state = record(eventPayload)
      const step = record(record(state.extras).activeTimelineStep)

      if (
        state.phase === "scene" &&
        typeof step.sceneId === "string" &&
        typeof state.epoch === "number"
      ) {
        scenes.push({ sceneId: step.sceneId, epoch: state.epoch })
      }
    })
  })
  await page.addInitScript(() => {
    const target = window as unknown as { qaAudio: HTMLAudioElement[] }
    target.qaAudio = []
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "play",
    )

    if (typeof descriptor?.value !== "function") {
      throw new Error("Native media playback unavailable")
    }

    const original = descriptor.value as (
      this: HTMLMediaElement,
    ) => Promise<void>
    HTMLMediaElement.prototype.play = function observeScopedMusicPlayback() {
      if (this instanceof HTMLAudioElement && !target.qaAudio.includes(this)) {
        target.qaAudio.push(this)
      }

      return original.call(this)
    }
  })
  const pin = await createGame(page, quizz.subject)
  const player = await browser.newPage()

  try {
    await joinGame(player, pin, "Music scope player")
    await expect(page.getByTestId("host-connected-counter")).toHaveText(
      /^1(?:\s*\/\s*1)?$/u,
    )
    await startGame(page)
    const shell = page.getByTestId("tadazz-show")
    await expect(shell).toHaveAttribute("data-show-scene", "voting")
    await page.getByTestId("host-end-timer-btn").click()
    await expect(shell).toHaveAttribute("data-show-scene", "results")
    await page.getByTestId("host-next-screen-btn").click()
    await expect.poll(() => scenes.at(-1)?.sceneId).toBe(firstSceneId)
    await expect(shell).toHaveAttribute("data-show-scene", "scene")
    const music = page.getByTestId("host-audio-track-select")
    const state = page.getByTestId("audio-cue-player-state")
    await expect(state).toHaveCount(1)
    await expect(music).toHaveValue("")
    await expect(state).toHaveAttribute("data-soundtrack-slot", "recap")
    await expect(state).toHaveAttribute("data-audio-url", automaticUrl)
    const automaticIdentity = await state.getAttribute("data-audio-identity")
    expect(automaticIdentity).toBeTruthy()
    await expect
      .poll(async () => (await audioState(page, automaticUrl)).playing)
      .toBe(1)
    await expect
      .poll(async () => (await audioState(page, automaticUrl)).time)
      .toBeGreaterThan(0.15)

    await music.selectOption("results")
    await expect(music).toHaveValue("results")
    await expect(state).toHaveAttribute("data-soundtrack-slot", "results")
    await expect(state).toHaveAttribute("data-audio-url", manualUrl)
    await expect
      .poll(async () => (await audioState(page, manualUrl)).playing)
      .toBe(1)
    await expect
      .poll(async () => (await audioState(page, manualUrl)).time)
      .toBeGreaterThan(0.15)
    const manualIdentity = await state.getAttribute("data-audio-identity")
    const firstScene = scenes.at(-1)
    await page.getByTestId("host-toggle-audio-pause").click()
    await expect(state).toHaveAttribute("data-audio-paused", "true")
    await expect(music).toHaveValue("results")
    await expect
      .poll(async () => (await audioState(page, manualUrl)).playing)
      .toBe(0)
    const paused = await audioState(page, manualUrl)
    await page.getByTestId("host-toggle-audio-pause").click()
    await expect(state).toHaveAttribute("data-audio-paused", "false")
    await expect(music).toHaveValue("results")
    await expect(state).toHaveAttribute(
      "data-audio-identity",
      manualIdentity ?? "",
    )
    await expect
      .poll(async () => (await audioState(page, manualUrl)).playing)
      .toBe(1)
    await expect
      .poll(async () => (await audioState(page, manualUrl)).time)
      .toBeGreaterThan(paused.time)
    expect((await audioState(page, manualUrl)).element).toBe(paused.element)
    expect(scenes.at(-1)).toEqual(firstScene)

    await page.getByTestId("host-next-screen-btn").click()
    await expect.poll(() => scenes.at(-1)?.sceneId).toBe(secondSceneId)
    await expect(music).toHaveValue("")
    await expect(state).toHaveAttribute("data-soundtrack-slot", "recap")
    await expect(state).toHaveAttribute("data-audio-url", automaticUrl)
    await expect(state).toHaveAttribute(
      "data-audio-identity",
      automaticIdentity ?? "",
    )
    await expect
      .poll(async () => (await audioState(page, manualUrl)).playing)
      .toBe(0)
    await expect
      .poll(async () => (await audioState(page, automaticUrl)).playing)
      .toBe(1)
    const secondSceneAudio = await audioState(page, automaticUrl)
    await page.getByTestId("host-previous-screen-btn").click()
    await expect.poll(() => scenes.at(-1)?.sceneId).toBe(firstSceneId)
    await expect(music).toHaveValue("")
    await expect(state).toHaveAttribute("data-soundtrack-slot", "recap")
    await expect(state).toHaveAttribute(
      "data-audio-identity",
      automaticIdentity ?? "",
    )
    await expect
      .poll(async () => (await audioState(page, automaticUrl)).playing)
      .toBe(1)
    await expect
      .poll(async () => (await audioState(page, automaticUrl)).time)
      .toBeGreaterThan(secondSceneAudio.time)
    expect((await audioState(page, automaticUrl)).element).toBe(
      secondSceneAudio.element,
    )
    expect(errors).toEqual([])
    fs.writeFileSync(
      join(evidence, "manual-scope-browser-proof.json"),
      JSON.stringify(
        {
          actualAuthoredSceneIds: [firstSceneId, secondSceneId],
          scenes,
          automaticIdentity,
          manualIdentity,
          automaticUrl,
          manualUrl,
          paused,
          secondSceneAudio,
          finalAudio: await audioState(page, automaticUrl),
          realNativeControls: true,
          sameScreenSelectionRetained: true,
          nextAndPreviousRestoreAutomatic: true,
          realMediaTimeAdvanced: true,
          browserErrors: errors,
        },
        null,
        2,
      ),
    )
  } finally {
    await player.close()
  }
})
