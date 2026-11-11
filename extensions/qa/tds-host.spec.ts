import { expect, test, type Page, type Locator } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { registerSynthetic } from "./tds-site-fixture"
import {
  createDefaultQuizExtrasV2,
  computeCanonicalBaseDigest,
} from "../src/core"
import { joinGame, answer } from "../../packages/e2e/utils/player"

type WireEvent = {
  name: string
  payload?: { action?: string; payload?: Record<string, unknown> }
}
type ObservedWindow = Window & {
  __tdsEvents: WireEvent[]
  __socket: {
    onAnyOutgoing: (
      listener: (name: string, payload?: WireEvent["payload"]) => void,
    ) => void
  }
}
async function openHost(page: Page) {
  const headers = await registerSynthetic(page)
  const quizz = {
    subject: "Host controls QA",
    gameMode: "quiz",
    questions: [
      "First host question?",
      "Second host question?",
      "Third host question?",
    ].map((question) => ({
      type: "single",
      question,
      answers: ["Yes", "No"],
      solutions: [0],
      cooldown: 3,
      time: 600,
    })),
  }
  const extras = createDefaultQuizExtrasV2(
    "draft",
    quizz.questions.map(() => crypto.randomUUID()),
    computeCanonicalBaseDigest(quizz),
  )
  expect(
    (
      await page.request.post("/api/extensions/quizzes", {
        headers,
        data: { quizz, extras },
      })
    ).ok(),
  ).toBe(true)
  await page.goto("/studio/games")
  await page.getByRole("link", { name: "Prepare show", exact: true }).click()
  await page
    .getByRole("button", { name: "Open show room", exact: true })
    .click()
  await expect(page.getByTestId("manager-control-toolbar")).toBeVisible()
  const url = await page
    .locator("svg[data-qr-url]")
    .first()
    .getAttribute("data-qr-url")
  expect(url).toBeTruthy()
  await page.evaluate(() => {
    const win = window as ObservedWindow
    win.__tdsEvents = []
    win.__socket.onAnyOutgoing((name, payload) => {
      win.__tdsEvents.push({ name, payload })
    })
  })
  return {
    pin: new URL(url!).searchParams.get("pin")!,
    gameId: /manager\/([^/?#]+)/u.exec(page.url())![1],
    url: url!,
  }
}
async function commandCount(page: Page, action?: string) {
  return page.evaluate(
    (action) =>
      (window as ObservedWindow).__tdsEvents.filter(
        (event) =>
          event.name === "extensions:command" &&
          (!action || event.payload?.action === action),
      ).length,
    action,
  )
}
async function emptyFocus(page: Page) {
  await page.locator("body").click({ position: { x: 2, y: 200 } })
}
async function doubleKey(page: Page, key: string) {
  await page.keyboard.press(key)
  await page.waitForTimeout(80)
  await page.keyboard.press(key)
}
async function fullscreen(page: Page) {
  if (!(await page.evaluate(() => Boolean(document.fullscreenElement)))) {
    await page.getByRole("button", { name: "Fullscreen", exact: true }).click()
    await expect
      .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(true)
  }
}
async function assertPortal(dialog: Locator) {
  await expect(dialog).toBeVisible()
  expect(
    await dialog.evaluate((node) => document.fullscreenElement?.contains(node)),
  ).toBe(true)
  expect(
    await dialog.evaluate((node) =>
      node
        .closest("[data-platform-scope]")
        ?.getAttribute("data-platform-scope"),
    ),
  ).toBe("platform.host")
}

test("display modes stay distinct; actual clipboard, clean audience/local presentation and fullscreen modal focus", async ({
  page,
  context,
}) => {
  const room = await openHost(page)
  await expect(
    page.getByTestId("host-display-controls").getByRole("button"),
  ).toHaveCount(3)
  await expect(page.getByTestId("host-previous-screen-btn")).toBeDisabled()
  await expect(
    page.getByRole("button", { name: "Lock the room", exact: true }),
  ).toHaveCount(1)
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:4310",
  })
  await page.getByTestId("host-copy-display-btn").click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`http://127.0.0.1:4310/display/${room.gameId}`)
  const popupPromise = page.waitForEvent("popup")
  await page.getByTestId("host-open-display-btn").click()
  const audience = await popupPromise
  await expect(audience).toHaveURL(new RegExp(`/display/${room.gameId}$`, "u"))
  await expect(audience.getByTestId("tadazz-show")).toHaveAttribute(
    "data-role",
    "spectator",
  )
  await expect(audience.getByTestId("manager-control-toolbar")).toHaveCount(0)
  await expect(audience.getByTestId("host-control-footer")).toHaveCount(0)
  await expect(audience.getByTestId("host-audio-scope")).toHaveCount(0)
  await expect(audience.getByTestId("tadazz-screen-lobby")).toBeVisible()
  await expect(audience.getByTestId("tadazz-opening")).toHaveCount(0, {
    timeout: 45000,
  })
  await audience
    .getByRole("button", { name: "Show QR code", exact: true })
    .click()
  const audienceQr = audience.getByRole("alertdialog", {
    name: "Show QR code",
    exact: true,
  })
  await expect(audienceQr).toBeVisible()
  await expect(audienceQr).toHaveAccessibleDescription(
    new RegExp(room.pin, "u"),
  )
  await expect(
    audienceQr.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused()
  await audienceQr
    .locator("svg[data-qr-url]")
    .screenshot({ path: "/evidence/phase-08-audience-qr.png" })
  expect(
    execFileSync(
      "zbarimg",
      ["--quiet", "--raw", "/evidence/phase-08-audience-qr.png"],
      { encoding: "utf8" },
    ).trim(),
  ).toBe(room.url)
  await audience.keyboard.press("Escape")
  await expect(audienceQr).toHaveCount(0)
  await audience.close()
  await page.getByTestId("host-present-from-host-btn").click()
  await expect(page.getByTestId("tadazz-show")).toHaveAttribute(
    "data-host-presenting",
    "true",
  )
  await expect(page.getByTestId("manager-control-toolbar")).toHaveCount(0)
  await expect(page.getByTestId("host-control-footer")).toHaveCount(0)
  await expect(page.getByTestId("host-audio-scope")).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true)
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("manager-control-toolbar")).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(false)
  for (const [name, trigger] of [
    ["shortcuts", page.getByTestId("host-shortcuts-btn")],
    [
      "settings",
      page.getByRole("button", { name: "Game settings", exact: true }),
    ],
    ["roster", page.getByTestId("host-bottom-players-btn")],
  ] as const) {
    await fullscreen(page)
    await trigger.click()
    const dialog = page.getByRole("dialog")
    await assertPortal(dialog)
    const before = await commandCount(page)
    await dialog.focus()
    await doubleKey(page, "ArrowRight")
    await doubleKey(page, "Enter")
    expect(await commandCount(page)).toBe(before)
    await page.keyboard.press("Tab")
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true)
    await page.screenshot({
      path: `/evidence/phase-08-fullscreen-${name}.png`,
      animations: "disabled",
    })
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }
  await fullscreen(page)
  const trigger = page.getByRole("button", {
    name: "Show QR code",
    exact: true,
  })
  await trigger.click()
  const qr = page.getByRole("alertdialog", {
    name: "Show QR code",
    exact: true,
  })
  await assertPortal(qr)
  await expect(qr).toHaveAccessibleDescription(new RegExp(room.pin, "u"))
  await expect(
    qr.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused()
  await qr
    .locator("svg[data-qr-url]")
    .screenshot({ path: "/evidence/phase-08-host-qr.png" })
  expect(
    execFileSync(
      "zbarimg",
      ["--quiet", "--raw", "/evidence/phase-08-host-qr.png"],
      { encoding: "utf8" },
    ).trim(),
  ).toBe(room.url)
  await page.keyboard.press("Escape")
  await expect(qr).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test("real game pause/audio/half-second shortcuts remain separate; end timer keeps submitted vote and history replay confirms once", async ({
  page,
  browser,
}) => {
  const room = await openHost(page)
  const playerContext = await browser.newContext({
    baseURL: "http://127.0.0.1:4310",
  })
  const player = await playerContext.newPage()
  await joinGame(player, room.pin, "HostFlowPlayer")
  await expect(page.getByTestId("host-connected-counter")).toHaveText(
    /^1\s*\//u,
  )
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await expect(page.getByTestId("host-end-timer-btn")).toBeVisible()
  const frame = page.getByTestId("tadazz-show")
  await page.getByTestId("host-pause-resume-btn").click()
  await expect(frame).toHaveAttribute("data-game-paused", "true")
  expect(await commandCount(page, "PAUSE_GAME")).toBe(1)
  const beforeAudio = await commandCount(page)
  await expect(page.getByTestId("host-audio-scope")).toHaveCount(1)
  await expect(player.getByTestId("host-audio-scope")).toHaveCount(0)
  await page.getByRole("button", { name: "Pause audio", exact: true }).click()
  await page.getByRole("button", { name: "Play audio", exact: true }).click()
  expect(await commandCount(page)).toBe(beforeAudio)
  await expect(frame).toHaveAttribute("data-game-paused", "true")
  await expect(page.getByTestId("host-pause-resume-btn")).toBeEnabled()
  await page.getByTestId("host-pause-resume-btn").click()
  await expect(frame).toHaveAttribute("data-game-paused", "false")
  await emptyFocus(page)
  const beforeKeys = await commandCount(page, "PAUSE_GAME")
  await page.keyboard.press("Space")
  await page.waitForTimeout(600)
  await page.keyboard.press("Space")
  await page.waitForTimeout(600)
  expect(await commandCount(page, "PAUSE_GAME")).toBe(beforeKeys)
  await doubleKey(page, "Space")
  await expect(frame).toHaveAttribute("data-game-paused", "true")
  expect(await commandCount(page, "PAUSE_GAME")).toBe(beforeKeys + 1)
  await page.waitForTimeout(1000)
  await doubleKey(page, "Space")
  await expect(frame).toHaveAttribute("data-game-paused", "false")
  await answer(player, "Yes")
  await expect(page.getByTestId("stage-hud-answer-counter")).toContainText(
    "1/1",
  )
  await page.getByTestId("host-end-timer-btn").click()
  expect(await commandCount(page, "END_ANSWER_TIMER")).toBe(1)
  expect(await commandCount(page, "SKIP_QUESTION")).toBe(0)
  await expect(page.getByTestId("host-next-screen-btn")).toBeEnabled()
  await page.getByTestId("host-next-screen-btn").click()
  await expect(page.getByTestId("host-history-btn")).toBeVisible()
  await fullscreen(page)
  await page.getByTestId("host-history-btn").click()
  const history = page.getByTestId("history-dialog-content")
  await assertPortal(history)
  await history.getByTestId("history-tab-0").click()
  await expect(history).toContainText("1 answers")
  await expect(history).toContainText("First host question?")
  await history
    .getByRole("button", { name: "Replay From Here", exact: true })
    .click()
  const replay = page.getByRole("alertdialog", {
    name: "Replay from checkpoint?",
    exact: true,
  })
  await assertPortal(replay)
  await replay.getByRole("button", { name: "Cancel", exact: true }).click()
  expect(await commandCount(page, "REPLAY_FROM_CHECKPOINT")).toBe(0)
  await history
    .getByRole("button", { name: "Replay From Here", exact: true })
    .click()
  await replay
    .getByRole("button", { name: "Replay From Here", exact: true })
    .click()
  await expect.poll(() => commandCount(page, "REPLAY_FROM_CHECKPOINT")).toBe(1)
  await expect(history).toHaveCount(0)
  await page.screenshot({
    path: "/evidence/phase-08-history-replay.png",
    animations: "disabled",
  })
  await playerContext.close()
})

test("restart and skip keep original confirmations and one command per explicit confirmation", async ({
  page,
  browser,
}) => {
  const room = await openHost(page)
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:4310" })
  await joinGame(await context.newPage(), room.pin, "RestartPlayer")
  await expect(page.getByTestId("host-connected-counter")).toHaveText(
    /^1\s*\//u,
  )
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await expect(page.getByTestId("host-restart-question-btn")).toBeEnabled()
  await page.getByTestId("host-restart-question-btn").click()
  const restart = page.getByRole("alertdialog", {
    name: "Restart question",
    exact: true,
  })
  await restart.getByRole("button", { name: "Cancel", exact: true }).click()
  expect(await commandCount(page, "REPLAY_FROM_CHECKPOINT")).toBe(0)
  await page.getByTestId("host-restart-question-btn").click()
  await page.getByTestId("confirm-restart-question-btn").click()
  await expect.poll(() => commandCount(page, "REPLAY_FROM_CHECKPOINT")).toBe(1)
  await expect(page.getByTestId("host-skip-question-btn")).toBeEnabled()
  await page.getByTestId("host-skip-question-btn").click()
  const skip = page.getByRole("alertdialog", {
    name: "Skip this question?",
    exact: true,
  })
  await expect(skip).toContainText("Answers will be discarded")
  expect(await commandCount(page, "SKIP_QUESTION")).toBe(0)
  await skip.getByRole("button", { name: "Skip Question", exact: true }).click()
  await expect.poll(() => commandCount(page, "SKIP_QUESTION")).toBe(1)
  expect(await commandCount(page, "END_ANSWER_TIMER")).toBe(0)
  await page.screenshot({
    path: "/evidence/phase-08-skip.png",
    animations: "disabled",
  })
  await context.close()
})

test("touch host controls and compact landscape dialogs keep named reachable close actions", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4310",
    hasTouch: true,
    viewport: { width: 1024, height: 768 },
  })
  const page = await context.newPage()
  const room = await openHost(page)
  await page.getByTestId("host-shortcuts-btn").tap()
  const dialog = page.getByTestId("host-shortcuts-dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Close", exact: true }).tap()
  await expect(dialog).toHaveCount(0)
  await page.setViewportSize({ width: 640, height: 400 })
  await page.getByRole("button", { name: "Game settings", exact: true }).tap()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .tap()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await emptyFocus(page)
  const qr = page.locator("svg[data-qr-url]").first()
  await expect(page.getByText(room.pin, { exact: true })).toBeVisible()
  const bounds = (await qr.boundingBox())!,
    surface = (await page.getByTestId("native-game-surface").boundingBox())!
  expect(bounds.y).toBeGreaterThanOrEqual(surface.y)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(
    surface.y + surface.height + 0.5,
  )
  await qr.screenshot({ path: "/evidence/phase-08-compact-qr.png" })
  expect(
    execFileSync(
      "zbarimg",
      ["--quiet", "--raw", "/evidence/phase-08-compact-qr.png"],
      { encoding: "utf8" },
    ).trim(),
  ).toBe(room.url)
  await page.screenshot({
    path: "/evidence/phase-08-touch-compact.png",
    animations: "disabled",
  })
  await context.close()
})

test("legacy settings switches use visible token thumbs and preserve a real confirmed server save", async ({
  page,
}) => {
  const room = await openHost(page)
  const trigger = page.getByRole("button", {
    name: "Game settings",
    exact: true,
  })
  await trigger.click()
  const dialog = page.getByRole("dialog"),
    toggle = dialog.getByRole("switch", {
      name: "End timer when everyone has answered",
      exact: true,
    })
  await expect(toggle).not.toBeChecked()
  const skin = await toggle.evaluate((node) => ({
    track: getComputedStyle(node).backgroundColor,
    thumb: getComputedStyle(node.querySelector("span")!).backgroundColor,
    height: node.getBoundingClientRect().height,
  }))
  expect(skin.track).not.toBe(skin.thumb)
  expect(skin.height).toBe(28)
  await toggle.click()
  await expect(toggle).toBeChecked()
  const patches: string[] = []
  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      request.url().endsWith(`/api/games/${room.gameId}/settings`)
    )
      patches.push(request.postData()!)
  })
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/games/${room.gameId}/settings`) &&
      response.request().method() === "PATCH",
  )
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  const response = await saved
  expect(response.ok()).toBe(true)
  expect((await response.json()).settings.endOnAllAnswered).toBe(true)
  expect(patches).toHaveLength(1)
  await expect(dialog).toHaveCount(0)
  await trigger.click()
  await expect(toggle).toBeChecked()
  await page.screenshot({
    path: "/evidence/phase-08-settings-saved.png",
    animations: "disabled",
  })
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
})
