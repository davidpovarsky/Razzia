import { describe, expect, it } from "vitest"
import { timerEndTransition } from "./timer-end-cue"
const voting = {
  enabled: true,
  gameId: "game",
  questionId: "q1",
  epoch: 2,
  voting: true,
  results: false,
  paused: false,
}
describe("authoritative timer end", () => {
  it.each(["natural deadline", "manual end", "all-connected answered"])(
    "plays once on server completion: %s",
    () => {
      const armed = timerEndTransition(null, voting).state
      const end = timerEndTransition(armed, {
        ...voting,
        voting: false,
        results: true,
      })
      expect(end.cue).toBe("game:q1:2:timer-ended")
      expect(
        timerEndTransition(end.state, {
          ...voting,
          voting: false,
          results: true,
        }).cue,
      ).toBeUndefined()
    },
  )
  it("does not buzz on refresh into results, a skip, or another question's history", () => {
    expect(
      timerEndTransition(null, { ...voting, voting: false, results: true }).cue,
    ).toBeUndefined()
    const armed = timerEndTransition(null, voting).state
    expect(
      timerEndTransition(armed, { ...voting, voting: false, results: false })
        .cue,
    ).toBeUndefined()
    expect(
      timerEndTransition(armed, {
        ...voting,
        questionId: "other",
        voting: false,
        results: true,
      }).cue,
    ).toBeUndefined()
  })
  it("fires on the server end before a delayed visual voting status updates", () => {
    const armed = timerEndTransition(null, voting).state
    expect(timerEndTransition(armed, { ...voting, results: true }).cue).toBe(
      "game:q1:2:timer-ended",
    )
  })
  it("rearms on a real question restart and respects a paused completion", () => {
    const first = timerEndTransition(timerEndTransition(null, voting).state, {
      ...voting,
      voting: false,
      results: true,
    })
    const restarted = timerEndTransition(first.state, {
      ...voting,
      epoch: 5,
    }).state
    const paused = timerEndTransition(restarted, {
      ...voting,
      epoch: 5,
      voting: false,
      results: true,
      paused: true,
    })
    expect(paused.cue).toBeUndefined()
    expect(
      timerEndTransition(paused.state, {
        ...voting,
        epoch: 5,
        voting: false,
        results: true,
      }).cue,
    ).toBe("game:q1:5:timer-ended")
  })
})
