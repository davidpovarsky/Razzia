import { describe, expect, it } from "vitest"
import { hostRules } from "./roster-controls"

describe("authoritative host roster policy", () => {
  it("uses the live host presence policy without mutating stored settings", () => {
    const settings = { phoneInviteOnly: false, answersOnly: true }

    expect(
      hostRules({ settings, hostPresence: { phoneInviteOnly: true } }),
    ).toEqual({ phoneInviteOnly: true, answersOnly: true })
    expect(settings).toEqual({ phoneInviteOnly: false, answersOnly: true })
  })

  it("falls back to current game settings until presence is available", () => {
    expect(
      hostRules({
        settings: { phoneInviteOnly: true, generatedUsernames: false },
        hostPresence: null,
      }),
    ).toEqual({ phoneInviteOnly: true, generatedUsernames: false })
  })
})
