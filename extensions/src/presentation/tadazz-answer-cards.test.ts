import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { TadazzQuestionFrame, TadazzSurveyCards } from "./tadazz-answer-cards"

const answers = [
  "Pirate",
  "Shadchan",
  "Faithful Dog",
  "Therapist",
  "Lamplighter",
]
const visuals = answers.map((answer, i) => ({
  answerIndex: i,
  display: "both" as const,
  url: `/media/pic-${i}.png`,
  alt: answer,
}))

describe("Tadazz reusable survey layout", () => {
  it("renders all five equal-format answer cards and square images", () => {
    const html = renderToStaticMarkup(
      createElement(TadazzSurveyCards, {
        answers,
        visuals,
        epochKey: "q1-2",
        readOnly: true,
      }),
    )
    expect(
      (html.match(/data-testid="tadazz-answer-choice-/g) ?? []).length,
    ).toBe(5)
    expect((html.match(/tdz-answer-card__photo/g) ?? []).length).toBe(5)
    expect(html).toContain("Faithful Dog")
    expect(html).toContain('data-answers-count="5"')
    expect(html).toContain('data-answer-index="4"')
  })
  it("shows actual image and its label in the same parent button", () => {
    const html = renderToStaticMarkup(
      createElement(TadazzSurveyCards, {
        answers,
        visuals,
        epochKey: "q1-3",
        readOnly: true,
      }),
    )
    expect(html).toContain('<img src="/media/pic-0.png" alt="Pirate"')
    expect(html).toContain('tdz-answer-card__caption">Pirate')
  })
  it("reveals results in unchanged answer order without green/red correctness", () => {
    const html = renderToStaticMarkup(
      createElement(TadazzSurveyCards, {
        answers,
        visuals,
        epochKey: "q1-results",
        resultStage: true,
        responses: [2, 0, 4, 3, 1],
        percentages: { 0: 20, 1: 0, 2: 40, 3: 30, 4: 10 },
      }),
    )
    expect(
      (html.match(/data-testid="tadazz-answer-choice-/g) ?? []).length,
    ).toBe(5)
    expect(html.indexOf("Pirate")).toBeLessThan(html.indexOf("Shadchan"))
    expect(html.indexOf("Shadchan")).toBeLessThan(html.indexOf("Faithful Dog"))
    expect(html).not.toContain("Correct answer")
    expect(html).not.toContain("Incorrect")
  })
  it("accepts locale-specific labels without hard-coded English stage copy", () => {
    const html = renderToStaticMarkup(
      createElement(TadazzSurveyCards, {
        answers,
        epochKey: "q4",
        readOnly: true,
        choicesAriaLabel: "Available responses",
        resultsAriaLabel: "Vote distribution",
        votesLabel: (n: number) => (n === 1 ? "vote" : "votes"),
      }),
    )
    expect(html).toContain('aria-label="Available responses"')
    expect(html).not.toContain("Audience favourite")
  })
  it("frames the question independently from the answers", () => {
    const html = renderToStaticMarkup(
      createElement(TadazzQuestionFrame, {
        question: "Pick a secondary character",
        kicker: "Question 04",
        children: createElement("span", null, "Answer grid"),
      }),
    )
    expect(html).toContain("Pick a secondary character")
    expect(html).toContain("Answer grid")
  })
})
