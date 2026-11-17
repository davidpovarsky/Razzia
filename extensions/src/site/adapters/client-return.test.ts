import { afterEach, describe, expect, it, vi } from "vitest"
import { safeReturnTo } from "./client"

describe("consent sign-in return target", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("allows only the feature-enabled exact native consent return pathname", () => {
    const path = `/studio/native-save-consent/${"a".repeat(54)}`
    vi.stubEnv("VITE_TADAZZ_NATIVE_CONSENT_ENABLED", "false")
    expect(safeReturnTo(path)).toBe("/studio")
    vi.stubEnv("VITE_TADAZZ_NATIVE_CONSENT_ENABLED", "true")
    expect(safeReturnTo(path)).toBe(path)
    for (const invalid of [
      `${path}?token=secret`,
      `${path}#secret`,
      `${path}/`,
      `${path}a`,
      path.slice(0, -1),
      `${path}/nested`,
      `https://external.invalid${path}`,
      `//external.invalid${path}`,
      path.replace("consent/", "consent%2f"),
      `/studio/../studio/native-save-consent/${"a".repeat(54)}`,
    ]) {
      expect(safeReturnTo(invalid), invalid).toBe("/studio")
    }
  })
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
