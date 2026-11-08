import { afterEach, expect, it, vi } from "vitest"
import { loadOpeningLottie } from "./TadazzOpening"
afterEach(() => vi.unstubAllGlobals())
it("revalidates private opening media instead of sharing a previous account's cached JSON", async () => {
  const value = {
    nm: "Authorized private opening",
    w: 100,
    h: 100,
    fr: 30,
    ip: 0,
    op: 30,
    layers: [],
  }
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(value)))
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
  vi.stubGlobal("fetch", fetch)
  const url = `/media/private-opening-${crypto.randomUUID()}.json`
  expect(await loadOpeningLottie(url)).not.toBeNull()
  expect(await loadOpeningLottie(url)).toBeNull()
  expect(fetch).toHaveBeenCalledTimes(2)
})
