import { describe, expect, it } from "vitest"
import { collectQuizMediaReferences, detachMediaFromShowData } from "./card-media-references"
import { createDefaultQuizExtras } from "./quiz-extras"

describe("soundtrack media retention", () => {
  it("protects an assigned soundtrack from deletion and detaches only on request", () => {
    const extras = createDefaultQuizExtras("qa", [], "0".repeat(64))
    extras.audio.soundtrack = {
      lobby: {mode:"media",url:"/media/lobby.mp3",volume:0.2,loop:true,fadeMs:650,startOffsetSeconds:0},
    }
    const quizz = {subject:"QA",questions:[]}
    const references = collectQuizMediaReferences({id:"qa",quizz,extras})
    expect(references).toContainEqual(expect.objectContaining({field:"show.soundtrack",url:"/media/lobby.mp3"}))
    const detached = detachMediaFromShowData("lobby.mp3", quizz, extras)
    expect(detached.modified).toBe(true)
    expect(detached.extras?.audio.soundtrack?.lobby?.mode).toBe("mute")
    expect(extras.audio.soundtrack.lobby?.mode).toBe("media")
  })
})
