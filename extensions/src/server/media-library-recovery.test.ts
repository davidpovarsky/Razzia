import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { findMediaReferencesAcrossShows } from "../core/index"
import {
  executeMediaDeleteTransaction,
  getMediaDeleteJournalDirectory,
  getMediaQuarantineDirectory,
  loadAllShowsHealth,
  recoverMediaDeleteJournals,
  recoverStartupJournals,
} from "./media-library"
import {
  createRecoveryFixture,
  fileDigest,
  MEDIA_NAME,
  removeSyntheticFixture,
} from "./storage/recovery-fixture"
import { createStagedJournal } from "./storage/journal"
import { readSidecar } from "./storage/sidecar"

describe("media-delete deterministic restart snapshots", () => {
  let fixture: ReturnType<typeof createRecoveryFixture>
  const extraRoots: string[] = []
  beforeEach(() => {
    fixture = createRecoveryFixture()
    fixture.seed("show-a")
    fixture.seed("show-b")
    fixture.seed("unrelated", false)
    fs.writeFileSync(
      fixture.getPath(`media/${MEDIA_NAME}`),
      Buffer.from([0, 1, 255, 3, 8, 13]),
    )
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "info").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    removeSyntheticFixture(fixture.root)
    for (const root of extraRoots.splice(0)) removeSyntheticFixture(root)
  })
  const mediaPath = () => fixture.getPath(`media/${MEDIA_NAME}`)
  function journals(getPath = fixture.getPath) {
    return fs
      .readdirSync(getMediaDeleteJournalDirectory(getPath))
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.join(getMediaDeleteJournalDirectory(getPath), f))
  }
  function transaction() {
    return executeMediaDeleteTransaction(fixture.getPath, MEDIA_NAME, {
      detach: true,
      deleteMediaFn: () => fs.unlinkSync(mediaPath()),
    })
  }
  function transactionState() {
    const files = [
      "quizz/show-a.json",
      "extensions/quizzes/show-a.json",
      `media/${MEDIA_NAME}`,
    ]
    return {
      files: Object.fromEntries(
        files.map((file) => [
          file,
          fs.existsSync(fixture.getPath(file))
            ? fileDigest(fixture.getPath(file))
            : null,
        ]),
      ),
      journals: journals().map((file) => ({
        status: JSON.parse(fs.readFileSync(file, "utf8")).status,
      })),
      quarantine: fs
        .readdirSync(getMediaQuarantineDirectory(fixture.getPath))
        .map((file) =>
          fileDigest(
            path.join(getMediaQuarantineDirectory(fixture.getPath), file),
          ),
        ),
    }
  }
  function recordTransactionFault(
    fault: string,
    before: ReturnType<typeof transactionState>,
    result: ReturnType<typeof transaction>,
  ) {
    if (process.env.RECOVERY_TRANSACTION_RECEIPT_PATH)
      fs.appendFileSync(
        process.env.RECOVERY_TRANSACTION_RECEIPT_PATH,
        JSON.stringify({ fault, before, after: transactionState(), result }) +
          "\n",
      )
  }
  function staged() {
    const result = executeMediaDeleteTransaction(fixture.getPath, MEDIA_NAME, {
      detach: true,
      deleteMediaFn: () => fs.unlinkSync(mediaPath()),
      faultInjection: {
        failBeforeCommittedWrite: true,
        failDuringRollback: true,
      },
    })
    expect(result.allowed).toBe(false)
    expect(journals()).toHaveLength(1)
    return journals()[0]
  }
  it.each([
    "quarantine-copy",
    "staged-journal",
    "first-base-write",
    "last-sidecar-write",
    "binary-delete",
    "committed-journal",
    "quarantine-cleanup",
    "journal-cleanup",
  ])("restarts twice from actual disk snapshot at %s", (boundary) => {
    const originals = ["show-a", "show-b", "unrelated"].flatMap((id) => [
      `quizz/${id}.json`,
      `extensions/quizzes/${id}.json`,
    ])
    const hashes = new Map(
      originals.map((file) => [file, fileDigest(fixture.getPath(file))]),
    )
    const binaryHash = fileDigest(mediaPath())
    const snapshot = createRecoveryFixture()
    extraRoots.push(snapshot.root)
    let captured = false
    const capture = () => {
      if (captured) return
      captured = true
      fs.cpSync(fixture.root, snapshot.root, { recursive: true })
    }
    const copy = fs.copyFileSync.bind(fs)
    vi.spyOn(fs, "copyFileSync").mockImplementation(
      (source, destination, mode) => {
        copy(source, destination, mode)
        if (
          boundary === "quarantine-copy" &&
          String(destination).includes("quarantine")
        )
          capture()
      },
    )
    const rename = fs.renameSync.bind(fs)
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      rename(source, destination)
      const dest = String(destination)
      if (dest.endsWith(".media-journal.json")) {
        const status = JSON.parse(fs.readFileSync(destination, "utf8")).status
        if (boundary === "staged-journal" && status === "staged") capture()
        if (boundary === "committed-journal" && status === "committed")
          capture()
      }
      if (
        boundary === "first-base-write" &&
        dest === fixture.basePath("show-a")
      )
        capture()
    })
    const write = fs.writeFileSync.bind(fs)
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      write(file, data, options)
      if (
        boundary === "last-sidecar-write" &&
        String(file) === fixture.getPath("extensions/quizzes/show-b.json")
      )
        capture()
    })
    const unlink = fs.unlinkSync.bind(fs)
    vi.spyOn(fs, "unlinkSync").mockImplementation((file) => {
      unlink(file)
      const name = String(file)
      if (boundary === "binary-delete" && name === mediaPath()) capture()
      if (boundary === "quarantine-cleanup" && name.includes("quarantine"))
        capture()
      if (
        boundary === "journal-cleanup" &&
        name.endsWith(".media-journal.json")
      )
        capture()
    })
    expect(transaction().allowed).toBe(true)
    expect(captured).toBe(true)
    vi.restoreAllMocks()
    const committed = [
      "committed-journal",
      "quarantine-cleanup",
      "journal-cleanup",
    ].includes(boundary)
    if (journals(snapshot.getPath).length > 0) {
      // Copied roots/inodes are not restarts of the recorded files. Actual
      // same-root SIGKILL positives remain in process-interruption.test.ts.
      const copiedState = () =>
        fs
          .readdirSync(snapshot.root, { recursive: true })
          .map(String)
          .sort()
          .map((relative) => {
            const file = path.join(snapshot.root, relative)
            const stat = fs.lstatSync(file)
            return {
              relative,
              kind: stat.isDirectory() ? "directory" : "file",
              ...(stat.isFile() ? { sha256: fileDigest(file) } : {}),
            }
          })
      const beforeCopyRecovery = copiedState()
      for (const attempt of [1, 2]) {
        expect(() =>
          recoverStartupJournals({ getPath: snapshot.getPath }),
        ).toThrow(/startup blocked/i)
        expect(copiedState(), `attempt ${attempt}`).toStrictEqual(
          beforeCopyRecovery,
        )
      }
      if (process.env.RECOVERY_RECEIPT_PATH)
        fs.appendFileSync(
          process.env.RECOVERY_RECEIPT_PATH,
          JSON.stringify({
            boundary,
            recovery: "copied-identity-rejected",
            before: beforeCopyRecovery,
            after: copiedState(),
          }) + "\n",
        )
      return
    }
    expect(
      recoverStartupJournals({ getPath: snapshot.getPath }).status,
    ).not.toBe("failed")
    if (committed) {
      expect(fs.existsSync(snapshot.getPath(`media/${MEDIA_NAME}`))).toBe(false)
      expect(
        findMediaReferencesAcrossShows(
          MEDIA_NAME,
          loadAllShowsHealth(snapshot.getPath).records,
        ),
      ).toHaveLength(0)
    } else {
      for (const [file, hash] of hashes)
        expect(fileDigest(snapshot.getPath(file))).toBe(hash)
      expect(fileDigest(snapshot.getPath(`media/${MEDIA_NAME}`))).toBe(
        binaryHash,
      )
    }
    expect(fileDigest(snapshot.getPath("quizz/unrelated.json"))).toBe(
      hashes.get("quizz/unrelated.json"),
    )
    expect(recoverStartupJournals({ getPath: snapshot.getPath }).status).toBe(
      "clean",
    )
    expect(journals(snapshot.getPath)).toHaveLength(0)
    if (process.env.RECOVERY_RECEIPT_PATH) {
      fs.appendFileSync(
        process.env.RECOVERY_RECEIPT_PATH,
        JSON.stringify({
          boundary,
          recovery: committed ? "committed-forward" : "staged-rollback",
          before: Object.fromEntries(hashes),
          binaryBefore: binaryHash,
          after: Object.fromEntries(
            originals.map((file) => [file, fileDigest(snapshot.getPath(file))]),
          ),
          binaryAfter: fs.existsSync(snapshot.getPath(`media/${MEDIA_NAME}`))
            ? fileDigest(snapshot.getPath(`media/${MEDIA_NAME}`))
            : null,
          replay: "clean",
          journalsAfter: 0,
        }) + "\n",
      )
    }
  })
  it("retains staged journal and quarantine after partial restore and retries", () => {
    const journal = staged()
    const entry = JSON.parse(fs.readFileSync(journal, "utf8"))
    const rename = fs.renameSync.bind(fs)
    const spy = vi
      .spyOn(fs, "renameSync")
      .mockImplementation((source, destination) => {
        if (
          String(destination) ===
          fixture.getPath("extensions/quizzes/show-b.json")
        )
          throw new Error("EACCES injected restore")
        return rename(source, destination)
      })
    expect(recoverMediaDeleteJournals(fixture.getPath).unresolvedCount).toBe(1)
    expect(fs.existsSync(journal)).toBe(true)
    expect(fs.existsSync(entry.quarantinePath)).toBe(true)
    spy.mockRestore()
    expect(recoverMediaDeleteJournals(fixture.getPath).unresolvedCount).toBe(0)
    expect(recoverMediaDeleteJournals(fixture.getPath).recoveredCount).toBe(0)
  })
  it("blocks startup rather than restoring refs when original and quarantine are missing", () => {
    const journal = staged()
    const entry = JSON.parse(fs.readFileSync(journal, "utf8"))
    fs.unlinkSync(mediaPath())
    fs.unlinkSync(entry.quarantinePath)
    expect(() => recoverStartupJournals({ getPath: fixture.getPath })).toThrow(
      "startup blocked",
    )
    expect(fs.existsSync(journal)).toBe(true)
  })
  it.each(["unreadable-show", "binary-present"])(
    "preserves committed journal and quarantine on %s",
    (fault) => {
      const journal = staged()
      const entry = JSON.parse(fs.readFileSync(journal, "utf8"))
      entry.status = "committed"
      entry.shows = []
      fs.writeFileSync(journal, JSON.stringify(entry))
      // Detach shows using the actual production transaction, then restore our committed receipt.
      const saved = fs.readFileSync(journal)
      fs.unlinkSync(journal)
      expect(transaction().allowed).toBe(true)
      fs.writeFileSync(journal, saved)
      if (fault === "unreadable-show")
        fs.writeFileSync(fixture.basePath("show-a"), "{broken")
      if (fault === "binary-present")
        fs.writeFileSync(mediaPath(), "replacement must not be deleted")
      expect(recoverMediaDeleteJournals(fixture.getPath).unresolvedCount).toBe(
        1,
      )
      expect(fs.existsSync(journal)).toBe(true)
      expect(fs.existsSync(entry.quarantinePath)).toBe(true)
    },
  )
  it("does not treat failed committed-marker rename as a durable commit", () => {
    const rename = fs.renameSync.bind(fs)
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (
        String(destination).endsWith(".media-journal.json") &&
        JSON.parse(fs.readFileSync(source, "utf8")).status === "committed"
      )
        throw new Error("ENOSPC injected committed marker")
      rename(source, destination)
    })
    expect(transaction().allowed).toBe(false)
    expect(fs.existsSync(mediaPath())).toBe(true)
    expect(
      loadAllShowsHealth(fixture.getPath).records.every(
        (s) =>
          s.id === "unrelated" ||
          findMediaReferencesAcrossShows(MEDIA_NAME, [s]).length > 0,
      ),
    ).toBe(true)
  })
  it("rejects unsafe journal IDs without writing outside authorized paths", () => {
    const journal = staged()
    const entry = JSON.parse(fs.readFileSync(journal, "utf8"))
    entry.shows[0].quizId = "../foreign"
    fs.writeFileSync(journal, JSON.stringify(entry))
    const before = fileDigest(fixture.basePath("show-a"))
    expect(recoverMediaDeleteJournals(fixture.getPath).unresolvedCount).toBe(1)
    expect(fileDigest(fixture.basePath("show-a"))).toBe(before)
    expect(
      fs.readdirSync(getMediaQuarantineDirectory(fixture.getPath)),
    ).toHaveLength(1)
  })
  it.each(["staged", "committed"])(
    "retains %s journal when quarantine cleanup fails and replays safely",
    (status) => {
      const journal = staged()
      const entry = JSON.parse(fs.readFileSync(journal, "utf8"))
      if (status === "committed") {
        const saved = { ...entry, status, shows: [] }
        fs.unlinkSync(journal)
        expect(transaction().allowed).toBe(true)
        fs.writeFileSync(journal, JSON.stringify(saved))
      }
      const unlink = fs.unlinkSync.bind(fs)
      const spy = vi.spyOn(fs, "unlinkSync").mockImplementation((file) => {
        if (String(file) === entry.quarantinePath)
          throw new Error("EACCES injected quarantine cleanup")
        unlink(file)
      })
      expect(recoverMediaDeleteJournals(fixture.getPath).unresolvedCount).toBe(
        1,
      )
      expect(fs.existsSync(journal)).toBe(true)
      expect(fs.existsSync(entry.quarantinePath)).toBe(true)
      spy.mockRestore()
      expect(recoverMediaDeleteJournals(fixture.getPath).unresolvedCount).toBe(
        0,
      )
      expect(recoverMediaDeleteJournals(fixture.getPath).recoveredCount).toBe(0)
    },
  )
  it("preserves evidence when a restore rename silently changes valid sidecar content", () => {
    const journal = staged()
    const rename = fs.renameSync.bind(fs)
    const spy = vi
      .spyOn(fs, "renameSync")
      .mockImplementation((source, destination) => {
        rename(source, destination)
        if (
          String(destination) ===
          fixture.getPath("extensions/quizzes/show-b.json")
        ) {
          const extras = JSON.parse(fs.readFileSync(destination, "utf8"))
          extras.authoring.showNote = "silently wrong"
          fs.writeFileSync(destination, JSON.stringify(extras))
        }
      })
    expect(recoverMediaDeleteJournals(fixture.getPath).unresolvedCount).toBe(1)
    expect(fs.existsSync(journal)).toBe(true)
    spy.mockRestore()
    expect(recoverMediaDeleteJournals(fixture.getPath).unresolvedCount).toBe(0)
  })
  it("recovers concurrent journal families with real matching base digest", () => {
    staged()
    const original = fixture.seed("quiz-save", false)
    createStagedJournal(fixture.getPath, {
      quizId: "quiz-save",
      backupBase: original.base,
      backupExtras: original.extras,
      targetBase: { ...original.base, subject: "Interrupted title" },
      targetExtras: { ...original.extras, revision: 2 },
    })
    fixture.injections.updateQuizz("quiz-save", {
      ...original.base,
      subject: "Interrupted title",
    })
    const result = recoverStartupJournals({ getPath: fixture.getPath })
    expect(result.unresolvedCount).toBe(0)
    expect(result.quizRecovery.recoveredCount).toBe(1)
    expect(result.mediaRecovery.recoveredCount).toBe(1)
    expect(readSidecar(fixture.getPath, "quiz-save")).toEqual(original.extras)
    expect(fixture.injections.getQuizzById("quiz-save")).toEqual(original.base)
    expect(recoverStartupJournals({ getPath: fixture.getPath }).status).toBe(
      "clean",
    )
  })
  it("transaction committed cleanup retains its journal after quarantine unlink EACCES", () => {
    const before = transactionState()
    const unlink = fs.unlinkSync.bind(fs)
    const spy = vi.spyOn(fs, "unlinkSync").mockImplementation((file) => {
      if (String(file).startsWith(getMediaQuarantineDirectory(fixture.getPath)))
        throw new Error("EACCES injected transaction quarantine unlink")
      unlink(file)
    })
    const result = transaction()
    recordTransactionFault("committed-quarantine-unlink-EACCES", before, result)
    expect(journals()).toHaveLength(1)
    expect(result.allowed).toBe(true)
    expect(result.journalId).toBeTruthy()
    expect(result.error).toMatch(/cleanup.*warning/i)
    expect(JSON.parse(fs.readFileSync(journals()[0], "utf8")).status).toBe(
      "committed",
    )
    expect(transactionState().quarantine).toEqual([
      before.files[`media/${MEDIA_NAME}`],
    ])
    expect(fs.existsSync(mediaPath())).toBe(false)
    expect(
      findMediaReferencesAcrossShows(
        MEDIA_NAME,
        loadAllShowsHealth(fixture.getPath).records,
      ),
    ).toHaveLength(0)
    expect(() => recoverStartupJournals({ getPath: fixture.getPath })).toThrow(
      "startup blocked",
    )
    spy.mockRestore()
    expect(recoverStartupJournals({ getPath: fixture.getPath }).status).toBe(
      "recovered",
    )
    expect(recoverStartupJournals({ getPath: fixture.getPath }).status).toBe(
      "clean",
    )
    expect(transactionState().quarantine).toHaveLength(0)
  })
  it.each(["base", "sidecar", "binary"])(
    "transaction rollback retains evidence after silent %s corruption",
    (fault) => {
      if (fault === "binary") {
        fs.writeFileSync(mediaPath(), Buffer.alloc(64 * 1024 + 3, 13))
      }
      const before = transactionState()
      let rollingBack = false
      const write = fs.writeFileSync.bind(fs)
      const writeSpy = vi
        .spyOn(fs, "writeFileSync")
        .mockImplementation((file, data, options) => {
          const target =
            fault === "base"
              ? fixture.basePath("show-a")
              : fixture.getPath("extensions/quizzes/show-a.json")
          if (
            fault !== "binary" &&
            rollingBack &&
            String(file).startsWith(`${target}.tmp.`)
          ) {
            const corrupted = JSON.parse(String(data))
            if (fault === "base")
              corrupted.subject = "Silent rollback corruption"
            else corrupted.authoring.showNote = "Silent rollback corruption"
            return write(file, JSON.stringify(corrupted), options)
          }
          return write(file, data, options)
        })
      const copy = fs.copyFileSync.bind(fs)
      const copySpy = vi
        .spyOn(fs, "copyFileSync")
        .mockImplementation((source, destination, mode) => {
          copy(source, destination, mode)
          if (
            fault === "binary" &&
            rollingBack &&
            String(destination) === mediaPath()
          ) {
            const corrupted = fs.readFileSync(destination)
            corrupted[corrupted.length - 1] ^= 255
            write(destination, corrupted)
          }
        })
      // Legacy rollback chmod is intercepted so the reproduction itself never widens permissions.
      const chmod = vi.spyOn(fs, "chmodSync").mockImplementation(() => {})
      const result = executeMediaDeleteTransaction(
        fixture.getPath,
        MEDIA_NAME,
        {
          detach: true,
          deleteMediaFn: () => {
            fs.unlinkSync(mediaPath())
            rollingBack = true
          },
          faultInjection: { failBeforeCommittedWrite: true },
        },
      )
      recordTransactionFault(
        `immediate-rollback-silent-${fault}`,
        before,
        result,
      )
      expect(journals()).toHaveLength(1)
      expect(result.allowed).toBe(false)
      expect(result.journalId).toBeTruthy()
      expect(result.error).toMatch(/journal preserved/i)
      expect(transactionState().quarantine).toEqual([
        before.files[`media/${MEDIA_NAME}`],
      ])
      expect(chmod).not.toHaveBeenCalled()
      writeSpy.mockRestore()
      copySpy.mockRestore()
      chmod.mockRestore()
      if (fault === "binary") {
        // A present but different binary may be a concurrent replacement. Startup
        // preserves both copies until this disposable corrupted fixture is removed.
        expect(() =>
          recoverStartupJournals({ getPath: fixture.getPath }),
        ).toThrow("startup blocked")
        fs.unlinkSync(mediaPath())
      }
      expect(recoverStartupJournals({ getPath: fixture.getPath }).status).toBe(
        "recovered",
      )
      expect(transactionState().files).toEqual(before.files)
      expect(recoverStartupJournals({ getPath: fixture.getPath }).status).toBe(
        "clean",
      )
    },
  )
  it("transaction rollback preserves permission-denied restores without chmod", () => {
    const before = transactionState()
    let rollingBack = false
    const rename = fs.renameSync.bind(fs)
    const spy = vi
      .spyOn(fs, "renameSync")
      .mockImplementation((source, destination) => {
        if (rollingBack && String(destination) === fixture.basePath("show-a"))
          throw new Error("EACCES injected rollback base rename")
        rename(source, destination)
      })
    const chmod = vi.spyOn(fs, "chmodSync").mockImplementation(() => {})
    const result = executeMediaDeleteTransaction(fixture.getPath, MEDIA_NAME, {
      detach: true,
      deleteMediaFn: () => {
        fs.unlinkSync(mediaPath())
        rollingBack = true
      },
      faultInjection: { failBeforeCommittedWrite: true },
    })
    recordTransactionFault(
      "immediate-rollback-permission-denied",
      before,
      result,
    )
    expect(chmod).not.toHaveBeenCalled()
    expect(journals()).toHaveLength(1)
    expect(result.error).toMatch(/journal preserved/i)
    expect(transactionState().quarantine).toEqual([
      before.files[`media/${MEDIA_NAME}`],
    ])
    spy.mockRestore()
    chmod.mockRestore()
    expect(recoverStartupJournals({ getPath: fixture.getPath }).status).toBe(
      "recovered",
    )
    expect(transactionState().files).toEqual(before.files)
  })
  it.each(["quarantine", "journal"])(
    "transaction rollback reports pending %s cleanup and replays",
    (fault) => {
      const before = transactionState()
      const unlink = fs.unlinkSync.bind(fs)
      const spy = vi.spyOn(fs, "unlinkSync").mockImplementation((file) => {
        if (
          (fault === "quarantine" &&
            String(file).startsWith(
              getMediaQuarantineDirectory(fixture.getPath),
            )) ||
          (fault === "journal" && String(file).endsWith(".media-journal.json"))
        )
          throw new Error(`EACCES injected rollback ${fault} cleanup`)
        unlink(file)
      })
      const chmod = vi.spyOn(fs, "chmodSync").mockImplementation(() => {})
      const result = executeMediaDeleteTransaction(
        fixture.getPath,
        MEDIA_NAME,
        {
          detach: true,
          deleteMediaFn: () => fs.unlinkSync(mediaPath()),
          faultInjection: { failBeforeCommittedWrite: true },
        },
      )
      recordTransactionFault(
        `immediate-rollback-${fault}-cleanup`,
        before,
        result,
      )
      expect(result.journalId).toBeTruthy()
      expect(result.error).toMatch(/journal preserved/i)
      expect(journals()).toHaveLength(1)
      expect(transactionState().files).toEqual(before.files)
      expect(chmod).not.toHaveBeenCalled()
      spy.mockRestore()
      chmod.mockRestore()
      expect(recoverStartupJournals({ getPath: fixture.getPath }).status).toBe(
        "recovered",
      )
      expect(recoverStartupJournals({ getPath: fixture.getPath }).status).toBe(
        "clean",
      )
    },
  )
})
