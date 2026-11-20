/** Observe actual painted native live phases; no mocked clocks or production data. */
import assert from "node:assert/strict"

export async function watchNativeQuestionSequence(page) {
  await page.evaluate(() => {
    let firstHeading = null
    let stopped = false
    const observation = {
      questionAt: null,
      votingAt: null,
      answersAt: null,
      timerAt: null,
      resultsAt: null,
      identityRetained: true,
      duplicateHeading: false,
      earlyAnswers: false,
      earlyTimer: false,
      repeatedEntrance: false,
      phases: [],
    }
    const sample = () => {
      if (stopped) return
      const round = document.querySelector("[data-native-question-round]")
      if (round) {
        const now = performance.now()
        const phase = round.getAttribute("data-question-phase")
        const headings = round.querySelectorAll(
          "[data-native-question-heading]",
        )
        const heading = headings[0]
        if (headings.length !== 1) observation.duplicateHeading = true
        if (phase === "question" && observation.questionAt === null) {
          observation.questionAt = now
          firstHeading = heading
        }
        if (firstHeading && heading !== firstHeading) {
          observation.identityRetained = false
        }
        if (!observation.phases.includes(phase)) observation.phases.push(phase)
        const visible = (node) => {
          if (!(node instanceof Element)) return false
          const bounds = node.getBoundingClientRect()
          const frame = round.getBoundingClientRect()
          if (
            bounds.width <= 0 ||
            bounds.height <= 0 ||
            bounds.right <= frame.left ||
            bounds.left >= frame.right ||
            bounds.bottom <= frame.top ||
            bounds.top >= frame.bottom
          )
            return false
          for (let current = node; current; current = current.parentElement) {
            const style = getComputedStyle(current)
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              Number(style.opacity) <= 0.01
            )
              return false
            if (current === round) break
          }
          return true
        }
        const badge = round.querySelector('[data-testid="answer-badge-0"]')
        const hasAnswers = visible(badge?.closest("button") ?? badge)
        const hasTimer = visible(round.querySelector('[role="timer"]'))
        if (phase === "question") {
          if (hasAnswers) observation.earlyAnswers = true
          if (hasTimer) observation.earlyTimer = true
        }
        if (phase === "voting" && observation.votingAt === null) {
          observation.votingAt = now
        }
        if (hasAnswers && observation.answersAt === null)
          observation.answersAt = now
        if (hasTimer && observation.timerAt === null) observation.timerAt = now
        if (phase === "results" && observation.resultsAt === null) {
          observation.resultsAt = now
        }
      }
      requestAnimationFrame(sample)
    }
    const entrance = (event) => {
      if (
        firstHeading &&
        observation.votingAt !== null &&
        event.target instanceof Element &&
        event.target.contains(firstHeading)
      ) {
        observation.repeatedEntrance = true
      }
    }
    document.addEventListener("animationstart", entrance, true)
    window.__nativeQuestionSequence = {
      observation,
      stop() {
        stopped = true
        document.removeEventListener("animationstart", entrance, true)
      },
    }
    requestAnimationFrame(sample)
  })
}

export async function readNativeQuestionSequence(
  page,
  { results = false } = {},
) {
  const observation = await page.evaluate(() => {
    const state = window.__nativeQuestionSequence
    if (!state) throw new Error("Native sequence observer not installed")
    if (state.observation.resultsAt !== null) state.stop()
    return state.observation
  })
  assert.notEqual(
    observation.questionAt,
    null,
    "Question-only phase was painted",
  )
  assert.notEqual(observation.votingAt, null, "Voting phase was painted")
  assert.notEqual(observation.answersAt, null, "Answer choices appeared")
  assert.notEqual(observation.timerAt, null, "Voting timer appeared")
  const questionLeadInMs = observation.votingAt - observation.questionAt
  assert(
    questionLeadInMs >= 1800 && questionLeadInMs <= 2500,
    "Server question lead-in must be 2000 ms within measured network/frame tolerance: " +
      questionLeadInMs,
  )
  assert.equal(observation.earlyAnswers, false, "No answers during the lead-in")
  assert.equal(
    observation.earlyTimer,
    false,
    "No voting timer during the lead-in",
  )
  assert(
    Math.abs(observation.answersAt - observation.timerAt) <= 34,
    "Answers and timer must appear in the same rendered frame",
  )
  assert.equal(
    observation.identityRetained,
    true,
    "The original question DOM node persists",
  )
  assert.equal(
    observation.duplicateHeading,
    false,
    "One question heading throughout",
  )
  assert.equal(
    observation.repeatedEntrance,
    false,
    "Question entrance is not replayed",
  )
  if (results)
    assert.notEqual(observation.resultsAt, null, "Results phase observed")
  return { ...observation, questionLeadInMs, resultsRequired: results }
}
