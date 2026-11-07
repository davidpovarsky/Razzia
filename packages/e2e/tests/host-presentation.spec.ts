import { expect, test } from "@playwright/test"
import fs from "node:fs"
import { join } from "node:path"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
} from "../../../extensions/src/core"
import { loginManager } from "../utils/manager"
import { joinGame } from "../utils/player"

test("same-window host presentation hides manager UI and controls authoritative pause", async ({
  page: host,
  browser,
  request,
  browserName,
}) => {
  const evidenceDir = join(
    import.meta.dirname,
    "../../../work/p0-audio-host-presentation-20261106",
  )
  fs.mkdirSync(evidenceDir, { recursive: true })
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

  await loginManager(host)
  await host.getByRole("button", { name: title, exact: true }).click()
  await host.getByRole("button", { name: "Start game", exact: true }).click()
  const openingSkip = host.getByTestId("tadazz-opening-skip")

  if (await openingSkip.isVisible()) {
    await openingSkip.click()
  }

  const pin = host.getByTestId("tadazz-lobby-pin")
  await expect(pin).toBeVisible()
  const originalPin = await pin.textContent()
  const originalUrl = host.url()
  const gameId = /manager\/([^/?#]+)/u.exec(originalUrl)?.[1]
  expect(gameId).toBeTruthy()

  const displayContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  })
  const display = await displayContext.newPage()
  const displayOpeningStartedAt = Date.now()
  await display.goto(`/display/${gameId}`)
  await expect(display.getByTestId("tadazz-lobby-pin")).toHaveText(
    originalPin ?? "",
    {
      timeout: 20_000,
    },
  )
  await expect(display.getByTestId("tadazz-opening")).toHaveCount(0, {
    timeout: 20_000,
  })
  await expect(display.getByTestId("tadazz-lobby-pin")).toBeVisible()
  const displayLobbyElapsedMs = Date.now() - displayOpeningStartedAt
  expect(displayLobbyElapsedMs).toBeGreaterThanOrEqual(7400)
  expect(displayLobbyElapsedMs).toBeLessThan(12000)
  await display.screenshot({
    path: join(evidenceDir, "lobby-display-1920x1080.png"),
  })

  const playerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const player = await playerContext.newPage()
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

  await host.getByTestId("host-present-from-host-btn").click()
  const shell = host.getByTestId("tadazz-show")
  await expect(shell).toHaveAttribute("data-host-presenting", "true")
  await expect(host.getByTestId("manager-control-toolbar")).toHaveCount(0)
  await expect(host.getByTestId("tadazz-host-controls")).toHaveCount(0)
  await expect(host.getByTestId("host-audio-controls")).toHaveCount(0)
  await expect(pin).toHaveText(originalPin ?? "")
  await expect(host.getByTestId("tadazz-lobby-qr")).toBeVisible()
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
  // Starting from the public lobby is possible without exposing the toolbar.
  await host.keyboard.press("ArrowRight")
  await expect(player.getByTestId("tadazz-pad-option-0")).toBeVisible({
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

  await host.keyboard.press("p")
  await expect(shell).toHaveAttribute("data-game-paused", "true")
  await expect(player.getByTestId("tadazz-pad-option-0")).toBeDisabled()
  await host.screenshot({ path: join(evidenceDir, "voting-paused-host.png") })
  await host.waitForTimeout(1200)
  await host.keyboard.press("p")
  await expect(shell).toHaveAttribute("data-game-paused", "false")
  await expect(player.getByTestId("tadazz-pad-option-0")).toBeEnabled()

  await host.keyboard.press("t")
  await expect(shell).toHaveAttribute("data-show-scene", "results")
  await expect(player.getByTestId("tadazz-screen-player-result")).toBeVisible()
  await host.screenshot({ path: join(evidenceDir, "results-host-present.png") })

  await host.keyboard.press("Escape")
  await expect(host.getByTestId("manager-control-toolbar")).toBeVisible()
  await playerContext.close()
  await displayContext.close()
})
