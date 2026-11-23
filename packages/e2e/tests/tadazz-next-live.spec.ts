import { test, expect, type Page } from "@playwright/test"
import { createDefaultQuizExtrasV2 } from "../../../extensions/src/core/studio-timeline-schema"
import { computeCanonicalBaseDigest } from "@razzia/extensions/core"
import { createGame, startGame } from "../utils/manager"
import { answer, joinGame } from "../utils/player"
import fs from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { t } from "../utils/i18n"

interface RoundObservation {
  name: string
  ordinal: number
  questionNumber?: number
  answeredCount?: number
}

const observeRounds = (page: Page) => {
  const rows: RoundObservation[] = []
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      const raw = typeof payload === "string" ? payload : payload.toString()

      if (!raw.startsWith("42")) {
        return
      }

      let packet: unknown = undefined

      try {
        packet = JSON.parse(raw.slice(raw.indexOf("[")))
      } catch {
        return
      }

      if (!Array.isArray(packet)) {
        return
      }

      const [event, data] = packet as unknown[]

      if (event === EVENTS.GAME.PLAYER_ANSWER && typeof data === "number") {
        rows.push({ name: event, ordinal: rows.length, answeredCount: data })

        return
      }

      if (
        event !== EVENTS.GAME.STATUS ||
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
      ) {
        return
      }

      const status = data as Record<string, unknown>

      if (typeof status.name !== "string") {
        return
      }

      const value = status.data
      const number =
        value && typeof value === "object" && "questionNumber" in value
          ? value.questionNumber
          : undefined
      rows.push({
        name: status.name,
        ordinal: rows.length,
        ...(typeof number === "number" ? { questionNumber: number } : {}),
      })
    })
  })

  return rows
}

const next = async (page: Page) => {
  const control = page.getByTestId("host-next-screen-btn")
  await expect(control).toHaveCount(1)
  await expect(control).toBeVisible()
  await expect(control).toBeEnabled()
  await control.click()
}

const configureManualCompletion = async (host: Page) => {
  await host.getByRole("button", { name: t("game:settings.title") }).click()
  const settings = host.getByRole("dialog")
  const completion = settings.getByTestId("settings-end-on-all-answered")

  if ((await completion.getAttribute("aria-checked")) === "true") {
    await completion.click()
  }

  await expect(completion).toHaveAttribute("aria-checked", "false")
  const auto = settings.getByRole("switch", {
    name: t("game:settings.autoAdvance.label"),
    exact: true,
  })

  if ((await auto.getAttribute("aria-checked")) === "true") {
    await auto.click()
  }

  await expect(auto).toHaveAttribute("aria-checked", "false")
  await settings
    .getByRole("button", { name: t("common:save"), exact: true })
    .click()
  await expect(settings).toBeHidden()
}

const endRecordedVote = async (
  host: Page,
  rows: RoundObservation[],
  count: number,
) => {
  const renderer = host.getByTestId("tadazz-show")
  await expect(renderer).toHaveAttribute("data-role", "manager")
  await expect(renderer).toHaveAttribute("data-show-scene", "voting")
  const voting = rows.filter((row) => row.name === STATUS.SELECT_ANSWER).at(-1)
  expect(voting).toBeDefined()

  if (!voting) {
    throw new Error("An actual voting status is required")
  }

  await expect
    .poll(() =>
      rows.some(
        (row) =>
          row.ordinal > voting.ordinal &&
          row.name === EVENTS.GAME.PLAYER_ANSWER &&
          row.answeredCount === count,
      ),
    )
    .toBe(true)
  const end = host.getByTestId("host-end-timer-btn")
  await expect(end).toHaveCount(1)
  await expect(end).toBeVisible()
  await expect(end).toBeEnabled()
  await end.click()
  await expect
    .poll(() =>
      rows.some(
        (row) =>
          row.ordinal > voting.ordinal && row.name === STATUS.SHOW_RESPONSES,
      ),
    )
    .toBe(true)
  await expect(renderer).toHaveAttribute("data-show-scene", "results")
}

test("server timeline: host/display round banners, ten photo votes, results, stories, refresh and curtains", async ({
  page: host,
  browser,
  request,
}, info) => {
  const hostWire = observeRounds(host)
  const auth = await request.post("/api/auth/manager", {
    data: { password: "e2e-password" },
  })
  expect(auth.ok()).toBeTruthy()
  const { token } = (await auth.json()) as { token: string }
  const title = `Next acceptance ${randomUUID()}`
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
    gameMode: "survey" as const,
    questions: ids.map((_, i) => ({
      type: "single" as const,
      question: `Story question ${i + 1}`,
      answers: names,
      solutions: [],
      cooldown: 3,
      time: 60,
    })),
  }
  const extras = createDefaultQuizExtrasV2(
    quizz.id,
    ids,
    computeCanonicalBaseDigest(quizz),
  )
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
  const pin = await createGame(host, title)
  const room = /\/party\/manager\/([0-9a-f-]{36})/u.exec(
    new URL(host.url()).pathname,
  )

  if (!room) {
    throw new Error("Actual native manager room is required")
  }

  const [, gameId] = room
  await configureManualCompletion(host)
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: info.outputPath("next-videos"),
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
  await startGame(host)
  const out = info.outputPath("next-live-evidence")
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
      await answer(voter, names[index])
    }
    await endRecordedVote(host, hostWire, 4)
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
        const cards = pg
          .getByTestId("tadazz-story-mixer")
          .locator(".card-col img.card-photo")
        await expect(cards).toHaveCount(5)
        await expect
          .poll(() =>
            cards.evaluateAll((images) =>
              images.every(
                (image) =>
                  image instanceof HTMLImageElement && image.naturalWidth > 0,
              ),
            ),
          )
          .toBe(true)
      }
      await next(host)
      await full("story-live")
      for (const pg of [host, display]) {
        const cards = pg
          .getByTestId("tadazz-story-reveal")
          .locator(".story-card img.card-image")
        await expect(cards).toHaveCount(5)
        await expect
          .poll(() =>
            cards.evaluateAll((images) =>
              images.every(
                (image) =>
                  image instanceof HTMLImageElement && image.naturalWidth > 0,
              ),
            ),
          )
          .toBe(true)
      }
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
  const proof = info.outputPath("next-live-contract.json")
  fs.writeFileSync(
    proof,
    JSON.stringify(
      {
        questionCount: 10,
        actualPlayerCount: 4,
        expectedDistribution: [75, 50, 75, 75, 75, 75, 75, 75, 75, 75],
        hostWire,
        mediaErrors: errors,
      },
      null,
      2,
    ),
  )
  await info.attach("next-live-contract", {
    path: proof,
    contentType: "application/json",
  })
  await playerCtx.close()
  for (const c of otherContexts) {
    await c.close()
  }
  await ctx.close()
})
