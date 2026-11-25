import { randomUUID } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { limit } = vi.hoisted(() => ({ limit: vi.fn(() => true) }))
vi.mock("../services/account-auth", () => ({ limitAction: limit }))

const body = (overrides: Record<string, unknown> = {}) => ({
  requestId: randomUUID(),
  email: "visitor@example.invalid",
  eventType: "Community quiz",
  message: "Please contact me about an event for 50 participants.",
  website: "",
  ...overrides,
})

async function fixture() {
  const { contact } = await import("./routes/contact")
  const post = (data: unknown, origin = "https://tadazz.com") =>
    contact.request("https://tadazz.com/", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })

  return { contact, post }
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("RESEND_API_KEY", "synthetic-contact-key")
  vi.stubEnv("TADAZZ_AUTH_EMAIL_FROM", "Tadazz <auth@example.invalid>")
  vi.stubEnv("TADAZZ_CONTACT_EMAIL_FROM", "")
  vi.stubEnv("TADAZZ_CONTACT_EMAIL_TO", "owner@example.invalid")
  vi.stubEnv("TADAZZ_PUBLIC_ORIGIN", "https://tadazz.com")
  limit.mockReset().mockReturnValue(true)
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json({ id: "synthetic-mail" }))),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("public contact email boundary", () => {
  it("requires an explicit recipient and never exposes server configuration", async () => {
    const { contact } = await fixture()
    expect(
      await (await contact.request("https://tadazz.com/config")).json(),
    ).toEqual({ available: true })
    vi.stubEnv("TADAZZ_CONTACT_EMAIL_TO", "")
    const response = await contact.request("https://tadazz.com/config")
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.json()).toEqual({ available: false })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("uses the configured recipient and verified sender with visitor Reply-To", async () => {
    const { post } = await fixture()
    const input = body({ email: "  VISITOR@example.invalid  " })
    expect((await post(input)).status).toBe(202)
    const [[url, options]] = vi.mocked(fetch).mock.calls
    expect(url).toBe("https://api.resend.com/emails")

    if (typeof options?.body !== "string") {
      throw new Error("Expected a serialized provider payload")
    }

    expect(JSON.parse(options.body)).toEqual({
      from: "Tadazz <auth@example.invalid>",
      to: ["owner@example.invalid"],
      reply_to: "visitor@example.invalid",
      subject: "Tadazz — new event enquiry",
      text: "New enquiry from the Tadazz contact form\nReply to: visitor@example.invalid\nEvent: Community quiz\n\nPlease contact me about an event for 50 participants.",
    })
    expect(new Headers(options.headers).get("Idempotency-Key")).toBe(
      `tadazz-contact-${input.requestId}`,
    )
  })

  it("rejects caller-supplied recipients and invalid input without sending", async () => {
    const { post } = await fixture()
    expect(
      (await post(body({ to: "third-party@example.invalid" }))).status,
    ).toBe(400)
    expect((await post(body({ email: "not-an-email" }))).status).toBe(400)
    expect((await post(body({ message: " " }))).status).toBe(400)
    expect((await post(body({ message: "a".repeat(4001) }))).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("rejects cross-origin requests and oversized payloads", async () => {
    const { post, contact } = await fixture()
    expect((await post(body(), "https://other.example")).status).toBe(403)
    expect((await post(body(), "")).status).toBe(403)
    expect(
      (
        await contact.request("https://tadazz.com/", {
          method: "POST",
          headers: {
            Origin: "https://tadazz.com",
            "Content-Type": "text/plain",
          },
          body: "invalid",
        })
      ).status,
    ).toBe(415)
    expect((await post(body({ message: "a".repeat(25_000) }))).status).toBe(413)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("coalesces simultaneous retries into one provider request", async () => {
    const { promise: gate, resolve: release } =
      Promise.withResolvers<undefined>()
    vi.mocked(fetch).mockImplementation(async () => {
      await gate

      return Response.json({ id: "synthetic-mail" })
    })
    const { post } = await fixture()
    const input = body()
    const first = post(input)
    const second = post(input)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    release(undefined)
    expect((await first).status).toBe(202)
    expect((await second).status).toBe(202)
    expect((await post(input)).status).toBe(202)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("rejects a reused request key with different enquiry content", async () => {
    const { post } = await fixture()
    const input = body()
    expect((await post(input)).status).toBe(202)
    expect(
      (await post({ ...input, message: "Different message" })).status,
    ).toBe(409)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("reports provider failure honestly and retries with the same provider key", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: "private-provider-error" }, { status: 500 }),
    )
    const { post } = await fixture()
    const input = body()
    const failed = await post(input)
    expect(failed.status).toBe(503)
    expect(await failed.text()).toBe('{"error":"contact-send-failed"}')
    expect((await post(input)).status).toBe(202)
    const keys = vi
      .mocked(fetch)
      .mock.calls.map(([, options]) =>
        new Headers(options?.headers).get("Idempotency-Key"),
      )
    expect(keys).toEqual([
      `tadazz-contact-${input.requestId}`,
      `tadazz-contact-${input.requestId}`,
    ])
  })

  it("enforces rate limits and ignores honeypot submissions", async () => {
    const { post } = await fixture()
    expect((await post(body({ website: "spam.invalid" }))).status).toBe(202)
    limit.mockReturnValue(false)
    expect((await post(body())).status).toBe(429)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("rejects unsafe sender configuration and fails closed", async () => {
    vi.stubEnv(
      "TADAZZ_CONTACT_EMAIL_FROM",
      "Tadazz <auth@example.invalid>\r\nBcc: other@example.invalid",
    )
    const { post, contact } = await fixture()
    expect(
      await (await contact.request("https://tadazz.com/config")).json(),
    ).toEqual({ available: false })
    expect((await post(body())).status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })
})
