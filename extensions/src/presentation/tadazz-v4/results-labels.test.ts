import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { StageSceneV4 } from "./components"
import type { TadazzV4Data } from "./types"

const labels = {
  correctAnswer: "התשובה הנכונה",
  audienceResults: "תוצאות הקהל",
}

function renderResult(mode: "quiz" | "survey", eyebrow?: string) {
  const data: TadazzV4Data = {
    question: "A retained question",
    mode,
    answers: [{ title: "First" }, { title: "Second" }],
    counts: [2, 1],
    solutions: mode === "quiz" ? [0] : undefined,
    labels,
    eyebrow,
  }

  return renderToString(
    createElement(StageSceneV4, {
      scene: "survey-results",
      data,
      assetBase: "/tadazz-show/v4/",
    }),
  )
}

describe("native result label semantics", () => {
  it.each(["quiz", "survey"] as const)(
    "uses the localized %s result label in the existing heading and accessible status",
    (mode) => {
      const expected =
        mode === "quiz" ? labels.correctAnswer : labels.audienceResults
      const output = renderResult(mode)
      expect(output).toContain(`<div class="eyebrow">${expected}</div>`)
      expect(output).toContain(`data-testid="tadazz-status">${expected}</div>`)
      expect(output).toContain("A retained question")
      expect(
        output.match(/data-testid="tadazz-question-panel"/gu),
      ).toHaveLength(1)
    },
  )

  it("preserves an explicit authored heading without losing result semantics", () => {
    const output = renderResult("quiz", "Authored round title")
    expect(output).toContain('<div class="eyebrow">Authored round title</div>')
    expect(output).toContain(
      `data-testid="tadazz-status">${labels.correctAnswer}</div>`,
    )
  })
})
