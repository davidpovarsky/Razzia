import { expect, test } from "@playwright/test"
import fs from "node:fs"
import { join } from "node:path"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
} from "../../../extensions/src/core"
import { createGame } from "../utils/manager"
import { joinGame } from "../utils/player"

test("same-window host presentation hides manager UI and controls authoritative pause", async ({
  page: host,
  browser,
  request,
  browserName,
}) => {
  const evidenceDir = join(
    import.meta.dirname,
    "../../../docs/extensions/plans/ux-unified-20261119/host-presentation/screenshots",
  )
  fs.mkdirSync(evidenceDir, { recursive: true })
  const socketConnections: string[] = []
  const commands: Array<{ action: string; requestId: string; epoch: number }> =
    []
  const pauseStates: Array<{
    paused: boolean
    remainingMs: number | null
    epoch: number
  }> = []
  const browserErrors: string[] = []
  host.on("websocket", (connection) => {
    if (new URL(connection.url()).pathname.replace(/\/$/u, "") !== "/ws") {
      return
    }

    socketConnections.push(connection.url())
    const readEvent = (payload: string | Buffer) => {
      const text = payload.toString()
      const start = text.indexOf("[")

      if (!text.startsWith("42") || start === -1) {
        return null
      }

      return JSON.parse(text.slice(start)) as [string, Record<string, unknown>]
    }
    connection.on("framesent", ({ payload }) => {
      const event = readEvent(payload)

      if (event?.[0] === "extensions:command") {
        const command = event[1] as {
          action: string
          requestId: string
          payload: { epoch: number }
        }
        commands.push({
          action: command.action,
          requestId: command.requestId,
          epoch: command.payload.epoch,
        })
      }
    })
    connection.on("framereceived", ({ payload }) => {
      const event = readEvent(payload)

      if (event?.[0] === "extensions:state" && event[1].pause) {
        const state = event[1] as {
          epoch: number
          pause: { paused: boolean; remainingMs: number | null }
        }
        pauseStates.push({
          paused: state.pause.paused,
          remainingMs: state.pause.remainingMs,
          epoch: state.epoch,
        })
      }
    })
  })
  host.on("pageerror", (error) => browserErrors.push(error.message))
  const doublePress = async (key: string) => {
    await host.keyboard.press(key)
    await host.keyboard.press(key)
  }
  const title = `Host presentation ${Date.now()}`
  const questionId = crypto.randomUUID()
  const quizz = {
    subject: title,
    gameMode: "quiz" as const,
    questions: [
      {
        type: "single" as const,
        question: "Which answer is correct?",
        answers: ["One", "Two", "Three", "Four"],
        solutions: [0],
        cooldown: 3,
        time: 30,
      },
    ],
  }
  const extras = createDefaultQuizExtras(
    "draft",
    [questionId],
    computeCanonicalBaseDigest(quizz),
  )
  const login = await request.post("/api/auth/manager", {
    data: { password: "e2e-password" },
  })
  const { token } = (await login.json()) as { token: string }
  const save = await request.post("/api/extensions/quizzes", {
    headers: { Authorization: `Bearer ${token}` },
    data: { quizz, extras },
  })
  expect(save.ok(), await save.text()).toBe(true)

  for (const path of [
    "/sounds/answersMusic.mp3",
    "/sounds/answersSound.mp3",
    "/sounds/boump.mp3",
    "/sounds/show.mp3",
    "/sounds/results.mp3",
    "/sounds/snearRoll.mp3",
    "/sounds/first.mp3",
    "/sounds/second.mp3",
    "/sounds/three.mp3",
    "/tadazz-show/opening/Animate_gameshow_stage_loop_c01e8a8a_1080p.mp4",
    "/tadazz-show/opening/TADAZZ-Opening-4-5s.json",
  ]) {
    const response = await request.get(path)
    expect(response.status(), `${path} must be served`).toBe(200)
  }

  await createGame(host, title)
  const presentationCommandStart = commands.length

  const pin = host.getByText(/^\d{6}$/u).first()
  await expect(pin).toBeVisible()
  const originalPin = await pin.textContent()
  const originalUrl = host.url()
  const gameId = /manager\/([^/?#]+)/u.exec(originalUrl)?.[1]
  expect(gameId).toBeTruthy()

  const displayContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  })
  const display = await displayContext.newPage()
  display.on("pageerror", (error) => browserErrors.push(error.message))
  const displayLobbyStartedAt = Date.now()
  await display.goto(`/display/${gameId}`)
  await expect(display.getByText(/^\d{6}$/u).first()).toHaveText(
    originalPin ?? "",
    { timeout: 5_000 },
  )
  // The host already completed the shared ident. A new display and its reload
  // join the same lobby without playing another local opening.
  await expect(display.getByTestId("platform-game-opening")).toHaveCount(0)
  await expect(display.getByTestId("tadazz-opening")).toHaveCount(0)
  await expect(display.getByText(/^\d{6}$/u).first()).toBeVisible()
  const displayLobbyElapsedMs = Date.now() - displayLobbyStartedAt
  await display.reload()
  await expect(display.getByText(/^\d{6}$/u).first()).toHaveText(
    originalPin ?? "",
    { timeout: 5_000 },
  )
  await expect(display.getByTestId("platform-game-opening")).toHaveCount(0)
  await expect(display.getByTestId("tadazz-opening")).toHaveCount(0)
  await display.screenshot({
    path: join(evidenceDir, "lobby-display-1920x1080.png"),
  })

  const playerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const player = await playerContext.newPage()
  player.on("pageerror", (error) => browserErrors.push(error.message))
  await joinGame(player, originalPin ?? "", "Mirror QA player")

  if (browserName === "webkit") {
    await host.evaluate(() => {
      HTMLElement.prototype.requestFullscreen = () =>
        Promise.reject(new Error("WebKit fullscreen denial fixture"))
    })
    await host.getByTestId("host-present-from-host-btn").click()
    await expect(host.getByTestId("tadazz-show")).toHaveAttribute(
      "data-host-presenting",
      "false",
    )
    await expect(host.getByTestId("manager-control-toolbar")).toBeVisible()
    expect(host.url()).toBe(originalUrl)
    await playerContext.close()
    await displayContext.close()

    return
  }

  await host.setViewportSize({ width: 1920, height: 1080 })
  const connectionsBeforePresentation = socketConnections.length
  expect(connectionsBeforePresentation).toBe(1)
  await host.getByTestId("host-present-from-host-btn").click()
  const shell = host.getByTestId("tadazz-show")
  await expect(shell).toHaveAttribute("data-host-presenting", "true")
  await expect(host.getByTestId("manager-control-toolbar")).toHaveCount(0)
  await expect(host.getByTestId("tadazz-host-controls")).toHaveCount(0)
  await expect(host.getByTestId("host-audio-controls")).toHaveCount(0)
  await expect(host.getByRole("dialog")).toHaveCount(0)
  await expect(host.getByRole("alertdialog")).toHaveCount(0)
  await expect(host.locator('[role="tooltip"]:visible')).toHaveCount(0)
  await expect(host.getByText("Mirror QA player", { exact: true })).toHaveCount(
    0,
  )
  await expect
    .poll(() => host.evaluate(() => document.fullscreenElement !== null))
    .toBe(true)
  await expect(pin).toHaveText(originalPin ?? "")
  await expect(
    host.getByRole("img", { name: "Show QR code", exact: true }),
  ).toBeVisible()
  expect(host.url()).toBe(originalUrl)

  const viewports = [
    [1920, 1080],
    [1366, 768],
    [1280, 720],
    [1024, 768],
  ] as const
  for (let index = 0; index < viewports.length; index += 1) {
    const [width, height] = viewports[index]

    if (index > 0) {
      await host.keyboard.press("Escape")
      await expect(shell).toHaveAttribute("data-host-presenting", "false")
      await expect
        .poll(() => host.evaluate(() => document.fullscreenElement === null))
        .toBe(true)
      await host.setViewportSize({ width, height })
      await host.getByTestId("host-present-from-host-btn").click()
      await expect(shell).toHaveAttribute("data-host-presenting", "true")
    }

    await expect(host.getByTestId("tadazz-opening")).toHaveCount(0, {
      timeout: 20_000,
    })
    await expect(pin).toBeVisible()
    await expect(
      host.getByRole("img", { name: "Show QR code", exact: true }),
    ).toBeVisible()
    await host.evaluate(async () => {
      await document.fonts.ready
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
    })
    const overflow = await shell.evaluate((element) => ({
      horizontal: element.scrollWidth - element.clientWidth,
      vertical: element.scrollHeight - element.clientHeight,
    }))
    expect(overflow.horizontal).toBeLessThanOrEqual(1)
    expect(overflow.vertical).toBeLessThanOrEqual(1)
    await host.screenshot({
      path: join(evidenceDir, `lobby-host-present-${width}x${height}.png`),
    })
  }

  await host.keyboard.press("Escape")
  await expect(shell).toHaveAttribute("data-host-presenting", "false")
  await expect(host.getByTestId("manager-control-toolbar")).toBeVisible()
  await expect(pin).toHaveText(originalPin ?? "")
  await expect
    .poll(() => host.evaluate(() => document.fullscreenElement === null))
    .toBe(true)

  await host.getByTestId("host-present-from-host-btn").click()
  await expect(shell).toHaveAttribute("data-host-presenting", "true")
  // The owner-approved November8 contract requires two matching presses.
  await host.keyboard.press("ArrowRight")
  await host.waitForTimeout(600)
  await expect(shell).toHaveAttribute("data-show-scene", "lobby")
  await doublePress("ArrowRight")
  await expect(
    player.getByRole("button", { name: "1 One", exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  })
  await expect(shell).toHaveAttribute("data-host-presenting", "true")
  await expect(host.getByTestId("audio-cue-player-state")).toHaveAttribute(
    "data-audio-url",
    "/sounds/answersMusic.mp3",
  )
  await expect(host.getByTestId("audio-cue-player-state")).toHaveAttribute(
    "data-audio-loop",
    "true",
  )

  // Different skip aliases are not accepted as the required same-chord confirmation.
  await host.keyboard.press("Shift+ArrowRight")
  await host.keyboard.press("Shift+S")
  await expect(shell).toHaveAttribute("data-show-scene", "voting")

  const visibleTimer = host
    .locator('[data-testid="tadazz-timer"]:visible')
    .last()
  await expect(visibleTimer).toBeVisible()
  await doublePress("Space")
  await expect(shell).toHaveAttribute("data-game-paused", "true")
  const pausedTimer = await visibleTimer.textContent()
  const authoritativePause = pauseStates.at(-1)
  expect(authoritativePause?.paused).toBe(true)
  expect(authoritativePause?.remainingMs).toBeGreaterThan(0)
  await expect(
    player.getByRole("button", { name: "1 One", exact: true }),
  ).toBeDisabled()
  await host.screenshot({ path: join(evidenceDir, "voting-paused-host.png") })
  await host.waitForTimeout(1200)
  await expect(visibleTimer).toHaveText(pausedTimer ?? "")
  await doublePress("Space")
  await expect(shell).toHaveAttribute("data-game-paused", "false")
  await expect(
    player.getByRole("button", { name: "1 One", exact: true }),
  ).toBeEnabled()

  await player.screenshot({ path: join(evidenceDir, "voting-player-390.png") })
  await player.getByRole("button", { name: "1 One", exact: true }).click()
  await doublePress("Enter")
  await expect(shell).toHaveAttribute("data-show-scene", "results")
  await expect(player.getByText("Nice!", { exact: true })).toBeVisible()
  await expect(player.getByTestId("tadazz-show")).toHaveAttribute(
    "data-show-scene",
    "results",
  )
  await player.screenshot({ path: join(evidenceDir, "results-player-390.png") })
  await expect(
    host.getByTestId("tadazz-question-panel").getByText("AUDIENCE RESULTS", {
      exact: true,
    }),
  ).toBeVisible()
  await host.screenshot({ path: join(evidenceDir, "results-host-present.png") })

  await host.keyboard.press("Escape")
  await expect(host.getByTestId("manager-control-toolbar")).toBeVisible()
  expect(host.url()).toBe(originalUrl)
  expect(socketConnections).toHaveLength(connectionsBeforePresentation)
  expect(browserErrors).toEqual([])
  const presentationCommands = commands.slice(presentationCommandStart)
  expect(presentationCommands.map(({ action }) => action)).toEqual([
    "NEXT_SCREEN",
    "PAUSE_GAME",
    "RESUME_GAME",
    "END_ANSWER_TIMER",
  ])
  expect(
    new Set(presentationCommands.map(({ requestId }) => requestId)).size,
  ).toBe(4)
  expect(
    presentationCommands.every(({ epoch }) => Number.isInteger(epoch)),
  ).toBe(true)
  expect(pauseStates.some((state) => state.paused)).toBe(true)
  expect(pauseStates.at(-1)?.paused).toBe(false)
  const cleanupStartedAt = Date.now()
  const cleanupPages = [playerContext, displayContext].map((context) =>
    context.pages().map((page) => {
      const url = new URL(page.url())

      return url.origin + url.pathname
    }),
  )
  fs.writeFileSync(
    join(evidenceDir, "cleanup-start.json"),
    JSON.stringify({ cleanupPages, cleanupStartedAt }, null, 2),
  )
  await Promise.all([playerContext.close(), displayContext.close()])
  fs.writeFileSync(
    join(evidenceDir, "browser-receipt.json"),
    JSON.stringify(
      {
        gameId,
        gameSocketConnections: socketConnections.length,
        gameSocketConnectionsBeforePresentation: connectionsBeforePresentation,
        cleanupMs: Date.now() - cleanupStartedAt,
        cleanupPages,
        browserErrors,
        commands: presentationCommands,
        platformSetupCommands: commands.slice(0, presentationCommandStart),
        displayLobbyElapsedMs,
        displayReloadStayedInLobby: true,
        authoritativePause,
        pausedTimer,
        viewports,
        playerViewport: player.viewportSize(),
        actualFullscreen: true,
        submittedBrowserVote: true,
        shortcutContract:
          "Owner-requested November8 matching double press within500ms",
      },
      null,
      2,
    ),
  )
})
