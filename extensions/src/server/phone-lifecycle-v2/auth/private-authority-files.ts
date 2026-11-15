import {
  constants,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { DatabaseSync } from "node:sqlite"
import { authorityDenied } from "./credential-codec"
import type { SynchronousReauthorize } from "./contracts"

const APPLICATION_ID = 0x54445041
const SCHEMA_VERSION = 1
const MAX_AUTHORITY_BYTES = 4 * 1024 * 1024
type Stamp = { dev: number; ino: number }

function authorize(check: SynchronousReauthorize) {
  // void is intentional: an async or truthy fixture substitute cannot pass.
  const result: unknown = check()
  if (result !== undefined) authorityDenied()
}

export class PrivateAuthorityFiles {
  private readonly root: string
  private pinnedIdentity: { storeId: string; stamp: Stamp } | undefined
  private poisoned = false
  constructor(root: string) {
    if (!isAbsolute(root) || resolve(root) !== root) authorityDenied()
    this.root = root
  }
  private path() {
    return join(this.root, "phone-service-authority.sqlite")
  }
  private lock() {
    return join(this.root, "phone-service-authority.writer-lock")
  }
  private assertRoot() {
    if (this.poisoned) authorityDenied()
    const stat = lstatSync(this.root)
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0 ||
      realpathSync(this.root) !== this.root
    )
      authorityDenied()
    const marker = join(this.root, "PHONE_V2A_SYNTHETIC_ONLY"),
      m = lstatSync(marker)
    if (
      !m.isFile() ||
      m.isSymbolicLink() ||
      readFileSync(marker, "utf8") !== "synthetic-v2a-only\n"
    )
      authorityDenied()
  }
  private stamp(initialized = true): Stamp {
    const stat = lstatSync(this.path())
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > MAX_AUTHORITY_BYTES
    )
      authorityDenied()
    if (initialized) {
      const header = Buffer.alloc(100),
        fd = openSync(this.path(), "r")
      try {
        if (
          readSync(fd, header) !== 100 ||
          header.subarray(0, 16).toString() !== "SQLite format 3\0" ||
          header[18] !== 1 ||
          header[19] !== 1
        )
          authorityDenied()
      } finally {
        closeSync(fd)
      }
    }
    return { dev: stat.dev, ino: stat.ino }
  }
  private assertNoJournal() {
    if (
      ["-journal", "-wal", "-shm"].some((suffix) =>
        existsSync(this.path() + suffix),
      )
    )
      authorityDenied()
  }
  private syncDirectory() {
    const fd = openSync(this.root, "r")
    try {
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  }
  private schema(db: DatabaseSync, stamp: Stamp) {
    const app = db.prepare("PRAGMA application_id").get() as {
      application_id: number
    }
    const version = db.prepare("PRAGMA user_version").get() as {
      user_version: number
    }
    const check = db.prepare("PRAGMA quick_check(1)").get() as Record<
      string,
      unknown
    >
    const meta = db
      .prepare(
        "SELECT schema_version,store_id FROM authority_meta WHERE singleton=1",
      )
      .get() as { schema_version: number; store_id: string } | undefined
    if (
      app.application_id !== APPLICATION_ID ||
      version.user_version !== SCHEMA_VERSION ||
      Object.values(check)[0] !== "ok" ||
      meta?.schema_version !== SCHEMA_VERSION ||
      typeof meta.store_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/u.test(meta.store_id)
    )
      authorityDenied()
    const pinned = this.pinnedIdentity
    if (
      pinned &&
      (pinned.storeId !== meta.store_id ||
        pinned.stamp.dev !== stamp.dev ||
        pinned.stamp.ino !== stamp.ino)
    )
      authorityDenied()
    this.pinnedIdentity = { storeId: meta.store_id, stamp }
  }

  // Authentication does not initialize, mkdir, recover journals, modify schema,
  // clear locks or create a database. DELETE mode avoids WAL/SHM creation.
  read<T>(work: (db: DatabaseSync) => T): T {
    let db: DatabaseSync | undefined
    try {
      this.assertRoot()
      if (existsSync(this.lock())) authorityDenied()
      this.assertNoJournal()
      const before = this.stamp()
      db = new DatabaseSync(this.path(), { readOnly: true, timeout: 1000 })
      this.schema(db, before)
      const after = this.stamp()
      if (
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        existsSync(this.lock())
      )
        authorityDenied()
      const result = work(db)
      if (existsSync(this.lock())) authorityDenied()
      return result
    } catch {
      return authorityDenied()
    } finally {
      try {
        db?.close()
      } catch {
        this.poisoned = true
        authorityDenied()
      }
    }
  }

  initialize(check: SynchronousReauthorize, schema: string): void {
    authorize(check)
    this.assertRoot()
    if (existsSync(this.path())) {
      this.read(() => undefined) // Existing ready store only; no repair/DDL.
      authorize(check)
      return
    }
    this.mutate(
      check,
      (db) => {
        db.exec(
          `PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${SCHEMA_VERSION};`,
        )
        db.exec(schema)
        db.prepare(
          "INSERT INTO authority_meta(singleton,schema_version,store_id) VALUES(1,?,?)",
        ).run(SCHEMA_VERSION, randomUUID())
      },
      true,
    )
  }

  // Only explicit control mutations use a writable connection. A crash or an
  // ambiguous COMMIT leaves the lock as an uncertainty barrier, never autohealed.
  mutate<T>(
    check: SynchronousReauthorize,
    work: (db: DatabaseSync) => T,
    initialize = false,
  ): T {
    authorize(check)
    let db: DatabaseSync | undefined, lockFd: number | undefined
    let began = false,
      committed = false,
      uncertain = initialize,
      phase = "open"
    try {
      this.assertRoot()
      lockFd = openSync(
        this.lock(),
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      )
      writeSync(lockFd, "explicit phone authority mutation\n")
      fsyncSync(lockFd)
      this.syncDirectory()
      this.assertNoJournal()
      if (initialize) {
        const fd = openSync(
          this.path(),
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
          0o600,
        )
        try {
          fsyncSync(fd)
        } finally {
          closeSync(fd)
        }
      }
      const before = this.stamp(!initialize)
      db = new DatabaseSync(this.path(), { timeout: 2000 })
      if (initialize)
        db.exec(
          "PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;",
        )
      else {
        this.schema(db, before)
        const mode = db.prepare("PRAGMA journal_mode").get() as {
          journal_mode: string
        }
        if (mode.journal_mode !== "delete") authorityDenied()
        db.exec("PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;")
      }
      db.exec("BEGIN IMMEDIATE")
      began = true
      authorize(check) // Real live authority AFTER any SQLite admission wait.
      const result = work(db)
      authorize(check)
      phase = "commit"
      db.exec("COMMIT")
      committed = true
      began = false
      uncertain = false
      phase = "disclose"
      authorize(check) // A denied disclosure does not undo a committed decision.
      return result
    } catch {
      if (phase === "commit") uncertain = true
      if (began && !committed) {
        try {
          db?.exec("ROLLBACK")
        } catch {
          uncertain = true
        }
      }
      return authorityDenied()
    } finally {
      try {
        db?.close()
      } catch {
        uncertain = true
      }
      if (uncertain) this.poisoned = true
      if (lockFd !== undefined) {
        try {
          closeSync(lockFd)
          if (!uncertain) {
            unlinkSync(this.lock())
            this.syncDirectory()
          }
        } catch {
          this.poisoned = true
          // Preserve a visible uncertainty barrier if unlock durability failed.
          // An unavailable filesystem is never reported as a successful write.
          try {
            if (!existsSync(this.lock())) {
              const marker = openSync(this.lock(), "wx", 0o600)
              try {
                writeSync(marker, "uncertain authority cleanup\n")
                fsyncSync(marker)
              } finally {
                closeSync(marker)
              }
              this.syncDirectory()
            }
          } catch {
            /* In-process poisoned state still denies every later read. */
          }
          authorityDenied()
        }
      }
      // A pending return must not disclose success after an uncertain close.
      // The committed decision and the on-disk writer barrier remain intact.
      if (uncertain) authorityDenied()
    }
  }
}
