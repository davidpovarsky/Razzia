import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import {
  capabilityHash,
  digest,
  type OperationInput,
  type Receipt,
  type VerifiedServiceContext,
} from "../../src/server/phone-lifecycle-v2/contracts"
import { PrototypeStore } from "../../src/server/phone-lifecycle-v2/store"
import { ServiceAuthorityWriter } from "../../src/server/phone-lifecycle-v2/auth/authority-store"
import { PrivateAuthorityFiles } from "../../src/server/phone-lifecycle-v2/auth/private-authority-files"
import type { ServiceCredentialBinding } from "../../src/server/phone-lifecycle-v2/auth/contracts"

const roots: string[] = []
const capability = "a".repeat(64)

function privateRoot() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "phone-receipt-boundary-")),
  )
  roots.push(root)
  chmodSync(root, 0o700)
  writeFileSync(
    join(root, "PHONE_V2A_SYNTHETIC_ONLY"),
    "synthetic-v2a-only\n",
    { mode: 0o600 },
  )

  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe("Phone persisted receipt boundaries", () => {
  it("replays all three real SQLite receipt routes unchanged and rejects malformed cached field types", () => {
    const root = privateRoot()
    const context: VerifiedServiceContext = {
      verified: true,
      owner: "receipt_owner",
      issuerSid: "receipt_issuer",
      game: "receipt_game",
      provider: "receipt_provider",
      service: "receipt_service",
      executorId: "receipt_executor",
      actions: ["register", "poll", "answer", "hangup"],
      expiresAt: Date.now() + 60_000,
    }
    const store = new PrototypeStore(root, context, (current, action) =>
      current.actions.includes(action),
    )
    const db = new DatabaseSync(join(root, "phone-lifecycle-v2a.sqlite"))

    try {
      const input = {
        requestId: "register_1",
        callerHash: digest("synthetic-caller"),
        referenceHash: digest("synthetic-reference"),
        capabilityHash: capabilityHash(capability),
        expectedPredecessor: 0,
        fingerprint: digest("synthetic-registration"),
      }
      const reservation = store.reserveRegistration(context, input)

      if (reservation.kind !== "reserved") {
        throw new Error("Expected the actual reservation")
      }

      const registered: Receipt = {
        ok: true,
        status: "registered",
        registrationId: reservation.row.registration_id,
        generation: reservation.row.generation,
        rosterPlayerId: "roster_1",
        clientId: "client_1",
      }
      expect(
        store.completeRegistration(context, reservation, registered),
      ).toEqual(registered)
      const operation: OperationInput = {
        requestId: input.requestId,
        registrationId: reservation.row.registration_id,
        generation: reservation.row.generation,
        capability,
        operationId: "poll_1",
        action: "poll",
      }
      expect(store.reserveOperation(context, operation).kind).toBe("pending")
      const polled: Receipt = {
        ok: true,
        status: "poll",
        epoch: 4,
        points: 10,
        accepted: false,
        answered: false,
      }
      expect(store.completeOperation(context, operation, polled)).toEqual(
        polled,
      )
      const denialInput = {
        ...input,
        requestId: "register_denied",
        callerHash: digest("other-caller"),
        referenceHash: digest("other-reference"),
        expectedPredecessor: 2,
        fingerprint: digest("synthetic-denial"),
      }
      expect(store.reserveRegistration(context, denialInput)).toEqual({
        kind: "receipt",
        receipt: { ok: false, status: "predecessor_conflict" },
      })
      const routes = [
        {
          table: "registrations",
          key: "request_id",
          id: input.requestId,
          receipt: registered,
          replay: () => store.reserveRegistration(context, input),
        },
        {
          table: "registration_denials",
          key: "request_id",
          id: denialInput.requestId,
          receipt: { ok: false, status: "predecessor_conflict" },
          replay: () => store.reserveRegistration(context, denialInput),
        },
        {
          table: "operations",
          key: "operation_id",
          id: operation.operationId,
          receipt: polled,
          replay: () => store.reserveOperation(context, operation),
        },
      ]
      for (const route of routes) {
        expect(route.replay()).toMatchObject({
          kind: "receipt",
          receipt: route.receipt,
        })
        const read = db.prepare(
          `SELECT receipt FROM ${route.table} WHERE ${route.key}=?`,
        )
        const write = db.prepare(
          `UPDATE ${route.table} SET receipt=? WHERE ${route.key}=?`,
        )
        const original = read.get(route.id)?.receipt
        expect(original).toBe(JSON.stringify(route.receipt))

        if (typeof original !== "string") {
          throw new Error("Expected the persisted receipt")
        }

        for (const invalid of [
          "null",
          "[]",
          '{"ok":"true","status":"registered"}',
          '{"ok":true,"status":"registered","generation":"1"}',
          '{"ok":true,"status":"poll","accepted":"false"}',
        ]) {
          write.run(invalid, route.id)
          expect(route.replay).toThrow("receipt_invalid")
          expect(read.get(route.id)?.receipt).toBe(invalid)
        }
        write.run(original, route.id)
        expect(route.replay()).toMatchObject({
          kind: "receipt",
          receipt: route.receipt,
        })
      }
      expect(
        db
          .prepare(
            "SELECT generation,state FROM registrations WHERE request_id=?",
          )
          .get(input.requestId),
      ).toMatchObject({ generation: 1, state: "ACTIVE" })
    } finally {
      db.close()
      store.close()
    }
  })

  it("replays a real authority receipt without redisclosing its credential and rejects a coerced state", () => {
    const root = privateRoot()
    const files = new PrivateAuthorityFiles(root)
    const writer = new ServiceAuthorityWriter(files)
    const check = () => undefined
    writer.initialize(check)
    const binding: ServiceCredentialBinding = {
      owner: "receipt_owner",
      game: "receipt_game",
      provider: "receipt_provider",
      service: "receipt_service",
      version: 1,
      issuerSid: "receipt_issuer",
      executorId: "receipt_executor",
      expiresAt: Date.now() + 60_000,
      initialActions: ["register", "poll", "answer", "hangup"],
    }
    const request = { requestId: "authority_issue_1", expectedVersion: 0 }
    const issued = writer.issue({
      binding,
      input: request,
      actorSid: binding.issuerSid,
      check,
    })
    expect(issued.credential).toMatch(/^[a-f0-9]{64}$/u)
    expect(issued.receipt).toMatchObject({
      ok: true,
      status: "pending_delivery",
      state: "PENDING_DELIVERY",
      version: 1,
    })
    expect(
      writer.issue({
        binding,
        input: request,
        actorSid: binding.issuerSid,
        check,
      }),
    ).toEqual({
      receipt: issued.receipt,
    })
    const invalid = JSON.stringify({
      ...issued.receipt,
      state: ["PENDING_DELIVERY"],
    })
    files.mutate(check, (db) => {
      expect(
        Number(
          db
            .prepare(
              "UPDATE control_receipts SET metadata=? WHERE request_id=?",
            )
            .run(invalid, request.requestId).changes,
        ),
      ).toBe(1)
    })
    expect(() =>
      writer.issue({
        binding,
        input: request,
        actorSid: binding.issuerSid,
        check,
      }),
    ).toThrow("authority_unavailable")
    files.read((db) => {
      expect(
        db
          .prepare("SELECT metadata FROM control_receipts WHERE request_id=?")
          .get(request.requestId)?.metadata,
      ).toBe(invalid)
      expect(
        db
          .prepare("SELECT version,state FROM leases WHERE service=?")
          .get(binding.service),
      ).toMatchObject({ version: 1, state: "PENDING_DELIVERY" })
    })
    files.mutate(check, (db) => {
      db.prepare(
        "UPDATE control_receipts SET metadata=? WHERE request_id=?",
      ).run(JSON.stringify(issued.receipt), request.requestId)
    })
    expect(
      writer.issue({
        binding,
        input: request,
        actorSid: binding.issuerSid,
        check,
      }),
    ).toEqual({
      receipt: issued.receipt,
    })
  })
})
