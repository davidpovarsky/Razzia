import { describe, expect, it } from "vitest"
import { getPublicDemo } from "../../../core/show-library/public-demo-catalogue"
import { tadaShowV1Schema } from "../../../core/show-authoring-schema"
import {
  catalogueAuthoredSequence,
  catalogueQuestionReplayEntry,
} from "./catalogue-authored-sequence"

const show = tadaShowV1Schema.parse(getPublicDemo("family-mixup")!.show)
const sequence = catalogueAuthoredSequence(show.cards)

describe("Family catalogue authored playback", () => {
  it("retains every opening, round, media, question, score and closing in authored order", () => {
    expect(sequence.map((step) => step.card.key)).toEqual(
      show.cards.map((card) => card.key),
    )
    expect(sequence.slice(0, 3).map((step) => step.card.key)).toEqual([
      "family-opening",
      "family-round-1",
      "family-q01",
    ])
    expect(sequence.at(-1)?.card.key).toBe("family-closing")
    expect(
      sequence.filter((step) => step.card.kind === "transition"),
    ).toHaveLength(6)
    expect(sequence.filter((step) => step.card.kind === "media")).toHaveLength(
      10,
    )
    expect(
      sequence.filter((step) => step.card.kind === "leaderboard"),
    ).toHaveLength(3)
    expect(
      sequence
        .filter(
          (step) => step.card.kind === "quiz" || step.card.kind === "survey",
        )
        .map((step) => step.questionIndex),
    ).toEqual(Array.from({ length: 48 }, (_, index) => index))
  })

  it("places every observation before its question and every reveal after its result", () => {
    for (const step of sequence.filter((step) => step.card.kind === "media")) {
      const key = step.card.key.replace(/-(observe|reveal)$/, "")
      const question = sequence.find((entry) => entry.card.key === key)!
      expect(
        step.cardIndex + (step.card.key.endsWith("-observe") ? 1 : -1),
      ).toBe(question.cardIndex)
    }
    const finish = sequence.findIndex(
      (step) => step.card.key === "family-q38-reveal",
    )
    expect(sequence[finish + 1].card.key).toBe("family-q39")
  })

  it("replays required observations and round intros without replaying a previous question's reveal", () => {
    const entryKey = (questionIndex: number) =>
      sequence[catalogueQuestionReplayEntry(sequence, questionIndex)].card.key
    expect(entryKey(0)).toBe("family-round-1")
    expect(entryKey(3)).toBe("family-q04-observe")
    expect(entryKey(8)).toBe("family-round-2")
    expect(entryKey(17)).toBe("family-q18-observe")
    expect(entryKey(38)).toBe("family-q39")
    expect(entryKey(42)).toBe("family-q43-observe")
  })
})
