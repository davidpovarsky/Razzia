import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { FULL_SHOW_META_V3 } from "../../src/mcp-app/contracts/full-show-frame.ts"
import { prepareHostNavigation } from "./workspace-controls.mjs"

// Observe genuine browser animations without replacing timing, rendering or data.
// Both native WAAPI and the original Razzia CSS entrances are measured, including
// events inside the widget's native shadow root.
export async function installPhaseContinuityProbe(page) {
  await page.addInitScript(() => {
    const questionSelector =
      '[data-testid="tadazz-question-panel"],.native-razzia-question'
    const answerSelector =
      '[data-testid^="tadazz-card-"],[data-testid^="native-razzia-answer-"],[data-testid^="photo-card-choice-"]'
    const nodeIds = new WeakMap()
    const seenEvents = new WeakSet()
    const entrances = []
    let sequence = 0
    const identify = (element) => {
      if (!element) {
        return null
      }

      if (!nodeIds.has(element)) {
        sequence += 1
        nodeIds.set(element, sequence)
      }

      return nodeIds.get(element)
    }
    const kindOf = (element) => {
      if (!(element instanceof Element)) {
        return null
      }

      if (element.matches(questionSelector)) {
        return "question"
      }

      if (element.matches(answerSelector)) {
        return "answer"
      }

      return null
    }
    const record = (element, details) => {
      const kind = kindOf(element)

      if (!kind) {
        return
      }

      const stage = element.closest("[data-full-show-chapter]")
      entrances.push({
        sequence: entrances.length,
        kind,
        node: identify(element),
        testId: element.getAttribute("data-testid"),
        chapter: stage?.getAttribute("data-full-show-chapter") ?? null,
        at: performance.now(),
        ...details,
      })
    }
    const nativeAnimate = Element.prototype.animate
    Element.prototype.animate = function animate(...args) {
      const animation = nativeAnimate.apply(this, args)
      const frames = animation.effect?.getKeyframes() ?? []
      const [first] = frames
      const last = frames.at(-1)

      if (
        kindOf(this) &&
        Number(first?.opacity) === 0 &&
        Number(last?.opacity) > 0
      ) {
        const timing = animation.effect.getTiming()
        record(this, {
          source: "WAAPI",
          duration: timing.duration,
          delay: timing.delay,
        })
      }

      return animation
    }
    const observeCss = (root) => {
      root.addEventListener(
        "animationstart",
        (event) => {
          if (
            !seenEvents.has(event) &&
            kindOf(event.target) &&
            event.target.hasAttribute("data-tada-entrance")
          ) {
            seenEvents.add(event)
            record(event.target, {
              source: "CSS",
              name: event.animationName,
              duration: getComputedStyle(event.target).animationDuration,
            })
          }
        },
        true,
      )
    }
    observeCss(document)
    const nativeAttachShadow = Element.prototype.attachShadow
    Element.prototype.attachShadow = function attachShadow(...args) {
      const shadow = nativeAttachShadow.apply(this, args)
      observeCss(shadow)

      return shadow
    }
    const native = () =>
      document.querySelector('[data-testid="full-show-native-surface"]')
        ?.shadowRoot
    const root = () => native()?.querySelector("[data-full-show-chapter]")
    const roots = () => [
      ...(native()?.querySelectorAll(`${questionSelector},${answerSelector}`) ??
        []),
    ]
    const capture = () => {
      const surface = root()
      const question = native()?.querySelector(questionSelector)
      const text = native()?.querySelector(
        '[data-testid="tadazz-question-panel"] .q-text,[data-testid="native-razzia-question"]',
      )
      const cards = [...(native()?.querySelectorAll(answerSelector) ?? [])]

      return {
        documentId: performance.timeOrigin,
        chapter: surface?.getAttribute("data-full-show-chapter"),
        epoch: Number(surface?.getAttribute("data-playback-epoch")),
        paused: surface?.getAttribute("data-playback-paused"),
        elapsed: Number(surface?.getAttribute("data-playback-elapsed")),
        renderer: identify(
          native()?.querySelector(
            '[data-testid="tadazz-stage"],[data-testid="native-razzia-preview-v2"]',
          ),
        ),
        nativeMode:
          native()
            ?.querySelector('[data-testid="tadazz-stage"]')
            ?.getAttribute("data-v4-scene") ??
          native()
            ?.querySelector('[data-testid="native-razzia-preview-v2"]')
            ?.getAttribute("data-phase"),
        question: identify(question),
        textNode: identify(text),
        text: text?.textContent?.trim(),
        cards: cards.map((card) => ({
          id: identify(card),
          testId: card.getAttribute("data-testid"),
          pressed: card.getAttribute("aria-pressed"),
          entrance: card.getAttribute("data-tada-entrance"),
        })),
        entrances: entrances.slice(),
      }
    }
    window.__phaseContinuity = {
      capture,
      // Await actual finite entrance animations, never advance a clock or finish
      // an animation in the application under test.
      settled: () =>
        roots().every((element) =>
          element.getAnimations().every((animation) => {
            const timing = animation.effect?.getTiming()

            return (
              timing?.iterations === Infinity ||
              (!animation.pending &&
                !["running", "paused"].includes(animation.playState))
            )
          }),
        ),
    }
  })
}

const entranceCount = (snapshot, kind) =>
  snapshot.entrances.filter((entry) => entry.kind === kind).length

function assertSameQuestion(before, after, reason) {
  assert.equal(
    after.documentId,
    before.documentId,
    `${reason}: iframe reloaded`,
  )
  assert.equal(
    after.renderer,
    before.renderer,
    `${reason}: native stage remounted`,
  )
  assert.equal(
    after.question,
    before.question,
    `${reason}: question panel remounted`,
  )
  assert.equal(
    after.textNode,
    before.textNode,
    `${reason}: question text remounted`,
  )
  assert.equal(after.text, before.text, `${reason}: question changed`)
  assert.equal(
    entranceCount(after, "question"),
    entranceCount(before, "question"),
    `${reason}: question entrance replayed`,
  )
}

function assertSameCards(before, after, reason) {
  assert.deepEqual(
    after.cards.map((card) => [card.testId, card.id]),
    before.cards.map((card) => [card.testId, card.id]),
    `${reason}: answer cards remounted`,
  )
  assert.equal(
    entranceCount(after, "answer"),
    entranceCount(before, "answer"),
    `${reason}: answer entrance replayed`,
  )
}

// A single live iframe traverses real server-generated frames. The fixture owns
// no players/votes; selecting an answer is the product's local demo interaction.
export async function verifyPhaseContinuity({
  page,
  base,
  scenario,
  engine,
  theme,
  evidence,
  readRecord,
  reducedMotion,
}) {
  const mode = reducedMotion ? "reduced" : "normal"
  const name = [engine, theme, mode, "phase-continuity"].join("-")
  const witness = {
    engine,
    theme,
    reducedMotion,
    proof: "real MCP SDK + AppBridge + unchanged native animations",
    snapshots: [],
  }
  let child = null
  const beforeRecord = await readRecord()

  try {
    const chapter = (kind, ordinal = 3) =>
      scenario.chapters.find(
        (candidate) =>
          candidate.kind === kind && candidate.questionOrdinal === ordinal,
      )
    const question = chapter("question")
    const voting = chapter("voting")
    const results = chapter("results")
    const nextQuestion = chapter("question", 4)
    assert(question && voting && results && nextQuestion)
    assert.equal(question.duration.kind, "known")
    scenario.selection.chapterId = question.id
    scenario.selection.context.reducedMotion = reducedMotion
    await page.emulateMedia({
      reducedMotion: reducedMotion ? "reduce" : "no-preference",
    })
    await page.bringToFront()
    await prepareHostNavigation(page, `${mode} continuity case`)
    await page.goto(`${base}/host?scenario=${scenario.id}`)
    await page.locator("html[data-host-ready=true]").waitFor()
    const iframe = page.frameLocator("iframe")
    const waitChapter = async (id, timeout = 10000) => {
      await iframe
        .locator(`[data-full-show-chapter="${id}"]`)
        .waitFor({ timeout })
    }
    await waitChapter(question.id)
    child = page.frames().find((frame) => frame.url().endsWith("/widget"))
    assert(child)
    let snapshotSequence = 0
    const snapshot = async (
      step,
      {
        cards = false,
        expectedQuestion = "SELECTED_QUESTION_2",
        settled = true,
      } = {},
    ) => {
      let expectedModes = ["question"]

      if (step.includes("results")) {
        expectedModes = ["chosen", "survey-results", "results"]
      } else if (cards) {
        expectedModes = ["voting-open", "countdown", "voting"]
      }

      snapshotSequence += 1
      const requestToken = `${name}:${snapshotSequence}`
      const ready = await child.waitForFunction(
        (expected) => {
          const probe = window.__phaseContinuity

          if (!probe) {
            return false
          }

          if (probe.snapshotWait?.token !== expected.requestToken) {
            probe.snapshotWait = {
              token: expected.requestToken,
              identity: null,
              frames: 0,
            }
          }

          const state = probe.capture()
          const matches =
            state?.question &&
            state.text === expected.expectedQuestion &&
            expected.expectedModes.includes(state.nativeMode) &&
            (!expected.cards || state.cards.length === 5) &&
            (!expected.settled || probe.settled())

          if (!matches) {
            probe.snapshotWait.identity = null
            probe.snapshotWait.frames = 0

            return false
          }

          const identity = JSON.stringify([
            state.documentId,
            state.chapter,
            state.epoch,
            state.nativeMode,
            state.question,
            state.textNode,
            state.text,
            state.cards.map((card) => [card.testId, card.id]),
          ])

          if (probe.snapshotWait.identity !== identity) {
            probe.snapshotWait.identity = identity
            probe.snapshotWait.frames = 0
          }

          // One ready observation plus two subsequent RAF polls delivers CSS
          // animationstart events without a later, unrelated DOM capture.
          probe.snapshotWait.frames += 1

          return probe.snapshotWait.frames >= 3 ? state : false
        },
        { cards, expectedQuestion, settled, expectedModes, requestToken },
        { timeout: 10000, polling: "raf" },
      )

      try {
        const state = await ready.jsonValue()
        witness.snapshots.push({ step, ...state })

        return state
      } finally {
        await ready.dispose()
      }
    }

    const initial = await snapshot("question")
    assert.equal(initial.chapter, question.id)
    assert.equal(initial.cards.length, 0)
    assert.equal(initial.paused, "false")

    if (!reducedMotion) {
      assert.equal(
        entranceCount(initial, "question"),
        1,
        "Normal motion must play the genuine initial question entrance once",
      )
    }

    // This is the production timed transition, not a page reload or renderer fixture.
    await waitChapter(voting.id, question.duration.milliseconds + 10000)
    const answers = await snapshot("answers-and-voting", { cards: true })
    assertSameQuestion(initial, answers, "question → answers/voting")
    assert(answers.epoch > initial.epoch, "The phase clock must still reset")

    if (!reducedMotion) {
      assert.equal(
        entranceCount(answers, "answer"),
        5,
        "Each answer must enter exactly once when first shown",
      )
    }

    await page.screenshot({ path: path.join(evidence, `${name}-answers.png`) })
    const callsBeforeChoice = await page.evaluate(() => window.__host.calls())
    const choice = iframe.getByTestId(
      theme === "tadazz-classic" ? "tadazz-card-0" : "native-razzia-answer-0",
    )
    await choice.focus()
    await choice.press("Enter")
    await iframe.locator('[data-demo-selected-index="0"]').waitFor()
    assert.equal(await choice.getAttribute("aria-pressed"), "true")
    const selected = await snapshot("selected", { cards: true })
    assertSameQuestion(answers, selected, "local answer selection")
    assertSameCards(answers, selected, "local answer selection")
    assert.deepEqual(
      await page.evaluate(() => window.__host.calls()),
      callsBeforeChoice,
      "Selecting an answer must not call any server tool",
    )

    await page.bringToFront()
    await iframe.getByTestId("full-show-demo-reveal").click()
    await waitChapter(results.id)
    await iframe.getByTestId("full-show-demo-result").waitFor()
    const revealed = await snapshot("results", { cards: true })
    assertSameQuestion(selected, revealed, "result reveal")
    assertSameCards(selected, revealed, "same-grid zero-vote result reveal")
    assert(
      revealed.epoch > selected.epoch,
      "Results must retain a separate phase clock",
    )
    const { frame } =
      scenario.lastPreviewResult._meta[FULL_SHOW_META_V3].content
    assert.equal(frame.phase, "results")
    assert(
      frame.results.every(
        (result) => result.count === 0 && result.percent === 0,
      ),
      "Local selection must not fabricate vote totals",
    )
    assert.deepEqual(
      (await page.evaluate(() => window.__host.calls())).slice(
        callsBeforeChoice.length,
      ),
      ["preview_show"],
      "Only the authorized preview reveal may reach the server",
    )
    witness.resultCounts = frame.results.map((result) => result.count)
    witness.selectedOutcome = await iframe
      .getByTestId("full-show-demo-result")
      .getAttribute("data-demo-result")
    await page.screenshot({ path: path.join(evidence, `${name}-results.png`) })

    await page.bringToFront()
    await iframe.getByTestId("full-show-replay").click()
    await waitChapter(question.id)
    await iframe.locator('[data-demo-selected-index=""]').waitFor()
    const replay = await snapshot("explicit-replay")
    assert.notEqual(
      replay.question,
      revealed.question,
      "Explicit Replay must create a fresh question presentation",
    )
    assert.notEqual(
      replay.renderer,
      revealed.renderer,
      "The existing parent replay boundary must remain effective",
    )
    assert(replay.epoch > revealed.epoch)
    assert.equal(replay.cards.length, 0)
    assert.equal(await iframe.getByTestId("full-show-demo-result").count(), 0)

    if (!reducedMotion) {
      assert.equal(
        entranceCount(replay, "question"),
        entranceCount(revealed, "question") + 1,
        "Explicit Replay must play one fresh question entrance",
      )
    }

    await page.bringToFront()
    await iframe.getByTestId("full-show-next").click()
    await waitChapter(nextQuestion.id)
    const next = await snapshot("next-question", {
      expectedQuestion: "SELECTED_QUESTION_3",
    })
    assert.notEqual(next.question, replay.question)
    assert.notEqual(next.renderer, replay.renderer)
    assert.equal(next.cards.length, 0)

    if (!reducedMotion) {
      assert.equal(
        entranceCount(next, "question"),
        entranceCount(replay, "question") + 1,
        "New questions must play one fresh entrance",
      )
    }

    await page.bringToFront()
    await iframe.getByTestId("full-show-previous").click()
    await waitChapter(question.id)
    const previous = await snapshot("previous-question")
    assert.notEqual(previous.question, next.question)
    assert.notEqual(previous.question, replay.question)

    if (!reducedMotion) {
      assert.equal(
        entranceCount(previous, "question"),
        entranceCount(next, "question") + 1,
        "Explicit previous-question navigation must play one fresh entrance",
      )
    }

    // A presenter may pause before choosing/revealing. Advancing that same
    // question must not reconstruct its settled contents as a cold snapshot.
    await waitChapter(voting.id, question.duration.milliseconds + 10000)
    const again = await snapshot("second-answers", { cards: true })
    assertSameQuestion(previous, again, "previous question → answers/voting")
    await page.bringToFront()
    await iframe.getByTestId("full-show-pause").click()
    await iframe.locator('[data-playback-paused="true"]').waitFor()
    const pausedAnswers = await snapshot("paused-answers", {
      cards: true,
      settled: false,
    })
    assertSameQuestion(again, pausedAnswers, "pause existing question")
    assertSameCards(again, pausedAnswers, "pause existing answers")
    const callsBeforePausedChoice = await page.evaluate(() =>
      window.__host.calls(),
    )
    await choice.focus()
    await choice.press("Enter")
    await iframe.locator('[data-demo-selected-index="0"]').waitFor()
    const pausedChoice = await snapshot("paused-selection", {
      cards: true,
      settled: false,
    })
    assertSameQuestion(pausedAnswers, pausedChoice, "paused selection")
    assertSameCards(pausedAnswers, pausedChoice, "paused selection")
    assert.deepEqual(
      await page.evaluate(() => window.__host.calls()),
      callsBeforePausedChoice,
    )
    await page.bringToFront()
    await iframe.getByTestId("full-show-demo-reveal").click()
    await waitChapter(results.id)
    await iframe.getByTestId("full-show-demo-result").waitFor()
    const pausedResults = await snapshot("paused-results", {
      cards: true,
      settled: false,
    })
    assert.equal(pausedResults.paused, "true")
    assertSameQuestion(pausedChoice, pausedResults, "paused reveal")
    assertSameCards(pausedChoice, pausedResults, "paused same-grid reveal")
    assert(pausedResults.epoch > pausedChoice.epoch)
    assert.deepEqual(
      (await page.evaluate(() => window.__host.calls())).slice(
        callsBeforePausedChoice.length,
      ),
      ["preview_show"],
    )
    await page.bringToFront()
    await iframe.getByTestId("full-show-next").click()
    await waitChapter(nextQuestion.id)
    const pausedNext = await snapshot("paused-next-question", {
      expectedQuestion: "SELECTED_QUESTION_3",
      settled: false,
    })
    assert.equal(pausedNext.paused, "true")
    assert.notEqual(pausedNext.question, pausedResults.question)
    await iframe.locator('[data-demo-selected-index=""]').waitFor()
    await page.bringToFront()
    await iframe.getByTestId("full-show-pause").click()
    await iframe.locator('[data-playback-paused="false"]').waitFor()
    const resumedNext = await snapshot("resumed-next-question", {
      expectedQuestion: "SELECTED_QUESTION_3",
    })
    assert.equal(
      resumedNext.question,
      pausedNext.question,
      "Resuming the next question must continue its existing presentation",
    )

    const afterRecord = await readRecord()
    assert.equal(afterRecord.revision, beforeRecord.revision)
    assert.equal(afterRecord.authoredShowJson, beforeRecord.authoredShowJson)
    assert.equal(
      (await child.evaluate(() => window.__cspViolations ?? [])).length,
      0,
    )
    witness.draftUnchanged = true
    witness.status = "PASS"

    return { ...witness, evidence: `${name}.json` }
  } catch (error) {
    witness.status = "FAIL"
    witness.error = String(error)

    if (child) {
      try {
        witness.failureState = await child.evaluate(() =>
          window.__phaseContinuity?.capture(),
        )
      } catch (captureError) {
        witness.captureError = String(captureError)
      }
    }

    throw error
  } finally {
    fs.writeFileSync(
      path.join(evidence, `${name}.json`),
      JSON.stringify(witness, null, 2),
    )
  }
}
