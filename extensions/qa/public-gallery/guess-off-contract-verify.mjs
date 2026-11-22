import assert from "node:assert/strict"

/** Observe painted native scenes throughout the existing five-question walk. */
export async function watchGuessOffContract(root) {
  await root.evaluate((element) => {
    const forbidden = new Set([
      "vote-locked",
      "chosen",
      "top-pick",
      "round-recap",
    ])
    const trace = { frames: 0, transitions: [], rounds: [], violations: [] }
    let previous = ""
    let previousPhase = ""
    let currentRound
    let frame
    let stopped = false
    const visible = (node) => {
      if (!node) return false
      const rect = node.getBoundingClientRect()
      if (!rect.width || !rect.height) return false
      for (
        let ancestor = node;
        ancestor instanceof Element;
        ancestor = ancestor.parentElement
      ) {
        const style = getComputedStyle(ancestor)
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) <= 0.01
        )
          return false
      }
      return true
    }
    const sample = () => {
      const phase = element.getAttribute("data-ggo-phase")
      const mode = element.getAttribute("data-ggo-mode")
      const scene = element
        .querySelector(".tzv4-stage")
        ?.getAttribute("data-v4-scene")
      const identity = [phase, scene].join(":")
      if (identity !== previous) {
        trace.transitions.push({ phase, scene })
        previous = identity
      }
      if (forbidden.has(scene) || phase === "locked") {
        if (
          !trace.violations.some(
            (item) => item.phase === phase && item.scene === scene,
          )
        )
          trace.violations.push({ phase, scene })
      }
      if (scene === "grand-finale" && phase !== "closing") {
        trace.violations.push({ kind: "early-curtain", phase, scene })
      }
      if (
        phase === "closing" &&
        [
          ...element.querySelectorAll(".full-finale-z, .full-final-zigzags"),
        ].some(visible)
      ) {
        trace.violations.push({ kind: "visible-final-glyph", phase, scene })
      }
      if (phase === "voting" && previousPhase !== "voting") {
        currentRound = {
          index: trace.rounds.length,
          mode,
          startedAt: performance.now(),
          selected: false,
          timerValues: [],
        }
        trace.rounds.push(currentRound)
      }
      if (currentRound && phase === "voting") {
        currentRound.selected ||=
          element.querySelector(".choice-slot.is-selected") !== null
        const timer = element
          .querySelector('[data-testid="tadazz-timer"]')
          ?.textContent?.match(/\d{2}:\d{2}/u)?.[0]
        if (timer && currentRound.timerValues.at(-1) !== timer)
          currentRound.timerValues.push(timer)
      }
      if (
        currentRound &&
        phase === "results" &&
        currentRound.elapsedMs === undefined
      ) {
        currentRound.elapsedMs = performance.now() - currentRound.startedAt
        currentRound.selected ||=
          element.querySelector(".choice-slot.is-selected") !== null
      }
      previousPhase = phase
    }
    const tick = () => {
      if (stopped) return
      trace.frames += 1
      sample()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    element.__guessOffContract = {
      trace,
      stop: () => {
        stopped = true
        cancelAnimationFrame(frame)
        sample()
        return trace
      },
    }
  })
}

/** Await the settled visible tag; the existing sequence watcher checks geometry. */
export async function verifyGuessOffResult(root, expect, unanswered) {
  await expect
    .poll(
      () =>
        root.evaluate((element) => {
          const mode = element.getAttribute("data-ggo-mode")
          const tags = [
            ...element.querySelectorAll(".choice-slot .winner-tag"),
          ].filter((node) => {
            const rect = node.getBoundingClientRect()
            if (!rect.width || !rect.height) return false
            for (
              let ancestor = node;
              ancestor instanceof Element;
              ancestor = ancestor.parentElement
            ) {
              const style = getComputedStyle(ancestor)
              if (
                style.display === "none" ||
                style.visibility === "hidden" ||
                Number(style.opacity) <= 0.01
              )
                return false
            }
            return true
          })
          const expected =
            mode === "quiz" ? "CORRECT ANSWER" : "AUDIENCE FAVOURITE"
          const slot = tags[0]?.closest(".choice-slot")
          return (
            tags.length === 1 &&
            tags[0].textContent.trim() === expected &&
            slot.classList.contains(
              mode === "quiz" ? "is-correct" : "is-favourite",
            )
          )
        }),
      { timeout: 10_000 },
    )
    .toBe(true)
  if (unanswered)
    await expect(root.locator(".choice-slot.is-selected")).toHaveCount(0)
}

export async function readGuessOffContract(root) {
  const trace = await root.evaluate((element) =>
    element.__guessOffContract.stop(),
  )
  assert(
    trace.frames > 0,
    "The complete Guess-off walk must be observed in real frames",
  )
  assert.deepEqual(
    trace.violations,
    [],
    "Guess-off must not paint unintended scenes, early curtains, or final decorative glyphs",
  )
  assert.equal(
    trace.transitions.filter((entry) => entry.scene === "grand-finale").length,
    1,
    "The final curtain must appear once",
  )
  assert.equal(trace.rounds.length, 5)
  assert.deepEqual(
    trace.rounds.slice(0, 2).map((round) => round.mode),
    ["survey", "quiz"],
  )
  for (const round of trace.rounds.slice(0, 2)) {
    assert.equal(
      round.selected,
      false,
      "Expired questions must remain unanswered",
    )
    assert(
      round.elapsedMs >= 18_500,
      "Unanswered results must wait for the genuine 20-second timer",
    )
    assert(
      round.timerValues.some((value) => value === "00:20" || value === "00:19"),
      "Observe the real initial countdown",
    )
    assert(
      round.timerValues.some((value) => value === "00:01"),
      "Observe the last second before natural expiry",
    )
  }
  return trace
}
