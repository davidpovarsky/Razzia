import { expect, test } from "@playwright/test"
import { joinGame } from "../utils/player"

const token = process.env.TADAZZ_LIVE_QA_TOKEN
const title = "Build Our Story — Tzila · Two-Round Audience Vote"

test("final live Tzila smoke: real room, host presentation, pause, vote, results audio", async ({
  page: host,
  browser,
}) => {
  test.skip(!token, "TADAZZ_LIVE_QA_TOKEN is required")
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
  await host.getByRole("button", { name: title, exact: true }).click()
  await host.getByRole("button", { name: "Start game", exact: true }).click()
  await expect(host.getByTestId("tadazz-opening-video")).toBeVisible()
  await host.getByTestId("tadazz-opening-skip").click()
  const code = (await host.getByTestId("tadazz-lobby-pin").textContent())!
  await expect(host.getByTestId("tadazz-lobby-qr")).toBeVisible()

  const playerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const player = await playerContext.newPage()
  await joinGame(player, code, "Final live QA")
  await host.waitForTimeout(1200)
  await host.getByRole("button", { name: "Start", exact: true }).click()
  await host.getByTestId("host-present-from-host-btn").click()
  await expect(host.getByTestId("tadazz-show")).toHaveAttribute(
    "data-host-presenting",
    "true",
  )
  await expect(host.getByTestId("manager-control-toolbar")).toHaveCount(0)

  for (const expected of [
    "company-opening",
    "grand-opening",
    "representative-directory",
    "representative-directory",
    "representative-directory",
    "representative-directory",
    "representative-directory",
    "phone-instructions",
    "connection-readiness",
    "round-one",
  ]) {
    await expect(host.locator(`[data-v4-scene="${expected}"]`)).toBeVisible({
      timeout: 20_000,
    })
    await host.keyboard.press("ArrowRight")
    await host.waitForTimeout(650)
  }

  await expect(player.getByTestId("tadazz-pad-option-0")).toBeVisible({
    timeout: 20_000,
  })
  const audio = host.getByTestId("audio-cue-player-state")
  await expect(audio).toHaveAttribute(
    "data-audio-url",
    "/media/tzila-determined-pursuit-20261105.mp3",
  )
  await expect(audio).toHaveAttribute("data-audio-loop", "true")
  await host.keyboard.press("p")
  await expect(host.getByTestId("tadazz-show")).toHaveAttribute(
    "data-game-paused",
    "true",
  )
  await host.keyboard.press("p")
  await expect(host.getByTestId("tadazz-show")).toHaveAttribute(
    "data-game-paused",
    "false",
  )
  await player.getByTestId("tadazz-pad-option-0").click()
  await host.keyboard.press("t")
  await expect(host.locator(".result-percentage").first()).toBeVisible({
    timeout: 20_000,
  })
  await expect(audio).toHaveAttribute(
    "data-audio-url",
    "/media/tadazz-determination-20261106.mp3",
  )
  await host.keyboard.press("Escape")
  await expect(host.getByTestId("manager-control-toolbar")).toBeVisible()
  await playerContext.close()
})
