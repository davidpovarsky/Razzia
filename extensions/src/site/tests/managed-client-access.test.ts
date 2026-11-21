/* oxlint-disable no-await-in-loop -- Invalid code cases must all finish without any network request. */
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  closeManagedClientSession,
  isManagedClientCode,
  launchManagedClientGame,
  ManagedClientApiError,
  openManagedClientSession,
  readManagedClientGames,
} from "../adapters/managed-clients"

afterEach(() => vi.unstubAllGlobals())

describe("managed client access adapter", () => {
  it("preserves all six ASCII digits, including leading zeros, through the actual exchange body", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ kind: "managed-client" }), {
        status: 200,
      }),
    )
    vi.stubGlobal("fetch", fetch)
    await openManagedClientSession("012345")

    expect(isManagedClientCode("012345")).toBe(true)
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/client-access/session")
    expect(JSON.parse(options.body as string)).toEqual({ code: "012345" })
    expect(new Headers(options.headers).get("X-Tadazz-Session")).toBe(
      "managed-client",
    )
    expect(new Headers(options.headers).has("Authorization")).toBe(false)
    expect(options.credentials).toBe("same-origin")
    expect(options.cache).toBe("no-store")
    expect(options.redirect).toBe("error")
  })

  it("rejects short, long, padded and non-ASCII codes before making a request", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    for (const code of [
      "",
      "12345",
      "1234567",
      " 123456",
      "123456 ",
      "12 345",
      "１２３４５６",
      "١٢٣٤٥٦",
      "12a456",
    ]) {
      expect(isManagedClientCode(code)).toBe(false)
      await expect(openManagedClientSession(code)).rejects.toMatchObject({
        code: "invalid-client-code",
      })
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it("surfaces expiry, revocation and rate limits without retrying as an owner or guest", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "client-session-expired" }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "client-code-rate-limited" }), {
          status: 429,
          headers: { "Retry-After": "37" },
        }),
      )
    vi.stubGlobal("fetch", fetch)
    await expect(readManagedClientGames()).rejects.toMatchObject({
      status: 401,
      code: "client-session-expired",
    })
    await expect(openManagedClientSession("012345")).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 37,
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("retains launch request identity and never converts a failed sign-out into success", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ gameId: "native-room" }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "request-failed" }), {
          status: 503,
        }),
      )
    vi.stubGlobal("fetch", fetch)
    await launchManagedClientGame("canonical-game", "same-request")
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/client-access/games/canonical-game/launch")
    expect(JSON.parse(options.body as string)).toEqual({
      requestId: "same-request",
    })
    await expect(closeManagedClientSession()).rejects.toBeInstanceOf(
      ManagedClientApiError,
    )
  })
})
