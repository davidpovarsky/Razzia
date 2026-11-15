import { describe, expect, it } from "vitest"
import { safeReturnTo } from "./client"

describe("consent sign-in return target", () => {
  it("allows the exact query-free first-party consent page", () => {
    expect(safeReturnTo("/studio/oauth-consent")).toBe("/studio/oauth-consent")
  })

  it.each([
    "/studio/oauth-consent?oauth_request=opaque-ticket",
    "/studio/oauth-consent#opaque-ticket",
    "/studio/oauth-consent-other",
    "https://external.invalid/studio/oauth-consent",
    "//external.invalid/studio/oauth-consent",
    "/login",
  ])(
    "preserves rejection of an unsafe or unsupported return target %s",
    (value) => {
      expect(safeReturnTo(value)).toBe("/studio")
    },
  )

  it("preserves the existing games destination", () => {
    expect(safeReturnTo("/studio/games")).toBe("/studio/games")
  })
})
