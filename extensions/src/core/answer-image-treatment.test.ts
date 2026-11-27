import { buildInterimResults } from "../server/game/interim-results"
import { buildAnswerRecap } from "../server/game/answer-recap"
import { createRevealDistribution } from "../server/game/reveal-distribution"
import { answerRecapSceneSchema } from "./studio-timeline-schema"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { authoredAnswerSchema, tadaShowV1Schema } from "./show-authoring-schema"
import { answerVisualSchema } from "./media"
import {
  authoredShowToNativeBundleDraft,
  nativeBundleToAuthoredShow,
} from "./show-authoring-convert"
import { getPublicDemo } from "./show-library/public-demo-catalogue"
import { buildStageQuestion } from "../presentation/tadazz-show/presentation-scene"
import { FamilyMixupScene } from "../presentation/family-mixup/FamilyMixupScene"
import { AnswerVisualContent } from "../media/answer-button-presentation"
import { answerImageTreatmentStyle } from "../media/answer-image-treatment"

const answer = {
  text: "A",
  display: "both" as const,
  imageUrl: "/media/choice.png",
  alt: "Choice A",
}
const visual = {
  answerIndex: 0,
  display: "both" as const,
  url: answer.imageUrl,
  alt: answer.alt,
}

describe("authored answer image treatment", () => {
  it("leaves existing answers, native visuals and image rendering unchanged when absent", () => {
    expect(authoredAnswerSchema.parse(answer)).toEqual(answer)
    expect(answerVisualSchema.parse(visual)).toEqual(visual)
    expect(answerImageTreatmentStyle(undefined)).toBeUndefined()
    const html = renderToStaticMarkup(
      createElement(AnswerVisualContent, {
        image: visual,
        showText: true,
        children: "A",
      }),
    )
    expect(html).not.toContain("brightness(")
    expect(html).not.toContain("background:transparent")
  })

  it.each(["blur", "none", "url(javascript:alert(1))", 1, null])(
    "rejects unsupported treatment %j at both validation boundaries",
    (imageTreatment) => {
      expect(
        authoredAnswerSchema.safeParse({ ...answer, imageTreatment }).success,
      ).toBe(false)
      expect(
        answerVisualSchema.safeParse({ ...visual, imageTreatment }).success,
      ).toBe(false)
    },
  )

  it("preserves all four explicit Family silhouettes through native installation and save round trip", () => {
    const demo = getPublicDemo("family-mixup")!
    const show = tadaShowV1Schema.parse(demo.show)
    const originalQuestions = show.cards.filter(
      (card) => card.kind === "quiz" || card.kind === "survey",
    )
    expect(
      originalQuestions[5].answers.map((item) => item.imageTreatment),
    ).toEqual(Array(4).fill("silhouette"))
    expect(
      originalQuestions[8].answers.every(
        (item) => item.imageTreatment === undefined,
      ),
    ).toBe(true)
    const compiled = authoredShowToNativeBundleDraft(
      show,
      "silhouette-roundtrip",
    )
    expect(compiled.ok, JSON.stringify(compiled.diagnostics)).toBe(true)
    if (!compiled.bundleDraft) throw new Error("Expected native bundle")
    const questionId = compiled.bundleDraft.extras.questionIds[5]
    expect(
      compiled.bundleDraft.extras.perQuestion[questionId].answerVisuals?.map(
        (item) => item.imageTreatment,
      ),
    ).toEqual(Array(4).fill("silhouette"))
    const restored = tadaShowV1Schema.parse(
      nativeBundleToAuthoredShow(compiled.bundleDraft),
    )
    const restoredQuestions = restored.cards.filter(
      (card) => card.kind === "quiz" || card.kind === "survey",
    )
    expect(restoredQuestions[5].answers).toEqual(originalQuestions[5].answers)
    expect(restoredQuestions[8].answers).toEqual(originalQuestions[8].answers)
  })

  it("carries semantic treatment through the live stage without relying on a question key or filename", () => {
    const visuals = Array.from({ length: 4 }, (_, answerIndex) => ({
      ...visual,
      answerIndex,
      url: "/media/new-art-" + answerIndex + ".png",
      imageTreatment: "silhouette" as const,
    }))
    const question = buildStageQuestion({
      text: "Match the silhouette",
      answers: ["A", "B", "C", "D"],
      visuals,
      questionId: "renamed-installed-question",
      questionStates: { current: 1, total: 1 },
      questionImage: "/media/renamed-reference.png",
    })
    expect(question.options.map((item) => item.imageTreatment)).toEqual(
      Array(4).fill("silhouette"),
    )
    const html = renderToStaticMarkup(
      createElement(FamilyMixupScene, {
        scene: "voting-open",
        data: {
          question: question.question,
          questionKey: question.key,
          questionImage: question.questionImage,
          number: 1,
          totalQuestions: 1,
          answers: question.options.map((item) => ({
            title: item.label,
            imageUrl: item.image,
            imageTreatment: item.imageTreatment,
            alt: item.alt,
          })),
        },
      }),
    )
    expect(html.match(/filter:brightness\(0\)/g)).toHaveLength(4)
    expect(html.match(/background:transparent/g)).toHaveLength(4)
    expect(html.match(/box-shadow:none/g)).toHaveLength(4)
    expect(html).toContain("/media/new-art-3.png")
  })

  it("applies the same transparent silhouette treatment in the shared player answer image", () => {
    const image = answerVisualSchema.parse({
      ...visual,
      imageTreatment: "silhouette",
    })
    const html = renderToStaticMarkup(
      createElement(AnswerVisualContent, {
        image,
        showText: true,
        children: "A",
      }),
    )
    expect(html).toContain("filter:brightness(0)")
    expect(html).toContain("background:transparent")
    expect(html).toContain("box-shadow:none")
    expect(html).toContain('src="/media/choice.png"')
    expect(html).toContain('alt="Choice A"')
  })

  it("preserves silhouettes in authoritative interim and recap result projections", () => {
    const show = tadaShowV1Schema.parse(getPublicDemo("family-mixup")!.show)
    const compiled = authoredShowToNativeBundleDraft(show, "silhouette-results")
    if (!compiled.bundleDraft) throw new Error("Expected native bundle")
    const { quizz, extras } = compiled.bundleDraft
    const questionIndex = 5
    const questionId = extras.questionIds[questionIndex]
    const distribution = createRevealDistribution({
      question: quizz.questions[questionIndex],
      answers: [{ playerId: "synthetic-player", answerIds: [3], points: 100 }],
      players: [],
      survey: false,
      questionIndex,
      questionId,
      startedAt: 1234,
    })
    const interim = buildInterimResults(distribution, quizz, extras)
    expect(interim?.options.map((item) => item.imageTreatment)).toEqual(
      Array(4).fill("silhouette"),
    )
    const recap = buildAnswerRecap({
      scene: answerRecapSceneSchema.parse({
        id: "ad654ec7-3c41-4afc-80e5-1b07f3ec1ee0",
        kind: "answerRecap",
        startQuestionId: questionId,
        mode: "correctAnswer",
      }),
      timelineStepIndex:
        extras.timeline.findIndex(
          (item) => item.kind === "question" && item.questionId === questionId,
        ) + 1,
      extras,
      quizz,
      history: [],
      getLedger: (index) =>
        index === questionIndex ? { answers: [{ answerIds: [3] }] } : undefined,
    })
    expect(recap?.items).toHaveLength(1)
    expect(recap?.items[0].winningOptions[0]).toMatchObject({
      imageTreatment: "silhouette",
      imageUrl: extras.perQuestion[questionId].answerVisuals?.[3].url,
    })
    const normal = buildInterimResults(
      { ...distribution, questionIndex: 8, questionId: extras.questionIds[8] },
      quizz,
      extras,
    )
    expect(
      normal?.options.every((item) => item.imageTreatment === undefined),
    ).toBe(true)
  })
})
