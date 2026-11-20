import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto"
import { PACKAGE_LIMITS } from "../../core/packages/manifest"
import { PackageError } from "./error"

const CHUNK_BYTES = 24_000
const UPLOAD_TTL = 24 * 60 * 60_000
const TICKET_TTL = 300_000
const hex = /^[a-f0-9]{64}$/u
const keyPattern = /^[A-Za-z0-9_-]{22,64}$/u
interface TransferRow {
  id: string
  owner: string
  filename: string
  bytes: number
  digest: string
  received: number
  expires: number
  begin_key: string
  upload: string | null
}
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex")
const denied = () => new PackageError("PACKAGE_NOT_FOUND", 404)
export interface PackageInstallIntent {
  uploadId: string
  revision: number
  sourceDigest: string
  buildDigest: string | null
  selectedContentIds: string[]
}

/** Durable staging only. Bytes cannot execute or enter a library until the
 * authenticated complete operation passes the ordinary PackageStore preflight.
 * The optional upload ticket grants only one exact hash/size write, never reads. */
export class PackageTransferStore {
  readonly db: DatabaseSync
  readonly root: string
  private readonly secret: string

  constructor(root: string, secret: string) {
    this.root = root
    this.secret = secret
    fs.mkdirSync(root, { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path.join(root, "transfers.sqlite"))
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS transfers(id TEXT PRIMARY KEY,owner TEXT NOT NULL,
        filename TEXT NOT NULL,bytes INTEGER NOT NULL,digest TEXT NOT NULL,
        received INTEGER NOT NULL,expires INTEGER NOT NULL,begin_key TEXT NOT NULL,
        upload TEXT,UNIQUE(owner,begin_key));
      CREATE TABLE IF NOT EXISTS transfer_chunks(transfer_id TEXT NOT NULL,
        offset INTEGER NOT NULL,bytes INTEGER NOT NULL,digest TEXT NOT NULL,
        request_key TEXT NOT NULL,PRIMARY KEY(transfer_id,offset),
        UNIQUE(transfer_id,request_key));
      CREATE TABLE IF NOT EXISTS package_tool_operations(owner TEXT NOT NULL,
        kind TEXT NOT NULL,request_key TEXT NOT NULL,digest TEXT NOT NULL,
        outcome TEXT,PRIMARY KEY(owner,kind,request_key));
      CREATE TABLE IF NOT EXISTS package_install_consents(id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,request_key TEXT NOT NULL,digest TEXT NOT NULL,
        selection TEXT NOT NULL,expires INTEGER NOT NULL,outcome TEXT,
        UNIQUE(owner,request_key));`)
  }
  close() {
    this.db.close()
  }
  installIntent(
    owner: string,
    input: PackageInstallIntent & { idempotencyKey: string },
  ) {
    const { idempotencyKey, ...selection } = input
    if (!keyPattern.test(idempotencyKey))
      throw new PackageError("PACKAGE_TRANSFER_INPUT", 422)
    const digest = sha(Buffer.from(JSON.stringify(selection)))
    const old = this.db
      .prepare(
        "SELECT id,digest,expires FROM package_install_consents WHERE owner=? AND request_key=?",
      )
      .get(owner, idempotencyKey) as
      { id: string; digest: string; expires: number } | undefined
    if (old) {
      if (old.digest !== digest)
        throw new PackageError("PACKAGE_IDEMPOTENCY_CONFLICT", 409)
      if (old.expires < Date.now()) throw denied()
      return { requestId: old.id }
    }
    const id = randomUUID()
    this.db
      .prepare("INSERT INTO package_install_consents VALUES(?,?,?,?,?,?,NULL)")
      .run(
        id,
        owner,
        idempotencyKey,
        digest,
        JSON.stringify(selection),
        Date.now() + UPLOAD_TTL,
      )
    return { requestId: id }
  }
  readInstallIntent(owner: string, id: string) {
    const row = this.db
      .prepare(
        "SELECT selection,expires,outcome FROM package_install_consents WHERE owner=? AND id=?",
      )
      .get(owner, id) as
      { selection: string; expires: number; outcome: string | null } | undefined
    if (!row || row.expires < Date.now()) throw denied()
    return {
      requestId: id,
      ...(JSON.parse(row.selection) as PackageInstallIntent),
      expiresAt: new Date(row.expires).toISOString(),
      outcome: row.outcome
        ? (JSON.parse(row.outcome) as {
            uploadId: string
            revision: number
            installedGameIds: string[]
          })
        : null,
    }
  }
  approveInstall(
    owner: string,
    id: string,
    action: (selection: PackageInstallIntent) => {
      uploadId: string
      revision: number
      installedGameIds: string[]
    },
  ) {
    const intent = this.readInstallIntent(owner, id)
    if (intent.outcome) return intent.outcome
    // PackageStore.install has its own durable write-ahead recovery and returns the
    // same installed games on retry; no duplicate native game is created here.
    const result = action(intent)
    this.db
      .prepare(
        "UPDATE package_install_consents SET outcome=? WHERE owner=? AND id=?",
      )
      .run(JSON.stringify(result), owner, id)
    return result
  }
  operation<T>(
    owner: string,
    kind: string,
    key: string,
    digest: string,
    action: () => T,
    precondition?: () => void,
  ): T {
    if (!keyPattern.test(key) || !hex.test(digest))
      throw new PackageError("PACKAGE_TRANSFER_INPUT", 422)
    const old = this.db
      .prepare(
        "SELECT digest,outcome FROM package_tool_operations WHERE owner=? AND kind=? AND request_key=?",
      )
      .get(owner, kind, key) as
      { digest: string; outcome: string | null } | undefined
    if (old) {
      if (old.digest !== digest)
        throw new PackageError("PACKAGE_IDEMPOTENCY_CONFLICT", 409)
      // A process failure between two stores is uncertain, never permission to replay a mutation blindly.
      if (old.outcome === null)
        throw new PackageError("PACKAGE_OPERATION_UNCERTAIN", 409)
      return JSON.parse(old.outcome) as T
    }
    precondition?.()
    this.db
      .prepare("INSERT INTO package_tool_operations VALUES(?,?,?,?,NULL)")
      .run(owner, kind, key, digest)
    try {
      const result = action()
      this.db
        .prepare(
          "UPDATE package_tool_operations SET outcome=? WHERE owner=? AND kind=? AND request_key=?",
        )
        .run(JSON.stringify(result), owner, kind, key)
      return result
    } catch (error) {
      // Keep the intent: callers must inspect status after any uncertain mutation.
      throw error
    }
  }
  private file(id: string) {
    if (!/^[a-f0-9-]{36}$/u.test(id)) throw denied()
    return path.join(this.root, `${id}.part`)
  }
  private row(owner: string, id: string): TransferRow {
    const row = this.db
      .prepare("SELECT * FROM transfers WHERE owner=? AND id=?")
      .get(owner, id) as unknown as TransferRow | undefined
    if (!row || row.expires < Date.now()) throw denied()
    return row
  }
  private sweep(owner: string) {
    const expired = this.db
      .prepare("SELECT id FROM transfers WHERE owner=? AND expires<?")
      .all(owner, Date.now()) as Array<{ id: string }>
    for (const { id } of expired) {
      fs.rmSync(this.file(id), { force: true })
      this.db.prepare("DELETE FROM transfer_chunks WHERE transfer_id=?").run(id)
      this.db
        .prepare("DELETE FROM transfers WHERE owner=? AND id=?")
        .run(owner, id)
    }
  }
  begin(
    owner: string,
    input: {
      filename: string
      totalBytes: number
      sha256: string
      idempotencyKey: string
    },
  ) {
    if (
      !owner ||
      !keyPattern.test(input.idempotencyKey) ||
      !hex.test(input.sha256) ||
      !Number.isSafeInteger(input.totalBytes) ||
      input.totalBytes < 1 ||
      input.totalBytes > PACKAGE_LIMITS.archiveBytes ||
      input.filename.length < 8 ||
      input.filename.length > 160 ||
      !/^[^/\\:\u0000-\u001f\u007f]+\.tadazz$/u.test(input.filename)
    ) {
      throw new PackageError("PACKAGE_TRANSFER_INPUT", 422)
    }
    this.sweep(owner)
    const previous = this.db
      .prepare("SELECT * FROM transfers WHERE owner=? AND begin_key=?")
      .get(owner, input.idempotencyKey) as unknown as TransferRow | undefined
    if (previous) {
      if (
        previous.bytes !== input.totalBytes ||
        previous.digest !== input.sha256 ||
        previous.filename !== input.filename
      ) {
        throw new PackageError("PACKAGE_IDEMPOTENCY_CONFLICT", 409)
      }
      return this.describe(previous)
    }
    const count = this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM transfers WHERE owner=? AND upload IS NULL",
      )
      .get(owner) as { count: number }
    if (count.count >= 3) throw new PackageError("PACKAGE_QUOTA", 413)
    const row: TransferRow = {
      id: randomUUID(),
      owner,
      filename: input.filename,
      bytes: input.totalBytes,
      digest: input.sha256,
      received: 0,
      expires: Date.now() + UPLOAD_TTL,
      begin_key: input.idempotencyKey,
      upload: null,
    }
    fs.writeFileSync(this.file(row.id), Buffer.alloc(0), {
      flag: "wx",
      mode: 0o600,
    })
    try {
      this.db
        .prepare("INSERT INTO transfers VALUES(?,?,?,?,?,?,?,?,NULL)")
        .run(
          row.id,
          row.owner,
          row.filename,
          row.bytes,
          row.digest,
          0,
          row.expires,
          row.begin_key,
        )
    } catch (error) {
      fs.rmSync(this.file(row.id), { force: true })
      throw error
    }
    return this.describe(row)
  }
  private describe(row: TransferRow) {
    return {
      transferId: row.id,
      totalBytes: row.bytes,
      receivedBytes: row.received,
      chunkBytes: CHUNK_BYTES,
      expiresAt: new Date(row.expires).toISOString(),
    }
  }
  issueUploadTicket(owner: string, id: string) {
    const row = this.row(owner, id)
    const body = Buffer.from(
      JSON.stringify({
        v: 1,
        id,
        owner,
        digest: row.digest,
        bytes: row.bytes,
        exp: Math.min(row.expires, Date.now() + TICKET_TTL),
      }),
    ).toString("base64url")
    return `${body}.${createHmac("sha256", this.secret).update(`package-upload:${body}`).digest("base64url")}`
  }
  private ticket(token: string) {
    if (token.length > 2000) throw denied()
    const parts = token.split(".")
    if (parts.length !== 2) throw denied()
    const expected = createHmac("sha256", this.secret)
      .update(`package-upload:${parts[0]}`)
      .digest()
    const actual = Buffer.from(parts[1], "base64url")
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw denied()
    const payload = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    ) as {
      v: number
      id: string
      owner: string
      digest: string
      bytes: number
      exp: number
    }
    if (
      payload.v !== 1 ||
      !Number.isFinite(payload.exp) ||
      payload.exp < Date.now() ||
      payload.exp > Date.now() + TICKET_TTL
    )
      throw denied()
    const row = this.row(payload.owner, payload.id)
    if (row.digest !== payload.digest || row.bytes !== payload.bytes)
      throw denied()
    return row
  }
  receiveTicket(token: string, bytes: Buffer) {
    const row = this.ticket(token)
    if (bytes.length !== row.bytes || sha(bytes) !== row.digest)
      throw new PackageError("PACKAGE_DIGEST_CHANGED", 409)
    if (row.upload) return { receivedBytes: row.bytes, complete: true }
    if (row.received && row.received !== row.bytes)
      throw new PackageError("PACKAGE_TRANSFER_OFFSET", 409)
    const fd = fs.openSync(this.file(row.id), "r+")
    try {
      fs.writeFileSync(fd, bytes)
      fs.ftruncateSync(fd, bytes.length)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    this.db
      .prepare(
        "UPDATE transfers SET received=? WHERE id=? AND owner=? AND upload IS NULL",
      )
      .run(bytes.length, row.id, row.owner)
    return { receivedBytes: bytes.length, complete: true }
  }
  ticketUploadSize(token: string) {
    return this.ticket(token).bytes
  }
  issueExportTicket(
    owner: string,
    input: { uploadId: string; sourceDigest: string; revision: number },
  ) {
    const body = Buffer.from(
      JSON.stringify({
        purpose: "package-export",
        owner,
        ...input,
        exp: Date.now() + TICKET_TTL,
      }),
    ).toString("base64url")
    return `${body}.${createHmac("sha256", this.secret).update(`package-export:${body}`).digest("base64url")}`
  }
  readExportTicket(token: string) {
    if (token.length > 2000) throw denied()
    const parts = token.split(".")
    if (parts.length !== 2) throw denied()
    const expected = createHmac("sha256", this.secret)
      .update(`package-export:${parts[0]}`)
      .digest()
    const actual = Buffer.from(parts[1], "base64url")
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw denied()
    const payload = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    ) as {
      purpose: string
      owner: string
      uploadId: string
      sourceDigest: string
      revision: number
      exp: number
    }
    if (
      payload.purpose !== "package-export" ||
      typeof payload.owner !== "string" ||
      !/^[a-f0-9-]{36}$/u.test(payload.uploadId) ||
      !hex.test(payload.sourceDigest) ||
      !Number.isSafeInteger(payload.revision) ||
      payload.revision < 1 ||
      !Number.isFinite(payload.exp) ||
      payload.exp < Date.now() ||
      payload.exp > Date.now() + TICKET_TTL
    )
      throw denied()
    return payload
  }
  chunk(
    owner: string,
    input: {
      transferId: string
      offset: number
      bytesBase64: string
      sha256: string
      idempotencyKey: string
    },
  ) {
    const row = this.row(owner, input.transferId)
    const bytes = Buffer.from(input.bytesBase64, "base64")
    if (
      !keyPattern.test(input.idempotencyKey) ||
      !hex.test(input.sha256) ||
      input.bytesBase64 !== bytes.toString("base64") ||
      bytes.length < 1 ||
      bytes.length > CHUNK_BYTES ||
      sha(bytes) !== input.sha256 ||
      !Number.isSafeInteger(input.offset) ||
      input.offset < 0 ||
      input.offset + bytes.length > row.bytes
    )
      throw new PackageError("PACKAGE_TRANSFER_INPUT", 422)
    const previous = this.db
      .prepare(
        "SELECT * FROM transfer_chunks WHERE transfer_id=? AND (offset=? OR request_key=?)",
      )
      .all(row.id, input.offset, input.idempotencyKey) as Array<{
      offset: number
      bytes: number
      digest: string
      request_key: string
    }>
    if (previous.length) {
      if (
        previous.length !== 1 ||
        previous[0].offset !== input.offset ||
        previous[0].bytes !== bytes.length ||
        previous[0].digest !== input.sha256 ||
        previous[0].request_key !== input.idempotencyKey
      ) {
        throw new PackageError("PACKAGE_IDEMPOTENCY_CONFLICT", 409)
      }
      return {
        transferId: row.id,
        receivedBytes: row.received,
        complete: row.received === row.bytes,
      }
    }
    if (row.upload || input.offset !== row.received)
      throw new PackageError("PACKAGE_TRANSFER_OFFSET", 409)
    const fd = fs.openSync(this.file(row.id), "r+")
    try {
      if (
        fs.writeSync(fd, bytes, 0, bytes.length, input.offset) !== bytes.length
      )
        throw new PackageError("PACKAGE_TRANSFER_WRITE", 409)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    this.db.exec("BEGIN IMMEDIATE")
    try {
      const changed = this.db
        .prepare(
          "UPDATE transfers SET received=? WHERE id=? AND owner=? AND received=? AND upload IS NULL",
        )
        .run(input.offset + bytes.length, row.id, owner, input.offset)
      if (changed.changes !== 1)
        throw new PackageError("PACKAGE_TRANSFER_OFFSET", 409)
      this.db
        .prepare("INSERT INTO transfer_chunks VALUES(?,?,?,?,?)")
        .run(
          row.id,
          input.offset,
          bytes.length,
          input.sha256,
          input.idempotencyKey,
        )
      this.db.exec("COMMIT")
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
    return {
      transferId: row.id,
      receivedBytes: input.offset + bytes.length,
      complete: input.offset + bytes.length === row.bytes,
    }
  }
  complete<T extends { uploadId: string }>(
    owner: string,
    id: string,
    upload: (bytes: Buffer, key: string) => T,
    read: (uploadId: string) => T,
  ): T {
    const row = this.row(owner, id)
    if (row.upload) return read(row.upload)
    if (row.received !== row.bytes)
      throw new PackageError("PACKAGE_TRANSFER_INCOMPLETE", 409)
    const bytes = fs.readFileSync(this.file(id))
    if (bytes.length !== row.bytes || sha(bytes) !== row.digest)
      throw new PackageError("PACKAGE_DIGEST_CHANGED", 409)
    // PackageStore's durable idempotency handles a crash after upload but before this link.
    const result = upload(bytes, `mcp-package-${row.id}`)
    this.db
      .prepare("UPDATE transfers SET upload=? WHERE id=? AND owner=?")
      .run(result.uploadId, id, owner)
    fs.rmSync(this.file(id), { force: true })
    return result
  }
}
