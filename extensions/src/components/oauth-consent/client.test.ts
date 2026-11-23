import { describe, expect, it, vi } from "vitest"
import { consentIssuerPath, createOAuthConsentClient } from "./client"
const ticket = "encrypted-ticket-".repeat(4)
const inspection = () => ({
  clientId: "real-registered-client",
  scopes: ["tadazz.drafts.read"],
  expiresAt: Date.now() + 300000,
  proof: "a".repeat(64),
})
const json = (value: unknown) => Response.json(value)
describe("same-origin native OAuth consent client", () => {
  it("consumes an inspection before awaiting an in-flight approval", async () => {
    let release: (response: Response) => void = () => {
      throw new Error(
        "Promise resolver release was used before executor initialization",
      )
    }

    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(inspection()))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve
          }),
      )
    const client = createOAuthConsentClient({
      issuerBasePath: "/oauth",
      getNativeToken: () => "session-a",
      request,
    })
    const inspected = await client.inspect(ticket)
    const pending = client.approve(ticket, inspected)
    await expect(client.approve(ticket, inspected)).rejects.toThrow("expired")
    expect(request).toHaveBeenCalledTimes(2)
    release(
      json({
        redirectUrl: "https://client.invalid/callback?code=one",
        grantId: "synthetic-grant",
      }),
    )
    await expect(pending).resolves.toBe(
      "https://client.invalid/callback?code=one",
    )
  })
  it("keeps the exact inspected client/scopes and sends approval only explicitly", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(inspection()))
      .mockResolvedValueOnce(
        json({
          redirectUrl:
            "https://client.invalid/callback?code=exact%2Fcode&state=original",
          grantId: "actual-grant-id",
        }),
      )
    const client = createOAuthConsentClient({
      issuerBasePath: "/oauth",
      getNativeToken: () => "native-session",
      request,
    })
    const result = await client.inspect(ticket)
    expect(request).toHaveBeenCalledTimes(1)
    expect(result.clientId).toBe("real-registered-client")
    expect(result.scopes).toEqual(["tadazz.drafts.read"])
    expect(await client.approve(ticket, result)).toBe(
      "https://client.invalid/callback?code=exact%2Fcode&state=original",
    )
    const [path, options] = request.mock.calls[1]!
    expect(path).toBe("/oauth/approve")
    expect(options).toMatchObject({
      credentials: "same-origin",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: { Authorization: "Bearer native-session" },
    })
    expect(JSON.parse(options!.body as string)).toEqual({
      ticket,
      decision: "allow",
      proof: result.proof,
    })
    await expect(client.approve(ticket, result)).rejects.toThrow("expired")
    expect(request).toHaveBeenCalledTimes(2)
  })
  it("rejects external or query-selected issuer destinations", () => {
    for (const path of [
      "",
      "//external.invalid/oauth",
      "https://external.invalid/oauth",
      "/oauth?issuer=other",
      "/oauth%2fother",
      "/oauth/../admin",
    ]) {
      expect(() => consentIssuerPath(path)).toThrow()
    }
    expect(consentIssuerPath("/private/oauth/")).toBe("/private/oauth")
  })
  it("rejects copied, foreign-ticket and invalidated proofs before approval IO", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json(inspection()))
    const client = createOAuthConsentClient({
      issuerBasePath: "/oauth",
      getNativeToken: () => "session-a",
      request,
    })
    const result = await client.inspect(ticket)
    await expect(client.approve(ticket, { ...result })).rejects.toThrow(
      "expired",
    )
    await expect(client.approve(`${ticket}other`, result)).rejects.toThrow(
      "expired",
    )
    client.invalidate()
    await expect(client.approve(ticket, result)).rejects.toThrow(
      "session-changed",
    )
    expect(request).toHaveBeenCalledTimes(1)
  })
  it("discards an inspect response when the native session changes in flight", async () => {
    let token = "session-a"
    let release: (value: Response) => void = () => {
      throw new Error(
        "Promise resolver release was used before executor initialization",
      )
    }

    const request = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const client = createOAuthConsentClient({
      issuerBasePath: "/oauth",
      getNativeToken: () => token,
      request,
    })
    const pending = client.inspect(ticket)
    token = "session-b"
    release(json(inspection()))
    await expect(pending).rejects.toThrow("session-changed")
  })
  it("fails closed on expired requests, missing authentication and unsafe callback responses", async () => {
    const unauthenticated = vi.fn<typeof fetch>()
    await expect(
      createOAuthConsentClient({
        issuerBasePath: "/oauth",
        getNativeToken: () => null,
        request: unauthenticated,
      }).inspect(ticket),
    ).rejects.toThrow("session-changed")
    expect(unauthenticated).not.toHaveBeenCalled()
    const expired = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ ...inspection(), expiresAt: Date.now() - 1 }))
    await expect(
      createOAuthConsentClient({
        issuerBasePath: "/oauth",
        getNativeToken: () => "session-a",
        request: expired,
      }).inspect(ticket),
    ).rejects.toThrow("expired")
    const unsafe = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(inspection()))
      .mockResolvedValueOnce(
        json({
          redirectUrl: "javascript:alert(1)",
          grantId: "actual-grant-id",
        }),
      )
    const client = createOAuthConsentClient({
      issuerBasePath: "/oauth",
      getNativeToken: () => "session-a",
      request: unsafe,
    })
    const result = await client.inspect(ticket)
    await expect(client.approve(ticket, result)).rejects.toThrow(
      "invalid-redirect",
    )
  })
})
