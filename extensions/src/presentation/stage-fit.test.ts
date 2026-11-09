import { describe, expect, it } from "vitest"
import React from "react"
import { renderToString } from "react-dom/server"
import { StageFitContainer, useStageFit } from "./stage-fit"

describe("Gate 3: StageFit Presentation Primitive", () => {
  it("renders with default stage-fit-mode and reactive css variables", () => {
    const html = renderToString(
      React.createElement(
        StageFitContainer,
        { className: "custom-fit-class" },
        React.createElement(
          "div",
          { "data-testid": "test-child" },
          "Stage Content",
        ),
      ),
    )

    expect(html).toContain('data-testid="stage-fit-container"')
    expect(html).toContain('data-fit-mode="')
    expect(html).toContain("--stage-available-height:")
    expect(html).toContain("--stage-available-width:")
    expect(html).toContain("custom-fit-class")
    expect(html).toContain("Stage Content")
  })

  it("assigns ultracompact mode when height is constrained below 580px", () => {
    let capturedMode = ""
    let capturedMaxPhotoH = 0

    const Consumer = () => {
      const state = useStageFit()
      capturedMode = state.fitMode
      capturedMaxPhotoH = state.maxPhotoHeightPx

      return React.createElement("div", null, `Mode: ${state.fitMode}`)
    }

    renderToString(
      React.createElement(
        StageFitContainer,
        { heightOverride: 568 },
        React.createElement(Consumer),
      ),
    )

    expect(capturedMode).toBe("ultracompact")
    expect(capturedMaxPhotoH).toBeLessThanOrEqual(76)
    expect(capturedMaxPhotoH).toBeGreaterThanOrEqual(40)
  })

  it("assigns spacious mode when height is 1080px", () => {
    let capturedMode = ""
    let capturedMaxPhotoH = 0

    const Consumer = () => {
      const state = useStageFit()
      capturedMode = state.fitMode
      capturedMaxPhotoH = state.maxPhotoHeightPx

      return React.createElement("div", null, `Mode: ${state.fitMode}`)
    }

    renderToString(
      React.createElement(
        StageFitContainer,
        { heightOverride: 1080 },
        React.createElement(Consumer),
      ),
    )

    expect(capturedMode).toBe("spacious")
    expect(capturedMaxPhotoH).toBeGreaterThanOrEqual(90)
    expect(capturedMaxPhotoH).toBeLessThanOrEqual(220)
  })
})
