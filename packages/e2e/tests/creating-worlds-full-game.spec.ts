import { expect, test } from "@playwright/test"
import fs from "node:fs"
import { join } from "node:path"
import { loginManager, next as nextHost } from "../utils/manager"
import { joinGame } from "../utils/player"

const title = "Creating Worlds"
const root = join(import.meta.dirname, "../../..")
const basePath = join(
  root,
  "work/creating-worlds-base-rev7-release-20261107.json",
)
const extrasPath = join(root, "work/tzila-repaired-private-20261108.json")
const fixturesPresent = fs.existsSync(basePath) && fs.existsSync(extrasPath)
// oxlint-disable-next-line no-empty-pattern -- Playwright requires an object fixture pattern; this hook only reads testInfo.
test.beforeEach(({}, testInfo) => {
  test.skip(
    !fixturesPresent || testInfo.config.metadata.tzilaRepairCandidate !== true,
    "Requires the isolated release candidate and private owner-supplied roster",
  )
})
const base = fixturesPresent
  ? (JSON.parse(
      fs.readFileSync(
        join(root, "work/creating-worlds-base-rev7-release-20261107.json"),
        "utf8",
      ),
    ) as {
      questions: Array<{ question: string; answers: string[] }>
    })
  : { questions: [] }
const extras = fixturesPresent
  ? (JSON.parse(
      fs.readFileSync(
        join(root, "work/tzila-repaired-private-20261108.json"),
        "utf8",
      ),
    ) as {
      questionIds: string[]
      roster: { participants: Array<{ displayName: string }> }
      perQuestion: Record<
        string,
        { answerVisuals?: Array<{ answerIndex: number; url?: string }> }
      >
    })
  : { questionIds: [], roster: { participants: [] }, perQuestion: {} }

async function expectScene(
  page: import("@playwright/test").Page,
  name: string,
) {
  await expect(page.locator(`[data-v4-scene="${name}"]`)).toBeVisible({
    timeout: 20_000,
  })
}

test("runs the complete Creating Worlds show with real assets, results, tie and finale", async ({
  page: host,
  browser,
}, testInfo) => {
  const browserErrors: string[] = []
  host.on("pageerror", (error) => browserErrors.push(error.message))
  await loginManager(host)
  await host.getByRole("button", { name: title, exact: true }).click()
  await host.getByRole("button", { name: "Start game", exact: true }).click()

  const opening = host.getByTestId("tadazz-opening")
  await expect(opening).toHaveAttribute("data-opening-phase", "event-artwork")
  await expect(host.getByTestId("tadazz-opening-event-artwork")).toBeVisible()
  await expect(host.getByTestId("tadazz-opening-video")).toHaveCount(0)
  await expect(opening).toHaveAttribute("data-opening-phase", "brand")
  await expect(host.getByTestId("tadazz-opening-event-artwork")).toHaveCount(0)
  await expect(host.getByTestId("tadazz-opening-video")).toBeVisible()
  await host.getByTestId("tadazz-opening-skip").click()

  await expect(host.getByTestId("tadazz-lobby-representative")).toHaveCount(31)
  await expect(host.getByTestId("tadazz-lobby-count")).toHaveText(
    "0 / 31 TABLES CONNECTED",
  )
  await expect(host.locator(".tz-lobby-show-rep.connected")).toHaveCount(0)
  await expect(host.getByTestId("tadazz-lobby-qr")).toBeVisible()
  await expect(
    host.getByText("+44 330 613 1984", { exact: true }),
  ).toBeVisible()
  await expect(host.getByTestId("tadazz-lobby-pin")).toHaveText(/^\d{6}$/u)
  await host.screenshot({ path: testInfo.outputPath("00-lobby-zero.png") })

  // The original at-least-one-player restriction remains in force.
  await host.getByRole("button", { name: "Start", exact: true }).click()
  await expect(host.getByTestId("tadazz-screen-lobby")).toBeVisible()

  const code = (await host.getByTestId("tadazz-lobby-pin").textContent())!
  const gameId = /manager\/([^/?#]+)/u.exec(host.url())?.[1]
  expect(gameId).toBeTruthy()

  const displayContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    reducedMotion: "reduce",
  })
  const display = await displayContext.newPage()
  await display.goto(`/display/${gameId}`)

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
  for (let index = 0; index < players.length; index += 1) {
    await joinGame(
      players[index],
      code,
      extras.roster.participants[index].displayName,
    )
  }
  await expect(host.getByTestId("tadazz-lobby-count")).toHaveText(
    "3 / 31 TABLES CONNECTED",
  )
  await expect(host.locator(".tz-lobby-show-rep.connected")).toHaveCount(3)
  for (const table of [1, 2, 3]) {
    await expect(
      host.locator(`[data-table="${table}"].connected`),
    ).toBeVisible()
  }

  await host.getByRole("button", { name: "Start", exact: true }).click()
  await expectScene(host, "round-one")
  await expectScene(display, "round-one")
  await expect(host.locator('[data-v4-scene="company-opening"]')).toHaveCount(0)
  await expect(
    host.locator('[data-v4-scene="representative-directory"]'),
  ).toHaveCount(0)
  await expect(host.locator('[data-v4-scene="interimResults"]')).toHaveCount(0)

  await host.getByTestId("host-present-from-host-btn").click()
  await expect(host.getByTestId("tadazz-show")).toHaveAttribute(
    "data-host-presenting",
    "true",
  )
  await expect(host.getByTestId("manager-control-toolbar")).toHaveCount(0)
  await expect(host.getByTestId("tadazz-host-controls")).toHaveCount(0)
  await host.keyboard.press("ArrowRight")

  const observedQuestions: string[] = []
  for (let questionIndex = 0; questionIndex < 10; questionIndex += 1) {
    const question = base.questions[questionIndex]
    const questionId = extras.questionIds[questionIndex]
    const expectedImages = [
      ...(extras.perQuestion[questionId]?.answerVisuals ?? []),
    ]
      .sort((a, b) => a.answerIndex - b.answerIndex)
      .map((visual) => visual.url)

    await expect(players[0].getByTestId("tadazz-pad-option-0")).toBeVisible({
      timeout: 30_000,
    })
    await expect(host.locator(".tzv4-stage .q-text")).toContainText(
      question.question,
    )
    for (const player of players) {
      await expect(player.locator(".tzv4-stage .q-text")).toContainText(
        question.question,
      )
    }
    await expect(host.locator(".tzv4-stage .answer-card")).toHaveCount(5)
    await expect(host.locator(".tzv4-stage .answer-card-badge")).toHaveCount(0)
    const imageSources = await host
      .locator(".tzv4-stage .answer-image")
      .evaluateAll((images) =>
        images.map((image) => (image as HTMLImageElement).getAttribute("src")),
      )
    expect(imageSources).toEqual(expectedImages)
    observedQuestions.push(question.question)

    if (questionIndex === 0) {
      await expect(host.locator(".countdown-value")).toBeVisible()
      await expect(host.locator(".countdown-value")).toHaveText("20")
      await host.evaluate(() => {
        const samples: Array<{ value: string; at: number }> = []
        Object.assign(window, { __tzTimerSamples: samples })
        let previous = ""
        const sample = () => {
          const value =
            document.querySelector(".countdown-value")?.textContent ?? ""

          if (value && value !== previous) {
            samples.push({ value, at: Date.now() })
            previous = value
          }

          if (value !== "00") {
            requestAnimationFrame(sample)
          }
        }
        sample()
      })
    }

    const choices =
      questionIndex === 1
        ? [0, 0, 1, 1]
        : [
            questionIndex % 5,
            questionIndex % 5,
            questionIndex % 5,
            (questionIndex + 1) % 5,
          ]
    for (let playerIndex = 0; playerIndex < players.length; playerIndex += 1) {
      await players[playerIndex]
        .getByTestId(`tadazz-pad-option-${choices[playerIndex]}`)
        .click()
    }

    await expect(
      host.locator(".tzv4-stage .result-percentage").first(),
    ).toBeVisible({
      timeout: 30_000,
    })
    await expect(
      display.locator(".tzv4-stage .result-percentage").first(),
    ).toBeVisible()
    await expect(host.locator('[data-v4-scene="interimResults"]')).toHaveCount(
      0,
    )
    const expectedPercentages = Array.from({ length: 5 }, (_, index) => {
      const count = choices.filter((choice) => choice === index).length

      return `${Math.round((count / choices.length) * 100)}%`
    })
    await expect
      .poll(
        () => host.locator(".tzv4-stage .result-percentage").allTextContents(),
        { timeout: 4_000 },
      )
      .toEqual(expectedPercentages)
    await host.screenshot({
      path: testInfo.outputPath(
        `result-${String(questionIndex + 1).padStart(2, "0")}.png`,
      ),
    })

    if (questionIndex === 0) {
      const timing = await host.evaluate(
        () =>
          (window as unknown as { __tzTimerSamples: unknown })
            .__tzTimerSamples as Array<{
            value: string
            at: number
          }>,
      )
      expect(timing[0].value).toBe("20")
      expect(timing.at(-1)?.value).toBe("00")
      expect(timing.map((sample) => Number(sample.value))).toEqual(
        Array.from({ length: 21 }, (_, index) => 20 - index),
      )
      const nineteen = timing.find((sample) => sample.value === "19")!
      const zero = timing.find((sample) => sample.value === "00")!
      fs.writeFileSync(
        testInfo.outputPath("countdown-timestamps.json"),
        JSON.stringify(
          { samples: timing, nineteenToZeroMs: zero.at - nineteen.at },
          null,
          2,
        ),
      )
      expect(zero.at - nineteen.at).toBeGreaterThanOrEqual(18_700)
      expect(zero.at - nineteen.at).toBeLessThanOrEqual(19_300)
      await testInfo.attach("countdown-timestamps.json", {
        body: JSON.stringify(
          { samples: timing, nineteenToZeroMs: zero.at - nineteen.at },
          null,
          2,
        ),
        contentType: "application/json",
      })
      await host.keyboard.press("Escape")
      await expect(host.getByTestId("manager-control-toolbar")).toBeVisible()
    }

    let winnerIndex = questionIndex % 5

    if (questionIndex === 1) {
      await expectScene(host, "tie-break")
      await host.getByTestId("host-resolve-tie-1").click()
      winnerIndex = 1
      await nextHost(host)
    }

    await expectScene(host, "top-pick")
    await expect(host.getByTestId("tadazz-top-pick-name")).toHaveText(
      question.answers[winnerIndex],
    )
    await nextHost(host)

    if (questionIndex === 4) {
      await expectScene(host, "round-recap")
      await expect(host.locator(".recap-answers .answer-card")).toHaveCount(5)
      await nextHost(host)
      await expect(host.getByTestId("tadazz-v4-wipe-layer")).toBeVisible()
      await expect(host.getByTestId("tadazz-v4-wipe-layer")).toHaveCount(0, {
        timeout: 10_000,
      })
      await expectScene(host, "round-two")
      await nextHost(host)
    }

    if (questionIndex === 9) {
      await expectScene(host, "round-recap")
      await expect(host.locator(".recap-answers .answer-card")).toHaveCount(5)
      await nextHost(host)
    }
  }

  expect(observedQuestions).toEqual(
    base.questions.map((question) => question.question),
  )
  await expectScene(host, "grand-finale")
  await expectScene(display, "grand-finale")
  await host.waitForTimeout(9_300)
  await expect(host.locator(".full-curtain.left")).toBeVisible()
  await expect(host.locator(".full-curtain.right")).toBeVisible()
  await host.screenshot({ path: testInfo.outputPath("99-grand-finale.png") })

  for (const context of playerContexts) {
    await context.close()
  }
  await displayContext.close()
  expect(browserErrors).toEqual([])
})

test("fits the 16:9 stage across projector and laptop viewports", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await loginManager(page)
  await page.getByRole("button", { name: title, exact: true }).click()
  await page.getByRole("button", { name: "Start game", exact: true }).click()
  await expect(page.getByTestId("tadazz-screen-lobby")).toBeVisible()

  const viewports = [
    { name: "full-hd", width: 1920, height: 1080 },
    { name: "laptop", width: 1366, height: 768 },
    { name: "hd", width: 1280, height: 720 },
    { name: "four-three", width: 1024, height: 768 },
    { name: "wide", width: 2560, height: 1080 },
    { name: "standard", width: 1440, height: 900 },
  ]

  const assertFit = async (
    width: number,
    height: number,
    expectMaximum = false,
  ) => {
    const maximumScale = Math.min(width / 1920, height / 1080)
    const maximumWidth = 1920 * maximumScale
    const maximumHeight = 1080 * maximumScale
    await expect
      .poll(async () => {
        const box = await page.getByTestId("tadazz-stage").boundingBox()

        return Boolean(
          box &&
          box.x >= -1 &&
          box.y >= -1 &&
          box.x + box.width <= width + 1 &&
          box.y + box.height <= height + 1 &&
          (!expectMaximum ||
            (Math.abs(box.width - maximumWidth) <= 2 &&
              Math.abs(box.height - maximumHeight) <= 2)),
        )
      })
      .toBe(true)
    const show = await page.getByTestId("tadazz-show").boundingBox()
    const stage = await page.getByTestId("tadazz-stage").boundingBox()
    expect(show).not.toBeNull()
    expect(stage).not.toBeNull()
    console.log(
      "STAGE_BOUNDS",
      JSON.stringify({ viewport: { width, height }, show, stage }),
    )
    expect(Math.round(show!.width)).toBe(width)
    expect(Math.round(show!.height)).toBe(height)
    expect(stage!.x).toBeGreaterThanOrEqual(-1)
    expect(stage!.y).toBeGreaterThanOrEqual(-1)
    expect(stage!.x + stage!.width).toBeLessThanOrEqual(width + 1)
    expect(stage!.y + stage!.height).toBeLessThanOrEqual(height + 1)
    expect(stage!.width / stage!.height).toBeCloseTo(16 / 9, 2)
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    }))
    expect(overflow.x).toBeLessThanOrEqual(0)
    expect(overflow.y).toBeLessThanOrEqual(0)
  }

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await assertFit(viewport.width, viewport.height)
  }

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.getByTestId("host-present-from-host-btn").click()
    await expect(page.getByTestId("manager-control-toolbar")).toHaveCount(0)
    await expect(page.getByTestId("tadazz-host-controls")).toHaveCount(0)
    await assertFit(viewport.width, viewport.height, true)
    await page.screenshot({
      path: testInfo.outputPath(`present-${viewport.name}.png`),
    })
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("manager-control-toolbar")).toBeVisible()
  }
})

test("survives skip, restart, pause, timer end, rapid input, and refresh", async ({
  page: host,
  browser,
}) => {
  await host.emulateMedia({ reducedMotion: "reduce" })
  await loginManager(host)
  await host.getByRole("button", { name: title, exact: true }).click()
  await host.getByRole("button", { name: "Start game", exact: true }).click()
  const code = (await host.getByTestId("tadazz-lobby-pin").textContent())!

  const playerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  })
  const player = await playerContext.newPage()
  await joinGame(player, code, extras.roster.participants[0].displayName)
  await expect(host.getByTestId("tadazz-lobby-count")).toHaveText(
    "1 / 31 TABLES CONNECTED",
  )
  await host.getByRole("button", { name: "Start", exact: true }).click()
  await expectScene(host, "round-one")
  await host.getByTestId("host-present-from-host-btn").click()
  await host.keyboard.press("ArrowRight")

  await expect(host.locator(".tzv4-stage .q-text")).toContainText(
    base.questions[0].question,
  )
  await expect(player.locator(".tzv4-stage .q-text")).toContainText(
    base.questions[0].question,
  )

  await host.keyboard.press("p")
  await expect(host.getByTestId("tadazz-show")).toHaveAttribute(
    "data-game-paused",
    "true",
  )
  await host.keyboard.press("ArrowRight")
  await host.keyboard.press("ArrowRight")
  await expect(host.locator(".tzv4-stage .q-text")).toContainText(
    base.questions[0].question,
  )
  await host.keyboard.press("p")
  await expect(host.getByTestId("tadazz-show")).toHaveAttribute(
    "data-game-paused",
    "false",
  )

  await host.keyboard.press("Shift+ArrowRight")
  await host.keyboard.press("Shift+ArrowRight")
  await expect(host.locator(".tzv4-stage .q-text")).toContainText(
    base.questions[1].question,
    { timeout: 20_000 },
  )

  await host.keyboard.press("Shift+ArrowLeft")
  await host.keyboard.press("Shift+ArrowLeft")
  await expect(host.locator(".tzv4-stage .q-text")).toContainText(
    base.questions[0].question,
    { timeout: 20_000 },
  )

  await host.reload()
  await expect(host.getByTestId("tadazz-show")).toHaveAttribute(
    "data-show-scene",
    "voting",
  )
  await expect(host.locator(".tzv4-stage .q-text")).toContainText(
    base.questions[0].question,
  )
  await host.getByTestId("host-present-from-host-btn").click()
  await expect(host.getByTestId("tadazz-show")).toHaveAttribute(
    "data-voting-open",
    "true",
  )
  await host.keyboard.press("p")
  await expect(host.getByTestId("tadazz-show")).toHaveAttribute(
    "data-game-paused",
    "true",
  )
  const heldClock = await host.locator(".countdown-value").textContent()
  await host.waitForTimeout(2100)
  await expect(host.locator(".countdown-value")).toHaveText(heldClock!)
  await host.keyboard.press("p")
  await expect(host.getByTestId("tadazz-show")).toHaveAttribute(
    "data-game-paused",
    "false",
  )
  await host.keyboard.press("t")
  await expect(host.getByTestId("tadazz-show")).toHaveAttribute(
    "data-show-scene",
    "results",
    { timeout: 20_000 },
  )
  await host.keyboard.press("Escape")
  await expect(host.getByTestId("manager-control-toolbar")).toBeVisible()
  await expectScene(host, "top-pick")
  await expect(host.locator('[data-v4-scene="tie-break"]')).toHaveCount(0)
  await nextHost(host)
  await host.getByTestId("host-present-from-host-btn").click()
  for (let index = 1; index < 5; index += 1) {
    await expect(host.locator(".tzv4-stage .q-text")).toContainText(
      base.questions[index].question,
    )
    await host.keyboard.press("Shift+ArrowRight")
    await host.keyboard.press("Shift+ArrowRight")
  }
  await expectScene(host, "round-recap")
  await expect(host.locator(".recap-answers .answer-card")).toHaveCount(5)
  await playerContext.close()
})
