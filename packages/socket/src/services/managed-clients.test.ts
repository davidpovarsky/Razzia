import { randomUUID } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { closeAccountDb, getAccountDb } from "./account-db"
import { ManagedClientStore } from "./managed-clients"

const owner = "c1898b9e-cf5e-4666-aeef-41b984056114"
const other = "9b65eaa2-3869-4cdc-b477-c7ae16db0ae1"
const secret = "synthetic-managed-clients-unit-secret-32-characters"
let directory = ""
let now = 1_800_000_000_000

beforeEach(() => {
  closeAccountDb()
  directory = mkdtempSync(join(tmpdir(), "tadazz-managed-store-"))
  vi.stubEnv("CONFIG_PATH", directory)
  vi.stubEnv("TADAZZ_ACCOUNTS_ENABLED", "true")
  vi.stubEnv("JWT_SECRET", secret)
  now = 1_800_000_000_000
  const db = getAccountDb()

  for (const id of [owner, other]) {
    db.prepare(
      "INSERT INTO accounts(id,email,salt,hash,verified_at,created_at) VALUES(?,?,?,?,?,?)",
    ).run(id, `${id}@example.invalid`, "synthetic", "synthetic", now, now)
  }
})

afterEach(() => {
  closeAccountDb()
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

const store = (codes = ["000123", "000124", "000125"]) =>
  new ManagedClientStore({
    db: getAccountDb(),
    secret,
    now: () => now,
    randomCode: () => codes.shift() ?? "999999",
  })

describe("managed-client private credentials and durable boundaries", () => {
  it("keeps leading zeros, rejects collisions, and persists only keyed code/session digests", () => {
    const service = store(["000123", "000123", "000124"])
    const first = service.create(owner, {
      name: "First",
      gameIds: ["legacy-game"],
      requestId: randomUUID(),
    })
    const second = service.create(other, {
      name: "Second",
      gameIds: [],
      requestId: randomUUID(),
    })
    expect(first.code).toBe("000123")
    expect(second.code).toBe("000124")
    const principal = service.exchange(first.code)
    const row = getAccountDb()
      .prepare("SELECT * FROM managed_clients WHERE id=?")
      .get(first.client.id)
    expect(row?.code_digest).toMatch(/^[a-f0-9]{64}$/u)
    expect(JSON.stringify(row)).not.toContain(JSON.stringify(first.code))
    const session = getAccountDb()
      .prepare("SELECT * FROM managed_client_sessions")
      .get()
    expect(session?.digest).toMatch(/^[a-f0-9]{64}$/u)
    expect(JSON.stringify(session)).not.toContain(principal.sessionId)
    expect(service.list(owner)).toEqual([first.client])
    expect(service.list(other)).toEqual([second.client])
  })

  it("does not duplicate a create request, and recovery never rediscloses its code", () => {
    const service = store()
    const input = {
      name: "One client",
      gameIds: ["one"],
      requestId: randomUUID(),
    }
    const first = service.create(owner, input)
    expect(() => service.create(owner, input)).toThrow(
      expect.objectContaining({
        code: "client-create-already-completed",
        details: { clientId: first.client.id },
      }),
    )
    expect(service.findCreation(owner, input.requestId)).toEqual(first.client)
    expect(service.findCreation(other, input.requestId)).toBeNull()
    expect(service.list(owner)).toHaveLength(1)
  })

  it("denies cross-owner reads/mutations without changing assignments", () => {
    const service = store()
    const { client } = service.create(owner, {
      name: "Private",
      gameIds: ["one"],
      requestId: randomUUID(),
    })
    for (const act of [
      () => service.get(other, client.id),
      () => service.update(other, client.id, { enabled: false }),
      () => service.assign(other, client.id, ["other"]),
      () => service.rotate(other, client.id),
    ]) {
      expect(act).toThrow(expect.objectContaining({ code: "client-not-found" }))
    }
    expect(service.get(owner, client.id)).toEqual(client)
  })

  it("rotation, disabling, owner disabling and session expiry invalidate existing credentials", () => {
    const service = store()
    const first = service.create(owner, {
      name: "Private",
      gameIds: ["one"],
      requestId: randomUUID(),
    })
    const session = service.exchange(first.code)
    expect(service.session(session.id, session.sessionId)).toEqual(session)
    const next = service.rotate(owner, first.client.id)
    expect(next.code).not.toBe(first.code)
    expect(service.session(session.id, session.sessionId)).toBeNull()
    expect(() => service.exchange(first.code)).toThrow(
      expect.objectContaining({ code: "invalid-client-code" }),
    )
    const nextSession = service.exchange(next.code)
    service.update(owner, first.client.id, { enabled: false })
    expect(service.session(nextSession.id, nextSession.sessionId)).toBeNull()
    expect(() => service.exchange(next.code)).toThrow(
      expect.objectContaining({ code: "invalid-client-code" }),
    )
    const enabled = service.rotate(owner, first.client.id)
    expect(enabled.client.enabled).toBe(true)
    expect(enabled.code).not.toBe(next.code)
    const finalSession = service.exchange(enabled.code)
    getAccountDb()
      .prepare("UPDATE accounts SET disabled=1 WHERE id=?")
      .run(owner)
    expect(service.session(finalSession.id, finalSession.sessionId)).toBeNull()
    expect(() => service.exchange(enabled.code)).toThrow()
    getAccountDb()
      .prepare("UPDATE accounts SET disabled=0 WHERE id=?")
      .run(owner)
    now += 12 * 60 * 60 * 1000
    expect(service.session(finalSession.id, finalSession.sessionId)).toBeNull()
  })

  it("survives DB reopening with assignment, session and guessing budgets intact", () => {
    const service = store()
    const first = service.create(owner, {
      name: "Persistent",
      gameIds: ["one", "two"],
      requestId: randomUUID(),
    })
    const session = service.exchange(first.code)

    for (let i = 0; i < 30; i += 1) {
      service.consumeLoginBudget("192.0.2.1")
    }

    closeAccountDb()
    const restarted = store()
    expect(restarted.get(owner, first.client.id)).toEqual(first.client)
    expect(restarted.session(session.id, session.sessionId)).toEqual(session)
    expect(() => restarted.consumeLoginBudget("192.0.2.1")).toThrow(
      expect.objectContaining({
        code: "client-code-rate-limited",
        details: { retryAfterSeconds: 900 },
      }),
    )
    restarted.assign(owner, first.client.id, ["two"])
    expect(restarted.assigned(first.client.id, owner, "one")).toBe(false)
    expect(restarted.assigned(first.client.id, owner, "two")).toBe(true)
    expect(restarted.session(session.id, session.sessionId)).not.toBeNull()
    now += 900_000
    expect(() => restarted.consumeLoginBudget("192.0.2.1")).not.toThrow()
  })

  it("globally bounds distributed guessing and never accepts non-six-digit input", () => {
    const service = store()
    service.create(owner, {
      name: "Private",
      gameIds: [],
      requestId: randomUUID(),
    })

    for (const code of [
      123,
      "123",
      "0001234",
      " 000123",
      "１２３４５６",
      "000000",
    ]) {
      expect(() => service.exchange(code)).toThrow(
        expect.objectContaining({ code: "invalid-client-code" }),
      )
    }

    for (let i = 0; i < 300; i += 1) {
      service.consumeLoginBudget(`synthetic-${i}`)
    }

    expect(() => service.consumeLoginBudget("fresh-address")).toThrow(
      expect.objectContaining({ code: "client-code-rate-limited" }),
    )
  })
})
