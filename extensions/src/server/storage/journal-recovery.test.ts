import fs from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
} from "../../core/index"
import {
  createStagedJournal,
  getJournalFilePath,
  recoverJournals,
} from "./journal"
import { readSidecar, writeSidecar } from "./sidecar"
import {
  createRecoveryFixture,
  fileDigest,
  QUESTION_ID,
  removeSyntheticFixture,
} from "./recovery-fixture"

function isJournalObservationRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireJournalObservationRecord(
  value: unknown,
): Record<string, unknown> {
  if (!isJournalObservationRecord(value)) {
    throw new Error("Expected the observed journal value to be an object")
  }

  return value
}

describe("quiz-save deterministic recovery", () => {
  type InitializedFixtureValue = ReturnType<typeof createRecoveryFixture>
  let fixture: InitializedFixtureValue | undefined = undefined
  function requireInitializedFixture(): InitializedFixtureValue {
    if (fixture === undefined) {
      throw new Error("Fixture state fixture was read before initialization")
    }

    return fixture
  }
  beforeEach(() => {
    fixture = createRecoveryFixture()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    removeSyntheticFixture(requireInitializedFixture().root)
  })
  function stage() {
    const original = requireInitializedFixture().seed("show")
    createStagedJournal(requireInitializedFixture().getPath, {
      quizId: "show",
      backupBase: original.base,
      backupExtras: original.extras,
      targetBase: { ...original.base, subject: "Interrupted new title" },
      targetExtras: { ...original.extras, revision: 2 },
    })

    return {
      ...original,
      journal: getJournalFilePath(requireInitializedFixture().getPath, "show"),
    }
  }
  it.each(["base-written", "sidecar-written"])(
    "restores complete V2 at %s and replay is a no-op",
    (boundary) => {
      const original = stage()
      const other = requireInitializedFixture().seed("unrelated", false)
      const otherHash = fileDigest(other.basePath)
      requireInitializedFixture().injections.updateQuizz("show", {
        ...original.base,
        subject: "Interrupted new title",
      })

      if (boundary === "sidecar-written") {
        writeSidecar(requireInitializedFixture().getPath, "show", {
          ...original.extras,
          revision: 2,
          authoring: { showNote: "changed" },
        })
      }

      expect(
        recoverJournals(requireInitializedFixture().injections).unresolvedCount,
      ).toBe(0)
      expect(
        requireInitializedFixture().injections.getQuizzById("show"),
      ).toEqual(original.base)
      expect(readSidecar(requireInitializedFixture().getPath, "show")).toEqual(
        original.extras,
      )
      expect(
        computeCanonicalBaseDigest(
          readSidecar(requireInitializedFixture().getPath, "show"),
        ),
      ).toBe(computeCanonicalBaseDigest(original.extras))
      expect(fs.existsSync(original.journal)).toBe(false)
      const afterHash = fileDigest(original.sidecarPath)
      expect(
        recoverJournals(requireInitializedFixture().injections).recoveredCount,
      ).toBe(0)
      expect(fileDigest(original.sidecarPath)).toBe(afterHash)
      expect(fileDigest(other.basePath)).toBe(otherHash)
    },
  )
  it("preserves V1 backups", () => {
    const original = stage()
    const v1 = createDefaultQuizExtras(
      "show",
      [QUESTION_ID],
      computeCanonicalBaseDigest(original.base),
    )
    const entry = requireJournalObservationRecord(
      JSON.parse(fs.readFileSync(original.journal, "utf8")),
    )
    fs.writeFileSync(
      original.journal,
      JSON.stringify({ ...entry, backupExtras: v1 }),
    )
    expect(
      recoverJournals(requireInitializedFixture().injections).unresolvedCount,
    ).toBe(0)
    expect(readSidecar(requireInitializedFixture().getPath, "show")).toEqual(v1)
  })
  it("accepts a payload digest when the original adapter adds its matching storage ID", () => {
    const original = stage()
    const entry = requireJournalObservationRecord(
      JSON.parse(fs.readFileSync(original.journal, "utf8")),
    )
    entry.backupBase = { id: "show", ...original.base }
    fs.writeFileSync(original.journal, JSON.stringify(entry))
    expect(
      recoverJournals(requireInitializedFixture().injections).unresolvedCount,
    ).toBe(0)
    expect(requireInitializedFixture().injections.getQuizzById("show")).toEqual(
      entry.backupBase,
    )
    expect(readSidecar(requireInitializedFixture().getPath, "show")).toEqual(
      original.extras,
    )
  })
  it.each(["throw", "silent-wrong-content"])(
    "retains journal when base restoration is %s",
    (fault) => {
      const original = stage()
      const bad = {
        ...requireInitializedFixture().injections,
        updateQuizz: (id: string) => {
          if (fault === "throw") {
            throw new Error("ENOSPC: injected base write")
          }

          requireInitializedFixture().injections.updateQuizz(id, {
            ...original.base,
            subject: "silently corrupt",
          })

          return { id }
        },
      }
      expect(recoverJournals(bad).unresolvedCount).toBe(1)
      expect(fs.existsSync(original.journal)).toBe(true)
      expect(
        recoverJournals(requireInitializedFixture().injections).unresolvedCount,
      ).toBe(0)
    },
  )
  it("retains journal on valid sidecar content corruption with the same revision", () => {
    const original = stage()
    const write = fs.writeFileSync.bind(fs)
    const spy = vi
      .spyOn(fs, "writeFileSync")
      .mockImplementation((file, data, options) => {
        if (String(file) === original.sidecarPath) {
          const parsed = requireJournalObservationRecord(
            JSON.parse(String(data)),
          )
          requireJournalObservationRecord(parsed.authoring).showNote =
            "silently corrupted, same revision"

          return write(file, JSON.stringify(parsed), options)
        }

        return write(file, data, options)
      })
    expect(
      recoverJournals(requireInitializedFixture().injections).unresolvedCount,
    ).toBe(1)
    expect(fs.existsSync(original.journal)).toBe(true)
    spy.mockRestore()
    expect(
      recoverJournals(requireInitializedFixture().injections).unresolvedCount,
    ).toBe(0)
    expect(readSidecar(requireInitializedFixture().getPath, "show")).toEqual(
      original.extras,
    )
  })
  it.each([
    "invalid-v2",
    "digest-mismatch",
    "newer-revision",
    "wrong-quiz-id",
    "wrong-filename",
  ])("fails closed before writes for %s", (fault) => {
    const original = stage()
    const entry = requireJournalObservationRecord(
      JSON.parse(fs.readFileSync(original.journal, "utf8")),
    )

    if (fault === "invalid-v2") {
      requireJournalObservationRecord(entry.backupExtras).timeline = [
        { kind: "invalid" },
      ]
    }

    if (fault === "digest-mismatch") {
      requireJournalObservationRecord(entry.backupExtras).baseDigest =
        "f".repeat(64)
    }

    if (fault === "wrong-quiz-id") {
      requireJournalObservationRecord(entry.backupExtras).quizId = "foreign"
    }

    if (fault === "wrong-filename") {
      entry.quizId = "foreign"
    }

    fs.writeFileSync(original.journal, JSON.stringify(entry))

    if (fault === "newer-revision") {
      writeSidecar(requireInitializedFixture().getPath, "show", {
        ...original.extras,
        revision: 3,
      })
    }

    const beforeHash = fileDigest(original.sidecarPath)
    const update = vi.spyOn(
      requireInitializedFixture().injections,
      "updateQuizz",
    )
    expect(
      recoverJournals(requireInitializedFixture().injections).unresolvedCount,
    ).toBe(1)
    expect(update).not.toHaveBeenCalled()
    expect(fs.existsSync(original.journal)).toBe(true)
    expect(fileDigest(original.sidecarPath)).toBe(beforeHash)
  })
  it("keeps journal after partial sidecar write and retries safely", () => {
    const original = stage()
    const write = fs.writeFileSync.bind(fs)
    const spy = vi
      .spyOn(fs, "writeFileSync")
      .mockImplementation((file, data, options) => {
        if (String(file) === original.sidecarPath) {
          write(file, "{partial", options)
          throw new Error("EACCES injected")
        }

        return write(file, data, options)
      })
    expect(
      recoverJournals(requireInitializedFixture().injections).unresolvedCount,
    ).toBe(1)
    expect(fs.existsSync(original.journal)).toBe(true)
    spy.mockRestore()
    expect(
      recoverJournals(requireInitializedFixture().injections).unresolvedCount,
    ).toBe(0)
    expect(readSidecar(requireInitializedFixture().getPath, "show")).toEqual(
      original.extras,
    )
  })
  it("keeps journal if cleanup fails after exact restoration", () => {
    const original = stage()
    const unlink = fs.unlinkSync.bind(fs)
    const spy = vi.spyOn(fs, "unlinkSync").mockImplementation((file) => {
      if (String(file) === original.journal) {
        throw new Error("EACCES injected cleanup")
      }

      return unlink(file)
    })
    expect(
      recoverJournals(requireInitializedFixture().injections).unresolvedCount,
    ).toBe(1)
    expect(fs.existsSync(original.journal)).toBe(true)
    spy.mockRestore()
    expect(
      recoverJournals(requireInitializedFixture().injections).unresolvedCount,
    ).toBe(0)
  })
})
