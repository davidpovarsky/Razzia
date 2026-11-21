import { expect, it } from "vitest"
import { managedClientRateAddress } from "./managed-client-rate-limit"

const trusted = {
  peerAddress: "127.0.0.1",
  canonicalHeader: "192.0.2.7",
  rawHeaders: ["Host", "tadazz.com", "X-Tadazz-Client-IP", "192.0.2.7"],
  requestHost: "tadazz.com",
  canonicalHost: "tadazz.com",
  trustLoopback: true,
}

it("ignores canonical headers without the complete pinned-host and loopback trust contract", () => {
  expect(managedClientRateAddress({ ...trusted, trustLoopback: false })).toBe(
    "127.0.0.1",
  )
  expect(
    managedClientRateAddress({ ...trusted, peerAddress: "192.0.2.10" }),
  ).toBe("192.0.2.10")
  expect(managedClientRateAddress({ ...trusted, peerAddress: undefined })).toBe(
    "unknown",
  )
  expect(
    managedClientRateAddress({ ...trusted, canonicalHost: undefined }),
  ).toBe("127.0.0.1")
  expect(managedClientRateAddress({ ...trusted, requestHost: undefined })).toBe(
    "127.0.0.1",
  )
  expect(
    managedClientRateAddress({
      ...trusted,
      requestHost: "preview.example.invalid",
    }),
  ).toBe("127.0.0.1")
  expect(
    managedClientRateAddress({
      ...trusted,
      requestHost: "tadazz.com.attacker.invalid",
    }),
  ).toBe("127.0.0.1")
  expect(
    managedClientRateAddress({ ...trusted, requestHost: "tadazz.com:443" }),
  ).toBe("127.0.0.1")
})

it("rejects duplicate, normalized-only or malformed canonical address evidence", () => {
  for (const rawHeaders of [
    undefined,
    [],
    ["X-Tadazz-Client-IP"],
    ["X-Tadazz-Client-IP", 7],
    ["X-Tadazz-Client-IP", "192.0.2.8"],
    [...trusted.rawHeaders, "x-tadazz-client-ip", "192.0.2.7"],
  ]) {
    expect(managedClientRateAddress({ ...trusted, rawHeaders })).toBe(
      "127.0.0.1",
    )
  }

  for (const canonicalHeader of [
    "192.0.2.7, 192.0.2.8",
    "192.0.2.7:443",
    "arbitrary",
    "fe80::1%other",
  ]) {
    expect(
      managedClientRateAddress({
        ...trusted,
        canonicalHeader,
        rawHeaders: ["X-Tadazz-Client-IP", canonicalHeader],
      }),
    ).toBe("127.0.0.1")
  }
})

it("uses a single real canonical address only for the explicit pinned loopback contract", () => {
  expect(
    managedClientRateAddress({ ...trusted, peerAddress: "::ffff:127.0.0.1" }),
  ).toBe("192.0.2.7")
  expect(
    managedClientRateAddress({ ...trusted, requestHost: "TADAZZ.COM" }),
  ).toBe("192.0.2.7")
  expect(
    managedClientRateAddress({
      ...trusted,
      peerAddress: "::1",
      canonicalHeader: "2001:DB8::12",
      rawHeaders: ["x-tadazz-client-ip", "2001:DB8::12"],
    }),
  ).toBe("2001:db8::12")
  expect(managedClientRateAddress({ peerAddress: "::ffff:192.0.2.8" })).toBe(
    "192.0.2.8",
  )
})
