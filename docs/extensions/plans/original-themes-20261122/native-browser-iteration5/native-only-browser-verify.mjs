/** Original-family deltas on the existing native runtime, editor, and shared viewer. */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  watchQuestionSequence,
  readQuestionSequence,
  stopQuestionSequence,
} from "../public-gallery/question-sequence-verify.mjs"
import { verifyViewerGeometry } from "../public-gallery/viewer-controls-verify.mjs"
import { installAudioObserver } from "./audio-observer.mjs"
import { ids, layouts, locales } from "./contract.mjs"

const require = createRequire("/cleanup/extensions/package.json")
const { chromium, expect } = require("@playwright/test")
const questionsOf = (preview) =>
  preview.show.cards.filter(
    (card) => card.kind === "quiz" || card.kind === "survey",
  )
const write = (directory, name, data) =>
  writeFileSync(
    join(directory, `${name}.json`),
    `${JSON.stringify(data, null, 2)}\n`,
  )

async function decodedImages(root) {
  await expect
    .poll(
      () =>
        root
          .locator("img")
          .evaluateAll((images) =>
            images.every((image) => image.complete && image.naturalWidth > 0),
          ),
      { timeout: 15000 },
    )
    .toBe(true)
}

async function verifyChoiceLayout(world, count, label) {
  await decodedImages(world)
  await expect
    .poll(
      () =>
        world.evaluate((element, expectedCount) => {
          const inside = (child, parent) =>
            child.width > 0 &&
            child.height > 0 &&
            child.left >= parent.left - 1 &&
            child.right <= parent.right + 1 &&
            child.top >= parent.top - 1 &&
            child.bottom <= parent.bottom + 1
          const stage = element.getBoundingClientRect()
          const cards = [...element.querySelectorAll("[data-v4-choice]")]

          if (cards.length !== expectedCount) {
            return [{ expectedCount, actualCount: cards.length }]
          }

          return cards.flatMap((card, index) => {
            const body = card.querySelector(".og-choice-body")
            const problems = []

            if (!inside(card.getBoundingClientRect(), stage)) {
              problems.push("card outside stage")
            }

            if (!body) {
              return [{ index, problems: ["missing answer body"] }]
            }

            if (
              !card.querySelector(".answer-title") ||
              !card.querySelector(".answer-image")
            ) {
              problems.push("missing answer text or image")
            }

            const bounds = body.getBoundingClientRect()
            for (const node of card.querySelectorAll(
              ".answer-title,.answer-image,.result-percentage,.winner-tag",
            )) {
              const style = getComputedStyle(node)

              if (style.visibility === "hidden" || style.display === "none") {
                if (node.matches(".answer-title,.answer-image")) {
                  problems.push(`${node.className}: hidden answer`)
                }

                continue
              }

              if (!inside(node.getBoundingClientRect(), bounds)) {
                problems.push(`${node.className}: clipped by answer body`)
              }

              if (node.tagName === "IMG") {
                if (style.objectFit !== "contain") {
                  problems.push("answer image is cropped")
                }
              } else if (
                node.scrollWidth > node.clientWidth + 1 ||
                node.scrollHeight > node.clientHeight + 1
              ) {
                problems.push(`${node.className}: text overflow`)
              }
            }

            return problems.length ? [{ index, problems }] : []
          })
        }, count),
      { message: `All ${count} image, label and result choices fit ${label}` },
    )
    .toEqual([])
}

async function captureNativeFailure({ page, id, evidence, error }) {
  const detail = {
    family: id,
    url: page.url(),
    error: String(error?.stack ?? error).slice(0, 12000),
  }

  try {
    detail.layout = await page.evaluate(() => {
      const bounds = (node) => {
        if (!node) {
          return null
        }

        const { x, y, width, height } = node.getBoundingClientRect()

        return { x, y, width, height }
      }
      const describe = (node) => {
        if (!node) {
          return null
        }

        const style = getComputedStyle(node)

        return {
          text: node.textContent?.trim().slice(0, 320),
          bounds: bounds(node),
          clientWidth: node.clientWidth,
          clientHeight: node.clientHeight,
          scrollWidth: node.scrollWidth,
          scrollHeight: node.scrollHeight,
          display: style.display,
          visibility: style.visibility,
          flexDirection: style.flexDirection,
          alignItems: style.alignItems,
          gridTemplateRows: style.gridTemplateRows,
          minWidth: style.minWidth,
          minHeight: style.minHeight,
          padding: style.padding,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          overflow: style.overflow,
        }
      }
      const host = document.querySelector('[data-testid="tadazz-show"]')
      const stage = host?.querySelector(".tzv4-stage")

      return {
        viewport: { width: innerWidth, height: innerHeight },
        phase: host?.getAttribute("data-show-scene"),
        scene: stage?.getAttribute("data-v4-scene"),
        stage: bounds(stage),
        question: describe(stage?.querySelector(".og-question")),
        answers: describe(stage?.querySelector(".og-answers")),
        cards: [...(stage?.querySelectorAll("[data-v4-choice]") ?? [])]
          .slice(0, 6)
          .map((card) => ({
            index: card.getAttribute("data-v4-choice"),
            card: describe(card),
            body: describe(card.querySelector(".og-choice-body")),
            title: describe(card.querySelector(".answer-title")),
            image: describe(card.querySelector(".answer-image")),
            percentage: describe(card.querySelector(".result-percentage")),
            winner: describe(card.querySelector(".winner-tag")),
          })),
        visibleText: document.body.innerText.slice(0, 2500),
      }
    })
  } catch (diagnosticError) {
    detail.diagnosticError = String(diagnosticError).slice(0, 2000)
  }

  try {
    await page.screenshot({
      path: join(evidence, `native-${id}-failure.png`),
      fullPage: true,
      timeout: 10000,
    })
  } catch (screenshotError) {
    detail.screenshotError = String(screenshotError).slice(0, 2000)
  }

  try {
    write(evidence, `native-${id}-failure`, detail)
  } catch (writeError) {
    console.error(
      JSON.stringify({
        originalThemeFailureEvidenceError: String(writeError).slice(0, 2000),
        family: id,
      }),
    )
  }
}

async function verifySoloCheckpoint(root, score) {
  await expect(root.locator(".team-row")).toHaveCount(1)
  const row = root.locator('.team-row[data-id="solo-player"]')
  await expect(row.locator(".team-name")).toHaveText("You")
  await expect
    .poll(() =>
      row
        .locator(".team-score")
        .evaluate((node) =>
          Number(node.firstChild?.textContent?.replace(/[,\s]/gu, "")),
        ),
    )
    .toBe(score)
}

async function verifyRoyalHistory(page, root, questions) {
  const next = page.getByTestId("catalogue-next")
  await next.click()
  for (let index = 0; index < 3; index += 1) {
    await expect(root).toHaveAttribute("data-game-phase", "voting", {
      timeout: 30000,
    })
    await expect(root).toHaveAttribute("data-question-index", String(index))
    await root
      .getByTestId(`tadazz-card-${questions[index].correctAnswers[0] - 1}`)
      .click()
    await expect(root).toHaveAttribute("data-game-phase", "results")
    await expect(next).toBeEnabled({ timeout: 30000 })

    if (index === 2) {
      break
    }

    await next.click()

    if (index === 1) {
      await expect(root).toHaveAttribute("data-game-phase", "checkpoint")
      await expect(root).toHaveAttribute("data-authored-scene", "act-1-scores")
      await verifySoloCheckpoint(
        root,
        questions[0].maxPoints + questions[1].maxPoints,
      )
      await expect(next).toBeEnabled({ timeout: 30000 })
      await next.click()
      await expect(root).toHaveAttribute("data-game-phase", "interlude")
      await expect(next).toBeEnabled({ timeout: 30000 })
      await next.click()
    }
  }
  await expect(page.getByTestId("catalogue-back")).toBeEnabled()
  await page.getByTestId("catalogue-back").click()
  await expect(root).toHaveAttribute("data-game-phase", "voting", {
    timeout: 30000,
  })
  await expect(root).toHaveAttribute("data-question-index", "1")
  // Reveal Q2 without answering. Back must have removed both Q2's old vote and
  // the now-future Q3 vote, while retaining Q1's earned score.
  await next.click()
  await expect(root).toHaveAttribute("data-game-phase", "results")
  await expect(root.locator("[data-v4-choice].is-selected")).toHaveCount(0)
  await expect(next).toBeEnabled({ timeout: 30000 })
  await next.click()
  await expect(root).toHaveAttribute("data-game-phase", "checkpoint")
  await expect(root).toHaveAttribute("data-authored-scene", "act-1-scores")
  await verifySoloCheckpoint(root, questions[0].maxPoints)
  await expect(page.getByTestId("catalogue-replay")).toBeEnabled({
    timeout: 30000,
  })
  await page.getByTestId("catalogue-replay").click()
  await expect(root).toHaveAttribute("data-game-phase", "intro")
}

async function verifyMobileStoryRecap({ phone, root, questions, evidence }) {
  assert.equal(questions.length, 6)
  await expect(phone.locator("html")).toHaveAttribute("dir", "rtl")
  const next = phone.getByTestId("catalogue-next")
  const companion = phone.getByTestId("catalogue-mobile-question")
  const recap = phone.getByTestId("catalogue-mobile-recap")
  const recapLabels = recap.getByTestId("catalogue-mobile-recap-label")
  const chosenLabels = [questions[0].answers[0].text]
  let finalEntries = 0

  // Continue the genuine first mobile vote through the remaining five rounds.
  for (let index = 0; index < questions.length; index += 1) {
    if (index > 0) {
      await expect(root).toHaveAttribute("data-game-phase", "voting", {
        timeout: 30000,
      })
      await expect(root).toHaveAttribute("data-question-index", String(index))
      const choice = index % questions[index].answers.length
      chosenLabels.push(questions[index].answers[choice].text)
      await companion.getByTestId(`tadazz-pad-option-${choice}`).click()
      await expect(root).toHaveAttribute("data-game-phase", "results")
      await expect(
        companion.getByTestId("catalogue-mobile-selected-answer"),
      ).toContainText(chosenLabels[index])
    }

    await expect(next).toBeEnabled({ timeout: 30000 })
    await next.click()
    for (let guard = 0; guard < 3; guard += 1) {
      await expect(next).toBeEnabled({ timeout: 30000 })
      const phase = await root.getAttribute("data-game-phase")

      if (phase !== "checkpoint" && phase !== "interlude") {
        break
      }

      if (phase === "checkpoint") {
        const expectedLabels =
          index === 5 ? chosenLabels : chosenLabels.slice(index - 1, index + 1)
        await expect(recap).toBeVisible()
        await expect(recap).toHaveCSS("direction", "rtl")
        await expect(recapLabels).toHaveText(expectedLabels)
        await expect(recap.locator('li[data-selected="true"]')).toHaveCount(
          expectedLabels.length,
        )
        const stageRecap = root.getByTestId("tadazz-screen-recap")
        await expect(stageRecap.locator(".story-finale")).toHaveText(
          index === 5 ? "ההרפתקה השלמה שלנו" : "הסיפור שלנו עד עכשיו",
        )
        await expect(stageRecap.locator(".og-recap-subtitle")).toHaveCount(0)
        await expect(stageRecap.locator(".answer-title")).toHaveText(
          expectedLabels,
        )
        assert(
          await recapLabels.evaluateAll((nodes) =>
            nodes.every(
              (node) =>
                Number.parseFloat(getComputedStyle(node).fontSize) >= 16 &&
                node.scrollWidth <= node.clientWidth + 1 &&
                node.scrollHeight <= node.clientHeight + 1,
            ),
          ),
          "Mobile recap labels retain readable native size without clipping",
        )

        if (index === 5) {
          await expect(root).toHaveAttribute(
            "data-authored-scene",
            "chapter-3-choices",
          )
          finalEntries = await recapLabels.count()
          assert.equal(finalEntries, 6)
          await phone.screenshot({
            path: join(evidence, "mobile-he-magic-storybook-final-recap.png"),
            fullPage: true,
          })
        }
      }

      await next.click()
    }
  }

  await expect(root).toHaveAttribute("data-game-phase", "finish")
  await expect(recap).toBeVisible()
  await expect(recap).toHaveAttribute("data-phase", "finish")
  await expect(recapLabels).toHaveText(chosenLabels)
  assert.equal(finalEntries, 6)

  return finalEntries
}

async function originalWorld(root, id) {
  const stage = root.locator(".tzv4-stage").first()
  await expect(stage).toHaveAttribute("data-original-theme", id)
  await expect(stage).toHaveAttribute("data-original-family", id)
  await expect(stage.locator("[data-original-layout]").first()).toHaveAttribute(
    "data-original-layout",
    layouts[id],
  )

  return stage
}

async function verifyEditor({ page, options, record }) {
  const copy = options.installed.get(ids[0])
  const path = `/manager/quizz/${copy.quizzId}?lng=en`
  const beforeQuiz = await options.read(`/api/quizz/${copy.quizzId}`)
  const before = (await options.read(`/api/extensions/quizzes/${copy.quizzId}`))
    .extras
  const frozenContent = (value) => ({
    questionIds: value.questionIds,
    timeline: value.timeline,
    scenes: value.scenes,
    perQuestion: value.perQuestion,
    audio: value.audio,
  })
  const open = async () => {
    await page.goto(options.origin + path)
    await expect(page.getByTestId("editor-save-btn")).toBeEnabled({
      timeout: 30000,
    })
    await page.getByTestId("editor-panel-toggle-themes").click()
    await expect(page.getByTestId("editor-panel-themes")).toBeVisible()
  }
  await open()
  for (const id of ids) {
    await expect(page.getByTestId(`show-theme-${id}`)).toHaveCount(1)
  }
  const history = new Map([
    [before.defaults.showTheme.id, before.defaults.showTheme],
  ])
  for (const id of [...ids.slice(1), ids[0]]) {
    const select = page
      .getByTestId(`show-theme-${id}`)
      .getByRole("button", { name: "Use this theme", exact: true })
    await select.click()
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Use this theme", exact: true })
      .click()
    await expect(page.getByTestId("editor-game-backdrop")).toHaveAttribute(
      "data-editor-theme",
      id,
    )
    await page.getByTestId("editor-panel-close-themes").click()
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/extensions/quizzes/${copy.quizzId}` &&
        response.request().method() === "PUT",
    )
    await page.getByTestId("editor-save-btn").click()
    assert.equal((await saved).status(), 200)
    await page.waitForURL(/\/(studio\/games|manager\/config)$/)
    const actual = await options.read(`/api/quizz/${copy.quizzId}`)
    const { extras } = await options.read(
      `/api/extensions/quizzes/${copy.quizzId}`,
    )
    assert.deepEqual(
      actual,
      beforeQuiz,
      "Theme round-trip preserves every native question, answer, timer and title",
    )
    assert.deepEqual(
      frozenContent(extras),
      frozenContent(before),
      "Theme choice preserves identities, scenes, card overrides and saved audio",
    )
    assert.equal(extras.defaults.showTheme.id, id)
    for (const [previousId, previous] of history) {
      const stored =
        previousId === id
          ? extras.defaults.showTheme
          : extras.defaults.themeHistory?.find(
              (theme) => theme.id === previousId,
            )
      assert(stored, `Retained theme history ${previousId}`)
      assert.deepEqual(
        stored.overrides,
        previous.overrides,
        `Retained overrides ${previousId}`,
      )
    }
    history.set(id, structuredClone(extras.defaults.showTheme))
    await open()
    await expect(
      page.getByTestId(`show-theme-${id}`).getByRole("button"),
    ).toBeDisabled()
  }
  await page.getByTestId("editor-panel-close-themes").click()
  record("native-editor-eight-theme-round-trip-save-reload-and-history", {
    switches: 8,
    preservedQuestionCount: beforeQuiz.questions.length,
  })
}

async function verifyPublic({ browser, options, inspect, record }) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "en-GB",
    reducedMotion: "no-preference",
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  inspect(page)
  let baselineControls = undefined

  try {
    for (const id of ids) {
      await page.goto(`${options.origin}/?view=demo&game=${id}&lng=en`)
      const root = page.getByTestId("catalogue-game-demo")
      await expect(root).toHaveAttribute("data-game-phase", "intro", {
        timeout: 30000,
      })
      await page.getByTestId("game-viewer-expand").click()
      await verifyViewerGeometry(page, { label: id })
      const controls = await page
        .locator(
          '.game-viewer-controls [data-platform-component="presentation-controls"]',
        )
        .evaluate((node) => ({
          scope: node.dataset.platformScope,
          appearance: node.dataset.platformAppearance,
          buttons: [...node.querySelectorAll("[data-presentation-action]")].map(
            (button) => ({
              action: button.dataset.presentationAction,
              className: button.className,
              font: getComputedStyle(button).fontFamily,
              radius: getComputedStyle(button).borderRadius,
            }),
          ),
        }))
      assert.equal(controls.scope, "platform.host")

      if (!baselineControls) {
        baselineControls = controls
      } else {
        assert.deepEqual(
          controls,
          baselineControls,
          "Shared platform chrome stays identical across families",
        )
      }

      const questions = questionsOf(options.previews.get(id))
      const next = page.getByTestId("catalogue-next")
      await watchQuestionSequence(root)
      const sequences = [],
        checkpoints = [],
        interludes = [],
        chosenLabels = []
      let expectedScore = 0
      await next.click()
      for (let index = 0; index < questions.length; index += 1) {
        await expect(root).toHaveAttribute("data-game-phase", "voting", {
          timeout: 30000,
        })
        await expect(root).toHaveAttribute("data-question-index", String(index))
        const world = await originalWorld(root, id)
        await expect(world.locator("[data-v4-choice]")).toHaveCount(
          questions[index].answers.length,
        )
        await expect(world.locator(".q-text")).toHaveText(
          questions[index].question,
        )
        await decodedImages(world)
        const selected = (questions[index].correctAnswers[0] ?? 1) - 1
        chosenLabels.push(questions[index].answers[selected].text)

        if (
          questions[index].kind === "quiz" &&
          questions[index].correctAnswers.includes(selected + 1)
        ) {
          expectedScore += questions[index].maxPoints
        }

        await world.getByTestId(`tadazz-card-${selected}`).click()
        await expect(root).toHaveAttribute("data-game-phase", "results")
        await expect(world.getByTestId(`tadazz-card-${selected}`)).toHaveClass(
          /is-selected/u,
        )
        sequences.push(await readQuestionSequence(root, index))

        if (index === 0) {
          await page.screenshot({
            path: join(options.evidence, `public-${id}.png`),
          })
        }

        await expect(next).toBeEnabled({ timeout: 30000 })
        await next.click()
        for (let guard = 0; guard < 4; guard += 1) {
          await expect(next).toBeEnabled({ timeout: 30000 })
          const phase = await root.getAttribute("data-game-phase")

          if (phase !== "checkpoint" && phase !== "interlude") {
            break
          }

          const authored = await root.getAttribute("data-authored-scene")
          assert(
            authored,
            "Each original checkpoint is an actual authored card",
          )

          if (phase === "checkpoint") {
            checkpoints.push(authored)
            assert(
              [1, 3, 5].includes(index),
              "Authored checkpoint follows each two-question act",
            )
            assert.equal(
              authored,
              id === "magic-storybook"
                ? `chapter-${(index + 1) / 2}-choices`
                : `act-${(index + 1) / 2}-scores`,
            )

            if (id === "magic-storybook") {
              const authoredRecap = options.previews
                .get(id)
                .show.cards.find((card) => card.key === authored)
              assert.equal(authoredRecap?.kind, "answerRecap")
              const recap = root.getByTestId("tadazz-screen-recap")
              await expect(recap.locator(".story-finale")).toHaveText(
                authoredRecap.title,
              )
              // Authored answerRecap cards contain a title, with no subtitle field.
              await expect(recap.locator(".og-recap-subtitle")).toHaveCount(0)
              await expect(recap.locator(".answer-title")).toHaveText(
                index === 5
                  ? chosenLabels
                  : chosenLabels.slice(index - 1, index + 1),
              )
            } else {
              await verifySoloCheckpoint(root, expectedScore)
            }
          } else {
            interludes.push(authored)
          }

          await next.click()
        }
      }
      await expect(root).toHaveAttribute("data-game-phase", "finish")
      assert.equal(checkpoints.length, 3)
      assert.equal(interludes.length, 2)
      await stopQuestionSequence(root)
      write(options.evidence, `public-${id}`, {
        sequences,
        checkpoints,
        interludes,
        chosenLabels,
        expectedScore,
      })
      await page.getByTestId("catalogue-next").click()
      await expect(root).toHaveAttribute("data-game-phase", "intro")

      if (id === "royal-quiz") {
        await verifyRoyalHistory(page, root, questions)
        record("public-back-clears-current-and-future-votes", {
          retainedScore: questions[0].maxPoints,
          clearedQuestions: [2, 3],
          replay: true,
        })
      }

      record(`normal-motion-complete-public-show-${id}`, {
        rounds: 6,
        checkpoints: 3,
        interludes: 2,
        replay: true,
      })
    }
  } finally {
    await context.close()
  }

  // Nine metadata locales, with an active Hebrew mobile round in every family.
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    ignoreHTTPSErrors: true,
  })
  const phone = await mobile.newPage()
  inspect(phone)
  let storybookFinalRecapEntries = 0

  try {
    for (const locale of locales) {
      await phone.goto(`${options.origin}/?view=store&lng=${locale}`)
      await expect(phone.locator("[data-catalogue-card]")).toHaveCount(18, {
        timeout: 30000,
      })
      await expect(phone.locator("html")).toHaveAttribute(
        "dir",
        locale === "he" ? "rtl" : "ltr",
      )
      assert(
        await phone.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "No locale/mobile horizontal overflow",
      )
      for (const id of ids) {
        await expect(
          phone.locator(`[data-catalogue-card="${id}"]`),
        ).toBeVisible()
      }
    }
    for (const id of ids) {
      await phone.goto(`${options.origin}/?view=demo&game=${id}&lng=he`)
      const root = phone.getByTestId("catalogue-game-demo")
      await expect(root).toHaveAttribute("data-game-phase", "intro", {
        timeout: 30000,
      })
      await phone.getByTestId("catalogue-next").click()
      await expect(root).toHaveAttribute("data-game-phase", "voting", {
        timeout: 30000,
      })
      const companion = phone.getByTestId("catalogue-mobile-question")
      await expect(companion).toBeVisible()
      await expect(
        companion.getByTestId("catalogue-mobile-question-heading"),
      ).toHaveText(questionsOf(options.previews.get(id))[0].question)
      const answer = companion.getByTestId("tadazz-pad-option-0")
      const box = await answer.boundingBox()
      assert(
        box && box.width >= 44 && box.height >= 44,
        "Readable native mobile answer target",
      )
      await answer.click()
      await expect(root).toHaveAttribute("data-game-phase", "results")
      await expect(answer).toHaveAttribute("aria-pressed", "true")
      await expect(
        companion.getByTestId("catalogue-mobile-selected-answer"),
      ).toContainText(questionsOf(options.previews.get(id))[0].answers[0].text)
      await phone.screenshot({
        path: join(options.evidence, `mobile-he-${id}.png`),
        fullPage: true,
      })

      if (id === "magic-storybook") {
        storybookFinalRecapEntries = await verifyMobileStoryRecap({
          phone,
          root,
          questions: questionsOf(options.previews.get(id)),
          evidence: options.evidence,
        })
      }
    }
    assert.equal(storybookFinalRecapEntries, 6)
    record("nine-locales-and-eight-reduced-motion-hebrew-mobile-votes", {
      locales: 9,
      mobileRounds: 8,
      storybookFinalRecapEntries,
    })
  } finally {
    await mobile.close()
  }
}

async function verifyNative({ browser, options, inspect, record }) {
  for (const id of ids) {
    const fixture = options.fixtures.get(id)
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: "en-GB",
      reducedMotion: "reduce",
      ignoreHTTPSErrors: true,
    })
    await context.addInitScript((token) => {
      localStorage.setItem("token", token)
      localStorage.setItem("i18nextLng", "en")
    }, options.token)
    const page = await context.newPage()
    inspect(page)
    await installAudioObserver(page)
    const players = []

    try {
      await page.goto(
        `${options.origin}/manager/quizz/${fixture.quizId}?lng=en`,
      )
      await expect(page.getByTestId("editor-save-btn")).toBeEnabled({
        timeout: 30000,
      })
      await page.getByTestId("studio-tab-launch").click()
      const launched = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/games" &&
          response.request().method() === "POST",
      )
      await page.getByTestId("studio-launch-btn").click()
      const response = await launched
      assert([200, 201].includes(response.status()))
      const room = await response.json()
      await expect(page.getByTestId("platform-opening-start")).toBeEnabled({
        timeout: 30000,
      })
      await page.getByTestId("platform-opening-start").click()
      await expect(page.getByTestId("platform-opening-skip")).toBeEnabled()
      await page.getByTestId("platform-opening-skip").click()
      await expect(page.getByTestId("platform-game-opening")).toBeHidden({
        timeout: 30000,
      })
      const stage = page.getByTestId("tadazz-show")
      await expect(stage).toHaveAttribute("data-show-theme", id)
      await expect(stage).toHaveAttribute("data-theme-fallback", "false")
      await page.evaluate(() => window.__originalAudio.arm())
      const pin =
        room.inviteCode ??
        (
          await page
            .getByText(/^\d{6}$/u)
            .first()
            .textContent()
        ).trim()
      for (let playerIndex = 0; playerIndex < 2; playerIndex += 1) {
        const playerContext = await browser.newContext({
          viewport: { width: 390, height: 844 },
          locale: "en-GB",
          reducedMotion: "reduce",
          ignoreHTTPSErrors: true,
        })
        await playerContext.addInitScript(() =>
          localStorage.setItem("i18nextLng", "en"),
        )
        const player = await playerContext.newPage()
        inspect(player)
        players.push({ context: playerContext, page: player })
        await player.goto(
          `${options.origin}/game?pin=${encodeURIComponent(pin)}`,
        )
        await player
          .getByPlaceholder("Username here")
          .fill(`Original QA ${playerIndex + 1}`)
        await player
          .getByRole("button", { name: "Submit", exact: true })
          .click()
        await expect(player).toHaveURL(`${options.origin}/party/${room.gameId}`)
      }
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: /CONNECTED:\s*2\b/iu })
          .first(),
      ).toBeVisible({ timeout: 30000 })
      const sequences = []
      const select = async (player, index) => {
        const button = player
          .locator("button")
          .filter({ has: player.getByTestId(`answer-badge-${index}`) })
        await expect(button).toBeEnabled({ timeout: 15000 })
        await button.click()
        await expect(
          player.getByRole("heading", {
            name: "Thanks, that's noted",
            exact: true,
          }),
        ).toBeVisible({ timeout: 15000 })
      }
      for (let index = 0; index < fixture.quizz.questions.length; index += 1) {
        await watchQuestionSequence(stage, {
          phaseAttribute: "data-show-scene",
        })

        if (index === 0) {
          await page
            .getByTestId("manager-control-toolbar")
            .getByRole("button", { name: "Start", exact: true })
            .click()
        } else {
          await page.getByTestId("host-next-screen-btn").click()
        }

        await expect(stage).toHaveAttribute("data-show-scene", "voting", {
          timeout: 30000,
        })
        await expect(page.getByTestId("host-question-counter")).toHaveText(
          `${index + 1} / 4`,
        )
        const world = await originalWorld(stage, id)
        await expect(world.locator("[data-v4-choice]")).toHaveCount(index + 2)
        await decodedImages(world)
        await expect(world.locator(".answer-image")).toHaveCount(index + 2)
        await verifyChoiceLayout(world, index + 2, `${id} voting`)

        if (index === 3) {
          await expect(world.locator(".photo-question-img")).toHaveCount(1)
        }

        if (index === 0 && id === ids[0]) {
          await page.getByTestId("host-pause-resume-btn").click()
          await expect(
            page.getByTestId("host-pause-resume-btn"),
          ).toHaveAttribute("aria-label", /resume/iu)
          const timer = await world.getByTestId("tadazz-timer").textContent()
          await page.waitForTimeout(1200)
          await expect(world.getByTestId("tadazz-timer")).toHaveText(timer)
          await page.getByTestId("host-pause-resume-btn").click()
          await expect(
            page.getByTestId("host-pause-resume-btn"),
          ).toHaveAttribute("aria-label", /pause/iu)
        }

        if (index === 0) {
          await select(players[0].page, 0)
        }

        if (index === 1) {
          await select(players[0].page, 0)
          await select(players[1].page, 1)
        }

        if (index === 3) {
          await select(players[0].page, 4)
          await select(players[1].page, 4)
        }

        if ((await stage.getAttribute("data-show-scene")) === "voting") {
          await expect(page.getByTestId("host-end-timer-btn")).toBeEnabled()
          await page.getByTestId("host-end-timer-btn").click()
        }

        await expect(stage).toHaveAttribute("data-show-scene", "results", {
          timeout: 30000,
        })
        const expected = [
          [100, 0],
          [50, 50, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0, 100],
        ][index]
        for (const [answer, percentage] of expected.entries()) {
          const card = world.getByTestId(`tadazz-card-${answer}`)
          await expect(card.locator(".result-percentage")).toHaveAttribute(
            "data-target-percentage",
            String(percentage),
          )
          await expect(card.locator(".result-percentage")).toHaveText(
            `${percentage}%`,
          )
        }

        if (index === 0 || index === 3) {
          await expect(
            world.getByTestId(`tadazz-card-${index + 1}`),
          ).toHaveClass(/is-correct/u)
        }

        if (index === 1) {
          await expect(world.locator(".is-favourite")).toHaveCount(2)
          await expect(world.locator(".is-correct")).toHaveCount(0)
        }

        if (index === 2) {
          await expect(world.locator(".is-favourite,.is-correct")).toHaveCount(
            0,
          )
        }

        await verifyChoiceLayout(world, index + 2, `${id} results`)
        sequences.push(await readQuestionSequence(stage, 0))
        await stopQuestionSequence(stage)
        await page.screenshot({
          path: join(options.evidence, `native-${id}-${index + 2}-choices.png`),
        })
        await expect(page.getByTestId("host-next-screen-btn")).toBeEnabled({
          timeout: 30000,
        })
      }

      if (id === ids[0]) {
        await page.getByTestId("host-restart-question-btn").click()
        await watchQuestionSequence(stage, {
          phaseAttribute: "data-show-scene",
        })
        await page.getByTestId("confirm-restart-question-btn").click()
        await expect(stage).toHaveAttribute("data-show-scene", "voting", {
          timeout: 30000,
        })
        await expect(page.getByTestId("host-question-counter")).toHaveText(
          "4 / 4",
        )
        await page.getByTestId("host-end-timer-btn").click()
        await expect(stage).toHaveAttribute("data-show-scene", "results", {
          timeout: 30000,
        })
        sequences.push(await readQuestionSequence(stage, 0))
        await stopQuestionSequence(stage)
        await expect(stage.locator(".result-percentage")).toHaveText([
          "0%",
          "0%",
          "0%",
          "0%",
          "0%",
        ])
        await page.getByTestId("host-previous-screen-btn").click()
        await page.getByTestId("confirm-reopen-question-btn").click()
        await expect(stage).toHaveAttribute("data-show-scene", "voting", {
          timeout: 30000,
        })
        await page.getByTestId("host-skip-question-btn").click()
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: "Skip Question", exact: true })
          .click()
        record("native-pause-replay-previous-and-confirmed-skip", {
          retainedPausedTimer: true,
          replayDiscardsOldVotes: true,
        })
      } else {
        await page.getByTestId("host-next-screen-btn").click()
      }

      await expect(stage).toHaveAttribute("data-show-scene", "finale", {
        timeout: 30000,
      })
      const audio = await page.evaluate(() => window.__originalAudio.read())
      assert(audio.samples > 10)
      assert.equal(
        audio.ownerViolations,
        0,
        "Exactly one shared soundtrack owner on every observed host frame",
      )
      assert.equal(
        audio.duplicateTracks,
        0,
        "No duplicate active playback of the same recording",
      )
      assert.deepEqual(audio.errors, [])
      assert(
        audio.fulfilled.some((url) =>
          new URL(url).pathname.startsWith(`/tadazz-show/originals/${id}/`),
        ),
        "Actual family audio playback fulfilled in Chromium",
      )
      await page.evaluate(() => window.__originalAudio.stop())
      write(options.evidence, `native-${id}`, { sequences, audio })
      record(
        `reduced-motion-native-two-to-five-choices-votes-images-and-audio-${
          id
        }`,
        {
          questions: 4,
          realPlayers: 2,
          tie: true,
          zeroVotes: true,
          answerImages: 14,
          questionImages: 1,
          votingLayoutChecks: 4,
          resultsLayoutChecks: 4,
        },
      )
    } catch (error) {
      // Capture the actual host before finally closes it and both player pages.
      await captureNativeFailure({
        page,
        id,
        evidence: options.evidence,
        error,
      })
      throw error
    } finally {
      for (const player of players) {
        await player.context.close()
      }
      await context.close()
    }
  }
}

export async function verifyOriginalThemeBrowser(options) {
  assert.equal(process.platform, "linux")
  assert.equal(new URL(options.origin).hostname, "127.0.0.1")
  mkdirSync(options.evidence, { recursive: true })
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  })
  const errors = [],
    failedAssets = []
  let activePage = undefined
  const inspect = (page) => {
    activePage = page
    page.on("pageerror", (error) =>
      errors.push({ url: page.url(), message: error.message }),
    )
    page.on("response", (response) => {
      if (
        response.status() >= 400 &&
        ["image", "media", "script", "stylesheet", "font"].includes(
          response.request().resourceType(),
        )
      ) {
        failedAssets.push({
          path: new URL(response.url()).pathname,
          status: response.status(),
        })
      }
    })
  }
  const { record } = options

  try {
    await verifyNative({ browser, options, inspect, record })
    assert.deepEqual(errors, [], "No browser JavaScript errors")
    assert.deepEqual(failedAssets, [], "No failed shipped assets")
    record("original-browser-console-and-resource-integrity")
  } catch (error) {
    write(options.evidence, "browser-failure", {
      error: String(error?.stack ?? error),
      errors,
      failedAssets,
    })
    await activePage
      ?.screenshot({
        path: join(options.evidence, "browser-failure.png"),
        fullPage: true,
      })
      .catch((screenshotError) => {
        write(options.evidence, "browser-failure-screenshot", {
          error: String(screenshotError?.stack ?? screenshotError),
        })
      })
    throw error
  } finally {
    await browser.close()
  }
}
