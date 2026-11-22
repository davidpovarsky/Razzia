import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { expect, type Page } from "@playwright/test"
import { quizzValidator } from "@razzia/common/validators/quizz"
import { computeCanonicalBaseDigest } from "@razzia/extensions/core"
import { preflightShowImport } from "../../../extensions/src/core/show-import-preflight"
import { quizExtrasV2Schema } from "../../../extensions/src/core/studio-timeline-schema"
import { CONFIG_PATH, TZILA_PILOT_SECRET } from "./constants"
import { t } from "./i18n"

export const TZILA_ANSWER_COLORS = [
  "rgb(230, 159, 0)",
  "rgb(86, 180, 233)",
  "rgb(61, 191, 160)",
  "rgb(204, 121, 167)",
  "rgb(0, 114, 178)",
]

const fixture = fs.readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../../extensions/fixtures/tzila-show/TZILA_STORY_SHOW.tada.json",
  ),
)
assert.equal(
  createHash("sha256").update(fixture).digest("hex"),
  "bf7398a3e62a7ceedca4794f6a90e9075c49b8a265e969c9a297e22fbf191892",
)
const imported = preflightShowImport(fixture, "TZILA_STORY_SHOW.tada.json")
assert(imported.ok && imported.normalizedBundleDraft)
assert.deepEqual(imported.issues, [])
const quiz = quizzValidator.parse(imported.normalizedBundleDraft.quizz)
const extras = quizExtrasV2Schema.parse(imported.normalizedBundleDraft.extras)
assert.equal(quiz.questions.length, 10)
assert.equal(extras.timeline.length, 23)

/** Read the quiz created by the real dedicated globalSetup, including its allocated IDs. */
export const readStoredTzila = () => {
  const quizDirectory = path.join(CONFIG_PATH, "quizz")
  const matches = fs.readdirSync(quizDirectory).filter((name) => {
    if (!name.endsWith(".json")) {
      return false
    }

    const value: unknown = JSON.parse(
      fs.readFileSync(path.join(quizDirectory, name), "utf8"),
    )

    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "subject" in value &&
      value.subject === quiz.subject
    )
  })
  assert.equal(matches.length, 1)
  const [filename] = matches
  assert(filename)
  const quizId = path.basename(filename, ".json")
  const storedQuiz = quizzValidator.parse(
    JSON.parse(fs.readFileSync(path.join(quizDirectory, filename), "utf8")),
  )
  const storedExtras = quizExtrasV2Schema.parse(
    JSON.parse(
      fs.readFileSync(
        path.join(CONFIG_PATH, "extensions/quizzes", `${quizId}.json`),
        "utf8",
      ),
    ),
  )
  expect(storedQuiz).toEqual(quiz)
  expect(storedExtras.quizId).toBe(quizId)
  expect(storedExtras.baseDigest).toBe(computeCanonicalBaseDigest(storedQuiz))
  expect(storedExtras.questionIds).toHaveLength(10)
  expect(storedExtras.timeline.map((item) => item.kind)).toEqual(
    extras.timeline.map((item) => item.kind),
  )
  for (const [index, item] of storedExtras.timeline.entries()) {
    const expected = extras.timeline[index]
    assert(expected)

    if (item.kind === "question" || expected.kind === "question") {
      assert(item.kind === "question" && expected.kind === "question")
      expect(storedExtras.questionIds.indexOf(item.questionId)).toBe(
        extras.questionIds.indexOf(expected.questionId),
      )
    } else {
      const actualScene = new Map(Object.entries(storedExtras.scenes)).get(
        item.sceneId,
      )
      const expectedScene = new Map(Object.entries(extras.scenes)).get(
        expected.sceneId,
      )
      assert(actualScene && expectedScene)
      expect({ ...actualScene, id: expectedScene.id }).toEqual(expectedScene)
    }
  }

  return { quizz: storedQuiz, extras: storedExtras }
}

/** Plain Classic bookend names belong to the timeline; its preset owns the stage title. */
export const assertTzilaOpening = async (input: {
  manager: Page
  player: Page
  spectator?: Page
}) => {
  const stored = readStoredTzila()
  const first = stored.extras.timeline.at(0)
  assert(first?.kind === "opening")
  const opening = new Map(Object.entries(stored.extras.scenes)).get(
    first.sceneId,
  )
  assert(opening?.kind === "opening" && opening.title && opening.subtitle)
  for (const page of [
    input.manager,
    ...(input.spectator ? [input.spectator] : []),
  ]) {
    const intro = page.getByTestId("tadazz-intro-screen")
    await expect(intro).toHaveCount(1)
    await expect(intro).toHaveClass(/is-visible/u)
    await expect(intro.locator(".tz-intro-logo")).toBeVisible()
  }
  await expect(
    input.player.getByRole("heading", { name: opening.title, exact: true }),
  ).toBeVisible()
  await expect(
    input.player.getByText(opening.subtitle, { exact: true }),
  ).toBeVisible()
}

export const tzilaQuestion = (index: number) => {
  assert(Number.isInteger(index) && index >= 0 && index < quiz.questions.length)
  const question = quiz.questions.at(index)
  const questionId = extras.questionIds.at(index)
  assert(question && questionId)
  const visuals = extras.perQuestion[questionId]?.answerVisuals
  assert(visuals?.length === 5 && question.answers.length === 5)

  return {
    question,
    options: question.answers.map((label, answerIndex) => {
      const visual = visuals.find((item) => item.answerIndex === answerIndex)
      assert(visual?.display === "both" && visual.url && visual.alt)

      return { label, url: visual.url, alt: visual.alt }
    }),
  }
}

const tzilaResultTitle = (questionIndex: number) => {
  const questionId = extras.questionIds[questionIndex]
  const index = extras.timeline.findIndex(
    (item) => item.kind === "question" && item.questionId === questionId,
  )
  const next = extras.timeline.at(index + 1)
  assert(index >= 0 && next?.kind === "interimResults")
  const scene = new Map(Object.entries(extras.scenes)).get(next.sceneId)
  assert(scene?.kind === "interimResults" && scene.title)

  return scene.title
}

export const nativeTzilaCards = (page: Page) =>
  page.getByTestId("tadazz-show").getByTestId(/^tadazz-card-[0-4]$/u)

export const nativeTzilaTimer = (page: Page) =>
  page
    .getByTestId("tadazz-show")
    .getByTestId("tadazz-timer")
    .filter({ visible: true })

export const readVotingSeconds = async (input: {
  page: Page
  surface: "player" | "native"
}) => {
  const timer =
    input.surface === "player"
      ? input.page.getByRole("timer")
      : nativeTzilaTimer(input.page)
  await expect(timer).toHaveCount(1)
  await expect(timer).toBeVisible()
  const clock =
    input.surface === "player"
      ? timer.locator(":scope > span").filter({ hasText: /^\d{1,2}$/u })
      : timer
  await expect(clock).toHaveCount(1)
  const raw = (await clock.innerText()).trim()
  const nativeTime = /^•?\s*(\d{1,2}):(\d{2})$/u.exec(raw)

  if (nativeTime) {
    const minutes = Number(nativeTime[1])
    const seconds = Number(nativeTime[2])
    expect(seconds).toBeLessThan(60)

    return minutes * 60 + seconds
  }

  const plainTime = /^(\d{1,2})(?:\s*s)?$/u.exec(raw)
  expect(
    plainTime,
    `The visible voting timer must contain one clock: ${raw}`,
  ).not.toBeNull()
  assert(plainTime)

  return Number(plainTime[1])
}

export const assertTzilaChoices = async (input: {
  page: Page
  questionIndex: number
  surface: "player" | "native"
  paused?: boolean
}) => {
  const { page, questionIndex, surface } = input
  const { options } = tzilaQuestion(questionIndex)
  const native = surface === "native"
  const cards = native
    ? nativeTzilaCards(page)
    : page.getByTestId(/^photo-card-choice-[0-4]$/u)
  await expect(cards).toHaveCount(5)

  for (const [index, option] of options.entries()) {
    const card = native
      ? page.getByTestId("tadazz-show").getByTestId(`tadazz-card-${index}`)
      : page.getByTestId(`photo-card-choice-${index}`)
    await expect(card).toBeVisible()
    const label = native
      ? card.locator(".answer-index")
      : card.getByTestId(`photo-card-label-${index}`)
    const caption = native
      ? card.locator(".answer-title")
      : card.getByTestId(`photo-card-caption-${index}`)
    const image = native
      ? card.locator(".tz-photo-frame img")
      : card.getByTestId(`photo-card-image-${index}`)
    await expect(label).toHaveText(
      native ? String(index + 1).padStart(2, "0") : String(index + 1),
    )
    await expect(caption).toHaveText(option.label)
    await expect(caption).toBeVisible()
    await expect(image).toHaveAttribute("src", option.url)
    await expect(image).toHaveAttribute("alt", option.alt)
    await expect
      .poll(() =>
        image.evaluate(
          (element) =>
            element instanceof HTMLImageElement &&
            element.complete &&
            element.naturalWidth > 0,
        ),
      )
      .toBe(true)

    if (native) {
      await expect(card).toBeDisabled()
    } else {
      if (input.paused) {
        await expect(card).toBeDisabled()
      } else {
        await expect(card).toBeEnabled()
      }

      const background = await card.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      )
      expect(background).toBe(TZILA_ANSWER_COLORS[index])
      expect(background).not.toContain("rgba")
      const frameBackground = await image
        .locator("..")
        .evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(frameBackground).toBe(TZILA_ANSWER_COLORS[index])
      expect(frameBackground).not.toContain("rgba")
    }
  }
}

export const assertNativeTzilaResult = async (input: {
  page: Page
  questionIndex: number
  counts: number[]
}) => {
  const { page, questionIndex, counts } = input
  const { options } = tzilaQuestion(questionIndex)
  expect(counts).toHaveLength(5)
  expect(counts.every((count) => Number.isInteger(count) && count >= 0)).toBe(
    true,
  )
  const total = counts.reduce((sum, count) => sum + count, 0)
  const maximum = Math.max(...counts)
  const winners = counts.flatMap((count, index) =>
    count > 0 && count === maximum ? [index] : [],
  )
  await expect(
    page.getByTestId("tadazz-question-panel").locator(".eyebrow"),
  ).toHaveText(tzilaResultTitle(questionIndex))
  await expect(nativeTzilaCards(page)).toHaveCount(5)
  for (const [index, option] of options.entries()) {
    const card = page
      .getByTestId("tadazz-show")
      .getByTestId(`tadazz-card-${index}`)
    await expect(card.locator(".answer-title")).toHaveText(option.label)
    const percentage = total > 0 ? Math.round((counts[index] / total) * 100) : 0
    const result = card.locator(".tz-result-number")
    await expect(result).toBeVisible()
    await expect(result).toHaveText(`${percentage}%`)
    await expect(result).toHaveAttribute(
      "data-target-percentage",
      String(percentage),
    )
    await expect(card).toHaveClass(
      winners.includes(index)
        ? /\bis-favourite\b/u
        : /^(?!.*\bis-favourite\b)/u,
    )
  }
  await expect(
    nativeTzilaCards(page).and(page.locator(".is-favourite")),
  ).toHaveCount(winners.length)
}

export const assertResponsiveTzilaResult = async (input: {
  page: Page
  questionIndex: number
  counts: number[]
}) => {
  const { page, questionIndex, counts } = input
  const { options } = tzilaQuestion(questionIndex)
  expect(counts).toHaveLength(5)
  const total = counts.reduce((sum, count) => sum + count, 0)
  const maximum = Math.max(...counts)
  const winners = counts.flatMap((count, index) =>
    count > 0 && count === maximum ? [index] : [],
  )
  const scene = page.getByTestId("studio-scene-presenter")
  await expect(scene).toHaveAttribute("data-kind", "interimResults")
  await expect(
    scene.getByRole("heading", {
      name: tzilaResultTitle(questionIndex),
      exact: true,
    }),
  ).toBeVisible()
  const rows = scene.getByTestId("interim-option-row")
  await expect(rows).toHaveCount(5)
  await expect(scene.getByTestId("total-votes")).toHaveText(
    t("extensions:reveal.votes", { count: total }),
  )
  await expect(rows.and(page.locator('[data-winner="true"]'))).toHaveCount(
    winners.length,
  )
  for (const [index, option] of options.entries()) {
    const row = rows.filter({
      has: page.getByText(option.label, { exact: true }),
    })
    await expect(row).toHaveCount(1)
    await expect(row).toBeVisible()
    await expect(row).toHaveAttribute(
      "data-winner",
      String(winners.includes(index)),
    )
    await expect(row.locator("img")).toHaveAttribute("src", option.url)
    const percentage = total > 0 ? Math.round((counts[index] / total) * 100) : 0
    const percentText = total === 0 ? "(0%)" : `${percentage}%`
    const expectedCopies = winners.includes(index) ? 2 : 1
    const percentages = row.getByText(percentText, { exact: true })
    await expect(percentages).toHaveText(
      Array<string>(expectedCopies).fill(percentText),
    )
    for (const percentageElement of await percentages.all()) {
      await expect(percentageElement).toBeVisible()
    }
    const votes = t("extensions:reveal.votes", { count: counts[index] })
    const voteText = winners.includes(index) ? `(${votes})` : votes
    const voteCounts = row.getByText(voteText, { exact: true })
    await expect(voteCounts).toHaveText(
      Array<string>(expectedCopies).fill(voteText),
    )
    for (const voteCount of await voteCounts.all()) {
      await expect(voteCount).toBeVisible()
    }
  }

  if (winners.length > 1) {
    await expect(scene.getByTestId("spotlight-tie")).toBeVisible()
  } else {
    await expect(scene.getByTestId("spotlight-tie")).toHaveCount(0)
  }
}

export const setTzilaPaused = async (page: Page, paused: boolean) => {
  const show = page.getByTestId("tadazz-show")
  const current = await show.getAttribute("data-game-paused")
  expect(current).toMatch(/^(true|false)$/u)

  if (current !== String(paused)) {
    await page.getByTestId("host-pause-resume-btn").click()
  }

  await expect(show).toHaveAttribute("data-game-paused", String(paused))
}

/** The actual isolated phone ingress must accept every authored vote. */
export const submitTzilaPhoneVotes = async (input: {
  page: Page
  gameId: string
  votes: Array<{ phone: string; callId: string; answerIndex: number }>
}) => {
  const responses = await Promise.all(
    input.votes.map((vote) =>
      input.page.request.post("http://127.0.0.1:3011/api/games/pilot-phone", {
        headers: { "x-tada-pilot-secret": TZILA_PILOT_SECRET },
        data: { action: "answer", gameId: input.gameId, ...vote },
      }),
    ),
  )
  for (const response of responses) {
    expect(response.ok()).toBe(true)
    const acknowledgement: unknown = await response.json()
    expect(acknowledgement).toMatchObject({ accepted: true })
  }
}

export const requireSpectatorAnswerRejected = async (
  page: Page,
  gameId: string,
) => {
  const result: unknown = await page.evaluate((id) => {
    interface SpectatorSocket {
      connected: boolean
      timeout: (milliseconds: number) => {
        emit: (
          event: string,
          payload: { gameId: string; data: { answerKeys: number[] } },
          acknowledgement: (error: Error | null, value: unknown) => void,
        ) => void
      }
    }
    const socket = (window as Window & { __socket?: SpectatorSocket }).__socket

    if (!socket || !socket.connected || typeof socket.timeout !== "function") {
      throw new Error("The actual connected spectator socket is required")
    }

    return new Promise<unknown>((resolve, reject) => {
      socket
        .timeout(5000)
        .emit(
          "player:selectedAnswer",
          { gameId: id, data: { answerKeys: [0] } },
          (error, value) => {
            if (error) {
              reject(error)
            } else {
              resolve(value)
            }
          },
        )
    })
  }, gameId)
  expect(result).toEqual({ accepted: false, reason: "unauthorized" })

  return result
}
