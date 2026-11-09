import { expect, test } from "@playwright/test"
import { createHash } from "node:crypto"
import { loginManager } from "../utils/manager"
import { joinGame } from "../utils/player"

const title = "Creating Worlds"
const media = [
  [
    "tadazz-determination-20261106.mp3",
    "6a9821e5320933dd0b4445847911287563ec794cf0162291b882ffbb07fa1ebc",
  ],
  [
    "tadazz-determined-pursuit-20261106.mp3",
    "fa7e3e895f7968e5c5a249eef9d7020906ed547ba029290fece5fc6a1551c4c7",
  ],
  [
    "tadazz-boss-battle-20261106.mp3",
    "84cb8fc344ae1d52a9c8d25d38a633137994a9632c8a68568f38418a5a3f1960",
  ],
  [
    "tadazz-prepare-to-fight-20261106.mp3",
    "755aa38c6583016480671354bde7aabf2f1ada789eb2c99b3e2504e507cf4ed6",
  ],
  [
    "tadazz-epic-endgame-20261106.mp3",
    "b0ae9562d2c9c8e3a5d445789ed9e1f6f0b201bdc2b57f07897eac9a03a66c36",
  ],
  [
    "tadazz-exploration-20261106.mp3",
    "432f9dc04fbbcffe9f14e5559e2d17a9167d7a2ca5fb5bc887543200ad6248a8",
  ],
  [
    "tadazz-fantasy-orchestral-20261106.mp3",
    "8bc3c4df066c16916bd6a44008bcbd571e06396f4b335013e9c11c81d6239c15",
  ],
  [
    "tadazz-production-intro-20261106.wav",
    "65aca17e6c1b0ff067aeda6251c900e3a4eff3033c018598002f2a6432b05c07",
  ],
] as const

test("staged Tzila release has exact media, QR, roster, soundtrack and same-window presentation", async ({
  page,
  request,
  browser,
}) => {
  page.on("console", (message) =>
    console.log("CONSOLE", message.type(), message.text()),
  )
  page.on("websocket", (socket) => {
    socket.on("framesent", (frame) =>
      console.log("WS_SENT", String(frame.payload).slice(0, 500)),
    )
    socket.on("framereceived", (frame) => {
      const value = String(frame.payload)

      if (
        value.includes("error") ||
        value.includes("START") ||
        value.includes("extensions:state")
      ) {
        console.log("WS_RECV", value.slice(0, 1000))
      }
    })
  })
  const auth = await request.post("/api/auth/manager", {
    data: { password: "e2e-password" },
  })
  expect(auth.ok(), await auth.text()).toBe(true)
  const { token } = (await auth.json()) as { token: string }

  for (const [name, expected] of media) {
    const response = await request.get(`/media/${name}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(response.status(), name).toBe(200)
    expect(
      createHash("sha256")
        .update(await response.body())
        .digest("hex"),
      name,
    ).toBe(expected)
  }

  await loginManager(page)
  await page.getByRole("button", { name: title, exact: true }).click()
  await page.getByRole("button", { name: "Start game", exact: true }).click()

  const opening = page.getByTestId("tadazz-opening")
  await expect(opening).toHaveAttribute("data-opening-phase", "event-artwork")
  await expect(page.getByTestId("tadazz-opening-event-artwork")).toBeVisible()
  await expect(page.getByTestId("tadazz-opening-video")).toHaveCount(0)
  await expect(opening).toHaveAttribute("data-opening-phase", "brand")
  await expect(page.getByTestId("tadazz-opening-event-artwork")).toHaveCount(0)
  const video = page.getByTestId("tadazz-opening-video")
  await expect(video).toBeVisible()
  expect(
    await video.evaluate(
      (element: HTMLVideoElement) => element.muted && element.volume === 0,
    ),
  ).toBe(true)
  await expect(page.getByTestId("audio-cue-player-state")).toHaveAttribute(
    "data-audio-url",
    "/media/tadazz-production-intro-20261106.wav",
  )
  await page.getByTestId("tadazz-opening-skip").click()
  await expect(page.getByTestId("tadazz-lobby-pin")).toHaveText(/^\d{6}$/u)
  await expect(page.getByTestId("tadazz-lobby-qr")).toBeVisible()
  await expect(page.getByTestId("tadazz-lobby-representative")).toHaveCount(31)
  await expect(
    page.getByText("+44 330 613 1984", { exact: true }),
  ).toBeVisible()
  await expect(page.locator(".tz-lobby-show-rep.connected")).toHaveCount(0)
  await expect(page.getByTestId("audio-cue-player-state")).toHaveAttribute(
    "data-audio-url",
    "/media/tadazz-exploration-20261106.mp3",
  )
  const code = (await page.getByTestId("tadazz-lobby-pin").textContent())!
  const playerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const player = await playerContext.newPage()
  const sidecar = await request.get(
    "/api/extensions/quizzes/0KTcUgc0uvF_vGWYHrpTJ",
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const saved = (await sidecar.json()) as {
    extras: import("../../../extensions/src/core").QuizExtrasV2
  }
  await joinGame(player, code, saved.extras.roster.participants[0].displayName)
  await page.waitForTimeout(1500)

  await page.getByRole("button", { name: "Start", exact: true }).click()
  await expect(page.locator('[data-v4-scene="round-one"]')).toBeVisible()
  // The artwork and 40-person roster belong BEFORE Start, never on the timeline.
  await expect(page.locator('[data-v4-scene="company-opening"]')).toHaveCount(0)
  await expect(
    page.locator('[data-v4-scene="representative-directory"]'),
  ).toHaveCount(0)
  await expect(page.locator('[data-v4-scene="interimResults"]')).toHaveCount(0)

  const originalUrl = page.url()
  await page.getByTestId("host-present-from-host-btn").click()
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-host-presenting",
    "true",
  )
  await expect(page.getByTestId("manager-control-toolbar")).toHaveCount(0)
  await expect(page.getByTestId("tadazz-host-controls")).toHaveCount(0)
  await expect(page.locator('[data-v4-scene="round-one"]')).toBeVisible()
  expect(page.url()).toBe(originalUrl)
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("manager-control-toolbar")).toBeVisible()
  await playerContext.close()
})
