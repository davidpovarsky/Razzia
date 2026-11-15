import { describe, expect, it } from "vitest"
import {
  CONSENT_PATH,
  CONSENT_HANDOFF_KEY,
  CONSENT_HANDOFF_TTL_MS,
  createConsentLoginHandoff,
} from "./login-handoff"

const first = "a".repeat(64),
  second = "b".repeat(64)
const location = (ticket = first) => ({
  pathname: CONSENT_PATH,
  searchStr: `?oauth_request=${ticket}`,
})
function fixture() {
  let time = 1000000
  const records = new Map<string, string>()
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value)
    },
    removeItem: (key: string) => {
      records.delete(key)
    },
  }
  return {
    records,
    storage,
    advance: (ms: number) => {
      time += ms
    },
    handoff: createConsentLoginHandoff(storage, () => time),
    now: () => time,
  }
}
const destination = { pathname: CONSENT_PATH, searchStr: "" }
describe("same-tab consent login handoff", () => {
  it("survives repeated guards and module recreation without extending expiry or storing authority", () => {
    const f = fixture()
    expect(f.handoff.capture(location())).toBe(true)
    const record = f.records.get(CONSENT_HANDOFF_KEY)
    f.advance(1000)
    expect(f.handoff.capture(location())).toBe(true)
    expect(f.records.get(CONSENT_HANDOFF_KEY)).toBe(record)
    const recreated = createConsentLoginHandoff(f.storage, f.now)
    expect(recreated.resume(destination)).toEqual({ oauth_request: first })
    expect(recreated.resume(destination)).toEqual({ oauth_request: first })
    expect(Object.keys(JSON.parse(record!)).sort()).toEqual([
      "expiresAt",
      "ticket",
    ])
    recreated.acknowledge(first)
    expect(recreated.resume(destination)).toBeNull()
    expect(f.records.size).toBe(0)
  })
  it("expires without renewal and bounds future timestamps", () => {
    const f = fixture()
    f.handoff.capture(location())
    f.advance(CONSENT_HANDOFF_TTL_MS)
    expect(f.handoff.resume(destination)).toBeNull()
    f.records.set(
      CONSENT_HANDOFF_KEY,
      JSON.stringify({
        ticket: first,
        expiresAt: f.now() + CONSENT_HANDOFF_TTL_MS + 1,
      }),
    )
    expect(f.handoff.resume(destination)).toBeNull()
    expect(f.records.size).toBe(0)
  })
  it("replaces a request while stale acknowledgement cannot erase its successor", () => {
    const f = fixture()
    f.handoff.capture(location())
    f.handoff.capture(location(second))
    f.handoff.acknowledge(first)
    expect(f.handoff.resume(destination)).toEqual({ oauth_request: second })
    f.handoff.clear() // explicit cancel, logout or unexpected session replacement
    expect(f.handoff.resume(destination)).toBeNull()
  })
  it("rejects malformed/duplicate/unbounded tickets and extra authority fields", () => {
    const f = fixture()
    for (const searchStr of [
      "",
      "?oauth_request=short",
      `?oauth_request=${"a".repeat(8193)}`,
      `?oauth_request=${first}&oauth_request=${second}`,
      `?oauth_request=${first}&redirect_uri=https://evil.invalid`,
      `?oauth_request=${first}.proof`,
    ]) {
      f.handoff.capture(location())
      expect(f.handoff.capture({ pathname: CONSENT_PATH, searchStr })).toBe(
        false,
      )
      expect(f.handoff.resume(destination)).toBeNull()
    }
    for (const raw of [
      "not-json",
      "x".repeat(8301),
      JSON.stringify({
        ticket: first,
        expiresAt: f.now() + 5000,
        proof: "forbidden",
      }),
    ]) {
      f.records.set(CONSENT_HANDOFF_KEY, raw)
      expect(f.handoff.resume(destination)).toBeNull()
    }
  })
  it("never resumes to query/hash/external/other paths or another tab", () => {
    const f = fixture()
    f.handoff.capture(location())
    for (const entry of [
      { pathname: "https://evil.invalid", searchStr: "" },
      { pathname: "/studio", searchStr: "" },
      { ...destination, searchStr: "?redirect_uri=anything" },
      { ...destination, hash: "#anything" },
    ])
      expect(f.handoff.resume(entry)).toBeNull()
    expect(fixture().handoff.resume(destination)).toBeNull()
    expect(f.handoff.resume(destination)).toEqual({ oauth_request: first })
  })
  it("fails closed when browser storage is unavailable", () => {
    const fail = () => {
      throw new Error("blocked-storage")
    }
    const handoff = createConsentLoginHandoff({
      getItem: fail,
      setItem: fail,
      removeItem: fail,
    })
    expect(handoff.capture(location())).toBe(false)
    expect(handoff.resume(destination)).toBeNull()
    expect(() => handoff.clear()).not.toThrow()
  })
})
