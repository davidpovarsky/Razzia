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

it("routes an approved shared line to its owner's newest connected show", () => {
  const original = game("customer")
  const bms = { ...game("customer"), quizId: "bms" }
  const disconnected = {
    ...bms,
    manager: { connected: false, clientId: "customer" },
  }
  const otherOwner = { ...game("test"), quizId: "bms" }
  const unapproved = { ...game("customer"), quizId: "private-other-show" }
  const config = JSON.stringify({
    "443306131984": {
      ownerId: "customer",
      quizId: "tzila",
      quizIds: ["tzila", "bms"],
    },
  })
  expect(
    selectDialedPilotTarget(
      [original, bms, otherOwner, unapproved, disconnected],
      "+44 330 613 1984",
      config,
    ).game,
  ).toBe(bms)
  expect(
    selectDialedPilotTarget([bms, original], "443306131984", config).game,
  ).toBe(original)
  expect(
    selectDialedPilotTarget([otherOwner, unapproved], "443306131984", config)
      .game,
  ).toBeNull()
})

it("fails closed for malformed explicit show allowlists", () => {
  for (const quizIds of [[], [""], [null], "bms", Array(33).fill("bms")]) {
    const config = JSON.stringify({
      "443306131984": { ownerId: "customer", quizId: "tzila", quizIds },
    })
    expect(
      selectDialedPilotTarget([game("customer")], "443306131984", config).game,
    ).toBeNull()
  }
})
