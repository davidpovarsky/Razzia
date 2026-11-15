import { DatabaseSync } from "node:sqlite"
import fs, { chmodSync, mkdirSync } from "node:fs"
import { basename, dirname, resolve, sep } from "node:path"
import { accountsEnabled } from "./account-scope"
import { spawnSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { tmpdir } from "node:os"
import { resolveConfigRoot } from "./config-scope"
import type { StartupOwnerSnapshot } from "@razzia/extensions/server"

function recoveryStat(file: string) {
  try {
    const stat = fs.lstatSync(file, { bigint: true })

    if (
      stat.isSymbolicLink() ||
      (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1n))
    ) {
      throw new Error("Unsafe startup owner metadata path")
    }

    return [
      stat.dev,
      stat.ino,
      stat.mode,
      stat.size,
      stat.mtimeNs,
      stat.ctimeNs,
    ]
      .map(String)
      .join(":")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null
    }

    throw error
  }
}

function validateOwnerWal(file: string, walSize: number) {
  if (walSize === 0) {
    return
  }

  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)

  try {
    const header = Buffer.alloc(32)

    if (fs.readSync(fd, header, 0, 32, 0) !== 32) {
      throw new Error("Invalid owner WAL header")
    }

    const magic = header.readUInt32BE(0),
      page = header.readUInt32BE(8)

    if (
      ![0x377f0682, 0x377f0683].includes(magic) ||
      header.readUInt32BE(4) !== 3007000 ||
      page < 512 ||
      page > 65536 ||
      page & (page - 1) ||
      (walSize - 32) % (page + 24)
    ) {
      throw new Error("Invalid or incomplete owner WAL")
    }

    let a = 0,
      b = 0
    const checksum = (data: Buffer) => {
      for (let i = 0; i < data.length; i += 8) {
        const first =
          magic === 0x377f0682 ? data.readUInt32LE(i) : data.readUInt32BE(i)
        const second =
          magic === 0x377f0682
            ? data.readUInt32LE(i + 4)
            : data.readUInt32BE(i + 4)
        a = (a + first + b) >>> 0
        b = (b + second + a) >>> 0
      }
    }
    checksum(header.subarray(0, 24))

    if (a !== header.readUInt32BE(24) || b !== header.readUInt32BE(28)) {
      throw new Error("Owner WAL header checksum mismatch")
    }

    const frame = Buffer.alloc(page + 24)
    let committed = true

    for (let offset = 32; offset < walSize; offset += frame.length) {
      if (fs.readSync(fd, frame, 0, frame.length, offset) !== frame.length) {
        throw new Error("Owner WAL frame is unavailable")
      }

      // SQLite WAL reset retains older-generation tail frames. Only the
      // current salt/checksum chain is active (sqlite.org/fileformat2.html).
      if (!frame.subarray(8, 16).equals(header.subarray(16, 24))) {
        if (!committed) {
          throw new Error("Owner WAL has an incomplete transaction")
        }

        return
      }

      if (frame.readUInt32BE(0) === 0) {
        throw new Error("Invalid owner WAL page")
      }

      checksum(frame.subarray(0, 8))
      checksum(frame.subarray(24))

      if (a !== frame.readUInt32BE(16) || b !== frame.readUInt32BE(20)) {
        throw new Error("Owner WAL frame checksum mismatch")
      }

      committed = frame.readUInt32BE(4) !== 0
    }

    if (!committed) {
      throw new Error("Owner WAL has an incomplete transaction")
    }
  } finally {
    fs.closeSync(fd)
  }
}

const OWNER_COPY_LIMIT = 16 * 1024 * 1024
function ownerCaptureChanged(): never {
  const error = new Error("Startup owner metadata changed during capture")

  Object.defineProperty(error, "code", {
    value: "TADAZZ_OWNER_CAPTURE_CHANGED",
  })

  throw error
}
function captureOwnerFile(file: string, budget: { remaining: number }) {
  const before = recoveryStat(file)

  if (before === null) {
    return { stamp: before, bytes: null, sha256: null }
  }

  const info = fs.lstatSync(file, { bigint: true })

  if (!info.isFile() || info.size > BigInt(budget.remaining)) {
    throw new Error("Owner snapshot input exceeds its private capture bound")
  }

  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)

  try {
    const opened = fs.fstatSync(fd, { bigint: true })

    if (opened.dev !== info.dev || opened.ino !== info.ino) {
      ownerCaptureChanged()
    }

    const bytes = Buffer.alloc(Number(info.size))
    let offset = 0

    while (offset < bytes.length) {
      const count = fs.readSync(
        fd,
        bytes,
        offset,
        bytes.length - offset,

        offset,
      )

      if (!count) {
        ownerCaptureChanged()
      }

      offset += count
    }

    const after = fs.fstatSync(fd, { bigint: true })

    if (
      after.size !== info.size ||
      after.mtimeNs !== info.mtimeNs ||
      after.ctimeNs !== info.ctimeNs ||
      recoveryStat(file) !== before
    ) {
      ownerCaptureChanged()
    }

    budget.remaining -= bytes.length

    return {
      stamp: before,
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }
  } finally {
    fs.closeSync(fd)
  }
}

// Trusted native source only. SQLite opens an isolated disposable copy, never
// the source DB/WAL/SHM. At most 16 MiB of metadata and three capture attempts.
//
export function readStartupOwnerSnapshot(): StartupOwnerSnapshot {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return captureStartupOwners()
    } catch (error) {
      if (
        (error as { code?: string }).code !== "TADAZZ_OWNER_CAPTURE_CHANGED" ||
        attempt === 2
      ) {
        throw error
      }
    }
  }
}

function captureStartupOwners(): StartupOwnerSnapshot {
  const configuredRoot = resolveConfigRoot()
  const store = resolve(
    process.env.CONFIG_PATH ?? resolve(process.cwd(), "config"),
    "tadazz-accounts.sqlite",
  )
  let existing = configuredRoot

  while (recoveryStat(existing) === null && dirname(existing) !== existing) {
    existing = dirname(existing)
  }

  if (
    fs.realpathSync(existing) !== existing ||
    (recoveryStat(configuredRoot) !== null &&
      !fs.lstatSync(configuredRoot).isDirectory())
  ) {
    throw new Error("Unsafe configured startup root")
  }

  const files = [
    configuredRoot,
    store,
    `${store}-wal`,
    `${store}-shm`,
    `${store}-journal`,
  ]
  const capture = () =>
    files.map((file, i) => {
      const stamp = recoveryStat(file)

      return i === 0 && stamp !== null
        ? stamp.split(":").slice(0, 3).join(":")
        : stamp
    })
  const before = capture()
  const assertUnchanged = () => {
    if (JSON.stringify(capture()) !== JSON.stringify(before)) {
      throw new Error("Startup owner metadata changed")
    }
  }

  if (before[1] === null) {
    if (
      before.slice(2).some((value) => value !== null) ||
      recoveryStat(resolve(configuredRoot, "tenants")) !== null ||
      (dirname(store) !== configuredRoot &&
        recoveryStat(resolve(configuredRoot, "tadazz-accounts.sqlite")) !==
          null)
    ) {
      throw new Error("Missing account metadata with retained tenant namespace")
    }

    return Object.freeze({
      configuredRoot,
      ownerIds: Object.freeze([]),
      mode: "legacy-global-only",

      assertUnchanged: () => {
        assertUnchanged()

        if (recoveryStat(resolve(configuredRoot, "tenants")) !== null) {
          throw new Error("Tenant namespace appeared after legacy admission")
        }
      },
    })
  }

  if (dirname(store) !== configuredRoot) {
    throw new Error("Conflicting native account store root")
  }

  if (!fs.lstatSync(store).isFile()) {
    throw new Error("Account metadata is not a regular file")
  }

  const captureFiles = () => {
    const budget = { remaining: OWNER_COPY_LIMIT }

    return files.slice(1).map((file) => captureOwnerFile(file, budget))
  }
  const images = captureFiles()

  if (
    JSON.stringify(images.map((image) => image.stamp)) !==
    JSON.stringify(before.slice(1))
  ) {
    ownerCaptureChanged()
  }

  const header = images[0].bytes

  if (
    !header ||
    header.length < 100 ||
    header.subarray(0, 16).toString("binary") !== "SQLite format 3\0"
  ) {
    throw new Error("Invalid account database header")
  }

  if (images[3].bytes && images[3].bytes.length !== 0) {
    throw new Error("Account rollback journal unresolved")
  }

  if (![1, 2].includes(header[18]) || header[18] !== header[19]) {
    throw new Error("Unsupported account database mode")
  }

  const signature = images.map(({ stamp, sha256 }) => ({ stamp, sha256 }))
  const revalidateContent = () => {
    const now = captureFiles().map(({ stamp, sha256 }) => ({ stamp, sha256 }))

    if (
      JSON.stringify(now) !== JSON.stringify(signature) ||
      capture()[0] !== before[0]
    ) {
      ownerCaptureChanged()
    }
  }
  const parent = fs.realpathSync(tmpdir()),
    token = randomUUID()

  if (parent === configuredRoot || parent.startsWith(configuredRoot + sep)) {
    throw new Error("Private owner snapshot must be outside the source root")
  }

  const privateRoot = fs.mkdtempSync(resolve(parent, "tadazz-owner-snapshot-"))
  const privateStamp = recoveryStat(privateRoot)

  if (privateStamp === null) {
    throw new Error("Private owner snapshot disappeared")
  }

  const pin = privateStamp.split(":").slice(0, 3).join(":")
  const marker = resolve(privateRoot, ".owner")
  fs.writeFileSync(marker, token, { flag: "wx", mode: 0o600 })

  const cleanupPrivateSnapshot = () => {
    if (
      dirname(privateRoot) !== parent ||
      !basename(privateRoot).startsWith("tadazz-owner-snapshot-") ||
      fs.realpathSync(privateRoot) !== privateRoot ||
      recoveryStat(privateRoot)?.split(":").slice(0, 3).join(":") !== pin ||
      fs.lstatSync(marker).isSymbolicLink() ||
      fs.readFileSync(marker, "utf8") !== token
    ) {
      throw new Error("Refusing non-owned private snapshot cleanup")
    }

    fs.rmSync(privateRoot, { recursive: true })
  }

  try {
    const privateStore = resolve(privateRoot, "accounts.sqlite")
    fs.writeFileSync(privateStore, header, { flag: "wx", mode: 0o600 })

    if (images[1].bytes !== null) {
      fs.writeFileSync(`${privateStore}-wal`, images[1].bytes, {
        flag: "wx",
        mode: 0o600,
      })
      validateOwnerWal(`${privateStore}-wal`, images[1].bytes.length)
    }

    // SHM is intentionally not copied. The private SQLite connection builds its
    // own WAL index and can create disposable sidecars only inside privateRoot.

    revalidateContent()
    const read = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
    import { DatabaseSync } from 'node:sqlite';
    let db;
    try {
      db = new DatabaseSync(process.argv[1], { readOnly: true, timeout: 3000 });
      if (db.prepare('PRAGMA quick_check').all().some(row => row.quick_check !== 'ok')) throw Error('Account DB integrity failure');

      const schema = db.prepare("SELECT type FROM sqlite_schema WHERE name='accounts'").all();
      if (schema.length !== 1 || schema[0].type !== 'table') throw Error('Missing accounts table');
      const rows = db.prepare('SELECT id FROM accounts').all();
      db.close(); db = undefined; process.stdout.write(JSON.stringify(rows));
    } catch (error) { process.stderr.write(String(error)); process.exitCode = 1; }
    finally { if (db) { try { db.close(); } catch { process.exitCode = 1; } } }
  `,
        privateStore,
      ],
      {
        encoding: "utf8",
        env: { TMPDIR: privateRoot, TMP: privateRoot, TEMP: privateRoot },
        timeout: 10000,
        maxBuffer: 16 * 1024 * 1024,
      },
    )
    revalidateContent()

    if (read.error || read.status !== 0 || read.signal) {
      throw new Error("Read-only account owner snapshot failed")
    }

    const rows: unknown = JSON.parse(read.stdout)

    if (!Array.isArray(rows)) {
      throw new Error("Invalid owner snapshot result")
    }

    const seen = new Set<string>(),
      ownerIds: string[] = []
    for (const row of rows as unknown[]) {
      const id =
        typeof row === "object" && row !== null && "id" in row
          ? row.id
          : undefined

      if (
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(id) ||
        seen.has(id.toLowerCase())
      ) {
        throw new Error("Invalid, duplicate or conflicting recovery owner")
      }

      seen.add(id.toLowerCase())
      ownerIds.push(id)
    }
    // Root admission also precedes the retained C1 startup hook. Missing roots
    // for never-used accounts are structural absence, not an invitation to scan.
    const directories = [
      resolve(configuredRoot, "tenants"),

      ...ownerIds.map((id) => resolve(configuredRoot, "tenants", id)),
    ]
    const rootPins = () =>
      directories.map((directory) => {
        const stamp = recoveryStat(directory)

        if (
          stamp !== null &&
          (!fs.lstatSync(directory).isDirectory() ||
            fs.realpathSync(directory) !== directory)
        ) {
          throw new Error("Unsafe known recovery root")
        }

        return stamp?.split(":").slice(0, 3).join(":") ?? null
      })
    const admittedRoots = rootPins()

    return Object.freeze({
      configuredRoot,
      ownerIds: Object.freeze(ownerIds),
      mode: "accounts",
      assertUnchanged: () => {
        assertUnchanged()

        if (JSON.stringify(rootPins()) !== JSON.stringify(admittedRoots)) {
          throw new Error("Known recovery root changed after admission")
        }
      },
    })
  } finally {
    cleanupPrivateSnapshot()
  }
}

let db: DatabaseSync | undefined = undefined

export function getAccountDb(): DatabaseSync {
  if (!accountsEnabled()) {
    throw new Error("Accounts are disabled")
  }

  if (db) {
    return db
  }

  const base = process.env.CONFIG_PATH ?? resolve(process.cwd(), "config")
  const path = resolve(base, "tadazz-accounts.sqlite")
  mkdirSync(dirname(path), { recursive: true })
  // Restrict SQLite sidecar creation without changing uploaded media permissions.
  const priorUmask = process.platform === "win32" ? null : process.umask(0o077)

  try {
    db = new DatabaseSync(path, { timeout: 3000 })
    db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")

    if (process.platform !== "win32") {
      for (const filename of [path, `${path}-wal`, `${path}-shm`]) {
        try {
          chmodSync(filename, 0o600)
        } catch {
          /* Sidecar may not yet exist */
        }
      }
    }

    db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      verified_at INTEGER,
      created_at INTEGER NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS codes (
      user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      digest TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      sent_at INTEGER NOT NULL,
      PRIMARY KEY(user_id,purpose)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS limits (
      key TEXT PRIMARY KEY,
      period_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL
    );
  `)
  } finally {
    if (priorUmask !== null) {
      process.umask(priorUmask)
    }
  }

  if (process.platform !== "win32") {
    try {
      chmodSync(path, 0o600)
    } catch {
      /* Restricted volume */
    }
  }

  return db
}

export function checkAccountConfiguration(): void {
  if (!accountsEnabled()) {
    return
  }

  if ((process.env.JWT_SECRET?.length ?? 0) < 32) {
    throw new Error("A persistent JWT_SECRET is required for account mode")
  }

  if (!process.env.RESEND_API_KEY || !process.env.TADAZZ_AUTH_EMAIL_FROM) {
    throw new Error("Resend email sending must be configured for account mode")
  }

  getAccountDb()
}

/** Release the local DB handle for tests and controlled maintenance. */
export function closeAccountDb(): void {
  db?.close()
  db = undefined
}
