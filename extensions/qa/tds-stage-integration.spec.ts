import { test, expect, type Page } from "@playwright/test"
import { execFileSync } from "node:child_process"
import {
  createDefaultQuizExtrasV2,
  computeCanonicalBaseDigest,
} from "../src/core"
import { registerSynthetic } from "./tds-site-fixture"
import { joinGame } from "../../packages/e2e/utils/player"

async function settlePublicLobby(page: Page) {
  await expect(page.getByTestId("tadazz-screen-lobby")).toBeVisible()
  await expect(page.getByTestId("tadazz-opening")).toHaveCount(0, {
    timeout: 45000,
  })
}

async function openRoom(page: Page, phone = false, background?: string) {
  const headers = await registerSynthetic(page)
  const subject = phone
    ? "Synthetic Creating Worlds"
    : "Synthetic stage backdrop"
  const quizz = {
    subject,
    gameMode: "quiz",
    questions: [
      {
        type: "single",
        question: "Stage fixture?",
        answers: ["Yes", "No"],
        solutions: [0],
        cooldown: 3,
        time: 120,
      },
    ],
  }
  const extras = createDefaultQuizExtrasV2(
    "draft",
    [crypto.randomUUID()],
    computeCanonicalBaseDigest(quizz),
  )

  if (background) {
    extras.perQuestion[extras.questionIds[0]] = {
      background: {
        url: background,
        fit: "contain",
        position: "top",
        overlayOpacity: 0.2,
      },
    }
  }

  extras.roster.participants = [
    {
      rosterPlayerId: crypto.randomUUID(),
      displayName: "Private roster example",
      phoneE164: "+10000000000",
    },
  ]

  if (phone) {
    const id = crypto.randomUUID()
    extras.scenes[id] = {
      id,
      kind: "animation",
      preset: "representative-directory",
      title: "Synthetic directory",
      durationMs: 1000,
      advance: "manual",
      seatingPlan: true,
      dialNumber: "TEST-NO-CALLS",
      representatives: Array.from({ length: 40 }, (_, i) => ({
        table: (i % 20) + 1,
        name: `Demo${i + 1}`,
      })),
    }
  }

  expect(
    (
      await page.request.post("/api/extensions/quizzes", {
        headers,
        data: { quizz, extras },
      })
    ).ok(),
  ).toBe(true)
  await page.goto("/studio/games")
  await page
    .getByRole("link", { name: "Prepare show", exact: true })
    .first()
    .click()
  await page
    .getByRole("button", { name: "Open show room", exact: true })
    .click()
  await expect(page.getByTestId("manager-control-toolbar")).toBeVisible()
  const qr = page.locator("svg[data-qr-url]").first()
  await expect(qr).toBeVisible()
  const url = (await qr.getAttribute("data-qr-url"))!

  return {
    pin: new URL(url).searchParams.get("pin")!,
    url,
    gameId: /manager\/([^/?#]+)/u.exec(page.url())![1],
  }
}
test("actual host fills toolbar edges, keeps live joining/lock/reconnect and audience permissions", async ({
  page,
  browser,
}) => {
  const classroom: string[] = []
  page.on("request", (request) => {
    if (/\/assets\/background[-.]/u.test(request.url())) {
      classroom.push(request.url())
    }
  })
  await page.route("**/media/tds-background.png", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="indigo"/><circle cx="400" cy="225" r="100" fill="gold"/></svg>',
    }),
  )
  const room = await openRoom(page, false, "/media/tds-background.png")
  const frame = page.getByTestId("tadazz-show"),
    layers = page.getByTestId("show-viewport-layers")
  await expect(frame).toHaveAttribute("data-theme-viewport", "tadazz-classic")
  await expect(frame).toHaveCSS("background-image", /tadazz-show/u)
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [1280, 720],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height })
    expect(await layers.boundingBox()).toEqual(await frame.boundingBox())
    const geometry = await frame.boundingBox()
    expect(geometry).toEqual({ x: 0, y: 0, width, height })
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `/evidence/phase-07-host-${width}.png`,
      animations: "disabled",
    })
  }
  expect(classroom).toEqual([])
  await expect(page.getByTestId("room-dial-number")).toHaveCount(0)
  await page
    .locator("svg[data-qr-url]")
    .first()
    .screenshot({ path: "/evidence/phase-07-live-qr.png" })
  expect(
    execFileSync(
      "zbarimg",
      ["--quiet", "--raw", "/evidence/phase-07-live-qr.png"],
      { encoding: "utf8" },
    ).trim(),
  ).toBe(room.url)
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:4310" })
  const audience = await context.newPage()
  await audience.goto(`/display/${room.gameId}`)
  await settlePublicLobby(audience)
  await expect(audience.locator("svg[data-qr-url]").first()).toHaveAttribute(
    "data-qr-url",
    room.url,
  )
  await expect(audience.getByTestId("manager-control-toolbar")).toHaveCount(0)
  await expect(audience.getByTestId("host-bottom-players-btn")).toHaveCount(0)
  expect(await audience.locator("body").textContent()).not.toMatch(
    /Private roster example|10000000000/u,
  )
  await audience.screenshot({
    path: "/evidence/phase-07-audience-open.png",
    animations: "disabled",
  })
  await page
    .getByRole("button", { name: "Lock the room", exact: true })
    .first()
    .click()
  await expect(page.locator("svg[data-qr-url]")).toHaveCount(0)
  await expect(audience.locator("svg[data-qr-url]")).toHaveCount(0, {
    timeout: 7000,
  })
  await audience.screenshot({
    path: "/evidence/phase-07-audience-locked.png",
    animations: "disabled",
  })
  await page
    .getByRole("button", { name: "Unlock the room", exact: true })
    .first()
    .click()
  await expect(audience.locator("svg[data-qr-url]").first()).toHaveAttribute(
    "data-qr-url",
    room.url,
    { timeout: 7000 },
  )
  await audience.reload()
  await expect(audience.locator("svg[data-qr-url]").first()).toHaveAttribute(
    "data-qr-url",
    room.url,
  )
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true)
  expect(await layers.boundingBox()).toEqual(await frame.boundingBox())
  await page.screenshot({
    path: "/evidence/phase-07-host-browser-fullscreen.png",
    animations: "disabled",
  })
  await page.evaluate(() => document.exitFullscreen())
  const playerContext = await browser.newContext({
    baseURL: "http://127.0.0.1:4310",
  })
  const player = await playerContext.newPage()
  await joinGame(player, room.pin, "StagePlayer")
  await expect(page.getByTestId("host-connected-counter")).toHaveText(
    /^1\s*\//u,
  )
  await expect(player.getByTestId("manager-control-toolbar")).toHaveCount(0)
  await expect(player.getByTestId("host-bottom-players-btn")).toHaveCount(0)
  await page.getByRole("button", { name: "Start", exact: true }).click()
  const custom = page.getByTestId("stage-card-background")
  await expect(custom).toBeVisible()
  await expect(custom).toHaveAttribute("data-bg-fit", "contain")
  await expect(custom).toHaveAttribute("data-bg-position", "top")
  expect(await custom.boundingBox()).toEqual(await frame.boundingBox())
  await expect(custom.locator("img")).toHaveCSS("object-fit", "contain")
  await expect(custom.locator("img")).toHaveCSS("object-position", "50% 0%")
  expect(
    await custom
      .locator("img")
      .evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      ),
  ).toBe(true)
  await expect(page.getByTestId("stage-card-background")).toHaveCount(1)
  await page.screenshot({
    path: "/evidence/phase-07-custom-card-contain.png",
    animations: "disabled",
  })
  await playerContext.close()
  await context.close()
})
test("configured dial-in and Creating Worlds table layout share current PIN/QR without private roster data", async ({
  page,
  browser,
}) => {
  const room = await openRoom(page, true)
  await expect(page.getByTestId("room-dial-number")).toHaveText("TEST-NO-CALLS")
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4310",
    viewport: { width: 1920, height: 1080 },
  })
  const audience = await context.newPage()
  await audience.goto(`/display/${room.gameId}`)
  await settlePublicLobby(audience)
  await expect(
    audience.getByText("TEST-NO-CALLS", { exact: true }),
  ).toBeVisible()
  await expect(audience.locator('[data-table="20"]')).toHaveAttribute(
    "aria-label",
    /Demo40/u,
  )
  const tablePositions = await audience
    .locator("[data-table]")
    .evaluateAll((tables) =>
      tables.map((table) => ({
        id: table.getAttribute("data-table"),
        x: table.getBoundingClientRect().x,
        y: table.getBoundingClientRect().y,
      })),
    )
  await expect(audience.locator("svg[data-qr-url]")).toHaveAttribute(
    "data-qr-url",
    room.url,
  )
  expect(await audience.locator("body").textContent()).not.toMatch(
    /Private roster example|10000000000/u,
  )
  await audience.screenshot({
    path: "/evidence/phase-07-seating-before-decode.png",
    animations: "disabled",
  })
  await audience
    .locator("svg[data-qr-url]")
    .screenshot({ path: "/evidence/phase-07-seating-qr.png" })
  expect(
    execFileSync(
      "zbarimg",
      ["--quiet", "--raw", "/evidence/phase-07-seating-qr.png"],
      { encoding: "utf8" },
    ).trim(),
  ).toBe(room.url)
  await audience.screenshot({
    path: "/evidence/phase-07-creating-worlds.png",
    animations: "disabled",
  })
  await page
    .getByRole("button", { name: "Lock the room", exact: true })
    .first()
    .click()
  await expect(audience.locator("svg[data-qr-url]")).toHaveCount(0, {
    timeout: 7000,
  })
  await expect(audience.locator('[data-table="20"]')).toHaveAttribute(
    "aria-label",
    /Demo40/u,
  )
  expect(await audience.getByTestId("tadazz-lobby-pin").textContent()).toBe(
    "######",
  )
  expect(
    await audience.locator("[data-table]").evaluateAll((tables) =>
      tables.map((table) => ({
        id: table.getAttribute("data-table"),
        x: table.getBoundingClientRect().x,
        y: table.getBoundingClientRect().y,
      })),
    ),
  ).toEqual(tablePositions)
  await expect(
    audience.getByText("TEST-NO-CALLS", { exact: true }),
  ).toBeVisible()
  await context.close()
})
test("a failed per-card image falls back to the selected full-window theme without classroom or duplicate media", async ({
  page,
  browser,
}) => {
  await page.route("**/media/tds-missing-background.png", (route) =>
    route.fulfill({ status: 404, body: "not found" }),
  )
  const room = await openRoom(page, false, "/media/tds-missing-background.png")
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:4310" })
  await joinGame(await context.newPage(), room.pin, "FallbackPlayer")
  await expect(page.getByTestId("host-connected-counter")).toHaveText(
    /^1\s*\//u,
  )
  await page.getByRole("button", { name: "Start", exact: true }).click()
  await expect(page.getByTestId("host-end-timer-btn")).toBeVisible()
  await expect(page.getByTestId("stage-card-background")).toHaveCount(0)
  await expect(page.getByTestId("tadazz-show")).toHaveCSS(
    "background-image",
    /tadazz-show/u,
  )
  await expect(page.locator("video")).toHaveCount(0)
  await page.screenshot({
    path: "/evidence/phase-07-custom-card-fallback.png",
    animations: "disabled",
  })
  await context.close()
})
