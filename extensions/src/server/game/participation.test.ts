import { expect, it } from "vitest"
import { ExtensionGameSession } from "./session"
import { createDefaultQuizExtrasV2 } from "../../core/studio-timeline-schema"

it("publishes live numeric participation for host and projector without private roster payloads", () => {
  const extras = createDefaultQuizExtrasV2(
    "quiz",
    [crypto.randomUUID()],
    "a".repeat(64),
  )
  const session = new ExtensionGameSession("game", extras)
  let participation = { connected: 3, answered: 1 }
  session.setDelegate({ getParticipation: () => participation })
  for (const role of ["manager", "player"] as const) {
    expect(session.getStateSnapshot(role, []).extras.participation).toEqual(
      participation,
    )
  }
  participation = { connected: 2, answered: 0 }
  session.onPresenceChanged()
  expect(session.getStateSnapshot("player", []).extras.participation).toEqual(
    participation,
  )
  expect(
    Object.keys(
      session.getStateSnapshot("player", []).extras.participation as object,
    ),
  ).toEqual(["connected", "answered"])
})
