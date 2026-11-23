import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  enterManagedClientMode,
  isManagedClientMode,
  isManagedClientRoomPath,
  leaveManagedClientMode,
  managedClientHeaders,
  managedClientHostUrl,
  MANAGED_CLIENT_EXPIRED_EVENT,
  notifyManagedClientExpired,
} from "./managed-client-session"
import { requestAuthHeaders } from "./request-auth"

const { ensureSession } = vi.hoisted(() => ({ ensureSession: vi.fn() }))
vi.mock("./session", () => ({ ensureSession }))

const storage = () => {
  const values = new Map<string, string>()

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    },
  }
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", storage())
  vi.stubGlobal("localStorage", storage())
  leaveManagedClientMode()
  ensureSession.mockReset()
})

afterEach(() => {
  leaveManagedClientMode()
  vi.unstubAllGlobals()
})

describe("managed client transport isolation", () => {
  it("uses only a nonsecret mode hint and never reads or replaces the owner credential", async () => {
    localStorage.setItem("token", "existing-owner-credential")
    enterManagedClientMode()
    const headers = await requestAuthHeaders({
      Authorization: "Bearer stale-owner",
      Accept: "application/json",
    })

    expect(isManagedClientMode()).toBe(true)
    expect(headers.get("Authorization")).toBeNull()
    expect(headers.get("X-Tadazz-Session")).toBe("managed-client")
    expect(headers.get("Accept")).toBe("application/json")
    expect(ensureSession).not.toHaveBeenCalled()
    expect(localStorage.getItem("token")).toBe("existing-owner-credential")
    expect(sessionStorage.length).toBe(1)
    const storedKey = sessionStorage.key(0)
    expect(storedKey && sessionStorage.getItem(storedKey)).toBe("active")
  })

  it("does not leak an owner refresh that finishes after code entry", async () => {
    ensureSession.mockResolvedValue({ token: "late-owner-credential" })
    const pending = requestAuthHeaders()
    enterManagedClientMode()
    const headers = await pending

    expect(headers.has("Authorization")).toBe(false)
    expect(headers.get("X-Tadazz-Session")).toBe("managed-client")
  })

  it("restores ordinary transport only after an explicit owner-mode exit", async () => {
    enterManagedClientMode()
    leaveManagedClientMode()
    ensureSession.mockResolvedValue({ token: "signed-in-owner" })
    const headers = await requestAuthHeaders({
      "X-Tadazz-Session": "managed-client",
    })

    expect(headers.get("Authorization")).toBe("Bearer signed-in-owner")
    expect(headers.has("X-Tadazz-Session")).toBe(false)
    expect(isManagedClientMode()).toBe(false)
  })

  it("keeps managed transport isolated when browser storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("Storage blocked")
      },
      setItem: () => {
        throw new Error("Storage blocked")
      },
      removeItem: () => {
        throw new Error("Storage blocked")
      },
    })
    enterManagedClientMode()

    expect(isManagedClientMode()).toBe(true)
    expect(
      managedClientHeaders({ authorization: "Bearer owner" }).has(
        "authorization",
      ),
    ).toBe(false)
    leaveManagedClientMode()
    expect(isManagedClientMode()).toBe(false)
  })

  it.each(["/party/manager/room-id", "/display/room-id"])(
    "returns revoked %s to client entry without enabling owner fallback",
    (pathname) => {
      const events = new EventTarget()
      const ended = vi.fn()
      const replace = vi.fn()
      events.addEventListener(MANAGED_CLIENT_EXPIRED_EVENT, ended)
      vi.stubGlobal("window", {
        dispatchEvent: events.dispatchEvent.bind(events),
        location: { pathname, replace },
      })
      enterManagedClientMode()
      notifyManagedClientExpired()

      expect(ended).toHaveBeenCalledOnce()
      expect(replace).toHaveBeenCalledWith("/client?expired=1")
      expect(isManagedClientMode()).toBe(true)
    },
  )

  it("accepts only the exact local native room returned by the launch service", () => {
    expect(managedClientHostUrl("room-id", "/party/manager/room-id")).toBe(
      "/party/manager/room-id?client=1",
    )
    for (const destination of [
      "https://foreign.invalid/party/manager/room-id",
      "//foreign.invalid",
      "/studio/games",
      "/party/manager/another",
      "/party/manager/room-id?token=bad",
    ]) {
      expect(() => managedClientHostUrl("room-id", destination)).toThrow(
        "Invalid managed client room destination",
      )
    }
    expect(isManagedClientRoomPath("/display/room-id")).toBe(true)
    expect(isManagedClientRoomPath("/party/room-id")).toBe(false)
  })
})
