import { describe, expect, it } from "vitest"
import { tadaShowV1Schema } from "../../core/show-authoring-schema"
import { getPublicDemo } from "../../core/show-library/public-demo-catalogue"
import { stageOwnsQuestionImage } from "./question-media-owner"

const cards = tadaShowV1Schema.parse(getPublicDemo("family-mixup")!.show).cards
function question(key: string) {
  const card = cards.find((item) => item.key === key)
  if (!card || (card.kind !== "quiz" && card.kind !== "survey")) {
    throw new Error("Expected authored question")
  }
  return card
}

describe("native preview question image ownership", () => {
  it.each(["question", "answerCards", "voting", "voteLocked"] as const)(
    "keeps a static reference image beside image answers owned once by the original stage in %s",
    (phase) => {
      const card = question("family-q06")
      expect(card.answers.every((answer) => answer.imageUrl)).toBe(true)
      expect(
        stageOwnsQuestionImage({ card, phase, originalFamily: true }),
      ).toBe(true)
    },
  )

  it("retains the classic four-text-answer photo layout and its question-phase underlay", () => {
    const card = question("family-q28")
    expect(
      stageOwnsQuestionImage({ card, phase: "voting", originalFamily: false }),
    ).toBe(true)
    expect(
      stageOwnsQuestionImage({
        card,
        phase: "question",
        originalFamily: false,
      }),
    ).toBe(false)
    expect(
      stageOwnsQuestionImage({
        card: question("family-q06"),
        phase: "voting",
        originalFamily: false,
      }),
    ).toBe(false)
  })

  it.each(["blur", "pixelate", "tiles", "zoom"] as const)(
    "leaves the %s reveal with the existing native media owner",
    (effect) => {
      for (const trigger of ["automatic", "manual"] as const) {
        const card = {
          ...question("family-q06"),
          reveal: {
            effect,
            trigger,
            durationMs: 1000,
            audience: "all" as const,
          },
        }
        expect(
          stageOwnsQuestionImage({
            card,
            phase: "voting",
            originalFamily: true,
          }),
        ).toBe(false)
        expect(
          stageOwnsQuestionImage({
            card,
            phase: "voting",
            originalFamily: false,
          }),
        ).toBe(false)
      }
    },
  )

  it("keeps audio, video and absent media on their existing paths", () => {
    for (const originalFamily of [false, true]) {
      const original = question("family-q06")
      for (const type of ["audio", "video"] as const) {
        const card = { ...original, media: { ...original.media!, type } }
        expect(
          stageOwnsQuestionImage({ card, phase: "voting", originalFamily }),
        ).toBe(false)
      }
      expect(
        stageOwnsQuestionImage({
          card: undefined,
          phase: "voting",
          originalFamily,
        }),
      ).toBe(false)
      expect(
        stageOwnsQuestionImage({
          card: { ...original, media: undefined },
          phase: "voting",
          originalFamily,
        }),
      ).toBe(false)
    }
  })
})
