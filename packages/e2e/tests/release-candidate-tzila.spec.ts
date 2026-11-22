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
  const sidecar = await request.get(
    "/api/extensions/quizzes/0KTcUgc0uvF_vGWYHrpTJ",
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(sidecar.ok(), await sidecar.text()).toBe(true)
  const saved = (await sidecar.json()) as {
    extras: import("../../../extensions/src/core").QuizExtrasV2
  }
  const directoryScenes = Object.values(saved.extras.scenes).filter(
    (scene) =>
      scene.kind === "animation" && scene.preset === "representative-directory",
  )
  expect(directoryScenes).toHaveLength(1)
  const directory = directoryScenes.at(0)

  if (directory?.kind !== "animation") {
    throw new Error("The staged fixture must retain its saved directory scene")
  }

  expect(directory.seatingPlan).toBeUndefined()
  expect(directory.representatives).toBeUndefined()
  expect(saved.extras.defaults.lobby).toBeUndefined()
  expect(saved.extras.questionIds).toHaveLength(10)
  // This saved revision has no authored artwork or opening card. The shared
  // platform ident is the sole opening owner; unused directory data serves its lobby.
  expect(
    Object.values(saved.extras.scenes).filter(
      (scene) => scene.kind === "animation" && scene.eventArtworkUrl,
    ),
  ).toEqual([])
  const firstCard = saved.extras.timeline.at(0)

  if (firstCard?.kind !== "animation") {
    throw new Error(
      "The staged timeline must begin with its authored round-one card",
    )
  }

  expect(saved.extras.scenes[firstCard.sceneId]).toMatchObject({
    kind: "animation",
    preset: "round-one",
  })
  const namesByTable = new Map<number, string[]>()

  for (const participant of saved.extras.roster.participants) {
    const { tableNumber, displayName } = participant
    expect(Number.isInteger(tableNumber)).toBe(true)

    if (tableNumber === undefined) {
      throw new Error(
        "Every staged representative must retain an explicit table",
      )
    }

    expect(tableNumber).toBeGreaterThanOrEqual(1)
    expect(tableNumber).toBeLessThanOrEqual(31)
    const names = namesByTable.get(tableNumber) ?? []
    names.push(displayName)
    namesByTable.set(tableNumber, names)
  }

  expect(namesByTable.size).toBe(31)

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

  const platformOpening = page.getByTestId("platform-game-opening")
  const audio = page.getByTestId("audio-cue-player-state")
  await expect(platformOpening).toHaveCount(1)
  await expect(platformOpening).toHaveAttribute(
    "data-platform-opening-stage",
    "standby",
  )
  await expect(page.getByTestId("tadazz-opening")).toHaveCount(0)
  await expect(audio).toHaveCount(1)
  await expect(page.getByTestId("tadazz-opening-video")).toHaveCount(0)
  await page.getByTestId("platform-opening-start").click()
  await expect(platformOpening).toHaveAttribute(
    "data-platform-opening-stage",
    "opening",
  )
  const opening = page.getByTestId("tadazz-opening")
  await expect(opening).toHaveCount(1)
  await expect(opening).toHaveAttribute("data-opening-phase", "brand")
  await expect(page.getByTestId("tadazz-opening-event-artwork")).toHaveCount(0)
  const video = page.getByTestId("tadazz-opening-video")
  await expect(video).toBeVisible()
  expect(
    await video.evaluate(
      (element: HTMLVideoElement) => element.muted && element.volume === 0,
    ),
  ).toBe(true)
  await expect(audio).toHaveCount(1)
  await expect(audio).toHaveAttribute(
    "data-audio-url",
    "/media/tadazz-production-intro-20261106.wav",
  )
  await expect(audio).toHaveAttribute("data-should-play", "true")
  await page.getByTestId("platform-opening-skip").click()
  await expect(platformOpening).toHaveCount(0)
  await expect(opening).toHaveCount(0)
  await expect(page.getByTestId("tadazz-lobby-pin")).toHaveText(/^\d{6}$/u)
  await expect(page.getByTestId("tadazz-lobby-qr")).toBeVisible()
  const lobbyDirectory = page.getByTestId("tadazz-full-directory")
  const seats = lobbyDirectory.locator(".table-unit")
  await expect(seats).toHaveCount(31)

  for (const [table, names] of namesByTable) {
    const seat = lobbyDirectory.locator(`.table-unit[data-table="${table}"]`)
    await expect(seat).toHaveCount(1)
    await expect(seat).toBeVisible()
    const label = await seat.getAttribute("aria-label")

    for (const name of names) {
      expect(label).toContain(name)
    }
  }
  await expect(
    page.getByText("+44 330 613 1984", { exact: true }),
  ).toBeVisible()
  await expect(lobbyDirectory.locator(".table-unit.connected")).toHaveCount(0)
  await expect(audio).toHaveCount(1)
  await expect(audio).toHaveAttribute(
    "data-audio-url",
    "/media/tadazz-exploration-20261106.mp3",
  )
  await expect(audio).toHaveAttribute("data-should-play", "true")
  const code = await page.getByTestId("tadazz-lobby-pin").textContent()
  const representative = saved.extras.roster.participants.at(0)

  if (!code || !representative?.tableNumber) {
    throw new Error(
      "The staged fixture must expose a PIN and a saved representative table",
    )
  }

  expect(
    saved.extras.roster.participants.filter(
      (person) =>
        person.displayName.trim().toLocaleLowerCase() ===
        representative.displayName.trim().toLocaleLowerCase(),
    ),
  ).toHaveLength(1)
  const playerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const player = await playerContext.newPage()
  await joinGame(player, code, representative.displayName)
  await expect(
    lobbyDirectory.locator(
      `.table-unit[data-table="${representative.tableNumber}"]`,
    ),
  ).toHaveAttribute("data-connected", "true")
  await expect(lobbyDirectory.locator(".table-unit.connected")).toHaveCount(1)

  await page.getByRole("button", { name: "Start", exact: true }).click()
  await expect(page.locator('[data-v4-scene="round-one"]')).toBeVisible()
  // The platform ident and saved table directory precede the authored timeline.
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
  const after = await request.get(
    "/api/extensions/quizzes/0KTcUgc0uvF_vGWYHrpTJ",
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(after.ok(), await after.text()).toBe(true)
  const unchanged = (await after.json()) as typeof saved
  expect(unchanged.extras).toEqual(saved.extras)
  await playerContext.close()
})
