import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { planTransition } from "../../presentation/tadazz-show/show-director"
import {
  FamilyMixupEvent,
  FamilyMixupScene,
} from "../../presentation/family-mixup/FamilyMixupScene"
import {
  authoredShowToNativeBundleDraft,
  nativeBundleToAuthoredShow,
} from "../show-authoring-convert"
import { tadaShowV1Schema } from "../show-authoring-schema"
import type { PublicDemoMetadata } from "./public-demo-catalogue"
import {
  familyMixupDemoDefinition,
  familyMixupRounds,
  familyMixupSections,
  familyQuestionMedia,
  familyVaultClues,
  makeFamilyMixupCards,
} from "./family-mixup"

const metadata: PublicDemoMetadata = {
  ...familyMixupDemoDefinition,
  questionCount: 48,
  coverUrl: "",
}

const makeShow = () => ({
  format: "tada-show" as const,
  version: 1 as const,
  title: metadata.title,
  baseGameMode: "quiz" as const,
  cards: makeFamilyMixupCards(metadata, familyMixupRounds),
  settings: [],
})

const expectedAnswers: Record<number, string> = {
  2: "Second",
  3: "Toothbrush",
  4: "C",
  5: "5",
  6: "D",
  7: "3",
  9: "Wombat",
  10: "Octopus",
  11: "Venus",
  13: "Remember individual human faces",
  14: "Black",
  15: "Early shark relatives",
  18: "Yellow",
  19: "9",
  20: "Clock",
  21: "B",
  22: "A biscuit",
  23: "A",
  26: "A grandmother, mother and daughter",
  27: "The match",
  28: "D",
  29: "11 seconds",
  30: "At least two were born on the same day of the week",
  31: "Give the last person the basket with the orange",
  34: "B",
  35: "D",
  36: "Square",
  37: "Green",
  38: "Racer C",
  39: "D",
  42: "12",
  43: "Kitchen whisk",
  44: "Man overboard",
  45: "13:31",
  46: "14",
  48: "3624",
}

describe("The Great Family Mix-Up public show", () => {
  it("contains the approved 48 questions with 36 scored questions and 12 unscored surveys", () => {
    expect(familyMixupRounds).toHaveLength(48)
    expect(
      familyMixupRounds.filter((card) => card.kind === "quiz"),
    ).toHaveLength(36)
    const surveys = familyMixupRounds.flatMap((card, index) =>
      card.kind === "survey" ? [index + 1] : [],
    )
    expect(surveys).toEqual([1, 8, 12, 16, 17, 24, 25, 32, 33, 40, 41, 47])
    expect(familyMixupRounds.map((card) => card.key)).toEqual(
      Array.from(
        { length: 48 },
        (_, index) => `family-q${String(index + 1).padStart(2, "0")}`,
      ),
    )
    for (const card of familyMixupRounds) {
      expect(card.answers).toHaveLength(4)
      expect([20, 25, 30]).toContain(card.timeSeconds)
      if (card.kind === "survey") {
        expect(card.correctAnswers).toEqual([])
        expect(card.maxPoints).toBe(0)
        expect(card.penalty).toBe(0)
      }
    }
    expect(JSON.stringify(familyMixupRounds)).not.toMatch(
      /toilet|\bpoo\b|\bpoop\b/iu,
    )
  })

  it("keeps the reviewed answer key, including the corrected animal question and final code", () => {
    for (const [number, answer] of Object.entries(expectedAnswers)) {
      const card = familyMixupRounds[Number(number) - 1]
      expect(card.kind, card.key).toBe("quiz")
      if (card.kind !== "quiz")
        throw new Error(`Expected scored question ${number}`)
      expect(card.correctAnswers, card.key).toHaveLength(1)
      expect(card.answers[card.correctAnswers[0] - 1].text, card.key).toBe(
        answer,
      )
    }
    expect(familyMixupRounds[9].question).toBe("Which animal has three hearts?")
    const duck = familyMixupRounds[5]
    expect(duck.answers[3].imageUrl).toBe(duck.media?.url)
    expect(familyVaultClues).toHaveLength(4)
    expect(familyMixupRounds[47].question).toContain("triangle sides")
    expect(familyMixupRounds[47].question).toContain("second minus third")
    const ones = Array.from({ length: 20 }, (_, index) => String(index + 1))
      .join("")
      .match(/1/gu)
    expect(ones).toHaveLength(12)
    expect([1, 2, 3].reduce((sum, side) => sum + side * side, 0)).toBe(14)
  })

  it("places six introductions and leaderboards after precisely 16, 32 and 48 questions", () => {
    const cards = makeShow().cards
    let answered = 0
    const introPositions: number[] = []
    const leaderboardPositions: number[] = []
    for (const card of cards) {
      if (card.kind === "quiz" || card.kind === "survey") answered += 1
      if (card.kind === "transition") introPositions.push(answered)
      if (card.kind === "leaderboard") leaderboardPositions.push(answered)
    }
    expect(introPositions).toEqual([0, 8, 16, 24, 32, 40])
    expect(leaderboardPositions).toEqual([16, 32, 48])
    expect(
      cards
        .filter((card) => card.kind === "transition")
        .map((card) => card.title),
    ).toEqual(familyMixupSections)
    expect(cards[0].kind).toBe("opening")
    expect(cards.at(-1)?.kind).toBe("closing")
    expect(new Set(cards.map((card) => card.key)).size).toBe(cards.length)
  })

  it("separates finite observation clips from voting and keeps memory clues off the voting screen", () => {
    const cards = makeShow().cards
    const observationNumbers = [4, 18, 20, 22, 35, 38, 43]
    for (const number of observationNumbers) {
      const key = `family-q${String(number).padStart(2, "0")}`
      const index = cards.findIndex((card) => card.key === key)
      const clip = cards[index - 1]
      expect(clip.key).toBe(`${key}-observe`)
      expect(clip.kind).toBe("media")
      if (clip.kind !== "media")
        throw new Error(`Missing observation for ${key}`)
      expect(clip.mediaType).toBe("video")
      expect(clip.advance).toBe("onMediaEnd")
      expect(clip.endBehavior).toBe("advanceNext")
      expect(clip.loop).toBe(false)
      expect(clip.textOverlay).toBe(false)
      expect(clip.durationMs).toBeGreaterThan(0)
      expect(clip.mediaEndFallbackMs).toBeGreaterThan(clip.durationMs!)
      expect(familyMixupRounds[number - 1].media).toBeUndefined()
    }
    for (const number of [3, 38, 43]) {
      const key = `family-q${String(number).padStart(2, "0")}`
      const index = cards.findIndex((card) => card.key === key)
      const clip = cards[index + 1]
      expect(clip.key).toBe(`${key}-reveal`)
      expect(clip.kind).toBe("media")
    }
    const toothbrushReveal = cards.find(
      (card) => card.key === "family-q03-reveal",
    )
    expect(toothbrushReveal).toMatchObject({
      mediaType: "image",
      textOverlay: false,
      advance: "auto",
    })
    expect(familyMixupRounds[37].question).toContain("prediction")
  })

  it("validates and compiles through the shared native authoring pipeline with zero-based native solutions", () => {
    const show = tadaShowV1Schema.parse(makeShow())
    const compiled = authoredShowToNativeBundleDraft(
      show,
      "family-mixup-content-test",
    )
    expect(compiled.ok, JSON.stringify(compiled.diagnostics)).toBe(true)
    expect(
      compiled.diagnostics.filter((entry) => entry.severity === "error"),
    ).toEqual([])
    if (!compiled.bundleDraft) throw new Error("Expected a native bundle")
    const questions = compiled.bundleDraft.quizz.questions
    expect(questions).toHaveLength(48)
    expect(questions[9].solutions).toEqual([1])
    expect(questions[47].solutions).toEqual([0])
    expect(
      questions.filter((question) => question.playMode === "survey"),
    ).toHaveLength(12)
    for (const question of questions.filter(
      (entry) => entry.playMode === "survey",
    )) {
      expect(question.solutions).toBeUndefined()
      expect(question.maxPoints).toBe(0)
    }
    const roundTrip = tadaShowV1Schema.parse(
      nativeBundleToAuthoredShow(compiled.bundleDraft),
    )
    expect(
      roundTrip.cards.filter(
        (card) => card.kind === "quiz" || card.kind === "survey",
      ),
    ).toHaveLength(48)
    expect(
      roundTrip.cards.filter((card) => card.kind === "media"),
    ).toHaveLength(10)
  })

  it("keeps the approved bookends on the native authored cinematic owner after a save round trip", () => {
    const compiled = authoredShowToNativeBundleDraft(
      makeShow(),
      "family-bookends-test",
    )
    if (!compiled.bundleDraft)
      throw new Error(JSON.stringify(compiled.diagnostics))
    const restored = tadaShowV1Schema.parse(
      nativeBundleToAuthoredShow(compiled.bundleDraft),
    )
    const installed = authoredShowToNativeBundleDraft(
      restored,
      "family-bookends-reinstalled",
    )
    if (!installed.bundleDraft)
      throw new Error(JSON.stringify(installed.diagnostics))
    const scenes = Object.values(installed.bundleDraft.extras.scenes).filter(
      (scene) => scene.kind === "opening" || scene.kind === "closing",
    )
    expect(scenes).toHaveLength(2)
    for (const scene of scenes) {
      expect(scene).toMatchObject({
        mediaUrl: "/tadazz-show/family-mixup/stage-bright.webp",
        mediaType: "image",
        stageLayout: "cinema",
        textOverlay: true,
      })
      expect(
        planTransition(
          null,
          { kind: "scene", key: scene.id, scene },
          { mode: "idle", questionKey: null },
        ),
      ).toEqual([{ op: "custom" }])
      const html = renderToStaticMarkup(
        createElement(FamilyMixupEvent, { scene }),
      )
      expect(html).toContain(
        scene.kind === "opening" ? "fm-opening" : "fm-closing",
      )
    }
  })

  it("retains all six native round cues when installed scene IDs are UUIDs", () => {
    const compiled = authoredShowToNativeBundleDraft(
      makeShow(),
      "family-rounds-test",
    )
    if (!compiled.bundleDraft)
      throw new Error(JSON.stringify(compiled.diagnostics))
    const restored = tadaShowV1Schema.parse(
      nativeBundleToAuthoredShow(compiled.bundleDraft),
    )
    const installed = authoredShowToNativeBundleDraft(
      restored,
      "family-rounds-reinstalled",
    )
    if (!installed.bundleDraft)
      throw new Error(JSON.stringify(installed.diagnostics))
    const scenes = Object.values(installed.bundleDraft.extras.scenes).filter(
      (scene) => scene.kind === "transition",
    )
    expect(scenes).toHaveLength(6)
    scenes.forEach((scene, index) => {
      expect(scene.id).toMatch(/^[0-9a-f-]{36}$/u)
      const [step] = planTransition(
        null,
        { kind: "scene", key: scene.id, scene },
        { mode: "idle", questionKey: null },
      )
      expect(step).toMatchObject({
        op: "playZZWipe",
        thenCustom: true,
        interlude: { title: scene.title },
      })
      if (step.op !== "playZZWipe" || !step.interlude)
        throw new Error(
          `Expected native wipe into interlude for ${scene.title}`,
        )
      const html = renderToStaticMarkup(
        createElement(FamilyMixupScene, {
          scene: "interlude",
          data: step.interlude,
        }),
      )
      expect(html).toContain(`ROUND ${String(index + 1).padStart(2, "0")}`)
    })
    const title = familyMixupSections[5]
    for (const [extra, expected] of [
      [{ roundNumber: 2, round: 3, id: "family-round-4" }, "ROUND 02"],
      [{ round: 3, id: "family-round-4" }, "ROUND 03"],
      [{ id: "family-round-4" }, "ROUND 04"],
    ] as const) {
      expect(
        renderToStaticMarkup(
          createElement(FamilyMixupEvent, {
            scene: { kind: "transition", title, ...extra },
          }),
        ),
      ).toContain(expected)
    }
  })

  it("references real local PNG and MP4 bytes with labelled answer pictures and useful image descriptions", () => {
    const urls = new Set<string>()
    for (const card of makeShow().cards) {
      if (card.kind === "media") urls.add(card.mediaUrl!)
      if (card.kind !== "quiz" && card.kind !== "survey") continue
      if (card.media) urls.add(card.media.url)
      for (const answer of card.answers) {
        if (!answer.imageUrl) continue
        urls.add(answer.imageUrl)
        expect(answer.display).toBe("both")
        expect(answer.alt).toBe(answer.text)
      }
    }
    expect(urls.size).toBeGreaterThan(30)
    const publicRoot = resolve(
      import.meta.dirname,
      "../../../../packages/web/public",
    )
    for (const url of urls) {
      expect(url).toMatch(
        /^\/tadazz-show\/family-mixup\/media\/[a-z0-9-]+\.(png|mp4)$/u,
      )
      const bytes = readFileSync(resolve(publicRoot, url.slice(1)))
      expect(bytes.byteLength, url).toBeGreaterThan(100)
      if (url.endsWith(".png")) {
        expect(bytes.subarray(0, 8).toString("hex"), url).toBe(
          "89504e470d0a1a0a",
        )
      } else {
        expect(bytes.subarray(4, 8).toString("ascii"), url).toBe("ftyp")
      }
    }
    for (const picture of Object.values(familyQuestionMedia)) {
      expect(picture.alt.trim().length).toBeGreaterThan(10)
    }
  })
})
