import { test, expect } from "@playwright/test"
import { createDefaultQuizExtrasV2 } from "../../../extensions/src/core/studio-timeline-schema"
import { completeCreatingWorldsShow } from "../../../extensions/src/core/creating-worlds-show"
import { loginManager, startGame, next } from "../utils/manager"
import { endTimer } from "../utils/extension-manager"
import { joinGame } from "../utils/player"
import fs from "node:fs"
import { join } from "node:path"
test("native source cards: 40 saved representatives, focus pages, live join, readiness and story progress", async ({
  page: host,
  browser,
  request,
}) => {
  const title = `Source cards acceptance ${Date.now()}`
  const ids = Array.from(
    {
      length: 10,
    },
    () => crypto.randomUUID(),
  )
  const assets = ["pirate", "shadchan", "dog", "therapist", "lamplighter"]
  const q = {
    subject: title,
    gameMode: "survey",
    questions: ids.map((_, i) => ({
      type: "single",
      question: `Question ${i + 1}`,
      answers: ["Pirate", "Shadchan", "Dog", "Therapist", "Lamplighter"],
      solutions: [],
      cooldown: 3,
      time: 120,
    })),
  }
  const initial = createDefaultQuizExtrasV2("draft", ids, "0".repeat(64))
  for (const id of ids) {
    initial.perQuestion[id] = {
      answerVisuals: assets.map((asset, i) => ({
        answerIndex: i,
        display: "both",
        url: `/tadazz-show/second-library/cards/${asset}.svg`,
        alt: asset,
      })),
    }
  }
  const extras = completeCreatingWorldsShow(initial)
  const login = await request.post("/api/auth/manager", {
    data: {
      password: "e2e-password",
    },
  })
  const { token } = (await login.json()) as {
    token: string
  }
  const save = await request.post("/api/extensions/quizzes", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      quizz: q,
      extras,
    },
  })
  expect(save.ok(), await save.text()).toBe(true)
  await loginManager(host)
  await host
    .getByRole("button", {
      name: title,
      exact: true,
    })
    .click()
  await host
    .getByRole("button", {
      name: "Start game",
      exact: true,
    })
    .click()
  const pin = host.getByTestId("tadazz-lobby-pin")
  await expect(pin).toBeVisible()
  const code = (await pin.textContent())!
  const { 1: gameId } = /manager\/([^/?#]+)/.exec(host.url())!
  const displayContext = await browser.newContext({
    viewport: {
      width: 1920,
      height: 1080,
    },
  })
  const display = await displayContext.newPage()
  await display.goto(`/display/${gameId}`)
  const playerContext = await browser.newContext({
    viewport: {
      width: 390,
      height: 844,
    },
    reducedMotion: "reduce",
  })
  const player = await playerContext.newPage()
  await joinGame(player, code, "Native QA voter")
  const skip = host.getByTestId("tadazz-opening-skip")

  if (await skip.isVisible()) {
    await skip
      .click({
        timeout: 1500,
      })
      .catch(async (e: unknown) => {
        if (await skip.isVisible()) {
          throw e
        }
      })
  }

  await startGame(host)
  const out = join(import.meta.dirname, "../../../work/goldy-source-evidence")
  fs.mkdirSync(out, {
    recursive: true,
  })
  async function scene(name: string) {
    for (const page of [host, display]) {
      await expect(page.locator(`[data-v4-scene="${name}"]`)).toBeVisible()
    }
    await host.waitForTimeout(2200)
  }
  async function shot(name: string) {
    await host.screenshot({
      path: join(out, `${name}-host.png`),
      timeout: 15000,
    })
    await display.screenshot({
      path: join(out, `${name}-display.png`),
      timeout: 15000,
    })
  }
  await scene("company-opening")
  await next(host)
  await scene("grand-opening")
  await next(host)
  await scene("representative-directory")
  for (const page of [host, display]) {
    await expect(page.locator(".full-rep-row")).toHaveCount(40)
    await expect(page.locator(".full-rep-name").first()).toHaveText(
      "Test Representative 01",
    )
    await expect(page.locator(".full-rep-name").last()).toHaveText(
      "Test Representative 40",
    )
    await expect(page.locator(".full-rep-row.connected")).toHaveCount(0)
    expect(await page.locator("iframe").count()).toBe(0)
  }
  await shot("directory-40")
  // Original HTML is opened only as a test reference, never embedded in the game.
  const reference = await browser.newPage({
    viewport: {
      width: 1920,
      height: 1080,
    },
  })
  await reference.goto(
    `file:///${join(import.meta.dirname, "../../../docs/extensions/references/user-20261106/source/second library.html").replaceAll("\\", "/")}`,
  )
  await reference.addStyleTag({
    content:
      "#stage{position:fixed!important;left:0!important;top:0!important;transform:none!important;width:1920px!important;height:1080px!important;z-index:9999!important}",
  })
  await reference.evaluate(
    (reps) =>
      (
        window as unknown as {
          TadazzShowPreview: {
            kit: {
              play(...args: unknown[]): unknown
            }
          }
        }
      ).TadazzShowPreview.kit.play("representative-directory", {
        representatives: reps,
        connectedTables: [],
        isLive: true,
      }),
    extras.roster.participants.map((p, i) => ({
      table: i + 1,
      name: p.displayName,
    })),
  )
  await reference.waitForTimeout(2200)
  await reference.screenshot({
    path: join(out, "directory-40-reference.png"),
  })
  /* oxlint-disable require-await, typescript/require-await -- Retain promise-returning API and rejection semantics for synchronous implementations. */
  const metrics = async (page: typeof display) =>
    page.locator(".full-rep-row").evaluateAll((rows) =>
      rows.map((row) => {
        const r = row.getBoundingClientRect()

        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        }
      }),
    )
  /* oxlint-enable require-await, typescript/require-await */
  const expected = await metrics(reference),
    actual = await metrics(display)
  expect(actual).toHaveLength(40)
  for (let i = 0; i < 40; i += 1) {
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(
        Math.abs(actual[i][key] - expected[i][key]),
        `Row ${i + 1} ${key}`,
      ).toBeLessThan(3)
    }
  }
  await reference.close()
  const before = await display.locator('[data-table="2"]').evaluate((el) => {
    ;(el as HTMLElement).dataset.identity = "retained"

    return true
  })
  expect(before).toBe(true)
  const sim = await request.post("/api/games/pilot-phone", {
    headers: {
      "x-tada-pilot-secret": "next-local-simulation-only",
    },
    data: {
      action: "join_or_poll",
      gameId,
      callId: "native-roster-demo-1",
      rosterPlayerId: extras.roster.participants[0].rosterPlayerId,
    },
  })
  expect(sim.ok(), await sim.text()).toBe(true)
  await expect(display.locator(".full-rep-row.connected")).toHaveCount(1)
  await expect(display.locator('[data-table="2"]')).toHaveAttribute(
    "data-identity",
    "retained",
  )
  await display.reload()
  await scene("representative-directory")
  await expect(display.locator(".full-rep-row.connected")).toHaveCount(1)
  await shot("directory-one-joined")
  for (let group = 0; group < 4; group += 1) {
    await next(host)
    await scene("representative-directory")
    await expect(display.locator(".full-rep-row")).toHaveCount(10)
    await expect(display.locator(".full-table-number").first()).toHaveText(
      String(group * 10 + 1).padStart(2, "0"),
    )
  }
  await next(host)
  await scene("phone-instructions")
  await expect(display.locator(".full-phone-key")).toHaveCount(12)
  await expect(display.locator(".full-step")).toHaveCount(3)
  await shot("phone-instructions")
  await next(host)
  await scene("connection-readiness")
  await expect(display.locator(".full-table-led")).toHaveCount(40)
  await expect(display.locator(".full-connected-count")).toHaveText(
    "1 / 40 TABLES CONNECTED",
  )
  await shot("readiness")
  await display.setViewportSize({
    width: 1194,
    height: 834,
  })
  await expect(display.locator(".full-connected-count")).toBeVisible()
  await shot("readiness-tablet")
  await display.setViewportSize({
    width: 1920,
    height: 1080,
  })
  await next(host)
  await scene("round-one")
  await next(host)
  await expect(player.getByTestId("tadazz-pad-option-0")).toBeVisible()
  await player.getByTestId("tadazz-pad-option-0").click()
  await endTimer(host)
  await expect(display.locator(".result-percentage").first()).toHaveText("100%")
  // No-tie step is skipped by the authoritative server
  await next(host)
  await expect(display.locator('[data-v4-scene="top-pick"]')).toBeVisible()
  await next(host)
  await scene("story-progress")
  await expect(display.locator(".full-progress-piece.is-filled")).toHaveCount(1)
  await expect(display.locator(".full-progress-placeholder")).toHaveCount(4)
  await shot("story-progress-one-piece")
  await playerContext.close()
  await displayContext.close()
})
