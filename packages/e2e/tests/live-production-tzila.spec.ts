import { expect, test } from "@playwright/test"
import fs from "node:fs"
import { join } from "node:path"
import { endTimer, next as nextHost } from "../utils/manager"
import { joinGame } from "../utils/player"

const title = "Build Our Story — Tzila · Two-Round Audience Vote"
const token = process.env.TADAZZ_LIVE_QA_TOKEN

test("live production: original Tzila show, forty representatives, ten votes, tie, host presentation and audio", async ({
  page: host,
  browser,
}) => {
  test.skip(!token, "TADAZZ_LIVE_QA_TOKEN is required")
  const evidence = join(
    import.meta.dirname,
    "../../../work/live-release-evidence-20261106",
  )
  fs.mkdirSync(evidence, { recursive: true })
  host.on("console", (message) =>
    console.log("BROWSER_CONSOLE", message.type(), message.text()),
  )
  host.on("pageerror", (error) => console.log("BROWSER_ERROR", error.message))
  host.on("websocket", (socket) => {
    socket.on("framesent", (frame) => {
      const value = String(frame.payload)
      if (value.includes("extensions:command"))
        console.log("HOST_WS_SENT", value)
    })
    socket.on("framereceived", (frame) => {
      const value = String(frame.payload)
      if (value.startsWith("43") || value.includes("errorMessage"))
        console.log("HOST_WS_RECV", value.slice(0, 1200))
    })
  })
  host.on("response", (response) => {
    if (response.status() >= 400)
      console.log("HTTP_ERROR", response.status(), response.url())
  })

  await host.addInitScript(
    (value) => localStorage.setItem("token", value),
    token!,
  )
  await host.context().addCookies([
    {
      name: "tdz_media_auth",
      value: token!,
      domain: "tadazz.com",
      path: "/media",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ])
  await host.goto("/manager/config")
  await expect(
    host.getByRole("button", { name: title, exact: true }),
  ).toBeVisible()
  await host.getByRole("button", { name: title, exact: true }).click()
  await host.getByRole("button", { name: "Start game", exact: true }).click()

  const shell = host.getByTestId("tadazz-show")
  const audio = host.getByTestId("audio-cue-player-state")
  const video = host.getByTestId("tadazz-opening-video")
  await expect(video).toBeVisible()
  expect(
    await video.evaluate(
      (element: HTMLVideoElement) => element.muted && element.volume === 0,
    ),
  ).toBe(true)
  await expect(audio).toHaveAttribute(
    "data-audio-url",
    "/media/tadazz-production-intro-20261106.wav",
  )
  const enableSound = host.getByTestId("tadazz-opening-enable-sound")
  if (await enableSound.isVisible()) await enableSound.click()
  await expect(host.getByTestId("tadazz-opening")).toHaveCount(0, {
    timeout: 12_000,
  })
  const pin = host.getByTestId("tadazz-lobby-pin")
  await expect(pin).toHaveText(/^\d{6}$/u)
  await expect(host.getByTestId("tadazz-lobby-qr")).toBeVisible()
  await expect(audio).toHaveAttribute(
    "data-audio-url",
    "/media/tadazz-exploration-20261106.mp3",
    { timeout: 20_000 },
  )
  const code = (await pin.textContent())!
  const gameId = /manager\/([^/?#]+)/u.exec(host.url())?.[1]
  expect(gameId).toBeTruthy()

  const displayContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  })
  const display = await displayContext.newPage()
  await display.goto(`/display/${gameId}`)
  const displaySkip = display.getByTestId("tadazz-opening-skip")
  if (await displaySkip.isVisible())
    await displaySkip.click().catch(() => undefined)

  const playerContexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      }),
    ),
  )
  const players = await Promise.all(
    playerContexts.map((context) => context.newPage()),
  )
  for (let index = 0; index < players.length; index += 1)
    await joinGame(players[index], code, `Live QA ${index + 1}`)
  await host.waitForTimeout(1500)

  await host.getByRole("button", { name: "Start", exact: true }).click()
  await host.getByTestId("host-present-from-host-btn").click()
  await expect(shell).toHaveAttribute("data-host-presenting", "true")
  await expect(host.getByTestId("manager-control-toolbar")).toHaveCount(0)

  const scene = async (name: string) => {
    await expect(host.locator(`[data-v4-scene="${name}"]`)).toBeVisible({
      timeout: 20_000,
    })
    await expect(display.locator(`[data-v4-scene="${name}"]`)).toBeVisible({
      timeout: 20_000,
    })
  }
  const advance = async () => {
    await host.keyboard.press("ArrowRight")
    await host.waitForTimeout(500)
  }

  await scene("company-opening")
  await host.screenshot({ path: join(evidence, "01-company-opening.png") })
  await advance()
  await scene("grand-opening")
  await advance()
  await scene("representative-directory")
  await expect(host.locator(".full-rep-row")).toHaveCount(40)
  await expect(host.locator(".full-rep-row.connected")).toHaveCount(0)
  await host.screenshot({ path: join(evidence, "02-directory-40.png") })
  // Advance directly from the full directory. The four 10-table duplicates were removed.
  await advance()
  await scene("phone-instructions")
  await expect(host.locator(".full-phone-key")).toHaveCount(12)
  await advance()
  await scene("connection-readiness")
  await expect(host.locator(".full-table-led")).toHaveCount(40)
  await advance()
  await scene("round-one")
  await expect(audio).toHaveAttribute(
    "data-audio-url",
    "/media/tadazz-prepare-to-fight-20261106.mp3",
  )
  await host.screenshot({ path: join(evidence, "03-round-one.png") })
  await advance()

  for (let question = 0; question < 10; question += 1) {
    const pads = players.map((player) =>
      player.getByTestId("tadazz-pad-option-0"),
    )
    await expect(pads[0]).toBeVisible({ timeout: 20_000 })
    await expect(host.locator(".tzv4-stage .answer-card")).toHaveCount(5)
    await expect
      .poll(() =>
        host
          .locator(".tzv4-stage .answer-image")
          .evaluateAll(
            (images) =>
              images.length === 5 &&
              images.every(
                (image) => (image as HTMLImageElement).naturalWidth > 0,
              ),
          ),
      )
      .toBe(true)
    await expect(audio).toHaveAttribute(
      "data-audio-url",
      "/media/tzila-determined-pursuit-20261105.mp3",
    )
    await expect(audio).toHaveAttribute("data-audio-loop", "true")

    if (question === 0) {
      await host.keyboard.press("p")
      await expect(shell).toHaveAttribute("data-game-paused", "true")
      await expect(pads[0]).toBeDisabled()
      await host.keyboard.press("p")
      await expect(shell).toHaveAttribute("data-game-paused", "false")
    }

    const choices =
      question === 1
        ? [0, 0, 1, 1]
        : [question % 5, question % 5, question % 5, (question + 1) % 5]
    for (let player = 0; player < players.length; player += 1)
      await players[player]
        .getByTestId(`tadazz-pad-option-${choices[player]}`)
        .click()
    if (question === 0) await host.keyboard.press("t")
    else await endTimer(host)
    await expect(
      host.locator(".tzv4-stage .result-percentage").first(),
    ).toBeVisible({ timeout: 20_000 })
    for (const player of players)
      await expect(player.locator(".result-percentage").first()).toBeVisible()
    await expect(audio).toHaveAttribute(
      "data-audio-url",
      "/media/tadazz-determination-20261106.mp3",
    )
    await expect(
      display.locator(".tzv4-stage .result-percentage").first(),
    ).toBeVisible()
    await host.screenshot({
      path: join(
        evidence,
        `result-${String(question + 1).padStart(2, "0")}.png`,
      ),
    })
    await host.waitForTimeout(1800)
    if (question === 0) {
      await host.keyboard.press("Escape")
      await expect(host.getByTestId("manager-control-toolbar")).toBeVisible()
    }
    await nextHost(host)

    if (question === 1) {
      await scene("tie-break")
      await host.getByTestId("host-resolve-tie-1").click()
      await expect(display.locator(".full-tie-card.chosen")).toBeVisible()
      await nextHost(host)
    }

    await scene("top-pick")
    await nextHost(host)
    await scene("story-progress")
    await nextHost(host)

    if (question === 4 || question === 9) {
      await scene("round-recap")
      await expect(audio).toHaveAttribute(
        "data-audio-url",
        "/media/tadazz-fantasy-orchestral-20261106.mp3",
      )
      await nextHost(host)
      await scene("story-assembly")
      await nextHost(host)
      await scene("story-live")
      if (question === 4) {
        await nextHost(host)
        await scene("interlude")
        await nextHost(host)
        await host.waitForTimeout(600)
        await nextHost(host)
        await host.waitForTimeout(600)
        await nextHost(host)
      } else {
        await nextHost(host)
      }
    }
  }

  await scene("grand-finale")
  await expect(audio).toHaveAttribute(
    "data-audio-url",
    "/media/tadazz-epic-endgame-20261106.mp3",
  )
  await host.getByTestId("host-present-from-host-btn").click()
  await expect(shell).toHaveAttribute("data-host-presenting", "true")
  await expect(host.getByTestId("manager-control-toolbar")).toHaveCount(0)
  await host.screenshot({ path: join(evidence, "99-grand-finale.png") })
  await host.keyboard.press("Escape")
  await expect(host.getByTestId("manager-control-toolbar")).toBeVisible()

  for (const context of playerContexts) await context.close()
  await displayContext.close()
})
