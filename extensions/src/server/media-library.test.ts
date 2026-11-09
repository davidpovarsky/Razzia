import {
  type QuizExtrasV2,
  createDefaultAudioExtras,
  createDefaultRosterExtras,
  createDotLottieArchive,
} from "../core/index"
import {
  type MediaCatalogResponse,
  associateMediaWithShow,
  buildMediaCatalogResponse,
  checkMediaDeleteSafety,
  executeMediaDeleteTransaction,
  getMediaDeleteJournalDirectory,
  getMediaQuarantineDirectory,
  loadAllShowsHealth,
  recoverMediaDeleteJournals,
  recoverStartupJournals,
} from "./media-library"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createExtensionRoutes } from "./api/routes"
import { createStagedJournal, recoverJournals } from "./storage/journal"
import { readSidecar, writeSidecar } from "./storage/sidecar"
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
    fs.mkdirSync(getPath("quizz"), {
      recursive: true,
    })
    fs.mkdirSync(getPath("media"), {
      recursive: true,
    })
  })
  afterEach(() => {
    try {
      fs.rmSync(tempDir, {
        recursive: true,
        force: true,
      })
    } catch {
      // Ignore
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
          media: {
            type: "image",
            url: "/media/shared-hero.png",
          },
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
      timeline: [
        {
          id: T2_ID,
          kind: "question",
          questionId: Q2_ID,
        },
      ],
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
      timeline: [
        {
          id: T1_ID,
          kind: "question",
          questionId: Q1_ID,
        },
      ],
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
      saveQuizz: () => ({
        id: "show-1",
      }),
      updateQuizz: () => ({
        id: "show-1",
      }),
      deleteQuizz: () => {
        /* Intentional no-op callback. */
      },
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
    const body = (await res.json()) as MediaCatalogResponse
    expect(body.media[0].usedInCurrentShow).toBe(true)
    expect(
      body.builtInSounds.some((s) => s.url === "/sounds/answersMusic.mp3"),
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
    fs.mkdirSync(sidecarDir, {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(sidecarDir, "show-with-bad-sidecar.json"),
      "INVALID SIDECAR JSON",
    )
    const result = checkMediaDeleteSafety(getPath, "hero.png")
    expect(result.allowed).toBe(false)
    expect(result.unreadableFiles!.some((f) => f.includes("sidecar"))).toBe(
      true,
    )
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
      leaderboard: {
        mode: "upstream",
      },
      teams: {
        enabled: false,
        teams: [],
        autoAssign: "roundRobin",
      },
      audio: createDefaultAudioExtras(),
      roster: {
        phoneInviteOnly: false,
        participants: [],
      },
      baseDigest: VALID_DIGEST,
      defaults: {
        newQuestionMode: "quiz",
        leaderboardPolicy: "cardOnly",
        advanceMode: "auto",
      },
      timeline: [
        {
          id: T1_ID,
          kind: "question",
          questionId: Q1_ID,
        },
      ],
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
          media: {
            type: "image",
            url: "/media/rollback-target.png",
          },
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
          media: {
            type: "image",
            url: "/media/rollback-target.png",
          },
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

    // Inject an actual commit I/O failure. chmod on the destination does not
    // prevent atomic rename on Linux, and root can write read-only files.
    const file2Path = path.join(getPath("quizz"), "show-rollback-2.json")
    const originalRename = fs.renameSync.bind(fs)
    let injected = false
    const rename = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (!injected && to === file2Path) {
        injected = true
        throw Object.assign(new Error("Injected commit I/O failure"), {
          code: "EIO",
        })
      }

      return originalRename(from, to)
    })

    try {
      const result = checkMediaDeleteSafety(getPath, "rollback-target.png", {
        detach: true,
      })
      expect(injected).toBe(true)
      // Must fail closed because show 2 could not be safely updated
      expect(result.allowed).toBe(false)
      expect(result.error).toContain("Detach failed and was safely rolled back")

      // Verify show-rollback-1 was rolled back to its original state containing the media reference
      const show1Raw = fs.readFileSync(
        path.join(getPath("quizz"), "show-rollback-1.json"),
        "utf-8",
      )
      const show1Parsed = JSON.parse(show1Raw) as {
        questions: Array<{
          media: {
            url: string
          }
        }>
      }
      expect(show1Parsed.questions[0].media.url).toBe(
        "/media/rollback-target.png",
      )
      expect(JSON.parse(fs.readFileSync(file2Path, "utf8"))).toEqual(show2)
    } finally {
      rename.mockRestore()
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
          media: {
            type: "image",
            url: "/media/concurrent.png",
          },
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
  it("restart recovery: recovers staged journals across simulated crash in isolated namespace", () => {
    const quizId = "crashed-show"
    const originalShow = {
      id: quizId,
      subject: "Original Show Subject",
      questions: [
        {
          id: Q1_ID,
          type: "single",
          question: "Preserved Question",
          media: {
            type: "image",
            url: "/media/crash-media.png",
          },
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

    // Stage quarantined binary and staged media-delete journal
    const journalDir = getMediaDeleteJournalDirectory(getPath)
    const quarantineDir = getMediaQuarantineDirectory(getPath)
    const quarantinePath = path.join(
      quarantineDir,
      "quarantine-crash-media.png",
    )
    fs.writeFileSync(quarantinePath, "RESTORED_BINARY_BYTES", "utf-8")
    const journalEntry = {
      version: 1,
      kind: "media-delete",
      id: "journal-crash-1",
      mediaNameOrUrl: "/media/crash-media.png",
      cleanMediaName: "crash-media.png",
      mediaFilePath: path.join(getPath("media"), "crash-media.png"),
      quarantinePath,
      createdAt: Date.now(),
      status: "staged",
      shows: [
        {
          quizId,
          filePath: path.join(getPath("quizz"), `${quizId}.json`),
          sidecarPath: path.join(
            tempDir,
            "extensions",
            "quizzes",
            `${quizId}.json`,
          ),
          originalBaseRaw: JSON.stringify(originalShow, null, 2),
          originalSidecarRaw: null,
        },
      ],
    }
    const journalPath = path.join(
      journalDir,
      "media-crash-media-journal-crash-1.media-journal.json",
    )
    fs.writeFileSync(
      journalPath,
      JSON.stringify(journalEntry, null, 2),
      "utf-8",
    )

    // Execute journal recovery
    const recovery = recoverMediaDeleteJournals(getPath)
    expect(recovery.recoveredCount).toBe(1)
    expect(recovery.recoveredQuizIds).toContain(quizId)
    expect(recovery.restoredMediaNames).toContain("crash-media.png")

    // Verify base quiz file was restored to originalShow
    const restoredRaw = fs.readFileSync(
      path.join(getPath("quizz"), `${quizId}.json`),
      "utf-8",
    )
    const restored = JSON.parse(restoredRaw) as {
      subject: string
      questions: Array<{
        media: {
          url: string
        }
      }>
    }
    expect(restored.subject).toBe("Original Show Subject")
    expect(restored.questions[0].media.url).toBe("/media/crash-media.png")

    // Verify media binary was restored from quarantine
    const restoredBinary = fs.readFileSync(
      path.join(getPath("media"), "crash-media.png"),
      "utf-8",
    )
    expect(restoredBinary).toBe("RESTORED_BINARY_BYTES")

    // Staged journal and quarantine files are removed
    expect(fs.existsSync(journalPath)).toBe(false)
    expect(fs.existsSync(quarantinePath)).toBe(false)
  })
  it("Gate A4 (1 & 9): physical media deletion integration - deletes media binary atomically on success and rolls back on failure", () => {
    const quizId = "delete-media-atomic"
    const mediaName = "atomic-target.png"
    const mediaPath = path.join(getPath("media"), mediaName)
    fs.writeFileSync(mediaPath, "ORIGINAL_MEDIA_CONTENT", "utf-8")
    const show = {
      id: quizId,
      subject: "Atomic Delete Show",
      questions: [
        {
          id: Q1_ID,
          type: "single",
          question: "Q1",
          media: {
            type: "image",
            url: `/media/${mediaName}`,
          },
          answers: ["1", "2"],
          solutions: [0],
        },
      ],
    }
    fs.writeFileSync(
      path.join(getPath("quizz"), `${quizId}.json`),
      JSON.stringify(show, null, 2),
    )

    // 1A. With detach: false -> returns 409 references without touching media
    const blockedResult = executeMediaDeleteTransaction(getPath, mediaName, {
      detach: false,
      deleteMediaFn: () => fs.unlinkSync(mediaPath),
    })
    expect(blockedResult.allowed).toBe(false)
    expect(blockedResult.references).toHaveLength(1)
    expect(fs.existsSync(mediaPath)).toBe(true)

    // 1B. Failure in deleteMediaFn -> rolls back detached show and restores media binary
    const failDeleteResult = executeMediaDeleteTransaction(getPath, mediaName, {
      detach: true,
      deleteMediaFn: () => {
        throw new Error("EPERM: disk error during physical delete")
      },
    })
    expect(failDeleteResult.allowed).toBe(false)
    expect(failDeleteResult.error).toContain("EPERM")
    // Show still has reference
    const showAfterFailRaw = fs.readFileSync(
      path.join(getPath("quizz"), `${quizId}.json`),
      "utf-8",
    )
    expect(showAfterFailRaw).toContain(mediaName)
    // Media binary preserved
    expect(fs.readFileSync(mediaPath, "utf-8")).toBe("ORIGINAL_MEDIA_CONTENT")

    // 1C. Success: removes references and deletes binary atomically
    const successResult = executeMediaDeleteTransaction(getPath, mediaName, {
      detach: true,
      deleteMediaFn: () => fs.unlinkSync(mediaPath),
    })
    expect(successResult.allowed).toBe(true)
    expect(fs.existsSync(mediaPath)).toBe(false)
    const showFinalRaw = fs.readFileSync(
      path.join(getPath("quizz"), `${quizId}.json`),
      "utf-8",
    )
    expect(showFinalRaw).not.toContain(mediaName)
  })
  it("Gate A4 (4 & 5): deterministic fault injection during write and rollback failure preservation", () => {
    const quizId = "fault-injection-show"
    const mediaName = "fault-target.png"
    const mediaPath = path.join(getPath("media"), mediaName)
    fs.writeFileSync(mediaPath, "FAULT_TARGET_BYTES", "utf-8")
    const show = {
      id: quizId,
      subject: "Fault Injection Show",
      questions: [
        {
          id: Q1_ID,
          type: "single",
          question: "Q1",
          media: {
            type: "image",
            url: `/media/${mediaName}`,
          },
          answers: ["A", "B"],
          solutions: [0],
        },
      ],
    }
    fs.writeFileSync(
      path.join(getPath("quizz"), `${quizId}.json`),
      JSON.stringify(show, null, 2),
    )

    // 4A. Fault injection before show write -> safely rolled back, no corruption
    const failBeforeWrite = executeMediaDeleteTransaction(getPath, mediaName, {
      detach: true,
      faultInjection: {
        failBeforeShowWrite: true,
      },
    })
    expect(failBeforeWrite.allowed).toBe(false)
    expect(failBeforeWrite.error).toContain(
      "Simulated failure before writing detached show",
    )

    // 5A. Fault injection DURING rollback -> rollback fails, JOURNAL SURVIVES for crash recovery
    const failDuringRollback = executeMediaDeleteTransaction(
      getPath,
      mediaName,
      {
        detach: true,
        faultInjection: {
          failAfterFirstShowWrite: true,
          failDuringRollback: true,
        },
      },
    )
    expect(failDuringRollback.allowed).toBe(false)
    expect(failDuringRollback.error).toContain("Journal preserved for recovery")

    // Verify journal file exists in media-delete directory
    const journalDir = getMediaDeleteJournalDirectory(getPath)
    const journalFiles = fs
      .readdirSync(journalDir)
      .filter((f) => f.endsWith(".json"))
    expect(journalFiles.length).toBeGreaterThan(0)

    // Now simulated restart / startup recovery recovers the preserved journal
    const recovery = recoverMediaDeleteJournals(getPath)
    expect(recovery.recoveredCount).toBeGreaterThan(0)
    expect(recovery.recoveredQuizIds).toContain(quizId)

    // And after recovery, journal is cleaned up
    const remainingJournals = fs
      .readdirSync(journalDir)
      .filter((f) => f.endsWith(".json"))
    expect(remainingJournals).toHaveLength(0)
  })
  it("Gate A4 (7): isolated coexistence - composite-save and media-delete journals do not misinterpret or delete each other", () => {
    const quizSaveId = "save-journal-show"
    const mediaDeleteId = "media-journal-show"

    // 1. Create a composite-save journal in .journal/
    createStagedJournal(getPath, {
      quizId: quizSaveId,
      backupBase: {
        id: quizSaveId,
        subject: "Restored Save Base",
      },
      backupExtras: null,
      targetBase: null,
      targetExtras: null,
    })

    // 2. Create a media-delete journal in .journal/media-delete/
    const mediaJournalDir = getMediaDeleteJournalDirectory(getPath)
    const mediaJournalEntry = {
      version: 1,
      kind: "media-delete",
      id: "media-delete-uuid",
      mediaNameOrUrl: "/media/coexist.png",
      cleanMediaName: "coexist.png",
      createdAt: Date.now(),
      status: "staged",
      shows: [
        {
          quizId: mediaDeleteId,
          filePath: path.join(getPath("quizz"), `${mediaDeleteId}.json`),
          sidecarPath: path.join(
            tempDir,
            "extensions",
            "quizzes",
            `${mediaDeleteId}.json`,
          ),
          originalBaseRaw: JSON.stringify({
            id: mediaDeleteId,
            subject: "Restored Media Base",
          }),
          originalSidecarRaw: null,
        },
      ],
    }
    fs.writeFileSync(
      path.join(
        mediaJournalDir,
        "media-coexist-media-delete-uuid.media-journal.json",
      ),
      JSON.stringify(mediaJournalEntry, null, 2),
      "utf-8",
    )

    // Execute recoverJournals (composite-save only)
    const quizReport = recoverJournals({
      getPath,
      getQuizzById: () => undefined,
      saveQuizz: () => ({
        id: "",
      }),
      updateQuizz: (id, q) => {
        fs.writeFileSync(
          path.join(getPath("quizz"), `${id}.json`),
          JSON.stringify(q),
        )

        return {
          id,
        }
      },
      deleteQuizz: () => undefined,
    })
    expect(quizReport.recoveredQuizIds).toContain(quizSaveId)
    expect(quizReport.recoveredQuizIds).not.toContain(mediaDeleteId)

    // Media delete journal MUST still exist untouched!
    expect(
      fs.readdirSync(mediaJournalDir).filter((f) => f.endsWith(".json")),
    ).toHaveLength(1)

    // Now execute recoverMediaDeleteJournals
    const mediaReport = recoverMediaDeleteJournals(getPath)
    expect(mediaReport.recoveredQuizIds).toContain(mediaDeleteId)
    expect(mediaReport.recoveredQuizIds).not.toContain(quizSaveId)

    // Media journal is now recovered
    expect(
      fs.readdirSync(mediaJournalDir).filter((f) => f.endsWith(".json")),
    ).toHaveLength(0)
  })
  it("Gate A4 (10): recoverStartupJournals is idempotent across multiple calls", () => {
    // Calling startup recovery on a clean directory produces zero recovered
    const report1 = recoverStartupJournals(getPath)
    expect(report1.quizRecovery.recoveredCount).toBe(0)
    expect(report1.mediaRecovery.recoveredCount).toBe(0)

    // Second call produces zero recovered
    const report2 = recoverStartupJournals(getPath)
    expect(report2.quizRecovery.recoveredCount).toBe(0)
    expect(report2.mediaRecovery.recoveredCount).toBe(0)
  })
  it("Bug B negative gap: crash between quarantine unlink and journal unlink does NOT restore dangling references to missing binary", () => {
    const quizId = "dangling-ref-show"
    const mediaName = "lost-media.png"
    const mediaPath = path.join(getPath("media"), mediaName)
    // Media binary is ABSENT (already physically unlinked)
    expect(fs.existsSync(mediaPath)).toBe(false)

    // Show currently has the media DETACHED (as it was when crash happened post-detach)
    const detachedShow = {
      id: quizId,
      subject: "Detached Show",
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
      path.join(getPath("quizz"), `${quizId}.json`),
      JSON.stringify(detachedShow, null, 2),
    )

    // Simulate old crash gap: A staged journal exists, but quarantine binary was already unlinked!
    const journalDir = getMediaDeleteJournalDirectory(getPath)
    const missingQuarantinePath = path.join(
      getMediaQuarantineDirectory(getPath),
      `lost-journal-${mediaName}`,
    )
    expect(fs.existsSync(missingQuarantinePath)).toBe(false)
    const staleStagedJournal = {
      version: 1,
      kind: "media-delete",
      id: "lost-journal-uuid",
      mediaNameOrUrl: `/media/${mediaName}`,
      cleanMediaName: mediaName,
      mediaFilePath: mediaPath,
      quarantinePath: missingQuarantinePath,
      createdAt: Date.now(),
      status: "staged",
      shows: [
        {
          quizId,
          filePath: path.join(getPath("quizz"), `${quizId}.json`),
          sidecarPath: path.join(
            tempDir,
            "extensions",
            "quizzes",
            `${quizId}.json`,
          ),
          originalBaseRaw: JSON.stringify({
            id: quizId,
            subject: "Old Show With Reference",
            questions: [
              {
                id: Q1_ID,
                type: "single",
                question: "Q1",
                media: {
                  type: "image",
                  url: `/media/${mediaName}`,
                },
                answers: ["A", "B"],
                solutions: [0],
              },
            ],
          }),
          originalSidecarRaw: null,
        },
      ],
    }
    const journalFile = path.join(
      journalDir,
      `media-${mediaName}-lost-journal-uuid.media-journal.json`,
    )
    fs.writeFileSync(
      journalFile,
      JSON.stringify(staleStagedJournal, null, 2),
      "utf-8",
    )

    // Run recovery
    const recovery = recoverMediaDeleteJournals(getPath)

    // INVARIANT: When quarantine is missing and binary is gone, recovery MUST FAIL CLOSED!
    // It must NEVER roll back the show to point to a missing binary!
    const showAfter: unknown = JSON.parse(
      fs.readFileSync(path.join(getPath("quizz"), `${quizId}.json`), "utf-8"),
    )
    expect(JSON.stringify(showAfter)).not.toContain(mediaName)

    // Journal MUST be preserved for investigation
    expect(fs.existsSync(journalFile)).toBe(true)
    expect(recovery.unresolvedCount ?? 1).toBeGreaterThanOrEqual(1)
  })
  it("Bug B: point-of-no-return ordering - crash after physical delete before committed write rolls back binary and references from quarantine", () => {
    const quizId = "pnr-rollback-show"
    const mediaName = "pnr-target.png"
    const mediaPath = path.join(getPath("media"), mediaName)
    fs.writeFileSync(mediaPath, "PNR_TARGET_BYTES", "utf-8")
    const show = {
      id: quizId,
      subject: "PNR Show",
      questions: [
        {
          id: Q1_ID,
          type: "single",
          question: "Q1",
          media: {
            type: "image",
            url: `/media/${mediaName}`,
          },
          answers: ["A", "B"],
          solutions: [0],
        },
      ],
    }
    fs.writeFileSync(
      path.join(getPath("quizz"), `${quizId}.json`),
      JSON.stringify(show, null, 2),
    )

    // Injected crash immediately before committed marker write:
    // Physical delete already occurred, but committed marker has not been written!
    const result = executeMediaDeleteTransaction(getPath, mediaName, {
      detach: true,
      deleteMediaFn: () => {
        if (fs.existsSync(mediaPath)) {
          fs.unlinkSync(mediaPath)
        }
      },
      faultInjection: {
        failBeforeCommittedWrite: true,
        failDuringRollback: true,
      },
    })
    expect(result.allowed).toBe(false)
    // Physical file was deleted during the call, but quarantine still exists
    // The transaction rolled back (or left journal for crash recovery)
    // Now simulate restart / recovery:
    const recovery = recoverMediaDeleteJournals(getPath)
    expect(recovery.recoveredCount).toBeGreaterThanOrEqual(1)

    // Binary MUST be restored from quarantine back into media directory!
    expect(fs.existsSync(mediaPath)).toBe(true)
    expect(fs.readFileSync(mediaPath, "utf-8")).toBe("PNR_TARGET_BYTES")

    // Show references MUST be restored!
    const showRestored: unknown = JSON.parse(
      fs.readFileSync(path.join(getPath("quizz"), `${quizId}.json`), "utf-8"),
    )
    expect(JSON.stringify(showRestored)).toContain(mediaName)

    // Repeating recovery is idempotent
    const recovery2 = recoverMediaDeleteJournals(getPath)
    expect(recovery2.recoveredCount).toBe(0)
  })
  it("Bug B: point-of-no-return ordering - crash after committed marker cleans up forward without rolling back", () => {
    const quizId = "pnr-forward-show"
    const mediaName = "pnr-forward.png"
    const mediaPath = path.join(getPath("media"), mediaName)
    fs.writeFileSync(mediaPath, "PNR_FORWARD_BYTES", "utf-8")
    const show = {
      id: quizId,
      subject: "PNR Forward Show",
      questions: [
        {
          id: Q1_ID,
          type: "single",
          question: "Q1",
          media: {
            type: "image",
            url: `/media/${mediaName}`,
          },
          answers: ["A", "B"],
          solutions: [0],
        },
      ],
    }
    fs.writeFileSync(
      path.join(getPath("quizz"), `${quizId}.json`),
      JSON.stringify(show, null, 2),
    )

    // Injected crash AFTER committed write (before quarantine unlink):
    const result = executeMediaDeleteTransaction(getPath, mediaName, {
      detach: true,
      deleteMediaFn: () => {
        if (fs.existsSync(mediaPath)) {
          fs.unlinkSync(mediaPath)
        }
      },
      faultInjection: {
        failBeforeQuarantineUnlink: true,
      },
    })

    // Committed status was reached!
    expect(result.allowed).toBe(true)

    // Recovery runs on restart:
    const recovery = recoverMediaDeleteJournals(getPath)
    expect(recovery.recoveredCount).toBeGreaterThanOrEqual(1)

    // Invariant: MUST NOT rollback! Deletion was committed!
    expect(fs.existsSync(mediaPath)).toBe(false)
    const showAfter: unknown = JSON.parse(
      fs.readFileSync(path.join(getPath("quizz"), `${quizId}.json`), "utf-8"),
    )
    expect(JSON.stringify(showAfter)).not.toContain(mediaName)

    // Quarantine and journal must both be cleaned up
    const journalDir = getMediaDeleteJournalDirectory(getPath)
    expect(
      fs.readdirSync(journalDir).filter((f) => f.endsWith(".json")),
    ).toHaveLength(0)
    const quarantineDir = getMediaQuarantineDirectory(getPath)
    expect(fs.readdirSync(quarantineDir)).toHaveLength(0)
  })
  it("Bug B: path traversal and forged paths in journal are rejected without touching files", () => {
    const journalDir = getMediaDeleteJournalDirectory(getPath)
    const traversalJournal = {
      version: 1,
      kind: "media-delete",
      id: "traversal-journal",
      mediaNameOrUrl: "/media/../../secret.txt",
      cleanMediaName: "../../secret.txt",
      createdAt: Date.now(),
      status: "staged",
      shows: [
        {
          quizId: "../../dangerous",
          filePath: path.join(tempDir, "..", "secret.json"),
          sidecarPath: path.join(tempDir, "..", "secret-sidecar.json"),
          originalBaseRaw: "HACKED",
          originalSidecarRaw: null,
        },
      ],
    }
    const journalFile = path.join(journalDir, "traversal.media-journal.json")
    fs.writeFileSync(
      journalFile,
      JSON.stringify(traversalJournal, null, 2),
      "utf-8",
    )
    const recovery = recoverMediaDeleteJournals(getPath)
    expect(recovery.recoveredCount).toBe(0)
    expect(recovery.unresolvedCount ?? 1).toBeGreaterThanOrEqual(1)

    // Journal remains untouched as evidence
    expect(fs.existsSync(journalFile)).toBe(true)
  })
  it("Bug B: recoverStartupJournals halts server startup when critical recovery fails", () => {
    const journalDir = getMediaDeleteJournalDirectory(getPath)
    // Staged journal with missing quarantine and missing binary
    const brokenJournal = {
      version: 1,
      kind: "media-delete",
      id: "broken-startup-id",
      mediaNameOrUrl: "/media/missing-forever.png",
      cleanMediaName: "missing-forever.png",
      mediaFilePath: path.join(getPath("media"), "missing-forever.png"),
      quarantinePath: path.join(
        getMediaQuarantineDirectory(getPath),
        "nonexistent",
      ),
      createdAt: Date.now(),
      status: "staged",
      shows: [],
    }
    fs.writeFileSync(
      path.join(journalDir, "broken-startup.media-journal.json"),
      JSON.stringify(brokenJournal, null, 2),
      "utf-8",
    )

    // When called with options (as packages/socket/src/index.ts calls it):
    expect(() =>
      recoverStartupJournals({
        getPath,
        updateQuizz: () => {
          /* Intentional no-op callback. */
        },
        deleteQuizz: () => {
          /* Intentional no-op callback. */
        },
      }),
    ).toThrow(/Server startup blocked/)

    // When called with throwOnUnresolved: false:
    const result = recoverStartupJournals({
      getPath,
      throwOnUnresolved: false,
    })
    expect(result.status).toBe("failed")
    expect(result.unresolvedCount).toBeGreaterThanOrEqual(1)
  })
  it("Gate 3: concurrent cross-family recovery (staged V2 save + media-delete) restores deterministically without data loss", () => {
    // 1. Stage a V2 composite quiz save journal
    const quizId = "concurrent-v2-show"
    const qIds = [Q1_ID, Q2_ID]
    const sceneId = "00000000-0000-4000-8000-000000000099"
    const baseQuiz = {
      id: quizId,
      subject: "Concurrent V2 Subject",
      questions: [
        {
          id: Q1_ID,
          type: "single",
          question: "Q1",
          answers: ["A", "B"],
          solutions: [0],
        },
        {
          id: Q2_ID,
          type: "single",
          question: "Q2",
          answers: ["C", "D"],
          solutions: [1],
        },
      ],
    }
    const v2Extras = {
      schemaVersion: 2 as const,
      revision: 1,
      quizId,
      baseDigest: "b".repeat(64),
      questionIds: qIds,
      timeline: [
        {
          id: "00000000-0000-4000-8000-000000000091",
          kind: "opening" as const,
          sceneId,
        },
        {
          id: "00000000-0000-4000-8000-000000000092",
          kind: "question" as const,
          questionId: qIds[0],
        },
        {
          id: "00000000-0000-4000-8000-000000000093",
          kind: "question" as const,
          questionId: qIds[1],
        },
      ],
      scenes: {
        [sceneId]: {
          id: sceneId,
          kind: "opening" as const,
          title: "Concurrent Scene",
          durationMs: 3000,
          advance: "auto" as const,
          background: {
            url: "/media/concurrent-bg.png",
            fit: "cover" as const,
            position: "center" as const,
            overlayOpacity: 0.3,
          },
          audio: {
            mode: "custom" as const,
            url: "/media/concurrent-audio.mp3",
            volume: 0.8,
            loop: false,
          },
        },
      },
      defaults: {
        newQuestionMode: "quiz" as const,
        leaderboardPolicy: "cardOnly" as const,
        advanceMode: "auto" as const,
      },
      teams: {
        enabled: false,
        teams: [],
        autoAssign: "roundRobin" as const,
      },
      audio: createDefaultAudioExtras(),
      perQuestion: {},
      roster: createDefaultRosterExtras(),
      authoring: {
        showNote: "Concurrent Test Note",
      },
      mediaCatalog: [
        {
          name: "concurrent-bg.png",
          url: "/media/concurrent-bg.png",
          type: "image" as const,
        },
      ],
    }
    createStagedJournal(getPath, {
      quizId,
      backupBase: baseQuiz,
      backupExtras: v2Extras,
      targetBase: {
        ...baseQuiz,
        subject: "Crashed Subject",
      },
      targetExtras: {
        ...v2Extras,
        revision: 2,
      },
    })

    // Partially written base on disk
    fs.writeFileSync(
      path.join(getPath("quizz"), `${quizId}.json`),
      JSON.stringify({
        ...baseQuiz,
        subject: "Crashed Subject",
      }),
    )

    // 2. Stage a media-delete journal concurrently
    const mediaName = "concurrent-delete.png"
    const mediaPath = path.join(getPath("media"), mediaName)
    fs.writeFileSync(mediaPath, "CONCURRENT_BYTES")
    const mediaShowId = "media-concurrent-show"
    const mediaShow = {
      id: mediaShowId,
      subject: "Media Show",
      questions: [
        {
          id: Q1_ID,
          type: "single",
          question: "Q1",
          media: {
            type: "image",
            url: `/media/${mediaName}`,
          },
          answers: ["A", "B"],
          solutions: [0],
        },
      ],
    }
    fs.writeFileSync(
      path.join(getPath("quizz"), `${mediaShowId}.json`),
      JSON.stringify(mediaShow),
    )
    const delResult = executeMediaDeleteTransaction(getPath, mediaName, {
      detach: true,
      deleteMediaFn: () => {
        if (fs.existsSync(mediaPath)) {
          fs.unlinkSync(mediaPath)
        }
      },
      faultInjection: {
        failBeforeCommittedWrite: true,
        failDuringRollback: true,
      },
    })
    expect(delResult.allowed).toBe(false)

    // 3. Run cross-family startup recovery
    const startupResult = recoverStartupJournals({
      getPath,
      updateQuizz: (id, data) => {
        fs.writeFileSync(
          path.join(getPath("quizz"), `${id}.json`),
          JSON.stringify(data, null, 2),
        )

        return {
          id,
        }
      },
      deleteQuizz: (id) => {
        const fp = path.join(getPath("quizz"), `${id}.json`)

        if (fs.existsSync(fp)) {
          fs.unlinkSync(fp)
        }
      },
    })
    expect(startupResult.status).toBe("recovered")
    expect(startupResult.unresolvedCount).toBe(0)
    expect(startupResult.quizRecovery.recoveredCount).toBe(1)
    expect(startupResult.mediaRecovery.recoveredCount).toBe(1)

    // Verify V2 quiz restored cleanly with rich extras
    const restoredSidecar = readSidecar(getPath, quizId)
    expect(restoredSidecar?.schemaVersion).toBe(2)
    const v2Restored = restoredSidecar as QuizExtrasV2
    expect(v2Restored.timeline).toHaveLength(3)
    expect(v2Restored.scenes[sceneId]?.title).toBe("Concurrent Scene")
    expect(v2Restored.authoring?.showNote).toBe("Concurrent Test Note")

    // Verify media delete rolled back safely and binary is restored
    expect(fs.existsSync(mediaPath)).toBe(true)
    const restoredMediaShow: unknown = JSON.parse(
      fs.readFileSync(
        path.join(getPath("quizz"), `${mediaShowId}.json`),
        "utf-8",
      ),
    )
    expect(JSON.stringify(restoredMediaShow)).toContain(mediaName)
  })
  it("Gate 2 & 3: serves self-hosted dotlottie WASM, uploads .lottie/JSON animations, lists lottieAssets in catalog, and enforces reference-safe deletion on overlayAnimations", async () => {
    const showId = "cinematic-lottie-show"
    const sceneId = "11111111-1111-4111-8111-111111111199"
    const show = {
      id: showId,
      subject: "Cinematic Lottie Show",
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
      path.join(getPath("quizz"), `${showId}.json`),
      JSON.stringify(show, null, 2),
      "utf-8",
    )
    const app = createExtensionRoutes({
      getPath,
      getQuizzById: () => show,
      saveQuizz: () => ({
        id: showId,
      }),
      updateQuizz: () => ({
        id: showId,
      }),
      deleteQuizz: () => {
        /* Intentional no-op callback. */
      },
      listMedia: () => [],
    })

    // 1. Public self-hosted WASM endpoint works offline without auth
    const wasmRes = await app.request("/lottie-wasm")
    expect(wasmRes.status).toBe(200)
    expect(wasmRes.headers.get("content-type")).toBe("application/wasm")
    const wasmBytes = new Uint8Array(await wasmRes.arrayBuffer())
    expect(wasmBytes.byteLength).toBeGreaterThan(1000)

    // 2. Upload binary .lottie archive via POST /lottie
    const sampleLottieObj = {
      v: "5.7.4",
      fr: 30,
      ip: 0,
      op: 60,
      w: 400,
      h: 400,
      layers: [
        {
          ty: 4,
          nm: "Ring",
          ks: {},
          shapes: [],
        },
      ],
    }
    const dotLottieBytes = createDotLottieArchive([
      {
        name: "manifest.json",
        data: JSON.stringify({
          version: "1.0",
          animations: [
            {
              id: "emblem",
              speed: 1,
              loop: true,
            },
          ],
        }),
      },
      {
        name: "animations/emblem.json",
        data: JSON.stringify(sampleLottieObj),
      },
    ])
    const uploadRes = await app.request("/lottie", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "shared-emblem.lottie",
        contentBase64: Buffer.from(dotLottieBytes).toString("base64"),
      }),
    })
    expect(uploadRes.status).toBe(201)
    const uploadBody = (await uploadRes.json()) as {
      format: string
      url: string
      name: string
    }
    expect(uploadBody.format).toBe("dotlottie")
    expect(uploadBody.url).toMatch(/^\/media\/shared-emblem-.*\.lottie$/)
    const uploadedName = uploadBody.name
    const uploadedUrl = uploadBody.url

    // 3. Reference the uploaded .lottie in Two scenes via overlayAnimations
    const closingSceneId = "22222222-2222-4222-8222-222222222299"
    writeSidecar(getPath, showId, {
      schemaVersion: 2,
      revision: 1,
      quizId: showId,
      baseDigest: VALID_DIGEST,
      defaults: {
        newQuestionMode: "quiz",
        leaderboardPolicy: "cardOnly",
        advanceMode: "auto",
      },
      timeline: [
        {
          id: "00000000-0000-4000-8000-000000000071",
          kind: "opening",
          sceneId,
        },
        {
          id: "00000000-0000-4000-8000-000000000072",
          kind: "question",
          questionId: Q1_ID,
        },
        {
          id: "00000000-0000-4000-8000-000000000073",
          kind: "closing",
          sceneId: closingSceneId,
        },
      ],
      scenes: {
        [sceneId]: {
          id: sceneId,
          kind: "opening",
          title: "Opening Act",
          durationMs: 8000,
          advance: "onMediaEnd",
          overlayAnimations: [
            {
              id: "layer-open-1",
              label: "Opening Emblem",
              enabled: true,
              assetUrl: uploadedUrl,
              order: 0,
              layer: "aboveTitle",
              timeBase: "video",
              startMs: 1000,
              durationMs: 3000,
              loop: false,
              speed: 1,
              finish: "holdLastFrame",
              position: {
                x: 0.5,
                y: 0.25,
              },
              anchor: "center",
              widthPct: 30,
              fit: "contain",
              opacity: 1,
              rotationDeg: 0,
              fadeInMs: 0,
              fadeOutMs: 0,
            },
          ],
        },
        [closingSceneId]: {
          id: closingSceneId,
          kind: "closing",
          title: "Closing Act",
          durationMs: 8000,
          advance: "auto",
          overlayAnimations: [
            {
              id: "layer-close-1",
              label: "Closing Emblem",
              enabled: true,
              assetUrl: uploadedUrl,
              order: 0,
              layer: "behindTitle",
              timeBase: "scene",
              startMs: 0,
              durationMs: 5000,
              loop: true,
              speed: 1,
              finish: "hide",
              position: {
                x: 0.5,
                y: 0.5,
              },
              anchor: "center",
              widthPct: 35,
              fit: "contain",
              opacity: 1,
              rotationDeg: 0,
              fadeInMs: 0,
              fadeOutMs: 0,
            },
          ],
        },
      },
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

    // 4. Media catalog lists lottieAssets with referenceCount = 2
    const catalogRes = await app.request(`/media/catalog?quizId=${showId}`)
    expect(catalogRes.status).toBe(200)
    const catalogBody = (await catalogRes.json()) as MediaCatalogResponse
    const lottieEntry = catalogBody.lottieAssets.find(
      (a) => a.name === uploadedName,
    )
    expect(lottieEntry).toBeDefined()
    expect(lottieEntry!.referenceCount).toBe(2)
    expect(lottieEntry!.usedInCurrentShow).toBe(true)

    // 5. Deleting referenced Lottie asset without detach returns 409 Conflict
    const deleteBlockedRes = await app.request(`/lottie/${uploadedName}`, {
      method: "DELETE",
    })
    expect(deleteBlockedRes.status).toBe(409)
    const blockedBody = (await deleteBlockedRes.json()) as {
      references: unknown[]
    }
    expect(blockedBody.references).toHaveLength(2)

    // 6. Deleting with ?detach=true removes overlay references and deletes file
    const deleteDetachedRes = await app.request(
      `/lottie/${uploadedName}?detach=true`,
      {
        method: "DELETE",
      },
    )
    expect(deleteDetachedRes.status).toBe(204)
    const updatedSidecar = readSidecar(getPath, showId) as QuizExtrasV2
    expect(updatedSidecar.scenes[sceneId]).toMatchObject({
      overlayAnimations: [],
    })
    expect(updatedSidecar.scenes[closingSceneId]).toMatchObject({
      overlayAnimations: [],
    })
  })
})
