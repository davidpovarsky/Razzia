import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createDefaultAudioExtras, createDefaultRosterExtras } from "../core/index"
import { createExtensionRoutes } from "./api/routes"
import {
  associateMediaWithShow,
  buildMediaCatalogResponse,
  checkMediaDeleteSafety,
} from "./media-library"
import { writeSidecar } from "./storage/sidecar"

const Q1_ID = "00000000-0000-4000-8000-000000000001"
const Q2_ID = "00000000-0000-4000-8000-000000000002"
const T1_ID = "00000000-0000-4000-8000-000000000011"
const T2_ID = "00000000-0000-4000-8000-000000000012"
const VALID_DIGEST = "a".repeat(64)

describe("Gate C: Persistent Media Catalog & Reference-Safe Deletion", () => {
  let tempDir = ""

  const getPath = (subPath = "") => path.join(tempDir, subPath)

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "razzia-media-lib-"))
    fs.mkdirSync(getPath("quizz"), { recursive: true })
    fs.mkdirSync(getPath("media"), { recursive: true })
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it("blocks deletion when media is referenced by another show or card, and allows deletion when unreferenced or explicitly detached", () => {
    const show1 = {
      id: "show-1",
      subject: "Friday Trivia",
      questions: [
        {
          id: Q1_ID,
          type: "single",
          question: "Question 1",
          media: { type: "image", url: "/media/shared-hero.png" },
          answers: ["A", "B"],
          solutions: [0],
          cooldown: 3,
          time: 15,
        },
      ],
    }

    const show2 = {
      id: "show-2",
      subject: "Saturday Gala",
      questions: [
        {
          id: Q2_ID,
          type: "single",
          question: "Question 2",
          answers: ["C", "D"],
          solutions: [1],
          cooldown: 3,
          time: 15,
        },
      ],
    }

    fs.writeFileSync(
      path.join(getPath("quizz"), "show-1.json"),
      JSON.stringify(show1, null, 2),
      "utf-8",
    )
    fs.writeFileSync(
      path.join(getPath("quizz"), "show-2.json"),
      JSON.stringify(show2, null, 2),
      "utf-8",
    )

    writeSidecar(getPath, "show-2", {
      schemaVersion: 2,
      revision: 1,
      quizId: "show-2",
      baseDigest: VALID_DIGEST,
      defaults: {
        newQuestionMode: "quiz",
        leaderboardPolicy: "cardOnly",
        advanceMode: "auto",
      },
      timeline: [{ id: T2_ID, kind: "question", questionId: Q2_ID }],
      scenes: {},
      questionIds: [Q2_ID],
      perQuestion: {
        [Q2_ID]: {
          background: {
            url: "/media/shared-hero.png",
            fit: "cover",
            position: "center",
            overlayOpacity: 0.35,
          },
        },
      },
      teams: {
        enabled: false,
        teams: [],
        autoAssign: "roundRobin",
      },
      audio: createDefaultAudioExtras(),
      roster: createDefaultRosterExtras(),
    })

    // 1. Attempt to delete shared-hero.png without detach -> blocked!
    const blocked = checkMediaDeleteSafety(getPath, "shared-hero.png")
    expect(blocked.allowed).toBe(false)
    expect(blocked.references).toHaveLength(2)
    expect(blocked.references.map((r) => r.quizId).sort()).toEqual([
      "show-1",
      "show-2",
    ])

    // 2. Unused file is allowed immediately
    const unused = checkMediaDeleteSafety(getPath, "unused-image.png")
    expect(unused.allowed).toBe(true)
    expect(unused.references).toHaveLength(0)

    // 3. Explicit detach removes references from both shows and allows deletion
    const detached = checkMediaDeleteSafety(getPath, "shared-hero.png", {
      detach: true,
    })
    expect(detached.allowed).toBe(true)
    expect(detached.detachedFromShows.sort()).toEqual(["show-1", "show-2"])

    // Verify show-1 and show-2 no longer reference shared-hero.png
    const afterDetach = checkMediaDeleteSafety(getPath, "shared-hero.png")
    expect(afterDetach.allowed).toBe(true)
    expect(afterDetach.references).toHaveLength(0)
  })

  it("associates uploaded media with a show catalog so it remains in 'Used in This Show' even when unassigned from a card", async () => {
    const show1 = {
      id: "show-1",
      subject: "Catalog Test Show",
      questions: [
        {
          id: Q1_ID,
          type: "single",
          question: "Q1",
          answers: ["A", "B"],
          solutions: [0],
          cooldown: 3,
          time: 15,
        },
      ],
    }
    fs.writeFileSync(
      path.join(getPath("quizz"), "show-1.json"),
      JSON.stringify(show1, null, 2),
      "utf-8",
    )
    writeSidecar(getPath, "show-1", {
      schemaVersion: 2,
      revision: 1,
      quizId: "show-1",
      baseDigest: VALID_DIGEST,
      defaults: {
        newQuestionMode: "quiz",
        leaderboardPolicy: "cardOnly",
        advanceMode: "auto",
      },
      timeline: [{ id: T1_ID, kind: "question", questionId: Q1_ID }],
      scenes: {},
      questionIds: [Q1_ID],
      perQuestion: {},
      teams: {
        enabled: false,
        teams: [],
        autoAssign: "roundRobin",
      },
      audio: createDefaultAudioExtras(),
      roster: createDefaultRosterExtras(),
    })

    associateMediaWithShow(getPath, "show-1", {
      name: "uploaded-once.png",
      url: "/media/uploaded-once.png",
      type: "image",
      addedAt: 1730462400000,
    })

    const catalog = buildMediaCatalogResponse(
      getPath,
      [
        {
          name: "uploaded-once.png",
          url: "/media/uploaded-once.png",
          type: "image",
        },
        {
          name: "other-show.mp3",
          url: "/media/other-show.mp3",
          type: "audio",
        },
      ],
      "show-1",
    )

    expect(catalog.media).toHaveLength(2)
    expect(catalog.media[0].usedInCurrentShow).toBe(true)
    expect(catalog.media[1].usedInCurrentShow).toBe(false)
    expect(catalog.builtInSounds.length).toBeGreaterThanOrEqual(8)

    // Test HTTP routes
    const app = createExtensionRoutes({
      getPath,
      getQuizzById: () => show1,
      saveQuizz: () => ({ id: "show-1" }),
      updateQuizz: () => ({ id: "show-1" }),
      deleteQuizz: () => {},
      listMedia: () => [
        {
          name: "uploaded-once.png",
          url: "/media/uploaded-once.png",
          type: "image",
        },
      ],
    })

    const res = await app.request("/media/catalog?quizId=show-1")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.media[0].usedInCurrentShow).toBe(true)
    expect(
      body.builtInSounds.some(
        (s: any) => s.url === "/sounds/answersMusic.mp3",
      ),
    ).toBe(true)
  })
})
