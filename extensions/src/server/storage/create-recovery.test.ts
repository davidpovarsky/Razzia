import fs from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CompositeStorageService } from "./service"
import { recoverJournals, getJournalDirectory } from "./journal"
import {
  createRecoveryFixture,
  fileDigest,
  removeSyntheticFixture,
} from "./recovery-fixture"

describe("create/import rollback recovery", () => {
  let fixture: ReturnType<typeof createRecoveryFixture>
  beforeEach(() => {
    fixture = createRecoveryFixture()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    removeSyntheticFixture(fixture.root)
  })
  it.each(["create", "import"])(
    "retains recovery intent if %s sidecar write and base cleanup fail",
    (operation) => {
      const original = fixture.seed("unrelated", false)
      const write = fs.writeFileSync.bind(fs)
      const spy = vi
        .spyOn(fs, "writeFileSync")
        .mockImplementation((file, data, options) => {
          if (
            String(file).includes("quizzes") &&
            !String(file).includes(".journal")
          ) {
            write(file, "{partial", options)
            throw new Error("ENOSPC injected partial sidecar")
          }
          return write(file, data, options)
        })
      const service = new CompositeStorageService({
        ...fixture.injections,
        deleteQuizz: () => {
          throw new Error("EACCES injected cleanup")
        },
      })
      const run = () =>
        operation === "create"
          ? service.createCompositeQuiz({
              quizz: original.base,
              extras: original.extras,
            })
          : service.importEnhancedBundle({
              bundleVersion: 1,
              quizz: original.base,
              extras: original.extras,
            })
      expect(run).toThrow(/recovery|journal/i)
      spy.mockRestore()
      expect(
        fs
          .readdirSync(getJournalDirectory(fixture.getPath))
          .some((file) => file.endsWith(".journal.json")),
      ).toBe(true)
      expect(recoverJournals(fixture.injections).unresolvedCount).toBe(0)
      expect(fs.readdirSync(fixture.getPath("quizz"))).toEqual([
        "unrelated.json",
      ])
    },
  )
  it("retains recovery intent if sidecar cleanup fails after deleting base", () => {
    const original = fixture.seed("unrelated", false)
    const write = fs.writeFileSync.bind(fs)
    const unlink = fs.unlinkSync.bind(fs)
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (
        String(file).includes("quizzes") &&
        !String(file).includes(".journal")
      ) {
        write(file, "{partial", options)
        throw new Error("ENOSPC injected partial sidecar")
      }
      return write(file, data, options)
    })
    vi.spyOn(fs, "unlinkSync").mockImplementation((file) => {
      if (
        String(file).includes("quizzes") &&
        !String(file).includes(".journal")
      )
        throw new Error("EACCES injected sidecar cleanup")
      return unlink(file)
    })
    const service = new CompositeStorageService(fixture.injections)
    expect(() =>
      service.createCompositeQuiz({
        quizz: original.base,
        extras: original.extras,
      }),
    ).toThrow(/recovery|journal/i)
    vi.restoreAllMocks()
    expect(
      fs
        .readdirSync(getJournalDirectory(fixture.getPath))
        .some((file) => file.endsWith(".journal.json")),
    ).toBe(true)
    expect(recoverJournals(fixture.injections).unresolvedCount).toBe(0)
    expect(fs.readdirSync(fixture.getPath("quizz"))).toEqual(["unrelated.json"])
  })
  it.each(["create", "import"])(
    "replays interrupted %s after ID return and journal stage",
    (operation) => {
      const original = fixture.seed("unrelated", false)
      const before = fileDigest(original.basePath)
      const snapshot = createRecoveryFixture()
      let captured = false
      const rename = fs.renameSync.bind(fs)
      const spy = vi
        .spyOn(fs, "renameSync")
        .mockImplementation((source, destination) => {
          rename(source, destination)
          if (String(destination).endsWith(".journal.json")) {
            fs.cpSync(fixture.root, snapshot.root, { recursive: true })
            captured = true
          }
        })
      try {
        const service = new CompositeStorageService(fixture.injections)
        if (operation === "create")
          service.createCompositeQuiz({
            quizz: original.base,
            extras: original.extras,
          })
        else
          service.importEnhancedBundle({
            bundleVersion: 1,
            quizz: original.base,
            extras: original.extras,
          })
        spy.mockRestore()
        expect(captured).toBe(true)
        expect(recoverJournals(snapshot.injections).unresolvedCount).toBe(0)
        expect(fs.readdirSync(snapshot.getPath("quizz"))).toEqual([
          "unrelated.json",
        ])
        expect(fileDigest(snapshot.basePath("unrelated"))).toBe(before)
        expect(recoverJournals(snapshot.injections).recoveredCount).toBe(0)
      } finally {
        spy.mockRestore()
        removeSyntheticFixture(snapshot.root)
      }
    },
  )
})
