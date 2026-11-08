import { expect, it } from "vitest"
import { selectQuizPilotTarget } from "./pilot-target"

const game = (
  quizId = "tzila",
  owner = "owner",
  connected = true,
  started = false,
) => ({
  quizId,
  started,
  manager: { clientId: owner, connected },
})

it("routes directly to the connected owner's Tzila show among unrelated games", () => {
  const target = game()
  expect(
    selectQuizPilotTarget(
      [
        game("other"),
        game("tzila", "other"),
        game("tzila", "owner", false),
        target,
      ],
      "tzila",
      "owner",
    ).game,
  ).toBe(target)
})

it("prefers the running show over another connected lobby", () => {
  const target = game("tzila", "owner", true, true)
  expect(selectQuizPilotTarget([game(), target], "tzila", "owner").game).toBe(
    target,
  )
})

it("never routes to another quiz or guesses between active Tzila shows", () => {
  expect(selectQuizPilotTarget([game("other")], "tzila", "owner").error).toBe(
    "errors:game.notFound",
  )
  expect(selectQuizPilotTarget([game(), game()], "tzila", "owner").error).toBe(
    "errors:game.ambiguousTargetGame",
  )
})
