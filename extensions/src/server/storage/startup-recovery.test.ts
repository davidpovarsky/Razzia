import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { readStartupOwnerSnapshot } from "../../../../packages/socket/src/services/account-db"
import { recoverStartupOwnerJournals } from "./startup-recovery"
import {
  createCreationFixture,
  removeCreationFixture,
  creationInput,
} from "./creation-fixture"
import * as native from "../../../../packages/socket/src/services/config"
import { withAccount } from "../../../../packages/socket/src/services/account-scope"
import { richNativeExtras } from "./native-binding-fixture"
import { createStagedJournal } from "./journal"
import { writeSidecar } from "./sidecar"
import {
  executeMediaDeleteTransaction,
  getMediaQuarantineDirectory,
} from "../media-library"

const OWNER = "00000000-0000-4000-8000-0000000000A1"
const SECOND = "00000000-0000-4000-8000-0000000000B2"
let fixture: Pick<
  ReturnType<typeof createCreationFixture>,
  "root" | "token"
> = { root: "", token: "00000000-0000-4000-8000-000000000000" }
let priorConfig: string | undefined = undefined,
  priorAccounts: string | undefined = undefined
const handles: DatabaseSync[] = []
beforeEach(() => {
  priorConfig = process.env.CONFIG_PATH
  priorAccounts = process.env.TADAZZ_ACCOUNTS_ENABLED
  fixture = createCreationFixture()
})
afterEach(() => {
  vi.restoreAllMocks()
  for (const db of handles.splice(0)) {
    try {
      db.close()
    } catch {
      // Some cases explicitly close their synthetic writer before recovery.
    }
  }
  removeCreationFixture(fixture.root, fixture.token)

  if (priorConfig === undefined) {
    delete process.env.CONFIG_PATH
  } else {
    process.env.CONFIG_PATH = priorConfig
  }

  if (priorAccounts === undefined) {
    delete process.env.TADAZZ_ACCOUNTS_ENABLED
  } else {
    process.env.TADAZZ_ACCOUNTS_ENABLED = priorAccounts
  }
})
function database(ids: unknown[] = [OWNER], wal = false) {
  const db = new DatabaseSync(path.join(fixture.root, "tadazz-accounts.sqlite"))
  handles.push(db)

  if (wal) {
    db.exec("PRAGMA journal_mode=WAL")
  }

  db.exec("CREATE TABLE accounts(id,disabled INTEGER,verified_at INTEGER)")

  for (const id of ids) {
    db.prepare("INSERT INTO accounts VALUES(?,1,NULL)").run(id as string)
  }

  return db
}
function pending(family: string, owner = OWNER) {
  const directory = path.join(
    fixture.root,
    "tenants",
    owner,
    "extensions/quizzes/.journal",
    ...(family === "media-delete" ? [family] : []),
  )
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const file = path.join(directory, "synthetic.journal.json")
  fs.writeFileSync(file, "{malformed synthetic", { flag: "wx" })

  return file
}
function files() {
  const entries = [
    "tadazz-accounts.sqlite",
    "tadazz-accounts.sqlite-wal",
    "tadazz-accounts.sqlite-shm",
    "tadazz-accounts.sqlite-journal",
  ]

  return Object.fromEntries(
    entries.map((name) => {
      const file = path.join(fixture.root, name)

      if (!fs.existsSync(file)) {
        return [name, null]
      }

      const stat = fs.statSync(file, { bigint: true })

      return [
        name,
        {
          bytes: fs.readFileSync(file).toString("hex"),
          mode: String(stat.mode),
          mtime: String(stat.mtimeNs),
          ctime: String(stat.ctimeNs),
        },
      ]
    }),
  )
}

function retainOwnerProof(name: string, value: unknown) {
  const selected = process.env.RECOVERY_OWNER_RECEIPT_ROOT

  if (!selected) {
    return
  }

  fs.mkdirSync(selected, { recursive: true, mode: 0o700 })

  if (fs.realpathSync(selected) !== path.resolve(selected)) {
    throw new Error("Linked owner proof root")
  }

  fs.writeFileSync(
    path.join(selected, `${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  )
}

it.each(["quiz-save", "media-delete"])(
  "blocks unresolved tenant %s before listen, including accounts OFF",
  (family) => {
    const db = database()
    db.close()
    const journal = pending(family),
      before = fs.readFileSync(journal)
    process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
    const snapshot = readStartupOwnerSnapshot()
    expect(snapshot.ownerIds).toEqual([OWNER])
    expect(() => recoverStartupOwnerJournals(snapshot)).toThrow(
      /startup blocked/,
    )
    expect(fs.readFileSync(journal)).toEqual(before)
  },
)
it("selects all exact disabled and unverified owner IDs independent of the current flag", () => {
  const db = database([SECOND, OWNER])
  db.close()
  process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
  const before = files(),
    snapshot = readStartupOwnerSnapshot()
  expect(snapshot.ownerIds).toEqual([SECOND, OWNER])
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  expect(readStartupOwnerSnapshot().ownerIds).toEqual([SECOND, OWNER])
  expect(files()).toEqual(before)
})
it("reads owners committed only in a live WAL without changing source files", () => {
  database([OWNER, SECOND], true)
  const before = files(),
    entriesBefore = fs.readdirSync(fixture.root).sort()
  const snapshot = readStartupOwnerSnapshot(),
    after = files()
  expect(snapshot.ownerIds).toEqual([OWNER, SECOND])
  expect(after).toEqual(before)
  const entriesAfter = fs.readdirSync(fixture.root).sort()
  expect(entriesAfter).toEqual(entriesBefore)
  retainOwnerProof("live-wal", {
    before,
    after,
    entriesBefore,
    entriesAfter,
    owners: snapshot.ownerIds,
    node: process.version,
    sqlite: process.versions.sqlite,
  })
})
it("reads a cleanly closed WAL DB without creating source sidecars", () => {
  const db = database([OWNER], true)
  db.close()
  const before = files(),
    entriesBefore = fs.readdirSync(fixture.root).sort()
  const snapshot = readStartupOwnerSnapshot(),
    after = files()
  expect(snapshot.ownerIds).toEqual([OWNER])
  expect(after).toEqual(before)
  const entriesAfter = fs.readdirSync(fixture.root).sort()
  expect(entriesAfter).toEqual(entriesBefore)
  retainOwnerProof("clean-closed-wal", {
    before,
    after,
    entriesBefore,
    entriesAfter,
    owners: snapshot.ownerIds,
    node: process.version,
    sqlite: process.versions.sqlite,
  })
})
it("accepts native WAL reset with retained older-generation tail frames without source writes", () => {
  const db = database([OWNER], true)
  for (let i = 0; i < 6; i += 1) {
    db.exec("UPDATE accounts SET disabled=disabled+1")
  }
  // Synthetic writer behavior only.
  db.exec("PRAGMA wal_checkpoint(FULL)")
  db.prepare("INSERT INTO accounts VALUES(?,1,NULL)").run(SECOND)
  const before = files(),
    entriesBefore = fs.readdirSync(fixture.root).sort()
  retainOwnerProof("recycled-wal-before", { before, entriesBefore })
  const snapshot = readStartupOwnerSnapshot(),
    after = files(),
    entriesAfter = fs.readdirSync(fixture.root).sort()
  expect(snapshot.ownerIds).toEqual([OWNER, SECOND])
  expect(after).toEqual(before)
  expect(entriesAfter).toEqual(entriesBefore)
  retainOwnerProof("recycled-wal", {
    before,
    after,
    entriesBefore,
    entriesAfter,
    owners: snapshot.ownerIds,
    node: process.version,
    sqlite: process.versions.sqlite,
  })
})
it("accepts structural never-account absence without creating an account store", () => {
  const before = files(),
    snapshot = readStartupOwnerSnapshot()
  expect(snapshot.mode).toBe("legacy-global-only")
  expect(
    recoverStartupOwnerJournals(snapshot).map((v) => v.report.status),
  ).toEqual(["clean"])
  expect(files()).toEqual(before)
})
it("denies missing DB with even an empty tenant namespace", () => {
  fs.mkdirSync(path.join(fixture.root, "tenants"))
  expect(() => readStartupOwnerSnapshot()).toThrow(/retained tenant namespace/)
  expect(files()).toEqual(
    Object.fromEntries(Object.keys(files()).map((key) => [key, null])),
  )
})
it.each([
  { ids: [null] },
  { ids: ["not-an-owner"] },
  { ids: [OWNER, OWNER] },
  { ids: [OWNER, OWNER.toLowerCase()] },
])(
  "rejects invalid/duplicate/conflicting owner rows %j before recovery",
  ({ ids }) => {
    const db = database(ids)
    db.close()
    const journal = pending("quiz-save"),
      before = fs.readFileSync(journal)
    expect(() => readStartupOwnerSnapshot()).toThrow(
      /Invalid, duplicate or conflicting/,
    )
    expect(fs.readFileSync(journal)).toEqual(before)
  },
)
it("rejects corrupt committed WAL bytes without journal mutation", () => {
  const db = database([OWNER], true)
  const journal = pending("quiz-save"),
    before = fs.readFileSync(journal)
  const wal = path.join(fixture.root, "tadazz-accounts.sqlite-wal")
  const bytes = fs.readFileSync(wal)
  bytes[bytes.length - 1] ^= 1
  fs.writeFileSync(wal, bytes)
  expect(() => readStartupOwnerSnapshot()).toThrow(/WAL.*checksum/)
  expect(fs.readFileSync(journal)).toEqual(before)
  db.close()
})
it("rejects corrupt DB and missing owner table without source or journal writes", () => {
  const store = path.join(fixture.root, "tadazz-accounts.sqlite")
  fs.writeFileSync(store, "not a database")
  const journal = pending("quiz-save"),
    before = fs.readFileSync(journal)
  expect(() => readStartupOwnerSnapshot()).toThrow(/database header/)
  expect(fs.readFileSync(store, "utf8")).toBe("not a database")
  fs.unlinkSync(store)
  const db = new DatabaseSync(store)
  db.exec("CREATE TABLE unrelated(value)")
  db.close()
  expect(() => readStartupOwnerSnapshot()).toThrow(/snapshot failed/)
  expect(fs.readFileSync(journal)).toEqual(before)
})
it("checks the complete owner list before touching a valid earlier root", () => {
  const db = database()
  db.close()
  const journal = pending("quiz-save"),
    snapshot = readStartupOwnerSnapshot(),
    before = fs.readFileSync(journal)
  expect(() =>
    recoverStartupOwnerJournals({ ...snapshot, ownerIds: [OWNER, "bad"] }),
  ).toThrow(/snapshot owner/)
  expect(fs.readFileSync(journal)).toEqual(before)
})
it("refuses changed owner metadata after snapshot and preserves journal bytes", () => {
  const db = database()
  db.close()
  const snapshot = readStartupOwnerSnapshot(),
    journal = pending("quiz-save"),
    before = fs.readFileSync(journal)
  fs.appendFileSync(
    path.join(fixture.root, "tadazz-accounts.sqlite"),
    "changed",
  )
  expect(() => recoverStartupOwnerJournals(snapshot)).toThrow(
    /metadata changed/,
  )
  expect(fs.readFileSync(journal)).toEqual(before)
})
it("keeps a linked known tenant root out of recovery", () => {
  const db = database()
  db.close()
  fs.mkdirSync(path.join(fixture.root, "tenants"))
  const sentinel = path.join(fixture.root, "private-sentinel")
  fs.mkdirSync(sentinel)
  fs.symlinkSync(
    sentinel,
    path.join(fixture.root, "tenants", OWNER),
    process.platform === "win32" ? "junction" : "dir",
  )
  expect(() => recoverStartupOwnerJournals(readStartupOwnerSnapshot())).toThrow(
    /Unsafe (known recovery root|startup owner metadata path)/,
  )
})
it("replays clean known roots twice without ambient native CRUD or account changes", () => {
  const db = database([OWNER, SECOND])
  db.close()
  for (const owner of [OWNER, SECOND]) {
    fs.mkdirSync(path.join(fixture.root, "tenants", owner), { recursive: true })
  }
  const before = files()
  for (let i = 0; i < 2; i += 1) {
    expect(
      recoverStartupOwnerJournals(readStartupOwnerSnapshot()).map(
        (v) => v.report.status,
      ),
    ).toEqual(["clean", "clean", "clean"])
  }
  expect(files()).toEqual(before)
})
it("restores full tenant V2 and native basename through bound-root adapters with the account flag OFF", async () => {
  const db = database()
  db.close()
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  const saved = await withAccount(OWNER, () => {
    fs.mkdirSync(native.getPath("quizz"), { recursive: true })
    const input = creationInput(),
      { id } = native.saveQuizz(input)
    const base = native.getQuizzById(id),
      extras = richNativeExtras(id, input)
    writeSidecar(native.getPath, id, extras)
    const target = { ...base, subject: "Interrupted tenant save" }
    createStagedJournal(native.getPath, {
      quizId: id,
      backupBase: base,
      backupExtras: extras,
      targetBase: target,
      targetExtras: { ...extras, revision: 2 },
    })
    native.updateQuizz(id, target)
    writeSidecar(native.getPath, id, { ...extras, revision: 2 })

    return {
      base,
      extras,
      basePath: native.getPath(
        `quizz/${fs.readdirSync(native.getPath("quizz"))[0]}`,
      ),
      sidecar: native.getPath(`extensions/quizzes/${id}.json`),
    }
  })
  process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
  const before = files()
  expect(
    recoverStartupOwnerJournals(readStartupOwnerSnapshot()).map(
      (v) => v.report.status,
    ),
  ).toEqual(["clean", "recovered"])
  expect(JSON.parse(fs.readFileSync(saved.basePath, "utf8"))).toEqual(
    saved.base,
  )
  expect(JSON.parse(fs.readFileSync(saved.sidecar, "utf8"))).toEqual(
    saved.extras,
  )
  expect(
    recoverStartupOwnerJournals(readStartupOwnerSnapshot()).map(
      (v) => v.report.status,
    ),
  ).toEqual(["clean", "clean"])
  expect(files()).toEqual(before)
})
it("finishes committed tenant Media cleanup through explicit roots after the accounts flag changes", async () => {
  const db = database()
  db.close()
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  const media = await withAccount(OWNER, () => {
    fs.mkdirSync(native.getPath("quizz"), { recursive: true })
    fs.mkdirSync(native.getPath("media"))
    const input = creationInput(),
      { id } = native.saveQuizz(input)
    writeSidecar(native.getPath, id, richNativeExtras(id, input))
    const file = native.getPath("media/r1-native.png")
    fs.writeFileSync(file, Buffer.alloc(4096, 7))
    const unlink = fs.unlinkSync.bind(fs),
      quarantine = getMediaQuarantineDirectory(native.getPath)
    const spy = vi.spyOn(fs, "unlinkSync").mockImplementation((target) => {
      if (String(target).startsWith(quarantine)) {
        throw new Error("EACCES synthetic tenant quarantine cleanup")
      }

      unlink(target)
    })
    const result = executeMediaDeleteTransaction(
      native.getPath,
      "r1-native.png",
      { detach: true, deleteMediaFn: () => fs.unlinkSync(file) },
    )
    spy.mockRestore()
    expect(result.allowed).toBe(true)
    expect(result.error).toMatch(/cleanup.*warning/i)

    return { file, quarantine }
  })
  process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
  const before = files()
  expect(
    recoverStartupOwnerJournals(readStartupOwnerSnapshot()).map(
      (v) => v.report.status,
    ),
  ).toEqual(["clean", "recovered"])
  expect(fs.existsSync(media.file)).toBe(false)
  expect(fs.readdirSync(media.quarantine)).toEqual([])
  expect(
    recoverStartupOwnerJournals(readStartupOwnerSnapshot()).map(
      (v) => v.report.status,
    ),
  ).toEqual(["clean", "clean"])
  expect(files()).toEqual(before)
})

it("retries a changed live source and publishes only the revalidated owner set", () => {
  const db = database([OWNER], true),
    write = fs.writeFileSync.bind(fs)
  let copies = 0,
    afterWriter: ReturnType<typeof files> | undefined = undefined
  const privateRoots = new Set<string>()
  vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
    write(file, data, options)

    if (
      String(file).includes("tadazz-owner-snapshot-") &&
      path.basename(String(file)) === "accounts.sqlite"
    ) {
      privateRoots.add(path.dirname(String(file)))

      if ((copies += 1) === 1) {
        db.prepare("INSERT INTO accounts VALUES(?,1,NULL)").run(SECOND)
        afterWriter = files()
      }
    }
  })
  expect(readStartupOwnerSnapshot().ownerIds).toEqual([OWNER, SECOND])
  expect(copies).toBe(2)
  expect(files()).toEqual(afterWriter)
  for (const root of privateRoots) {
    expect(fs.existsSync(root)).toBe(false)
  }
  retainOwnerProof("changed-source-retry", {
    copies,
    afterWriter,
    after: files(),
    allPrivateCopiesRemoved: [...privateRoots].every(
      (root) => !fs.existsSync(root),
    ),
  })
})
it("bounds churn to three captures, cleans private copies and preserves journals", () => {
  const db = database([OWNER], true),
    write = fs.writeFileSync.bind(fs)
  const journal = pending("quiz-save"),
    bytes = fs.readFileSync(journal)
  let copies = 0,
    afterWriter: ReturnType<typeof files> | undefined = undefined
  const privateRoots = new Set<string>()
  vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
    write(file, data, options)

    if (
      String(file).includes("tadazz-owner-snapshot-") &&
      path.basename(String(file)) === "accounts.sqlite"
    ) {
      copies += 1
      privateRoots.add(path.dirname(String(file)))
      db.exec("UPDATE accounts SET disabled=disabled+1")
      afterWriter = files()
    }
  })
  expect(() => readStartupOwnerSnapshot()).toThrow(/changed during capture/)
  expect(copies).toBe(3)
  expect(files()).toEqual(afterWriter)
  expect(fs.readFileSync(journal)).toEqual(bytes)
  for (const root of privateRoots) {
    expect(fs.existsSync(root)).toBe(false)
  }
  retainOwnerProof("bounded-source-churn", {
    copies,
    afterWriter,
    after: files(),
    preservedJournal: fs.readFileSync(journal, "utf8"),
    allPrivateCopiesRemoved: [...privateRoots].every(
      (root) => !fs.existsSync(root),
    ),
  })
})
it("retries a WAL/SHM disappearance and accepts the complete closed source without creating source sidecars", () => {
  const db = database([OWNER], true),
    write = fs.writeFileSync.bind(fs)
  let copies = 0,
    afterWriter: ReturnType<typeof files> | undefined = undefined
  vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
    write(file, data, options)

    if (
      String(file).includes("tadazz-owner-snapshot-") &&
      path.basename(String(file)) === "accounts.sqlite" &&
      (copies += 1) === 1
    ) {
      db.close()
      afterWriter = files()
    }
  })
  expect(readStartupOwnerSnapshot().ownerIds).toEqual([OWNER])
  expect(copies).toBe(2)
  expect(files()).toEqual(afterWriter)
})
it("refuses oversized metadata before private copying or journal changes", () => {
  const db = database()
  db.close()
  const journal = pending("quiz-save"),
    bytes = fs.readFileSync(journal)
  const store = path.join(fixture.root, "tadazz-accounts.sqlite")
  fs.truncateSync(store, 16 * 1024 * 1024 + 1)
  expect(() => readStartupOwnerSnapshot()).toThrow(/private capture bound/)
  expect(fs.statSync(store).size).toBe(16 * 1024 * 1024 + 1)
  expect(fs.readFileSync(journal)).toEqual(bytes)
})
it.runIf(process.platform === "linux")(
  "fails closed on unreadable canonical metadata without changing permissions",
  () => {
    const db = database()
    db.close()
    const journal = pending("media-delete"),
      bytes = fs.readFileSync(journal)
    const store = path.join(fixture.root, "tadazz-accounts.sqlite"),
      mode = fs.statSync(store).mode & 0o777
    const sourceBytes = fs.readFileSync(store)
    fs.chmodSync(store, 0)

    // Root can bypass mode 000 via CAP_DAC_OVERRIDE. Inject the same OS denial
    // at the canonical open boundary so root QA still verifies fail-closed I/O.
    // Non-root Linux runs exercise the real filesystem permission denial.
    const open = fs.openSync.bind(fs)
    const deniedOpen =
      process.getuid?.() === 0
        ? vi.spyOn(fs, "openSync").mockImplementation((file, flags, mode) => {
            if (String(file) === store) {
              throw Object.assign(new Error("EACCES: permission denied"), {
                code: "EACCES",
              })
            }

            return open(file, flags, mode)
          })
        : undefined

    try {
      expect(() => readStartupOwnerSnapshot()).toThrow(/EACCES/)
      expect(fs.statSync(store).mode & 0o777).toBe(0)
      expect(fs.readFileSync(journal)).toEqual(bytes)
    } finally {
      deniedOpen?.mockRestore()
      fs.chmodSync(store, mode)
    }
    expect(fs.readFileSync(store)).toEqual(sourceBytes)
  },
)
it("rejects a linked canonical DB without following or rewriting its target", () => {
  const db = database()
  db.close()
  const store = path.join(fixture.root, "tadazz-accounts.sqlite"),
    target = path.join(fixture.root, "owned-original.sqlite")
  fs.renameSync(store, target)
  const before = fs.readFileSync(target)
  fs.symlinkSync(target, store, "file")
  expect(() => readStartupOwnerSnapshot()).toThrow(/Unsafe.*path/)
  expect(fs.readFileSync(target)).toEqual(before)
})
