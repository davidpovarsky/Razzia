/**
 * Normal-speed regression: the configured backend must run with GAME_SPEED=1.
 * The real two-second lead-in assertion is intentional; do not scale or skip it
 * when wiring this file into a permanent Playwright project.
 */
import { writeFileSync } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { performance } from "node:perf_hooks"
import type { Locator, Page } from "@playwright/test"
import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
} from "@razzia/extensions/core"
import { MANAGER_PASSWORD } from "@razzia/e2e/utils/constants"
import { seedQuizz } from "@razzia/e2e/utils/editor"
import { expect, test } from "@razzia/e2e/utils/fixtures"
import { t } from "@razzia/e2e/utils/i18n"
import { createGame, next, startGame } from "@razzia/e2e/utils/manager"
import { answer, confirm, joinGame } from "@razzia/e2e/utils/player"

// Chromium's transformed IntersectionObserver rectangle can differ from its
// simultaneous DOM rectangle by a few ten-thousandths of a CSS pixel. Require
// every edge to be numerically equivalent as well as a near-unity area ratio.
// This is not a percentage-based allowance for clipped content.
const VIEWPORT_EDGE_EPSILON_CSS_PX = 0.0001
const VIEWPORT_RATIO_EPSILON = 0.000001

interface ViewportRect {
  x: number
  y: number
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}

interface ViewportIntersectionSample {
  ratio: number
  isIntersecting: boolean
  boundingClientRect: ViewportRect
  intersectionRect: ViewportRect
  domBoundingClientRect: ViewportRect
  rootBounds: ViewportRect | null
  viewport: { width: number; height: number; devicePixelRatio: number }
  ancestors: Array<{
    tag: string
    testId: string | null
    className: string | null
    boundingClientRect: ViewportRect
    clientTop: number
    clientLeft: number
    clientWidth: number
    clientHeight: number
    offsetWidth: number
    offsetHeight: number
    overflowX: string
    overflowY: string
    clip: string
    clipPath: string
    transform: string
    borderTopWidth: string
    borderBottomWidth: string
    borderLeftWidth: string
    borderRightWidth: string
  }>
  ancestorChainComplete: boolean
}

const evaluateViewportContainment = (sample: ViewportIntersectionSample) => {
  const edges = ["top", "right", "bottom", "left"] as const
  const target = sample.boundingClientRect
  const intersection = sample.intersectionRect
  const dom = sample.domBoundingClientRect
  const root = sample.rootBounds
  const rectangles = [target, intersection, dom, ...(root ? [root] : [])]
  const finiteRectangles = rectangles.every((rect) =>
    [
      rect.x,
      rect.y,
      rect.top,
      rect.right,
      rect.bottom,
      rect.left,
      rect.width,
      rect.height,
    ].every(Number.isFinite),
  )
  const edgeDeltasCssPixels = edges.map((edge) => ({
    edge,
    delta: intersection[edge] - target[edge],
  }))
  const domDeltasCssPixels = edges.map((edge) => ({
    edge,
    delta: dom[edge] - target[edge],
  }))
  const maxEdgeDeltaCssPixels = Math.max(
    ...edgeDeltasCssPixels.map((value) => Math.abs(value.delta)),
  )
  const maxDomDeltaCssPixels = Math.max(
    ...domDeltasCssPixels.map((value) => Math.abs(value.delta)),
  )
  const rootContainsDom = Boolean(
    root &&
    dom.left >= root.left - VIEWPORT_EDGE_EPSILON_CSS_PX &&
    dom.top >= root.top - VIEWPORT_EDGE_EPSILON_CSS_PX &&
    dom.right <= root.right + VIEWPORT_EDGE_EPSILON_CSS_PX &&
    dom.bottom <= root.bottom + VIEWPORT_EDGE_EPSILON_CSS_PX,
  )
  const ratioNearUnity =
    Number.isFinite(sample.ratio) &&
    sample.ratio >= 1 - VIEWPORT_RATIO_EPSILON &&
    sample.ratio <= 1
  const fullyContained =
    finiteRectangles &&
    sample.isIntersecting &&
    sample.ancestorChainComplete &&
    ratioNearUnity &&
    rootContainsDom &&
    rectangles.length === 4 &&
    rectangles.every((rect) => rect.width > 0 && rect.height > 0) &&
    maxEdgeDeltaCssPixels <= VIEWPORT_EDGE_EPSILON_CSS_PX &&
    maxDomDeltaCssPixels <= VIEWPORT_EDGE_EPSILON_CSS_PX

  return {
    fullyContained,
    rawRatioExactlyOne: sample.ratio === 1,
    precisionEquivalent: fullyContained && sample.ratio !== 1,
    edgeEpsilonCssPixels: VIEWPORT_EDGE_EPSILON_CSS_PX,
    ratioEpsilon: VIEWPORT_RATIO_EPSILON,
    ratioNearUnity,
    finiteRectangles,
    rootContainsDom,
    maxEdgeDeltaCssPixels,
    maxDomDeltaCssPixels,
    edgeDeltasCssPixels,
    domDeltasCssPixels,
  }
}

const observeViewportContainment = async (locator: Locator) => {
  const measured = await locator.evaluate(
    (element) =>
      new Promise<ViewportIntersectionSample>((resolve, reject) => {
        const rect = (value: DOMRectReadOnly): ViewportRect => ({
          x: value.x,
          y: value.y,
          top: value.top,
          right: value.right,
          bottom: value.bottom,
          left: value.left,
          width: value.width,
          height: value.height,
        })
        const observer = new IntersectionObserver(
          (entries) => {
            const entry = entries.find(
              (candidate) => candidate.target === element,
            )

            if (!entry) {
              return
            }

            window.clearTimeout(timeout)
            observer.disconnect()
            const ancestors: ViewportIntersectionSample["ancestors"] = []
            let current = element.parentElement

            while (current && ancestors.length < 32) {
              const style = getComputedStyle(current)
              ancestors.push({
                tag: current.tagName,
                testId: current.getAttribute("data-testid"),
                className:
                  typeof current.className === "string"
                    ? current.className
                    : null,
                boundingClientRect: rect(current.getBoundingClientRect()),
                clientTop: current.clientTop,
                clientLeft: current.clientLeft,
                clientWidth: current.clientWidth,
                clientHeight: current.clientHeight,
                offsetWidth: current.offsetWidth,
                offsetHeight: current.offsetHeight,
                overflowX: style.overflowX,
                overflowY: style.overflowY,
                clip: style.getPropertyValue("clip"),
                clipPath: style.clipPath,
                transform: style.transform,
                borderTopWidth: style.borderTopWidth,
                borderBottomWidth: style.borderBottomWidth,
                borderLeftWidth: style.borderLeftWidth,
                borderRightWidth: style.borderRightWidth,
              })
              current = current.parentElement
            }

            resolve({
              ratio: entry.intersectionRatio,
              isIntersecting: entry.isIntersecting,
              boundingClientRect: rect(entry.boundingClientRect),
              intersectionRect: rect(entry.intersectionRect),
              domBoundingClientRect: rect(element.getBoundingClientRect()),
              rootBounds: entry.rootBounds ? rect(entry.rootBounds) : null,
              viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio,
              },
              ancestors,
              ancestorChainComplete: current === null,
            })
          },
          { root: null, rootMargin: "0px", threshold: [0, 1] },
        )
        const timeout = window.setTimeout(() => {
          observer.disconnect()
          reject(
            new Error("Native viewport containment observation did not arrive"),
          )
        }, 2_000)
        observer.observe(element)
      }),
  )

  return { ...measured, containment: evaluateViewportContainment(measured) }
}

type ViewportContainmentObservation = Awaited<
  ReturnType<typeof observeViewportContainment>
>

const requireViewportContainment = async (
  locator: Locator,
  record: (observation: ViewportContainmentObservation) => void,
  soft = false,
) => {
  const observations: ViewportContainmentObservation[] = []

  await expect
    .configure({ soft })
    .poll(
      async () => {
        const observation = await observeViewportContainment(locator)
        observations.push(observation)
        record(observation)

        return observation.containment.fullyContained
      },
      {
        message:
          "Every native intersection edge must contain the visible region within 0.0001 CSS pixels, with a near-unity ratio",
      },
    )
    .toBe(true)
  const observation = observations.at(-1)

  if (!observation) {
    throw new Error(
      "The browser did not provide a viewport containment observation",
    )
  }

  return observation
}

interface WireStatus {
  name: string
  observedAt: number
  questionNumber?: number
  cooldown?: number
  answersOnly?: boolean
  votingStartsAt?: number
  notePresent?: boolean
  noteSha256?: string
  answeredCount?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

// Passive observation only: no Socket.IO emission, mocked clock or application hook.
const observeStatuses = (page: Page) => {
  const rows: WireStatus[] = []
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

      const items: unknown[] = packet
      const [event, eventPayload] = items

      if (
        event === EVENTS.GAME.PLAYER_ANSWER &&
        typeof eventPayload === "number"
      ) {
        rows.push({
          name: EVENTS.GAME.PLAYER_ANSWER,
          observedAt: performance.now(),
          answeredCount: eventPayload,
        })

        return
      }

      if (event !== EVENTS.GAME.STATUS) {
        return
      }

      if (!isRecord(eventPayload) || typeof eventPayload.name !== "string") {
        return
      }

      const statusName = eventPayload.name
      const { data } = eventPayload

      if (!isRecord(data)) {
        return
      }

      rows.push({
        name: statusName,
        observedAt: performance.now(),
        ...(typeof data.questionNumber === "number"
          ? { questionNumber: data.questionNumber }
          : {}),
        ...(typeof data.cooldown === "number"
          ? { cooldown: data.cooldown }
          : {}),
        ...(typeof data.answersOnly === "boolean"
          ? { answersOnly: data.answersOnly }
          : {}),
        ...(typeof data.votingStartsAt === "number"
          ? { votingStartsAt: data.votingStartsAt }
          : {}),
        ...(typeof data.note === "string"
          ? {
              notePresent: true,
              noteSha256: createHash("sha256").update(data.note).digest("hex"),
            }
          : {}),
      })
    })
  })

  return rows
}

const endRecordedVote = async (manager: Page, hostWire: WireStatus[]) => {
  const renderer = manager.getByTestId("tadazz-show")
  await expect(renderer).toHaveAttribute("data-role", "manager")
  await expect(renderer).toHaveAttribute("data-show-scene", "voting")
  const voting = hostWire
    .filter((row) => row.name === STATUS.SELECT_ANSWER)
    .at(-1)
  expect(voting).toBeDefined()

  if (!voting) {
    throw new Error("The actual voting status was not observed")
  }
  // This count is emitted by RoundManager only after it records the real answer.

  await expect
    .poll(() =>
      hostWire.some(
        (row) =>
          row.name === EVENTS.GAME.PLAYER_ANSWER &&
          row.answeredCount === 1 &&
          row.observedAt >= voting.observedAt,
      ),
    )
    .toBe(true)
  const endTimer = manager.getByTestId("host-end-timer-btn")
  await expect(endTimer).toHaveCount(1)
  await expect(endTimer).toBeVisible()
  await expect(endTimer).toBeEnabled()
  await endTimer.click()
  await expect
    .poll(() =>
      hostWire.some(
        (row) =>
          row.name === STATUS.SHOW_RESPONSES &&
          row.observedAt >= voting.observedAt,
      ),
    )
    .toBe(true)
  await expect(renderer).toHaveAttribute("data-show-scene", "results")
}

const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
const questions = [
  {
    type: "single" as const,
    question: "Answers-only text question: choose Paris",
    answers: ["Paris", "Rome"],
    solutions: [0],
    cooldown: 2,
    time: 60,
  },
  {
    type: "single" as const,
    question: "Answers-only image question: choose Paris",
    answers: ["Paris", "Rome"],
    solutions: [0],
    cooldown: 2,
    time: 60,
    media: { type: "image" as const, url: image },
  },
]

for (const answersOnly of [false, true]) {
  test(`ordinary player answers-only ${answersOnly ? "enabled regression" : "disabled control"}`, async ({
    page: manager,
    newPage,
  }, testInfo) => {
    test.setTimeout(100_000)
    const observations: Array<Record<string, unknown>> = []
    const hostWire = observeStatuses(manager)
    const player = await newPage({
      viewport: { width: 390, height: 664 },
      isMobile: true,
      hasTouch: true,
    })
    const playerWire = observeStatuses(player)
    const spectator = await newPage()
    const spectatorWire = observeStatuses(spectator)
    const receiptPath = testInfo.outputPath(`answers-only-${answersOnly}.json`)
    const receipt: Record<string, unknown> = {
      answersOnlyRequested: answersOnly,
      gameSpeed: 1,
      applicationClockMocked: false,
      passiveWireObserver: true,
      leadInProtocolSeconds: 2,
      // Frame-receipt timing has transport/scheduler noise; exact raw times remain.
      wireObservationToleranceMs: 50,
      observations,
      hostWire,
      playerWire,
      spectatorWire,
      selectedTheme: "razzia-original",
      completedQuestions: 0,
    }
    const save = () =>
      writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)

    try {
      const subject = `Answers-only razzia-original single ${answersOnly} ${randomUUID()}`
      seedQuizz(subject, { questions })
      const pin = await createGame(manager, subject)
      await manager
        .getByRole("button", { name: t("game:settings.title") })
        .click()
      const settings = manager.getByRole("dialog")
      const control = settings.getByRole("switch", {
        name: t("game:settings.answersOnly.label"),
        exact: true,
      })

      if (
        (await control.getAttribute("aria-checked")) !== String(answersOnly)
      ) {
        await control.click()
      }

      await expect(control).toHaveAttribute("aria-checked", String(answersOnly))
      const completion = settings.getByTestId("settings-end-on-all-answered")

      if ((await completion.getAttribute("aria-checked")) === "true") {
        await completion.click()
      }

      await expect(completion).toHaveAttribute("aria-checked", "false")
      const autoAdvance = settings.getByRole("switch", {
        name: t("game:settings.autoAdvance.label"),
        exact: true,
      })

      if ((await autoAdvance.getAttribute("aria-checked")) === "true") {
        await autoAdvance.click()
      }

      await expect(autoAdvance).toHaveAttribute("aria-checked", "false")
      await settings
        .getByRole("button", { name: t("common:save"), exact: true })
        .click()
      await expect(settings).toBeHidden()
      await joinGame(player, pin, "Answers QA")
      await expect(
        manager.getByText("Answers QA", { exact: true }),
      ).toBeVisible()
      const room = /\/party\/manager\/([0-9a-f-]{36})/u.exec(
        new URL(manager.url()).pathname,
      )
      expect(room).not.toBeNull()

      if (!room) {
        throw new Error("The real manager room URL is required")
      }

      await spectator.goto(`/display/${room[1]}`)
      await expect(spectator.getByTestId("audience-display")).toBeVisible()
      await startGame(manager)

      for (const [index, question] of questions.entries()) {
        const questionNumber = index + 1
        const hostRound = manager.locator(
          '[data-native-question-round][data-question-phase="question"]',
        )
        await expect(hostRound).toHaveCount(1)
        const hostHeading = await hostRound
          .locator("[data-native-question-heading]")
          .elementHandle()
        expect(hostHeading).not.toBeNull()
        await expect(
          hostRound.locator("[data-native-question-heading]"),
        ).toHaveText(question.question)
        await expect(
          player.getByRole("button", { name: "1 Paris", exact: true }),
        ).toBeEnabled()
        await expect
          .poll(() =>
            playerWire.some(
              (row) =>
                row.name === STATUS.SELECT_ANSWER &&
                row.questionNumber === questionNumber,
            ),
          )
          .toBe(true)
        const lead = playerWire.find(
          (row) =>
            row.name === STATUS.SHOW_QUESTION &&
            row.questionNumber === questionNumber,
        )
        const voting = playerWire.find(
          (row) =>
            row.name === STATUS.SELECT_ANSWER &&
            row.questionNumber === questionNumber,
        )
        expect(lead).toBeDefined()
        expect(voting).toBeDefined()

        if (!lead || !voting) {
          throw new Error("The real question and voting statuses are required")
        }

        expect(lead.cooldown).toBe(2)
        expect(voting.answersOnly).toBe(answersOnly)
        expect(typeof voting.votingStartsAt).toBe("number")
        const wireLeadMs = voting.observedAt - lead.observedAt
        expect(wireLeadMs).toBeGreaterThanOrEqual(1950)

        const hostRenderer = manager.getByTestId("tadazz-show")
        await expect(hostRenderer).toHaveAttribute(
          "data-show-theme",
          "razzia-original",
        )
        await expect(hostRenderer).toHaveAttribute("data-native-layout", "true")
        await expect(hostRenderer).toHaveAttribute("data-role", "manager")
        const spectatorRound = spectator.locator(
          '[data-native-question-round][data-question-phase="voting"]',
        )
        await expect(spectatorRound).toHaveCount(1)
        await expect(
          spectatorRound.locator("[data-native-question-heading]"),
        ).toBeVisible()
        const spectatorShowQuestionCount = await spectator
          .getByRole("button", { name: t("game:question.show"), exact: true })
          .count()
        const spectatorSubmissionControls = spectator
          .getByRole("button", { name: /^[12] (Paris|Rome)$/u })
          .or(
            spectator.getByRole("button", {
              name: t("game:confirm"),
              exact: true,
            }),
          )
        const spectatorEnabledSubmissionCount =
          await spectatorSubmissionControls
            .and(spectator.locator(":enabled"))
            .count()
        expect
          .soft(
            spectatorShowQuestionCount,
            "The public spectator must not receive the player-only question-reading control",
          )
          .toBe(0)
        expect
          .soft(
            spectatorEnabledSubmissionCount,
            "The public spectator cannot submit an answer",
          )
          .toBe(0)
        const hostVoting = manager.locator(
          '[data-native-question-round][data-question-phase="voting"]',
        )
        await expect(hostVoting).toHaveCount(1)
        await expect(
          hostVoting.locator("[data-native-question-heading]"),
        ).toBeVisible()
        const hostHeadingStableAtVoting = await hostHeading.evaluate(
          (element) =>
            element.isConnected &&
            element ===
              document.querySelector(
                '[data-native-question-round][data-question-phase="voting"] [data-native-question-heading]',
              ),
        )
        expect(hostHeadingStableAtVoting).toBe(true)
        const playerRound = player.locator(
          '[data-native-question-round][data-question-phase="voting"]',
        )
        await expect(playerRound).toHaveCount(1)
        const showQuestion = player.getByRole("button", {
          name: t("game:question.show"),
          exact: true,
        })
        const showQuestionCount = await showQuestion.count()
        const playerHeadingVisible = await playerRound
          .locator("[data-native-question-heading]")
          .isVisible()
        const row: Record<string, unknown> = {
          questionNumber,
          questionHasImage: Boolean(question.media),
          observedNativePlayerRoute: true,
          wireAnswersOnly: voting.answersOnly,
          hostRenderer: {
            theme: "razzia-original",
            nativeLayout: true,
            role: "manager",
          },
          spectatorHeadingVisible: true,
          spectatorShowQuestionCount,
          spectatorEnabledSubmissionCount,
          wireLeadMs,
          hostHeadingStableAtVoting,
          playerHeadingVisible,
          showQuestionCount,
          dialogOpened: false,
          readableQuestionTitle: false,
        }
        observations.push(row)
        save()
        const votingScreenshotPath = testInfo.outputPath(
          `answers-only-${answersOnly}-q${questionNumber}-voting.png`,
        )
        await player.screenshot({ path: votingScreenshotPath })
        await testInfo.attach(
          `answers-only-${answersOnly}-q${questionNumber}-voting`,
          { path: votingScreenshotPath, contentType: "image/png" },
        )
        expect
          .soft(
            playerHeadingVisible,
            "Player heading visibility must follow the supported answers-only setting during voting",
          )
          .toBe(!answersOnly)
        expect
          .soft(
            showQuestionCount,
            "Answers-only players must retain a question-reading control for text and image questions",
          )
          .toBe(answersOnly ? 1 : 0)

        if (answersOnly && showQuestionCount === 1) {
          await showQuestion.click()
          const dialog = player.getByRole("dialog")
          await expect(dialog).toBeVisible()
          const title = dialog.getByRole("heading", {
            name: question.question,
            exact: true,
          })
          await expect(title).toHaveCount(1)
          const box = await title.boundingBox()
          const readableQuestionTitle = Boolean(
            box && box.width >= 100 && box.height >= 20,
          )
          row.dialogOpened = true
          row.readableQuestionTitle = readableQuestionTitle
          row.dialogTitleBox = box
          expect
            .soft(
              readableQuestionTitle,
              "The question title must be visibly readable, not only a visually-hidden accessible title",
            )
            .toBe(true)
          const dialogScreenshotPath = testInfo.outputPath(
            `answers-only-${answersOnly}-q${questionNumber}-dialog.png`,
          )
          await player.screenshot({ path: dialogScreenshotPath })
          await testInfo.attach(
            `answers-only-${answersOnly}-q${questionNumber}-dialog`,
            { path: dialogScreenshotPath, contentType: "image/png" },
          )
          await player.keyboard.press("Escape")
          await expect(dialog).toBeHidden()
          expect
            .soft(
              await playerRound
                .locator("[data-native-question-heading]")
                .isVisible(),
            )
            .toBe(false)
        } else if (answersOnly) {
          row.dialogNotAttemptedReason = "required-question-control-missing"
        }

        await answer(player, "Paris")
        await endRecordedVote(manager, hostWire)
        await expect(
          player.getByText(t("game:correct"), { exact: true }),
        ).toBeVisible()
        const hostResults = manager.locator(
          '[data-native-question-round][data-question-phase="results"]',
        )
        await expect(hostResults).toHaveCount(1)
        await expect(
          hostResults.locator("[data-native-question-heading]"),
        ).toBeVisible()
        const hostHeadingStableAtReveal = await hostHeading.evaluate(
          (element) =>
            element.isConnected &&
            element ===
              document.querySelector(
                '[data-native-question-round][data-question-phase="results"] [data-native-question-heading]',
              ),
        )
        row.hostHeadingStableAtReveal = hostHeadingStableAtReveal
        row.realAnswerAcceptedAndScored = true
        expect(hostHeadingStableAtReveal).toBe(true)
        receipt.completedQuestions = questionNumber
        save()
        await hostHeading.dispose()

        if (index < questions.length - 1) {
          await next(manager)
        }
      }
    } finally {
      receipt.playwrightStatusAtFinally = testInfo.status
      receipt.assertionErrorCount = testInfo.errors.length
      receipt.requiredBehaviorPassed =
        testInfo.errors.length === 0 && receipt.completedQuestions === 2
      save()
      await testInfo.attach(`answers-only-${answersOnly}`, {
        path: receiptPath,
        contentType: "application/json",
      })
    }
  })
}

const explanationCases = [
  {
    theme: "razzia-original",
    type: "single",
    key: "razzia-choice",
    name: "ordinary manager receives the supported explanation at reveal",
  },
  {
    theme: "razzia-original",
    type: "estimation",
    key: "razzia-estimation",
    name: "Razzia estimation manager receives the explanation in the existing reveal",
  },
  {
    theme: "tadazz-classic",
    type: "single",
    key: "classic-choice",
    name: "Classic choice preserves its existing single manager explanation",
  },
  {
    theme: "tadazz-classic",
    type: "estimation",
    key: "classic-estimation",
    name: "Classic estimation manager receives the explanation in the existing reveal",
  },
] as const

for (const scenario of explanationCases) {
  test(scenario.name, async ({ page: manager, newPage, request }, testInfo) => {
    test.setTimeout(100_000)
    const suffix = randomUUID()
    const subject = `Explanation ${scenario.theme} ${scenario.type} ${suffix}`
    const note = `Synthetic ${scenario.theme} ${scenario.type} explanation ${suffix}: the selected value is correct.`
    const expectedNoteSha256 = createHash("sha256").update(note).digest("hex")
    const hostWire = observeStatuses(manager)
    const player = await newPage()
    const spectator = await newPage()
    const playerWire = observeStatuses(player)
    const spectatorWire = observeStatuses(spectator)
    const path = testInfo.outputPath(`manager-explanation-${scenario.key}.json`)
    const receipt: Record<string, unknown> = {
      applicationClockMocked: false,
      selectedTheme: scenario.theme,
      questionType: scenario.type,
      expectedNoteSha256,
      hostWire,
      playerWire,
      spectatorWire,
      actualRevealObserved: false,
    }
    const save = () =>
      writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`)

    try {
      const question =
        scenario.type === "single"
          ? { ...questions[0], note }
          : {
              type: "estimation" as const,
              question: "Pick 50 for this explanation",
              answers: [],
              solutions: [50],
              cooldown: 2,
              time: 60,
              note,
              options: {
                inputMode: "input" as const,
                min: 0,
                max: 100,
                step: 1,
                margin: 10,
              },
            }
      const quizz = {
        subject,
        gameMode: "quiz" as const,
        questions: [question],
      }
      const extras = createDefaultQuizExtrasV2(
        randomUUID(),
        [randomUUID()],
        computeCanonicalBaseDigest(quizz),
      )
      extras.defaults.showTheme = {
        id: scenario.theme,
        version: "1.0.0",
        overrides: {},
      }
      extras.defaults.advanceMode = "auto"
      const login = await request.post("/api/auth/manager", {
        data: { password: MANAGER_PASSWORD },
      })
      expect(login.ok()).toBe(true)
      const loginData: unknown = await login.json()

      if (!isRecord(loginData) || typeof loginData.token !== "string") {
        throw new Error("The real manager login must return a token")
      }

      const { token } = loginData
      const saved = await request.post("/api/extensions/quizzes", {
        headers: { Authorization: `Bearer ${token}` },
        data: { quizz, extras },
      })
      expect(
        saved.ok(),
        "The actual authenticated native composite save must accept the distinct themed fixture",
      ).toBe(true)
      const savedIdentity: unknown = await saved.json()

      if (!isRecord(savedIdentity)) {
        throw new Error("The native save must return its quiz identity")
      }

      expect(typeof savedIdentity.quizId).toBe("string")
      receipt.nativeCompositeFixtureCreated = true
      const pin = await createGame(manager, subject)
      await manager
        .getByRole("button", { name: t("game:settings.title") })
        .click()
      const settings = manager.getByRole("dialog")
      const completion = settings.getByTestId("settings-end-on-all-answered")

      if ((await completion.getAttribute("aria-checked")) === "true") {
        await completion.click()
      }

      await expect(completion).toHaveAttribute("aria-checked", "false")
      const autoAdvance = settings.getByRole("switch", {
        name: t("game:settings.autoAdvance.label"),
        exact: true,
      })

      if ((await autoAdvance.getAttribute("aria-checked")) === "true") {
        await autoAdvance.click()
      }

      await expect(autoAdvance).toHaveAttribute("aria-checked", "false")
      await settings
        .getByRole("button", { name: t("common:save"), exact: true })
        .click()
      await expect(settings).toBeHidden()
      await joinGame(player, pin, "Explanation QA")

      if (scenario.theme === "tadazz-classic") {
        const presence = manager.getByTestId("host-bottom-players-btn")
        await expect(presence).toBeVisible()
        await expect(presence.getByTestId("host-connected-counter")).toHaveText(
          /^1(?:\s*\/\s*1)?$/u,
        )
        await presence.click()
        const roster = manager.getByTestId("host-players-modal")
        await expect(roster).toBeVisible()
        const joinedName = roster.getByText("Explanation QA", { exact: true })
        await expect(joinedName).toHaveCount(1)
        await expect(joinedName).toBeVisible()
        await expect(
          roster
            .getByRole("row")
            .filter({
              has: manager.getByText("Explanation QA", { exact: true }),
            })
            .locator('[data-status="connected"]'),
        ).toHaveCount(1)
        await roster.getByTestId("host-players-close-btn").click()
        await expect(roster).toBeHidden()
        receipt.joinConfirmedViaHostRoster = true
      } else {
        await expect(
          manager.getByText("Explanation QA", { exact: true }),
        ).toBeVisible()
      }

      const room = /\/party\/manager\/([0-9a-f-]{36})/u.exec(
        new URL(manager.url()).pathname,
      )
      expect(room).not.toBeNull()

      if (!room) {
        throw new Error("The real manager room URL is required")
      }

      await spectator.goto(`/display/${room[1]}`)
      await expect(spectator.getByTestId("audience-display")).toBeVisible()
      await startGame(manager)
      const hostRenderer = manager.getByTestId("tadazz-show")
      await expect(hostRenderer).toHaveAttribute(
        "data-show-theme",
        scenario.theme,
      )
      await expect(hostRenderer).toHaveAttribute("data-role", "manager")

      if (scenario.theme === "razzia-original") {
        await expect(hostRenderer).toHaveAttribute("data-native-layout", "true")
      } else {
        await expect(hostRenderer).not.toHaveAttribute(
          "data-native-layout",
          "true",
        )
      }

      if (scenario.type === "single") {
        await answer(player, "Paris")
      } else {
        await player.getByLabel(t("game:estimation.yourAnswer")).fill("50")
        await confirm(player)
      }

      await endRecordedVote(manager, hostWire)
      await expect(
        player.getByText(t("game:correct"), { exact: true }),
      ).toBeVisible()
      await expect
        .poll(() =>
          hostWire.some(
            (row) =>
              row.name === STATUS.SHOW_RESPONSES &&
              row.noteSha256 === expectedNoteSha256,
          ),
        )
        .toBe(true)

      if (scenario.theme === "razzia-original") {
        await expect(
          manager.locator(
            '[data-native-question-round][data-question-phase="results"]',
          ),
        ).toHaveCount(1)
      } else {
        await expect(hostRenderer).toHaveAttribute("data-show-scene", "results")

        if (scenario.type === "estimation") {
          await expect(
            manager.getByTestId("tadazz-screen-estimation"),
          ).toBeVisible()
        }
      }

      receipt.actualRevealObserved = true
      receipt.realAnswerAcceptedAndScored = true
      receipt.actualRenderer = {
        theme: await hostRenderer.getAttribute("data-show-theme"),
        nativeLayout: await hostRenderer.getAttribute("data-native-layout"),
        scene: await hostRenderer.getAttribute("data-show-scene"),
        role: await hostRenderer.getAttribute("data-role"),
      }
      save()
      const managerNote = manager.getByText(note, { exact: true })
      // The existing Classic choice renderer animates into its reveal. Await the
      // real choreography while keeping an absent explanation an actual failure.
      await expect
        .soft(
          managerNote,
          "A manager explanation must become visibly readable within the existing reveal",
        )
        .toBeVisible({ timeout: 20_000 })
      await expect
        .soft(
          managerNote,
          "The existing reveal must contain exactly one explanation",
        )
        .toHaveCount(1)
      const managerNoteCount = await managerNote.count()
      const noteVisibleToManager =
        managerNoteCount === 1 && (await managerNote.isVisible())
      let noteBox: Awaited<ReturnType<typeof managerNote.boundingBox>> = null
      let noteBoxInsideViewport = false
      let noteViewportIntersectionRatio: number | null = null
      let noteViewportIsIntersecting = false
      let noteFullyInViewport = false
      let noteViewportContainment: ViewportContainmentObservation | null = null

      if (noteVisibleToManager) {
        noteViewportContainment = await requireViewportContainment(
          managerNote,
          (observation) => {
            receipt.noteViewportContainment = observation
            save()
          },
          true,
        )
        noteBox = await managerNote.boundingBox()
        const viewport = manager.viewportSize()
        noteBoxInsideViewport = Boolean(
          noteBox &&
          viewport &&
          noteBox.x >= 0 &&
          noteBox.y >= 0 &&
          noteBox.x + noteBox.width <= viewport.width &&
          noteBox.y + noteBox.height <= viewport.height,
        )
        expect.soft(noteBoxInsideViewport).toBe(true)
        noteViewportIntersectionRatio = noteViewportContainment.ratio
        noteViewportIsIntersecting = noteViewportContainment.isIntersecting
        noteFullyInViewport = noteViewportContainment.containment.fullyContained
      }

      const playerNoteCount = await player
        .getByText(note, { exact: true })
        .count()
      const spectatorNoteCount = await spectator
        .getByText(note, { exact: true })
        .count()
      const playerWireContainsNote = playerWire.some((row) => row.notePresent)
      const spectatorWireContainsNote = spectatorWire.some(
        (row) => row.notePresent,
      )
      Object.assign(receipt, {
        managerNoteCount,
        noteVisibleToManager,
        noteBoxInsideViewport,
        noteViewportIntersectionRatio,
        noteViewportIsIntersecting,
        noteFullyInViewport,
        noteViewportContainment,
        noteBox,
        playerNoteCount,
        spectatorNoteCount,
        playerWireContainsNote,
        spectatorWireContainsNote,
      })
      save()
      const revealScreenshotPath = testInfo.outputPath(
        `manager-explanation-${scenario.key}-reveal.png`,
      )
      await manager.screenshot({ path: revealScreenshotPath })
      await testInfo.attach(`manager-explanation-${scenario.key}-reveal`, {
        path: revealScreenshotPath,
        contentType: "image/png",
      })
      expect
        .soft(
          playerNoteCount,
          "Manager explanation must not leak onto the ordinary player",
        )
        .toBe(0)
      expect
        .soft(
          spectatorNoteCount,
          "Manager explanation must not leak onto the public display",
        )
        .toBe(0)
      expect
        .soft(
          playerWireContainsNote,
          "Player note privacy filtering must stay intact",
        )
        .toBe(false)
      expect
        .soft(
          spectatorWireContainsNote,
          "Spectator note privacy filtering must stay intact",
        )
        .toBe(false)
    } finally {
      receipt.playwrightStatusAtFinally = testInfo.status
      receipt.assertionErrorCount = testInfo.errors.length
      receipt.requiredBehaviorPassed =
        testInfo.errors.length === 0 && receipt.actualRevealObserved === true
      save()
      await testInfo.attach(`manager-explanation-${scenario.key}`, {
        path,
        contentType: "application/json",
      })
    }
  })
}

interface ExplanationState {
  seq: number
  epoch: number
  phase: string
  questionId?: string
}

const observeLongExplanation = (page: Page, privateMarker: string) => {
  const observation = {
    states: [] as ExplanationState[],
    results: [] as Array<{
      correct: boolean
      points: number
      myPoints: number
      rank: number
    }>,
    privateMarkerReceived: false,
  }
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      const raw = typeof payload === "string" ? payload : payload.toString()

      if (raw.includes(privateMarker)) {
        observation.privateMarkerReceived = true
      }

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

      const items: unknown[] = packet
      const [event, value] = items

      if (!isRecord(value)) {
        return
      }

      if (
        event === EVENTS.EXTENSIONS.STATE &&
        typeof value.seq === "number" &&
        typeof value.epoch === "number" &&
        typeof value.phase === "string"
      ) {
        observation.states.push({
          seq: value.seq,
          epoch: value.epoch,
          phase: value.phase,
          ...(typeof value.questionId === "string"
            ? { questionId: value.questionId }
            : {}),
        })
      }

      if (
        event === EVENTS.GAME.STATUS &&
        value.name === STATUS.SHOW_RESULT &&
        isRecord(value.data)
      ) {
        const result = value.data

        if (
          typeof result.correct === "boolean" &&
          typeof result.points === "number" &&
          typeof result.myPoints === "number" &&
          typeof result.rank === "number"
        ) {
          observation.results.push({
            correct: result.correct,
            points: result.points,
            myPoints: result.myPoints,
            rank: result.rank,
          })
        }
      }
    })
  })

  return observation
}

test("Classic long question and explanation remain readable through real scrolling", async ({
  page: manager,
  newPage,
  request,
}, testInfo) => {
  test.setTimeout(100_000)
  const suffix = randomUUID()
  const privateMarker = `Private explanation ${suffix}`
  const questionEnd = "END OF LONG QUESTION."
  const noteEnd = "END OF PRIVATE EXPLANATION."
  const longQuestion = [
    "Choose Paris for this long travel question.",
    ...Array.from(
      { length: 8 },
      (_, index) =>
        `Context ${index + 1}: the travel group is comparing the French capital with another European city, while reviewing its route and meeting points.`,
    ),
    questionEnd,
  ].join(" ")
  const note = [
    privateMarker,
    ...Array.from(
      { length: 16 },
      (_, index) =>
        `Explanation ${index + 1}: Paris is the correct answer for this synthetic travel question. The manager may read this supporting detail without sending the explanation to participants.`,
    ),
    noteEnd,
  ].join(" ")
  const expectedNoteSha256 = createHash("sha256").update(note).digest("hex")
  const hostWire = observeStatuses(manager)
  const hostObservation = observeLongExplanation(manager, privateMarker)
  const player = await newPage()
  const spectator = await newPage()
  const playerObservation = observeLongExplanation(player, privateMarker)
  const spectatorObservation = observeLongExplanation(spectator, privateMarker)
  const regions: Array<Record<string, unknown>> = []
  const receiptPath = testInfo.outputPath("classic-long-explanation.json")
  const receipt: Record<string, unknown> = {
    applicationClockMocked: false,
    passiveWireObserver: true,
    selectedTheme: "tadazz-classic",
    questionType: "single",
    gameSpeed: 1,
    questionLength: longQuestion.length,
    questionSha256: createHash("sha256").update(longQuestion).digest("hex"),
    noteLength: note.length,
    expectedNoteSha256,
    hostWire,
    hostObservation,
    playerObservation,
    spectatorObservation,
    regions,
    allLongTextVisibleAtOnce: false,
    requiredBehaviorPassed: false,
  }
  const save = () =>
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)

  try {
    const subject = `Long explanation Classic ${suffix}`
    const question = { ...questions[0], question: longQuestion, note }
    const quizz = { subject, gameMode: "quiz" as const, questions: [question] }
    const questionId = randomUUID()
    const extras = createDefaultQuizExtrasV2(
      randomUUID(),
      [questionId],
      computeCanonicalBaseDigest(quizz),
    )
    extras.defaults.showTheme = {
      id: "tadazz-classic",
      version: "1.0.0",
      overrides: {},
    }
    extras.defaults.advanceMode = "auto"
    const login = await request.post("/api/auth/manager", {
      data: { password: MANAGER_PASSWORD },
    })
    expect(login.ok()).toBe(true)
    const loginData: unknown = await login.json()

    if (!isRecord(loginData) || typeof loginData.token !== "string") {
      throw new Error("The real manager login must return a token")
    }

    const saved = await request.post("/api/extensions/quizzes", {
      headers: { Authorization: `Bearer ${loginData.token}` },
      data: { quizz, extras },
    })
    expect(
      saved.ok(),
      "The real native schema must accept the bounded long-content fixture",
    ).toBe(true)
    const savedIdentity: unknown = await saved.json()

    if (!isRecord(savedIdentity) || typeof savedIdentity.quizId !== "string") {
      throw new Error("The native save must return its actual quiz identity")
    }

    receipt.nativeCompositeFixtureCreated = true
    const pin = await createGame(manager, subject)
    await manager
      .getByRole("button", { name: t("game:settings.title") })
      .click()
    const settings = manager.getByRole("dialog")
    const completion = settings.getByTestId("settings-end-on-all-answered")

    if ((await completion.getAttribute("aria-checked")) === "true") {
      await completion.click()
    }

    await expect(completion).toHaveAttribute("aria-checked", "false")
    const autoAdvance = settings.getByRole("switch", {
      name: t("game:settings.autoAdvance.label"),
      exact: true,
    })

    if ((await autoAdvance.getAttribute("aria-checked")) === "true") {
      await autoAdvance.click()
    }

    await expect(autoAdvance).toHaveAttribute("aria-checked", "false")
    await settings
      .getByRole("button", { name: t("common:save"), exact: true })
      .click()
    await expect(settings).toBeHidden()
    await joinGame(player, pin, "Long explanation QA")
    const presence = manager.getByTestId("host-bottom-players-btn")
    await expect(presence).toBeVisible()
    await expect(presence.getByTestId("host-connected-counter")).toHaveText(
      /^1(?:\s*\/\s*1)?$/u,
    )
    await presence.click()
    const roster = manager.getByTestId("host-players-modal")
    await expect(roster).toBeVisible()
    await expect(
      roster.getByText("Long explanation QA", { exact: true }),
    ).toHaveCount(1)
    await expect(
      roster.getByText("Long explanation QA", { exact: true }),
    ).toBeVisible()
    await expect(
      roster
        .getByRole("row")
        .filter({
          has: manager.getByText("Long explanation QA", { exact: true }),
        })
        .locator('[data-status="connected"]'),
    ).toHaveCount(1)
    await roster.getByTestId("host-players-close-btn").click()
    await expect(roster).toBeHidden()
    const room = /\/party\/manager\/([0-9a-f-]{36})/u.exec(
      new URL(manager.url()).pathname,
    )

    if (!room) {
      throw new Error("The actual manager room URL is required")
    }

    await spectator.goto(`/display/${room[1]}`)
    await expect(spectator.getByTestId("audience-display")).toBeVisible()
    await startGame(manager)
    const renderer = manager.getByTestId("tadazz-show")
    await expect(renderer).toHaveAttribute("data-show-theme", "tadazz-classic")
    await expect(renderer).toHaveAttribute("data-role", "manager")
    await expect(renderer).not.toHaveAttribute("data-native-layout", "true")
    await answer(player, "Paris")
    await endRecordedVote(manager, hostWire)
    await expect(
      player.getByText(t("game:correct"), { exact: true }),
    ).toBeVisible()
    await expect.poll(() => playerObservation.results.length).toBe(1)
    const [scoredResult] = playerObservation.results
    expect(scoredResult.correct).toBe(true)
    expect(Number.isInteger(scoredResult.myPoints)).toBe(true)
    expect(scoredResult.myPoints).toBeGreaterThan(0)
    expect(scoredResult.myPoints).toBeLessThanOrEqual(1000)
    expect(scoredResult.points).toBe(scoredResult.myPoints)
    expect(scoredResult.rank).toBe(1)
    await expect
      .poll(() =>
        hostWire.some(
          (row) =>
            row.name === STATUS.SHOW_RESPONSES &&
            row.noteSha256 === expectedNoteSha256,
        ),
      )
      .toBe(true)
    await expect(renderer).toHaveAttribute("data-show-scene", "results")
    const frame = manager.getByTestId("tadazz-question-panel")
    await expect(frame).toHaveCount(1)
    const questionRegion = frame.locator(".q-text")
    const noteRegion = frame.getByTestId("tadazz-question-note")
    await expect(questionRegion).toHaveText(longQuestion)
    await expect(noteRegion).toHaveCount(1)
    await expect(noteRegion).toHaveText(note)
    await expect(noteRegion).toBeVisible({ timeout: 20_000 })
    await expect(manager.getByText(note, { exact: true })).toHaveCount(1)
    await expect
      .poll(() => ({
        questionId: hostObservation.states.at(-1)?.questionId,
        phase: hostObservation.states.at(-1)?.phase,
      }))
      .toEqual({ questionId, phase: "responses" })
    const baselineState = hostObservation.states.at(-1)

    if (!baselineState) {
      throw new Error("The real authoritative question state is required")
    }

    const statusCount = hostWire.filter(
      (row) => row.name !== EVENTS.GAME.PLAYER_ANSWER,
    ).length
    receipt.actualRevealObserved = true
    receipt.realAnswerAcceptedAndScored = scoredResult
    receipt.authoritativeStateBeforeScrolling = baselineState
    receipt.viewport = manager.viewportSize()
    save()

    const card = manager.getByTestId("tadazz-card-0")
    await expect(card).toBeVisible()
    const cardBox = await card.boundingBox()
    const frameBox = await frame.boundingBox()

    if (!cardBox || !frameBox) {
      throw new Error("Actual question and answer geometry is required")
    }

    expect(
      frameBox.y + frameBox.height,
      "The expanded explanation panel must not overlap the answer cards",
    ).toBeLessThanOrEqual(cardBox.y)

    for (const entry of [
      { key: "question", locator: questionRegion, endMarker: questionEnd },
      { key: "explanation", locator: noteRegion, endMarker: noteEnd },
    ]) {
      const region = entry.locator
      await expect(region).toHaveCount(1)
      const initialViewport = await requireViewportContainment(
        region,
        (observation) => {
          receipt.lastViewportContainment = {
            region: entry.key,
            stage: "before-scrolling",
            observation,
          }
          save()
        },
      )
      const metrics = () =>
        region.evaluate((element) => ({
          scrollTop: element.scrollTop,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
          clientWidth: element.clientWidth,
          reachedEnd:
            Math.abs(
              element.scrollHeight - element.clientHeight - element.scrollTop,
            ) <= 1,
        }))
      const initial = await metrics()
      expect(initial.clientHeight).toBeGreaterThan(0)
      expect(initial.clientWidth).toBeGreaterThan(0)
      expect(
        initial.scrollHeight,
        "The long-content case must actually exercise overflow",
      ).toBeGreaterThan(initial.clientHeight + 1)
      expect(initial.scrollTop).toBeLessThanOrEqual(1)
      const intersection = await observeViewportContainment(region)
      receipt.lastViewportContainment = {
        region: entry.key,
        stage: "overflow-confirmed",
        observation: intersection,
      }
      save()
      expect(intersection.containment.fullyContained).toBe(true)
      const box = await region.boundingBox()

      if (!box) {
        throw new Error(
          "The real scroll region must have a visible bounding box",
        )
      }

      expect(box.width).toBeGreaterThan(100)
      expect(box.height).toBeGreaterThan(10)
      expect(box.y + box.height).toBeLessThanOrEqual(cardBox.y)
      const row: Record<string, unknown> = {
        key: entry.key,
        initial,
        box,
        initialViewport,
        intersection,
        allTextVisibleAtOnce: false,
      }
      regions.push(row)
      save()

      // Real pointer input must reach the text; no scrollTop/DOM setter is used.
      await manager.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await manager.mouse.wheel(0, initial.scrollHeight + initial.clientHeight)
      await expect.poll(async () => (await metrics()).reachedEnd).toBe(true)
      row.afterWheel = await metrics()
      expect(hostObservation.states.at(-1)).toEqual(baselineState)
      await expect(renderer).toHaveAttribute("data-show-scene", "results")

      await region.click()
      await expect(region).toBeFocused()
      await manager.keyboard.press("Home")
      await expect
        .poll(async () => (await metrics()).scrollTop)
        .toBeLessThanOrEqual(1)
      row.afterHome = await metrics()
      await manager.keyboard.press("PageDown")
      await expect
        .poll(async () => (await metrics()).scrollTop)
        .toBeGreaterThan(0)
      row.afterPageDown = await metrics()
      await manager.keyboard.press("End")
      await expect.poll(async () => (await metrics()).reachedEnd).toBe(true)
      row.afterKeyboardEnd = await metrics()
      const lastText = await region.evaluate((element, endMarker) => {
        const node = element.firstChild

        if (!(node instanceof Text) || !node.data.endsWith(endMarker)) {
          throw new Error(
            "The unchanged final text must remain in the existing scroll region",
          )
        }

        const range = document.createRange()
        range.setStart(node, node.length - endMarker.length)
        range.setEnd(node, node.length)
        const textBox = range.getBoundingClientRect()
        const regionBox = element.getBoundingClientRect()

        return {
          width: textBox.width,
          height: textBox.height,
          insideVisibleRegion:
            textBox.left >= regionBox.left &&
            textBox.right <= regionBox.right &&
            textBox.top >= regionBox.top &&
            textBox.bottom <= regionBox.bottom,
        }
      }, entry.endMarker)
      expect(lastText.width).toBeGreaterThan(0)
      expect(lastText.height).toBeGreaterThan(0)
      expect(
        lastText.insideVisibleRegion,
        "The final text must actually be readable after scrolling to the end",
      ).toBe(true)
      row.lastText = lastText
      row.actualPointerAndKeyboardReachedEnd = true
      expect(hostObservation.states.at(-1)).toEqual(baselineState)
      expect(
        hostWire.filter((status) => status.name !== EVENTS.GAME.PLAYER_ANSWER),
      ).toHaveLength(statusCount)
      await expect(renderer).toHaveAttribute("data-show-scene", "results")
      row.afterScrollingViewport = await requireViewportContainment(
        region,
        (observation) => {
          receipt.lastViewportContainment = {
            region: entry.key,
            stage: "after-scrolling",
            observation,
          }
          save()
        },
      )
      save()
    }
    await expect(player.getByText(note, { exact: true })).toHaveCount(0)
    await expect(spectator.getByText(note, { exact: true })).toHaveCount(0)
    expect(
      playerObservation.privateMarkerReceived,
      "No audience socket event may contain the private explanation marker",
    ).toBe(false)
    expect(
      spectatorObservation.privateMarkerReceived,
      "No public-display socket event may contain the private explanation marker",
    ).toBe(false)
    expect(hostObservation.privateMarkerReceived).toBe(true)
    expect(hostObservation.states.at(-1)).toEqual(baselineState)
    receipt.authoritativeStateAfterScrolling = hostObservation.states.at(-1)
    receipt.privateNoteAbsentFromAudience = true
    receipt.completedScrollRegions = regions.length
    const screenshotPath = testInfo.outputPath(
      "classic-long-explanation-scrolled.png",
    )
    await manager.screenshot({ path: screenshotPath })
    await testInfo.attach("classic-long-explanation-scrolled", {
      path: screenshotPath,
      contentType: "image/png",
    })
  } finally {
    receipt.playwrightStatusAtFinally = testInfo.status
    receipt.assertionErrorCount = testInfo.errors.length
    receipt.requiredBehaviorPassed =
      testInfo.errors.length === 0 &&
      receipt.completedScrollRegions === 2 &&
      receipt.privateNoteAbsentFromAudience === true
    save()
    await testInfo.attach("classic-long-explanation", {
      path: receiptPath,
      contentType: "application/json",
    })
  }
})
