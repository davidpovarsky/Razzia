import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("@razzia/web/lib/session", () => ({
  clearToken: vi.fn(),
  getClientId: () => "alice",
  getRole: () => "manager",
  getToken: () => "secret-test-token",
}))
import { clearToken } from "@razzia/web/lib/session"
import { safeReturnTo, siteKey, siteRequest } from "../adapters/client"

beforeEach(() => {
  vi.restoreAllMocks()
})
describe("site security boundaries", () => {
  it("allows only local Studio and existing editor return routes", () => {
    for (const path of [
      "/studio",
      "/studio/games",
      "/manager/quizz",
      "/manager/quizz/quiz-123",
    ]) {
      expect(safeReturnTo(path)).toBe(path)
    }
    for (const path of [
      "//evil.test",
      "/\\evil.test",
      "https://evil.test",
      "/login",
      "/studio?token=secret",
      "/manager/config",
      "/studio#token",
      "/studio\r\nhttps://evil.test",
    ]) {
      expect(safeReturnTo(path)).toBe("/studio")
    }
  })
  it("partitions every private resource by account", () => {
    expect(siteKey("alice", "games")).not.toEqual(siteKey("bob", "games"))
    expect(siteKey("alice")).toEqual(["tadazz-site", "alice"])
  })
  it("uses the existing bearer session only on same-origin API paths", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ quizz: [] })))
    vi.stubGlobal("fetch", fetch)
    await siteRequest("/api/quizz")
    const init = fetch.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer secret-test-token",
    )
    expect(init.cache).toBe("no-store")
    expect(init.credentials).toBe("same-origin")
    await expect(siteRequest("https://evil.test/api/quizz")).rejects.toThrow(
      "Invalid API path",
    )
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
  it("retires local credentials on 401 and never reports failed writes as success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
        }),
      ),
    )
    await expect(
      siteRequest("/api/quizz", { method: "POST", body: "{}" }),
    ).rejects.toMatchObject({ status: 401 })
    expect(clearToken).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
