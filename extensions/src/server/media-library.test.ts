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
  loadAllShowsHealth,
  recoverMediaDeleteJournals,
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

  it("fail-closed: blocks deletion when any show file in quizz/ is malformed or unreadable", () => {
    // Write a valid show
    const validShow = {
      id: "valid-show",
      subject: "Valid Show",
      questions: [],
    }
    fs.writeFileSync(
      path.join(getPath("quizz"), "valid-show.json"),
      JSON.stringify(validShow),
    )

    // Write a corrupted/malformed file in quizz/
    fs.writeFileSync(
      path.join(getPath("quizz"), "corrupted-show.json"),
      "{{INVALID JSON MALFORMED CONTENT!!",
    )

    const result = checkMediaDeleteSafety(getPath, "some-media.png")
    expect(result.allowed).toBe(false)
    expect(result.unreadableFiles).toBeDefined()
    expect(result.unreadableFiles!.length).toBeGreaterThan(0)
    expect(result.unreadableFiles![0]).toContain("corrupted-show.json")
    expect(result.error).toContain("Cannot safely delete media")
  })

  it("fail-closed: blocks deletion when any sidecar file in extensions/quizzes/ is invalid", () => {
    const validShow = {
      id: "show-with-bad-sidecar",
      subject: "Bad Sidecar Show",
      questions: [],
    }
    fs.writeFileSync(
      path.join(getPath("quizz"), "show-with-bad-sidecar.json"),
      JSON.stringify(validShow),
    )

    // Write corrupted sidecar file
    const sidecarDir = path.join(tempDir, "extensions", "quizzes")
    fs.mkdirSync(sidecarDir, { recursive: true })
    fs.writeFileSync(
      path.join(sidecarDir, "show-with-bad-sidecar.json"),
      "INVALID SIDECAR JSON",
    )

    const result = checkMediaDeleteSafety(getPath, "hero.png")
    expect(result.allowed).toBe(false)
    expect(result.unreadableFiles!.some((f) => f.includes("sidecar"))).toBe(true)
  })

  it("catalog-only reference: blocks deletion without detach, and cleanly detaches with detach: true", () => {
    const show = {
      id: "catalog-only-show",
      subject: "Catalog Only Show",
      questions: [
        {
          id: Q1_ID,
          type: "single",
          question: "Q1",
          answers: ["A", "B"],
          solutions: [0],
        },
      ],
    }
    fs.writeFileSync(
      path.join(getPath("quizz"), "catalog-only-show.json"),
      JSON.stringify(show),
    )
    writeSidecar(getPath, "catalog-only-show", {
      schemaVersion: 2,
      revision: 1,
      quizId: "catalog-only-show",
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
      mediaCatalog: [
        {
          name: "staged-unassigned.png",
          url: "/media/staged-unassigned.png",
          type: "image",
          addedAt: Date.now(),
        },
      ],
    })

    // 1. Without detach -> blocked because catalog associations are references
    const blocked = checkMediaDeleteSafety(getPath, "staged-unassigned.png")
    expect(blocked.allowed).toBe(false)
    expect(blocked.references).toHaveLength(1)
    expect(blocked.references[0].field).toBe("show.mediaCatalog")

    // 2. With detach -> atomic removal from catalog and allowed: true
    const detached = checkMediaDeleteSafety(getPath, "staged-unassigned.png", {
      detach: true,
    })
    expect(detached.allowed).toBe(true)
    expect(detached.detachedFromShows).toContain("catalog-only-show")

    // Verify catalog item was removed
    const after = checkMediaDeleteSafety(getPath, "staged-unassigned.png")
    expect(after.allowed).toBe(true)
    expect(after.references).toHaveLength(0)
  })

  it("write-failure injection: rolls back all show and sidecar files to previous state on error", () => {
    const show1 = {
      id: "show-rollback-1",
      subject: "Rollback Test 1",
      questions: [
        {
          id: Q1_ID,
          type: "single",
          question: "Q1",
          media: { type: "image", url: "/media/rollback-target.png" },
          answers: ["A", "B"],
          solutions: [0],
        },
      ],
    }
    const show2 = {
      id: "show-rollback-2",
      subject: "Rollback Test 2",
      questions: [
        {
          id: Q2_ID,
          type: "single",
          question: "Q2",
          media: { type: "image", url: "/media/rollback-target.png" },
          answers: ["C", "D"],
          solutions: [1],
        },
      ],
    }
    fs.writeFileSync(
      path.join(getPath("quizz"), "show-rollback-1.json"),
      JSON.stringify(show1, null, 2),
    )
    fs.writeFileSync(
      path.join(getPath("quizz"), "show-rollback-2.json"),
      JSON.stringify(show2, null, 2),
    )

    // Make show-rollback-2 file read-only on disk so writeFileSync throws EPERM / EACCES
    const file2Path = path.join(getPath("quizz"), "show-rollback-2.json")
    fs.chmodSync(file2Path, 0o444)

    try {
      const result = checkMediaDeleteSafety(getPath, "rollback-target.png", {
        detach: true,
      })

      // Must fail closed because show 2 could not be safely updated
      expect(result.allowed).toBe(false)
      expect(result.error).toContain("Detach failed and was safely rolled back")

      // Verify show-rollback-1 was rolled back to its original state containing the media reference
      const show1Raw = fs.readFileSync(
        path.join(getPath("quizz"), "show-rollback-1.json"),
        "utf-8",
      )
      const show1Parsed = JSON.parse(show1Raw)
      expect(show1Parsed.questions[0].media.url).toBe(
        "/media/rollback-target.png",
      )
    } finally {
      // Restore permissions for cleanup
      try {
        fs.chmodSync(file2Path, 0o666)
      } catch {
        // ignore
      }
    }
  })

  it("concurrency protection: detects concurrent modification of show file during detach and rolls back", () => {
    const show = {
      id: "concurrency-show",
      subject: "Concurrency Show",
      questions: [
        {
          id: Q1_ID,
          type: "single",
          question: "Q1",
          media: { type: "image", url: "/media/concurrent.png" },
          answers: ["A", "B"],
          solutions: [0],
        },
      ],
    }
    const filePath = path.join(getPath("quizz"), "concurrency-show.json")
    fs.writeFileSync(filePath, JSON.stringify(show, null, 2))

    // First load health to capture mtime
    const health = loadAllShowsHealth(getPath)
    expect(health.records).toHaveLength(1)

    // Simulate concurrent modification by touching file mtime in the future
    const futureTime = Date.now() / 1000 + 100
    fs.utimesSync(filePath, futureTime, futureTime)

    // The detach operation detects mtime divergence from baseline and safely blocks
    const result = checkMediaDeleteSafety(getPath, "concurrent.png", {
      detach: true,
      baselineShows: health.records,
    })
    expect(result.allowed).toBe(false)
    expect(result.error).toContain("Concurrent modification detected")
  })

  it("restart recovery: recovers staged journals across simulated crash", () => {
    const quizId = "crashed-show"
    const originalShow = {
      id: quizId,
      subject: "Original Show Subject",
      questions: [
        {
          id: Q1_ID,
          type: "single",
          question: "Preserved Question",
          media: { type: "image", url: "/media/crash-media.png" },
          answers: ["1", "2"],
          solutions: [0],
        },
      ],
    }

    // Partially written base quiz during simulated crash
    const corruptedBase = {
      id: quizId,
      subject: "Partially Written Show",
      questions: [],
    }
    fs.writeFileSync(
      path.join(getPath("quizz"), `${quizId}.json`),
      JSON.stringify(corruptedBase),
    )

    // Create staged journal representing backup before the crash
    const journalDir = path.join(tempDir, "extensions", "quizzes", ".journal")
    fs.mkdirSync(journalDir, { recursive: true })
    const journalEntry = {
      id: "journal-crash-1",
      quizId,
      createdAt: Date.now(),
      status: "staged",
      backupBase: originalShow,
      backupExtras: null,
      targetBase: null,
      targetExtras: null,
    }
    fs.writeFileSync(
      path.join(journalDir, `${quizId}.journal.json`),
      JSON.stringify(journalEntry),
    )

    // Execute journal recovery
    const recovery = recoverMediaDeleteJournals(getPath)
    expect(recovery.recoveredCount).toBe(1)
    expect(recovery.recoveredQuizIds).toContain(quizId)

    // Verify base quiz file was restored to originalShow
    const restoredRaw = fs.readFileSync(
      path.join(getPath("quizz"), `${quizId}.json`),
      "utf-8",
    )
    const restored = JSON.parse(restoredRaw)
    expect(restored.subject).toBe("Original Show Subject")
    expect(restored.questions[0].media.url).toBe("/media/crash-media.png")

    // Staged journal file is removed
    expect(
      fs.existsSync(path.join(journalDir, `${quizId}.journal.json`)),
    ).toBe(false)
  })
})
