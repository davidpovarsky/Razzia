import { test, expect } from "@playwright/test"
import { createDefaultQuizExtrasV2 } from "../../../extensions/src/core/studio-timeline-schema"
import { loginManager, startGame, next } from "../utils/manager"
import { endTimer } from "../utils/extension-manager"
import { joinGame } from "../utils/player"
import fs from "node:fs"
import { join } from "node:path"

test("server timeline: host/display round banners, ten photo votes, results, stories, refresh and curtains", async ({
  page: host,
  browser,
  request,
}) => {
  host.on("websocket", (ws) => {
    ws.on("framesent", (frame) => {
      const s = String(frame.payload)

      if (s.includes("RESOLVE_STORY_TIE")) {
        console.log("TIE COMMAND", s)
      }
    })
    ws.on("framereceived", (frame) => {
      const s = String(frame.payload)

      if (s.includes("errorMessage")) {
        console.log("SERVER ERROR", s)
      }

      if (s.startsWith("42") && s.includes("extensions:state")) {
        try {
          const [, data] = JSON.parse(s.slice(2)) as [
            unknown,
            {
              seq: number
              extras?: {
                activeSceneData?: {
                  fullShow?: {
                    tieCandidates?: unknown[]
                    tieResolvedIndex?: number
                  }
                }
              }
            },
          ]
          const f = data.extras?.activeSceneData?.fullShow

          if (f?.tieCandidates?.length) {
            console.log("TIE STATE", data.seq, f.tieResolvedIndex)
          }
        } catch {
          /* Non-state diagnostic frames need no handling. */
        }
      }
    })
  })
  const auth = await request.post("/api/auth/manager", {
    data: { password: "e2e-password" },
  })
  expect(auth.ok()).toBeTruthy()
  const { token } = (await auth.json()) as { token: string }
  const title = `Next acceptance ${Date.now()}`
  const names = [
    "Pirate",
    "Shadchan",
    "Faithful Dog",
    "Therapist",
    "Lamplighter",
  ]
  const assets = ["pirate", "shadchan", "dog", "therapist", "lamplighter"]
  const ids = Array.from({ length: 10 }, () => crypto.randomUUID())
  const quizz = {
    id: crypto.randomUUID(),
    subject: title,
    gameMode: "survey",
    questions: ids.map((_, i) => ({
      type: "single",
      question: `Story question ${i + 1}`,
      answers: names,
      solutions: [],
      cooldown: 3,
      time: 60,
    })),
  }
  const extras = createDefaultQuizExtrasV2(quizz.id, ids, "0".repeat(64))
  const scene = (preset: string, round = 1) => {
    const id = crypto.randomUUID()
    extras.scenes[id] = {
      id,
      kind: "animation",
      preset,
      round,
      advance: "manual",
      durationMs: 10000,
    }

    return { id: crypto.randomUUID(), kind: "animation" as const, sceneId: id }
  }
  extras.timeline = [scene("company-opening"), scene("round-one")]
  ids.forEach((id, i) => {
    extras.perQuestion[id] = {
      answerVisuals: names.map((name, n) => ({
        answerIndex: n,
        display: "both",
        alt: name,
        url: `/tadazz-show/second-library/cards/${assets[n]}.svg`,
      })),
    }
    extras.timeline.push({
      id: crypto.randomUUID(),
      kind: "question",
      questionId: id,
    })

    if (i === 1) {
      extras.timeline.push(scene("tie-break"))
    }

    if (i === 4) {
      extras.timeline.push(
        scene("story-assembly"),
        scene("story-live"),
        scene("round-two", 2),
      )
    }
  })
  extras.timeline.push(
    scene("story-assembly", 2),
    scene("story-live", 2),
    scene("grand-finale", 2),
  )
  const save = await request.post("/api/extensions/quizzes", {
    headers: { Authorization: `Bearer ${token}` },
    data: { quizz, extras },
  })
  expect(save.ok(), await save.text()).toBeTruthy()
  await loginManager(host)
  await host.getByRole("button", { name: title, exact: true }).click()
  await host.getByRole("button", { name: "Start game", exact: true }).click()
  await expect(host.getByTestId("tadazz-lobby-pin")).toHaveText(/^\d{6}$/)
  const pin = (await host.getByTestId("tadazz-lobby-pin").textContent())!
  console.log(
    "STAGE",
    await host.getByTestId("tadazz-stage").evaluate((el) => ({
      rect: el.getBoundingClientRect().toJSON() as unknown,
      parent: el.parentElement!.getBoundingClientRect().toJSON() as unknown,
      scale: getComputedStyle(el).getPropertyValue("--scale"),
    })),
  )
  const { 1: gameId } = /manager\/([^/?#]+)/.exec(host.url())!
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: join(import.meta.dirname, "../../../work/next-videos"),
    },
  })
  const display = await ctx.newPage()
  const errors: string[] = []
  for (const pg of [host, display]) {
    pg.on("response", (r) => {
      if (r.status() >= 400 && r.url().includes("tadazz-show/")) {
        errors.push(`${r.status()} ${r.url()}`)
      }
    })
  }
  await display.goto(`/display/${gameId}`)
  const playerCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  })
  const player = await playerCtx.newPage()
  await joinGame(player, pin, "QA voter").catch(async (error: unknown) => {
    console.log(
      "HIDDEN",
      await host.getByTestId("tadazz-lobby-pin").evaluate((el) => {
        const rows = []
        for (let n: Element | null = el; n; n = n.parentElement) {
          const s = getComputedStyle(n)
          rows.push({
            cls: n.className,
            display: s.display,
            visibility: s.visibility,
            opacity: s.opacity,
            rect: n.getBoundingClientRect().toJSON() as unknown,
          })
        }

        return rows
      }),
    )
    throw error
  })
  const otherContexts = await Promise.all(
    [1, 2, 3].map(() =>
      browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      }),
    ),
  )
  const otherPlayers = await Promise.all(otherContexts.map((c) => c.newPage()))
  for (let i = 0; i < 3; i += 1) {
    await joinGame(otherPlayers[i], pin, `QA voter ${i + 2}`)
  }
  for (const pg of [host, display]) {
    const skip = pg.getByTestId("tadazz-opening-skip")

    if (await skip.isVisible()) {
      await skip.click({ timeout: 1500 }).catch(async (error: unknown) => {
        if (await skip.isVisible()) {
          throw error
        }
      })
    }
  }
  await startGame(host)
  const out = join(import.meta.dirname, "../../../work/next-live-evidence")
  fs.mkdirSync(out, { recursive: true })
  async function shot(name: string) {
    console.log("CAPTURE", name)
    for (const [label, pg] of [
      ["host", host],
      ["display", display],
    ] as const) {
      await pg.screenshot({
        path: join(out, `${name}-${label}.png`),
        timeout: 15000,
      })
    }
  }
  async function full(preset: string) {
    for (const pg of [host, display]) {
      await expect(pg.locator(`[data-v4-scene="${preset}"]`)).toBeVisible()
    }
    await host.waitForTimeout(preset === "grand-finale" ? 9000 : 2800)
    await shot(preset)
  }
  await full("company-opening")
  await next(host)
  await full("round-one")
  await next(host)
  for (let i = 0; i < 10; i += 1) {
    console.log("VOTE", i + 1)
    await expect(host.locator(".tzv4-stage .q-text")).toContainText(
      `Story question ${i + 1}`,
    )
    for (const pg of [host, display]) {
      await expect(pg.locator(".tzv4-stage .answer-card")).toHaveCount(5)
      await expect
        .poll(() =>
          pg
            .locator(".tzv4-stage .answer-image")
            .evaluateAll((imgs) =>
              imgs.every((img) => (img as HTMLImageElement).naturalWidth > 0),
            ),
        )
        .toBe(true)
      await expect(
        pg.locator(".tzv4-stage .answer-title").first(),
      ).toContainText("Pirate")
    }
    for (const [n, voter] of [player, ...otherPlayers].entries()) {
      const index = (() => {
        if (i === 1) {
          if (n < 2) {
            return 1
          }

          return 0
        }

        if (n === 3) {
          return (i + 1) % 5
        }

        return i % 5
      })()
      const pad = voter.getByTestId(`tadazz-pad-option-${index}`)
      await expect(pad).toBeVisible()
      await pad.click()
    }
    await endTimer(host)
    for (const pg of [host, display]) {
      await expect(
        pg.locator(".tzv4-stage .result-percentage").nth(i % 5),
      ).toHaveText(i === 1 ? "50%" : "75%")
      await expect
        .poll(() =>
          pg
            .locator(".tzv4-stage .result-track-fill")
            .nth(i % 5)
            .evaluate((el) => el.getBoundingClientRect().width),
        )
        .toBeGreaterThan(100)
    }
    await shot(`results-${i + 1}`)

    if (i === 0) {
      await display.reload()
      await expect(
        display.locator(".tzv4-stage .result-percentage").first(),
      ).toHaveText("75%")
    }

    await next(host)

    if (i === 1) {
      await full("tie-break")
      await host.getByTestId("host-resolve-tie-1").click()
      await expect(display.locator(".full-tie-card.chosen")).toContainText(
        "Shadchan",
      )
      await display.reload()
      await expect(display.locator(".full-tie-card.chosen")).toContainText(
        "Shadchan",
      )
      await next(host)
    }

    if (i === 4 || i === 9) {
      await full("story-assembly")
      for (const pg of [host, display]) {
        await expect(pg.locator(".full-story-image")).toHaveCount(5)
      }
      await next(host)
      await full("story-live")
      await host.waitForTimeout(1200)
      await expect(
        display.locator('[data-v4-scene="story-live"]'),
      ).toBeVisible()
      await next(host)

      if (i === 4) {
        await full("round-two")
        await next(host)
      }
    }
  }
  await full("grand-finale")
  expect(errors).toEqual([])
  await playerCtx.close()
  for (const c of otherContexts) {
    await c.close()
  }
  await ctx.close()
})
