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

it("follows the owner's newest connected room even while an older show is running", () => {
  const target = game()
  expect(
    selectQuizPilotTarget(
      [game("tzila", "owner", true, true), target],
      "tzila",
      "owner",
    ).game,
  ).toBe(target)
})

it("never routes to another quiz or guesses between active Tzila shows", () => {
  expect(selectQuizPilotTarget([game("other")], "tzila", "owner").error).toBe(
    "errors:game.notFound",
  )
  expect(selectQuizPilotTarget([game(), game()], "tzila").error).toBe(
    "errors:game.ambiguousTargetGame",
  )
})
