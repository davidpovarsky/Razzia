import { describe, expect, it } from "vitest"
import { resolveSiteMetadata } from "../web/shared/site-metadata-policy"

const products = [
  { id: "crowd", title: "The Crowd Decides" },
  { id: "quiz", title: "The Big Quiz" },
]
const resolve = (path: string, search = "", brand?: string) =>
  resolveSiteMetadata({
    pathname: path,
    search,
    origin: "https://example.test",
    products,
    tenantName: brand,
  })

describe("site metadata policy", () => {
  it.each([
    ["/", "Home"],
    ["/login", "Log in"],
    ["/signup", "Create account"],
    ["/verify", "Email verified"],
    ["/forgot", "Forgot password?"],
    ["/reset", "Reset password"],
    ["/studio", "Dashboard"],
    ["/studio/games", "My Games"],
    ["/studio/account", "Account & licences"],
    ["/studio/prepare", "Prepare show"],
    ["/manager/quizz/abc", "Editor"],
    ["/manager", "Manager"],
    ["/party/manager/abc", "Host"],
    ["/party/abc", "Player"],
    ["/game", "Join game"],
    ["/display/abc", "Display"],
  ])("maps %s to %s", (path, title) => {
    expect(resolve(path).titleKey).toBe(title)
  })

  it("uses platform brand and preserves an explicit native tenant brand", () => {
    expect(resolve("/login", "", "Custom").brand).toBe("Tadazz")
    expect(resolve("/party/abc", "", " Custom ").brand).toBe("Custom")
    expect(resolve("/game", "", "TADAZZ").brand).toBe("Tadazz")
    expect(resolve("/game", "", " ").brand).toBe("Tadazz")
  })

  it("normalizes invalid views and product identifiers consistently with marketing", () => {
    expect(resolve("/", "?view=unknown").isHome).toBe(true)
    expect(resolve("/", "?view=product&game=unknown").titleKey).toBe(
      "The Crowd Decides",
    )
    expect(resolve("/site", "?view=product&game=quiz").titleKey).toBe(
      "The Big Quiz",
    )
  })

  it("never places private query parameters in canonical URLs", () => {
    expect(resolve("/game", "?pin=1234&token=secret").canonical).toBe(
      "https://example.test/game",
    )
    expect(resolve("/reset", "?token=secret").canonical).toBe(
      "https://example.test/reset",
    )
    expect(
      resolve("/", "?view=product&game=unknown&token=secret").canonical,
    ).toBe("https://example.test/?view=product&game=crowd")
  })
})
