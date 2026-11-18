import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { StageBackdropV4 } from "./components"
import type { TadazzV4Data } from "./types"

const render = (data: TadazzV4Data) =>
  renderToStaticMarkup(
    createElement(StageBackdropV4, {
      scene: "question",
      data,
      assetBase: "/native/",
    }),
  )

describe("native authored backdrop presentation", () => {
  it("keeps inherited native appearance with no authored overlay", () => {
    const html = render({})
    expect(html).toContain("background-position:center")
    expect(html).toContain("background-size:cover")
    expect(html).toContain("/native/question-bg.webp")
    expect(html).not.toContain("linear-gradient")
  })

  it("applies authored position and overlay only to the backdrop layer", () => {
    const html = render({
      backgroundUrl: "/media/authored.png",
      backgroundFit: "contain",
      backgroundPosition: "bottom",
      backgroundOverlayOpacity: 0.85,
    })
    expect(html).toContain('data-testid="tadazz-backdrop"')
    expect(html).toContain("background-position:bottom")
    expect(html).toContain("background-size:contain")
    expect(html).toContain("linear-gradient(rgba(0, 0, 0, 0.85)")
    expect(html).toContain("/media/authored.png")
    expect(html).not.toContain("opacity:")
    expect(
      render({
        backgroundUrl: "/media/authored.png",
        backgroundOverlayOpacity: 0,
      }),
    ).not.toContain("linear-gradient")
  })
})
