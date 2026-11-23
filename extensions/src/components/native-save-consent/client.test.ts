import { describe, expect, it } from "vitest"
import {
  createNativeSaveConsentClient,
  nativeSaveRequestIdFromPath,
  NATIVE_SAVE_CONSENT_PATH,
} from "./client"
import { synchronousPromise } from "../../core/synchronous-promise.ts"

function requireNativeConsentString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Expected native consent ${label} to be a string`)
  }

  return value
}

const accountId = "d8c27613-c6b8-49bf-9f92-c333f38beb3a"
const requestId = "a".repeat(54),
  otherId = "b".repeat(54)
const draftId = "d".repeat(22)
const authoredShowJson =
  '{\n  "title": "Exact <script>text</script> snapshot"\n}\n'
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  })
const success = (data: unknown) => ({
  contractVersion: "0.1.0",
  ok: true,
  data,
})
async function fixture() {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(authoredShowJson),
  )
  const authoredDigest = Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
  const inspection = {
    version: 1,
    consentRequestId: requestId,
    accountId,
    clientId: "registered-native-client",
    draftId,
    revision: 7,
    summary: {
      title: "Exact snapshot",
      cardCount: 3,
      questionCount: 2,
      themeId: "razzia-original",
      themeVersion: "1.0.0",
      diagnostics: [],
    },
    authoredShowJson,
    authoredDigest,
    expiresAt: Date.now() + 60000,
    state: "pending",
    proof: "e".repeat(64),
  }
  const calls: Array<{ path: string; init: RequestInit; body: unknown }> = []
  let token = "native-session-a"
  let inspected: unknown = inspection
  let approvalResponse: unknown = null
  let requestFailure: Error | null = null
  let waitForApproval: Promise<void> | null = null
  const request: typeof fetch = async (input, init) => {
    const path = requireNativeConsentString(input, "request URL")
    calls.push({
      path,
      init: init!,
      body: JSON.parse(requireNativeConsentString(init?.body, "JSON body")),
    })

    if (requestFailure) {
      throw requestFailure
    }

    if (path.endsWith("/inspect")) {
      return json(success(inspected))
    }

    if (waitForApproval) {
      await waitForApproval
    }

    return json(
      success(
        approvalResponse ?? {
          version: 1,
          state: "approved",
          consentRequestId: requestId,
          draftId,
          revision: 7,
          expiresAt: inspection.expiresAt,
        },
      ),
    )
  }
  const options = {
    issuerBasePath: "/api/oauth",
    accountId,
    getNativeToken: () => token,
    request,
  }

  return {
    inspection,
    calls,
    options,
    client: createNativeSaveConsentClient(options),
    token: (value: string) => {
      token = value
    },
    response: (value: unknown) => {
      inspected = value
    },
    approvalResponse: (value: unknown) => {
      approvalResponse = value
    },
    failure: (value: Error) => {
      requestFailure = value
    },
    approvalWait: (value: Promise<void>) => {
      waitForApproval = value
    },
  }
}
describe("separate native exact-revision consent client", () => {
  it("uses only native same-origin inspect/approve, verifies exact bytes and consumes proof once", async () => {
    const f = await fixture()
    const inspected = await f.client.inspect(requestId)
    expect(inspected.authoredShowJson).toBe(authoredShowJson)
    expect(Object.isFrozen(inspected)).toBe(true)
    expect(Object.isFrozen(inspected.summary.diagnostics)).toBe(true)
    const approved = await f.client.approve(requestId, inspected)
    expect(approved).toMatchObject({ state: "approved", revision: 7, draftId })
    expect(f.calls.map((call) => call.path)).toEqual([
      "/api/oauth/native-save/inspect",
      "/api/oauth/native-save/approve",
    ])
    expect(f.calls[0].body).toEqual({ consentRequestId: requestId })
    expect(f.calls[1].body).toEqual({
      consentRequestId: requestId,
      decision: "allow",
      proof: f.inspection.proof,
    })
    for (const call of f.calls) {
      expect(call.init).toMatchObject({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
      })
      expect(new Headers(call.init.headers).get("Authorization")).toBe(
        "Bearer native-session-a",
      )
    }
    await expect(f.client.approve(requestId, inspected)).rejects.toThrow()
    expect(f.calls).toHaveLength(2)
  })
  it("rejects cloned, foreign-client, wrong-request and superseded inspection objects before approval I/O", async () => {
    const f = await fixture()
    const inspected = await f.client.inspect(requestId)
    await expect(
      f.client.approve(requestId, { ...inspected }),
    ).rejects.toThrow()
    await expect(
      createNativeSaveConsentClient(f.options).approve(requestId, inspected),
    ).rejects.toThrow()
    await expect(f.client.approve(otherId, inspected)).rejects.toThrow()
    const next = await f.client.inspect(requestId)
    await expect(f.client.approve(requestId, inspected)).rejects.toThrow()
    await f.client.approve(requestId, next)
    expect(
      f.calls.filter((call) => call.path.endsWith("/approve")),
    ).toHaveLength(1)
  })
  it("revokes native-session and invalidated generations without sending approval", async () => {
    const f = await fixture()
    const inspected = await f.client.inspect(requestId)
    f.token("native-session-b")
    await expect(f.client.approve(requestId, inspected)).rejects.toThrow(
      "session-changed",
    )
    f.token("native-session-a")
    f.client.invalidate()
    await expect(f.client.approve(requestId, inspected)).rejects.toThrow(
      "session-changed",
    )
    expect(f.calls).toHaveLength(1)
  })
  it("rejects wrong account/request/snapshot/digest and contradictory proof states", async () => {
    for (const patch of [
      { accountId: "b7a38b3d-b799-4a3d-8d96-d592b4cc57c4" },
      { consentRequestId: otherId },
      { authoredDigest: "0".repeat(64) },
      { authoredShowJson: `${authoredShowJson} ` },
      { state: "approved" },
      { proof: undefined },
      { unsafe: "extra" },
    ]) {
      const f = await fixture()
      f.response({ ...f.inspection, ...patch })
      await expect(f.client.inspect(requestId)).rejects.toThrow()
      expect(
        f.calls.filter((call) => call.path.endsWith("/approve")),
      ).toHaveLength(0)
    }
  })
  it("permits read-only nonpending status but never binds it as fresh approval authority", async () => {
    for (const state of ["approved", "publishing", "saved", "expired"]) {
      const f = await fixture()
      const { proof: _proof, ...record } = f.inspection
      f.response({
        ...record,
        state,
        ...(state === "expired" ? { expiresAt: Date.now() - 1 } : {}),
      })
      const inspected = await f.client.inspect(requestId)
      expect(inspected.state).toBe(state)
      await expect(f.client.approve(requestId, inspected)).rejects.toThrow()
      expect(f.calls).toHaveLength(1)
    }
  })
  it("fails closed for absent auth, malformed IDs, expired/far-future pending requests and disabled issuer configuration", async () => {
    const f = await fixture()
    f.token("")
    await expect(f.client.inspect(requestId)).rejects.toThrow("session-changed")
    await expect(f.client.inspect("short")).rejects.toThrow()
    expect(f.calls).toHaveLength(0)
    for (const expiry of [Date.now() - 1, Date.now() + 700000]) {
      const g = await fixture()
      g.response({ ...g.inspection, expiresAt: expiry })
      await expect(g.client.inspect(requestId)).rejects.toThrow("expired")
    }
    for (const issuerBasePath of [
      "",
      "https://external.invalid",
      "//external.invalid",
      "/api?issuer=x",
      "/api#x",
      "/api/%2f",
    ]) {
      expect(() =>
        createNativeSaveConsentClient({ ...f.options, issuerBasePath }),
      ).toThrow("issuer-unconfigured")
    }
    expect(() =>
      createNativeSaveConsentClient({ ...f.options, issuerBasePath: "/" }),
    ).not.toThrow()
  })
  it("consumes before in-flight approval and never retries an unknown outcome", async () => {
    const f = await fixture()
    const inspected = await f.client.inspect(requestId)
    let release: () => void = () => {
      throw new Error(
        "Promise resolver release was used before executor initialization",
      )
    }

    f.approvalWait(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    const pending = f.client.approve(requestId, inspected)
    await expect(f.client.approve(requestId, inspected)).rejects.toThrow()
    expect(
      f.calls.filter((call) => call.path.endsWith("/approve")),
    ).toHaveLength(1)
    release()
    await pending
    const g = await fixture(),
      second = await g.client.inspect(requestId)
    g.failure(new Error("unknown-network-outcome"))
    await expect(g.client.approve(requestId, second)).rejects.toThrow(
      "unknown-network-outcome",
    )
    await expect(g.client.approve(requestId, second)).rejects.toThrow()
    expect(
      g.calls.filter((call) => call.path.endsWith("/approve")),
    ).toHaveLength(1)
  })
  it("requires exact request/draft/revision/expiry approval and rejects native-save results or extra authority", async () => {
    for (const patch of [
      { consentRequestId: otherId },
      { draftId: "f".repeat(22) },
      { revision: 8 },
      { expiresAt: Date.now() - 1 },
      { expiresAt: Date.now() + 700000 },
      { quizId: "not-an-approval-field" },
      { state: "saved" },
    ]) {
      const f = await fixture(),
        inspected = await f.client.inspect(requestId)
      f.approvalResponse({
        version: 1,
        state: "approved",
        consentRequestId: requestId,
        draftId,
        revision: 7,
        expiresAt: f.inspection.expiresAt,
        ...patch,
      })
      await expect(f.client.approve(requestId, inspected)).rejects.toThrow()
      await expect(f.client.approve(requestId, inspected)).rejects.toThrow()
      expect(
        f.calls.filter((call) => call.path.endsWith("/approve")),
      ).toHaveLength(1)
    }
  })
  it("honors abort and parses safe failure envelopes without following their URLs", async () => {
    const f = await fixture(),
      abort = new AbortController()
    abort.abort()
    await expect(f.client.inspect(requestId, abort.signal)).rejects.toThrow(
      "canceled",
    )
    expect(f.calls).toHaveLength(0)
    const calls: string[] = []
    const request: typeof fetch = (input) =>
      synchronousPromise(() => {
        calls.push(requireNativeConsentString(input, "request URL"))

        return json(
          {
            contractVersion: "0.1.0",
            ok: false,
            error: {
              code: "CONSENT_REQUIRED",
              messageKey: "safe",
              retryable: false,
              consentUrl: "https://untrusted.invalid/never-follow",
            },
          },
          403,
        )
      })
    await expect(
      createNativeSaveConsentClient({ ...f.options, request }).inspect(
        requestId,
      ),
    ).rejects.toThrow("CONSENT_REQUIRED")
    expect(calls).toEqual(["/api/oauth/native-save/inspect"])
  })
  it("accepts only the exact query/hash-free54-ID first-party path", () => {
    expect(
      nativeSaveRequestIdFromPath(`${NATIVE_SAVE_CONSENT_PATH}/${requestId}`),
    ).toBe(requestId)
    for (const path of [
      NATIVE_SAVE_CONSENT_PATH,
      `${NATIVE_SAVE_CONSENT_PATH}/${requestId}/`,
      `${NATIVE_SAVE_CONSENT_PATH}/${requestId}/extra`,
      `${NATIVE_SAVE_CONSENT_PATH}/short`,
      `https://evil.invalid${NATIVE_SAVE_CONSENT_PATH}/${requestId}`,
      `${NATIVE_SAVE_CONSENT_PATH}/${"%2F".repeat(18)}`,
    ]) {
      expect(nativeSaveRequestIdFromPath(path)).toBeNull()
    }
    expect(
      nativeSaveRequestIdFromPath(
        `${NATIVE_SAVE_CONSENT_PATH}/${requestId}`,
        "?anything=x",
      ),
    ).toBeNull()
    expect(
      nativeSaveRequestIdFromPath(
        `${NATIVE_SAVE_CONSENT_PATH}/${requestId}`,
        "",
        "#anything",
      ),
    ).toBeNull()
  })
})
