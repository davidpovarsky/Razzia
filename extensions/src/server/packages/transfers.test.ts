import { afterEach, describe, expect, it } from "vitest"
import { createHash, createHmac, randomUUID } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { PackageTransferStore, type PackageInstallIntent } from "./transfers"

const secret = "synthetic-package-transfer-test-key".repeat(2)
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex")
const roots: string[] = [],
  stores: PackageTransferStore[] = []
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tadazz-transfer-test-"))
  roots.push(root)
  const store = new PackageTransferStore(root, secret)
  stores.push(store)
  const bytes = Buffer.from(
    "synthetic archive bytes for transport validation only",
  )
  const owner = randomUUID(),
    key = randomUUID()
  const input = {
    totalBytes: bytes.length,
    sha256: digest(bytes),
    filename: "theme.tadazz",
    idempotencyKey: key,
  }
  const transfer = store.begin(owner, input)

  return { root, store, bytes, owner, input, transfer }
}
afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close()
  }
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe("MCP package staging", () => {
  it("binds upload retries to owner, size, hash and filename without accepting paths", () => {
    const f = setup()
    expect(f.store.begin(f.owner, f.input)).toEqual(f.transfer)
    expect(() =>
      f.store.begin(f.owner, { ...f.input, sha256: "a".repeat(64) }),
    ).toThrow("IDEMPOTENCY_CONFLICT")
    expect(() =>
      f.store.begin(f.owner, {
        ...f.input,
        filename: "../escape.tadazz",
        idempotencyKey: randomUUID(),
      }),
    ).toThrow("TRANSFER_INPUT")
    expect(() =>
      f.store.issueUploadTicket(randomUUID(), f.transfer.transferId),
    ).toThrow("NOT_FOUND")
  })
  it("accepts a hash-bound single transfer and rejects damaged/tampered tickets", () => {
    const f = setup(),
      ticket = f.store.issueUploadTicket(f.owner, f.transfer.transferId)
    expect(() => f.store.receiveTicket(ticket, Buffer.from("wrong"))).toThrow(
      "DIGEST_CHANGED",
    )
    expect(() => f.store.ticketUploadSize(`${ticket}extra`)).toThrow(
      "NOT_FOUND",
    )
    expect(f.store.receiveTicket(ticket, f.bytes)).toEqual({
      receivedBytes: f.bytes.length,
      complete: true,
    })
    expect(f.store.receiveTicket(ticket, f.bytes).complete).toBe(true)
  })
  it("resumes sequential chunks, checks replay bytes and rejects gaps and foreign owners", () => {
    const f = setup(),
      first = f.bytes.subarray(0, 20),
      rest = f.bytes.subarray(20)
    const chunk = {
      transferId: f.transfer.transferId,
      offset: 0,
      bytesBase64: first.toString("base64"),
      sha256: digest(first),
      idempotencyKey: randomUUID(),
    }
    expect(f.store.chunk(f.owner, chunk).receivedBytes).toBe(20)
    expect(f.store.chunk(f.owner, chunk).receivedBytes).toBe(20)
    expect(() => f.store.chunk(randomUUID(), chunk)).toThrow("NOT_FOUND")
    expect(() =>
      f.store.chunk(f.owner, {
        ...chunk,
        offset: 21,
        bytesBase64: rest.toString("base64"),
        sha256: digest(rest),
        idempotencyKey: randomUUID(),
      }),
    ).toThrow()
    expect(() =>
      f.store.chunk(f.owner, {
        ...chunk,
        bytesBase64: Buffer.from("different").toString("base64"),
        sha256: digest(Buffer.from("different")),
      }),
    ).toThrow("IDEMPOTENCY_CONFLICT")
    expect(
      f.store.chunk(f.owner, {
        ...chunk,
        offset: 20,
        bytesBase64: rest.toString("base64"),
        sha256: digest(rest),
        idempotencyKey: randomUUID(),
      }).complete,
    ).toBe(true)
  })
  it("does not invoke package preflight before completion; completed upload is replayed and staging bytes removed", () => {
    const f = setup(),
      uploadId = randomUUID()
    let calls = 0
    const upload = (bytes: Buffer) => {
      expect(bytes).toEqual(f.bytes)
      calls += 1

      return { uploadId }
    }
    const read = (id: string) => {
      expect(id).toBe(uploadId)

      return { uploadId }
    }
    expect(() =>
      f.store.complete({
        owner: f.owner,
        id: f.transfer.transferId,
        upload,
        read,
      }),
    ).toThrow("INCOMPLETE")
    expect(calls).toBe(0)
    f.store.receiveTicket(
      f.store.issueUploadTicket(f.owner, f.transfer.transferId),
      f.bytes,
    )
    expect(
      f.store.complete({
        owner: f.owner,
        id: f.transfer.transferId,
        upload,
        read,
      }),
    ).toEqual({ uploadId })
    expect(
      f.store.complete({
        owner: f.owner,
        id: f.transfer.transferId,
        upload,
        read,
      }),
    ).toEqual({ uploadId })
    expect(calls).toBe(1)
    expect(
      fs.existsSync(path.join(f.root, `${f.transfer.transferId}.part`)),
    ).toBe(false)
  })
  it("never treats renderer or upload access as permission to export package source", () => {
    const f = setup(),
      uploadId = randomUUID()
    const token = f.store.issueExportTicket(f.owner, {
      uploadId,
      sourceDigest: digest(f.bytes),
      revision: 2,
    })
    expect(f.store.readExportTicket(token)).toMatchObject({
      purpose: "package-export",
      owner: f.owner,
      uploadId,
      revision: 2,
    })
    const body = Buffer.from(
      JSON.stringify({
        tenant: f.owner,
        upload: uploadId,
        source: digest(f.bytes),
        build: "a".repeat(64),
        exp: Date.now() + 60_000,
      }),
    ).toString("base64url")
    const runtimeTicket = `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`
    expect(() => f.store.readExportTicket(runtimeTicket)).toThrow("NOT_FOUND")
    expect(() =>
      f.store.readExportTicket(
        f.store.issueUploadTicket(f.owner, f.transfer.transferId),
      ),
    ).toThrow("NOT_FOUND")
    expect(() => f.store.ticketUploadSize(token)).toThrow("NOT_FOUND")
  })
  it("records exact operation outcomes and leaves failed preconditions retryable", () => {
    const f = setup(),
      key = randomUUID(),
      input = digest(Buffer.from("operation"))
    let calls = 0,
      ready = false
    const guard = () => {
      if (!ready) {
        throw new Error("not ready")
      }
    }
    const action = () => {
      calls += 1

      return { count: calls }
    }
    expect(() =>
      f.store.operation({
        owner: f.owner,
        kind: "build",
        key,
        digest: input,
        action,
        precondition: guard,
      }),
    ).toThrow("not ready")
    ready = true
    expect(
      f.store.operation({
        owner: f.owner,
        kind: "build",
        key,
        digest: input,
        action,
        precondition: guard,
      }),
    ).toEqual({ count: 1 })
    expect(
      f.store.operation({
        owner: f.owner,
        kind: "build",
        key,
        digest: input,
        action,
        precondition: guard,
      }),
    ).toEqual({ count: 1 })
    expect(() =>
      f.store.operation({
        owner: f.owner,
        kind: "build",
        key,
        digest: "b".repeat(64),
        action,
      }),
    ).toThrow("IDEMPOTENCY_CONFLICT")
  })
  it("keeps save consent owned and exact, requires explicit approval and replays installed game IDs", () => {
    const f = setup(),
      selection = {
        uploadId: randomUUID(),
        revision: 2,
        sourceDigest: digest(f.bytes),
        buildDigest: "c".repeat(64),
        selectedContentIds: ["custom-theme", "game"],
        idempotencyKey: randomUUID(),
      }
    const request = f.store.installIntent(f.owner, selection)
    expect(f.store.installIntent(f.owner, selection)).toEqual(request)
    expect(
      f.store.readInstallIntent(f.owner, request.requestId).outcome,
    ).toBeNull()
    expect(() =>
      f.store.readInstallIntent(randomUUID(), request.requestId),
    ).toThrow("NOT_FOUND")
    expect(() =>
      f.store.installIntent(f.owner, { ...selection, revision: 3 }),
    ).toThrow("IDEMPOTENCY_CONFLICT")
    let calls = 0
    const action = () => {
      calls += 1

      return {
        uploadId: selection.uploadId,
        revision: 2,
        installedGameIds: ["game-id"],
      }
    }
    expect(
      f.store.approveInstall(f.owner, request.requestId, action)
        .installedGameIds,
    ).toEqual(["game-id"])
    f.store.approveInstall(f.owner, request.requestId, action)
    expect(calls).toBe(1)
  })
  it("installs an explicit authorized request once without recording reviewer or browser consent", () => {
    const f = setup()
    const input = {
      uploadId: randomUUID(),
      revision: 2,
      sourceDigest: digest(f.bytes),
      buildDigest: "a".repeat(64),
      selectedContentIds: ["custom-theme", "game"],
      idempotencyKey: randomUUID(),
    }
    let calls = 0
    const action = (selection: PackageInstallIntent) => {
      calls += 1
      expect(selection.sourceDigest).toBe(input.sourceDigest)
      expect(selection.buildDigest).toBe(input.buildDigest)

      return {
        uploadId: selection.uploadId,
        revision: selection.revision,
        installedGameIds: ["new-private-game"],
      }
    }
    const first = f.store.installAuthorized(f.owner, input, action)
    expect(first.installedGameIds).toEqual(["new-private-game"])
    expect(f.store.installAuthorized(f.owner, input, action)).toEqual(first)
    expect(calls).toBe(1)
    expect(
      f.store.db
        .prepare("SELECT COUNT(*) AS n FROM package_install_consents")
        .get()?.n,
    ).toBe(0)
    for (const changed of [
      { revision: 3 },
      { sourceDigest: "b".repeat(64) },
      { buildDigest: "c".repeat(64) },
      { selectedContentIds: ["game"] },
    ]) {
      expect(() =>
        f.store.installAuthorized(f.owner, { ...input, ...changed }, action),
      ).toThrow("IDEMPOTENCY_CONFLICT")
    }
    expect(calls).toBe(1)
  })
  it("resumes an interrupted direct installation using the same immutable intent", () => {
    const f = setup()
    const input = {
      uploadId: randomUUID(),
      revision: 2,
      sourceDigest: digest(f.bytes),
      buildDigest: null,
      selectedContentIds: ["game"],
      idempotencyKey: randomUUID(),
    }
    const result = {
      uploadId: input.uploadId,
      revision: 2,
      installedGameIds: ["one-reserved-game"],
    }
    let attempts = 0
    const native = () => {
      attempts += 1

      if (attempts === 1) {
        throw new Error("interrupted after native commit")
      }

      return result
    }
    expect(() => f.store.installAuthorized(f.owner, input, native)).toThrow(
      "interrupted",
    )
    expect(f.store.installAuthorized(f.owner, input, native)).toEqual(result)
    expect(f.store.installAuthorized(f.owner, input, native)).toEqual(result)
    expect(attempts).toBe(2)
    let foreignCalls = 0
    expect(() =>
      f.store.installAuthorized(randomUUID(), input, () => {
        foreignCalls += 1
        throw new Error("native ownership rejected")
      }),
    ).toThrow("ownership")
    expect(foreignCalls).toBe(1)
  })
  it("preserves the selection of a pre-upgrade pending install without inventing consent", () => {
    const f = setup()
    const input = {
      uploadId: randomUUID(),
      revision: 2,
      sourceDigest: digest(f.bytes),
      buildDigest: "c".repeat(64),
      selectedContentIds: ["custom-theme", "game"],
      idempotencyKey: randomUUID(),
    }
    const request = f.store.installIntent(f.owner, input)
    expect(() =>
      f.store.installAuthorized(
        f.owner,
        { ...input, selectedContentIds: ["game"] },
        () => {
          throw new Error("must not run")
        },
      ),
    ).toThrow("IDEMPOTENCY_CONFLICT")
    const result = {
      uploadId: input.uploadId,
      revision: 2,
      installedGameIds: ["private-game"],
    }
    expect(f.store.installAuthorized(f.owner, input, () => result)).toEqual(
      result,
    )
    expect(
      f.store.readInstallIntent(f.owner, request.requestId).outcome,
    ).toBeNull()
  })
})
