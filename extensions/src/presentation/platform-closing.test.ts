import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { PlatformClosingBoundary } from "./platform-closing"
import { Finale } from "./tadazz-v4/FullShowScenes"
import { PLATFORM_CLOSING_DURATION_MS } from "../core/platform-opening"

describe("shared product curtain ownership", () => {
  const finale = () => createElement(Finale, { data: {} })

  it("retains the authored curtain in standalone scene previews", () => {
    const html = renderToStaticMarkup(finale())
    expect(html).toContain("full-curtain left")
    expect(html).toContain("full-curtain right")
    expect(html).not.toContain('data-testid="platform-game-closing"')
  })

  it("renders exactly one product curtain around a terminal authored finale", () => {
    const html = renderToStaticMarkup(
      createElement(
        PlatformClosingBoundary,
        { elapsedMs: PLATFORM_CLOSING_DURATION_MS },
        finale(),
      ),
    )
    expect(html).toContain('data-testid="platform-game-closing"')
    expect(html).toContain('data-closing-stage="closed"')
    expect(html).not.toContain("full-curtain left")
    expect(html).not.toContain("full-curtain right")
    expect(html).toContain("full-finale-logo")
  })

  it("also closes a plain native game and leaves ordinary scenes untouched", () => {
    const plain = createElement("section", null, "Final results")
    const ending = renderToStaticMarkup(
      createElement(
        PlatformClosingBoundary,
        { elapsedMs: PLATFORM_CLOSING_DURATION_MS, reducedMotion: true },
        plain,
      ),
    )
    expect(ending).toContain("Final results")
    expect(ending).toContain('data-curtain-progress="1"')
    const ordinary = renderToStaticMarkup(
      createElement(PlatformClosingBoundary, { elapsedMs: null }, finale()),
    )
    expect(ordinary).toContain("full-curtain left")
    expect(ordinary).not.toContain('data-testid="platform-game-closing"')
  })
})
