import { expect, it } from "vitest"
import { selectDialedPilotTarget } from "./pilot-dial-target"
const game = (owner: string) => ({
  quizId: "tzila",
  started: true,
  manager: { connected: true, clientId: owner },
})
const targets = JSON.stringify({
  "0772263533": { ownerId: "test", quizId: "tzila" },
  "443306131984": { ownerId: "customer", quizId: "tzila" },
})
it("keeps simultaneous customer and test games isolated by dialed system number", () => {
  const customer = game("customer"),
    test = game("test"),
    newTest = game("test")
  const games = [customer, test, newTest]
  expect(selectDialedPilotTarget(games, "0772263533", targets).game).toBe(
    newTest,
  )
  expect(selectDialedPilotTarget(games, "+443306131984", targets).game).toBe(
    customer,
  )
})
it("does not fall through to the other account when its owner has no game", () => {
  expect(
    selectDialedPilotTarget([game("customer")], "0772263533", targets).game,
  ).toBeNull()
  expect(
    selectDialedPilotTarget([game("test")], "443306131984", targets).game,
  ).toBeNull()
})
it("fails closed for unknown numbers or invalid configuration", () => {
  expect(
    selectDialedPilotTarget([game("customer")], "999999", targets).game,
  ).toBeNull()
  expect(
    selectDialedPilotTarget([game("customer")], "0772263533", "broken").game,
  ).toBeNull()
})
