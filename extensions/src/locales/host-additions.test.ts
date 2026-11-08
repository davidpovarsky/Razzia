import { describe, expect, it } from "vitest"
import { registerHostLocaleAdditions } from "./host-additions"

describe("extension additions to upstream namespaces", () => {
  it("preserves existing and future upstream labels and namespaces", () => {
    const resources = {
      en: {
        errors: {
          game: {
            alreadyStarted: "Upstream",
            ambiguousTargetGame: "Future upstream",
          },
        },
        common: { save: "Save" },
      },
    }
    registerHostLocaleAdditions(resources)
    expect(resources.en.errors.game).toEqual({
      alreadyStarted: "Upstream",
      ambiguousTargetGame: "Future upstream",
    })
    expect(resources.en.common).toEqual({ save: "Save" })
  })

  it("adds complete nonempty translations for all eight languages and is idempotent", () => {
    const resources: Record<string, Record<string, unknown>> = {}
    registerHostLocaleAdditions(resources)
    const initial = structuredClone(resources)

    for (const language of ["en", "fr", "de", "es", "it", "ja", "tr", "vi"]) {
      const entry = resources[language] as {
        errors: { game: { ambiguousTargetGame: string } }
        quizz: { question: { duplicateQuestion: string } }
      }
      expect(entry.errors.game.ambiguousTargetGame.length).toBeGreaterThan(0)
      expect(entry.quizz.question.duplicateQuestion.length).toBeGreaterThan(0)
    }
    registerHostLocaleAdditions(resources)
    expect(resources).toEqual(initial)
  })
})
