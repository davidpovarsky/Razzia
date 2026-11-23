import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import {
  fixture,
  createInput,
  key,
  origin,
  snapshot,
  type Session,
} from "./fixtures.ts"
import { bodyText, HTTP_LIMITS } from "../../first-party/ingress.ts"

function isObservedRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireObservedRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!isObservedRecord(value)) {
    throw new Error(`Expected raw object: ${label}`)
  }

  return value
}

function requireObservedString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Expected raw string: ${label}`)
  }

  return value
}

type InitializedFValue = Awaited<ReturnType<typeof fixture>>
let f: InitializedFValue | undefined = undefined
function requireInitializedF(): InitializedFValue {
  if (f === undefined) {
    throw new Error("Fixture state f was read before initialization")
  }

  return f
}
before(async () => {
  f = await fixture()
})
after(() => f?.close())
function streamed(
  session: Session,
  body: ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
) {
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    body,
    duplex: "half",
    headers: {
      host: new URL(origin).host,
      origin,
      "content-type": "application/json",
      authorization: `Bearer ${session.token}`,
      ...headers,
    },
  }

  return new Request(`${origin}/drafts`, init)
}
test("missing manager credentials reject before consuming body or allocating a draft family", async () => {
  let pulled = false
  const body = new ReadableStream<Uint8Array>(
    {
      pull() {
        pulled = true
      },
    },
    { highWaterMark: 0 },
  )
  const request = streamed(requireInitializedF().sessions[0], body)
  request.headers.delete("authorization")
  const priorSnapshot = snapshot(requireInitializedF().root)
  assert.equal((await requireInitializedF().app.fetch(request)).status, 401)
  assert.equal(pulled, false)
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot)
  await body.cancel()
})
test("wrong Host/Origin, forwarded headers, routes, methods and body types are rejected before storage", async () => {
  const priorSnapshot2 = snapshot(requireInitializedF().root)
  const cases: Array<[string, string, Record<string, string>, number]> = [
    ["/drafts", "POST", { host: "other.example.invalid" }, 403],
    ["/drafts", "POST", { origin: "https://other.example.invalid" }, 403],
    ["/drafts", "POST", { origin: "null" }, 403],
    [
      "/drafts",
      "POST",
      { forwarded: "host=studio.example.invalid;proto=https" },
      403,
    ],
    ["/drafts", "POST", { "x-forwarded-host": "studio.example.invalid" }, 403],
    ["/drafts", "DELETE", {}, 405],
    ["/native/import", "POST", {}, 404],
    ["/drafts", "POST", { "content-type": "text/plain" }, 415],
    ["/drafts", "POST", { "content-encoding": "gzip" }, 415],
    ["/drafts?cursor=anything", "POST", {}, 400],
    ["/drafts", "POST", { "content-length": "65537" }, 413],
    ["/drafts", "POST", { authorization: `Bearer ${"a".repeat(4096)}` }, 400],
    [`/drafts/${key()}`, "GET", { "content-length": "1" }, 400],
  ]
  for (const [path, method, headers, status] of cases) {
    assert.equal(
      (
        await requireInitializedF().request(
          requireInitializedF().sessions[0],
          path,
          method,
          method === "GET" ? undefined : {},
          headers,
        )
      ).status,
      status,
    )
  }
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot2)
})
test("malformed JSON and native/enhanced envelopes are rejected before private/native allocation", async () => {
  const priorSnapshot3 = snapshot(requireInitializedF().root)
  const malformed = new Request(`${origin}/drafts`, {
    method: "POST",
    headers: {
      host: new URL(origin).host,
      origin,
      "content-type": "application/json",
      authorization: `Bearer ${requireInitializedF().sessions[1].token}`,
    },
    body: "{",
  })
  assert.equal((await requireInitializedF().app.fetch(malformed)).status, 400)
  for (const body of [
    {
      contractVersion: "0.1.0",
      quizz: { id: "source-native" },
      idempotencyKey: key(),
    },
    { ...createInput(), extraJson: { quizId: "source-native" } },
    {
      ...createInput(),
      authoredShowJson: JSON.stringify({
        format: "razzia-bundle",
        quizz: { id: "source-native" },
      }),
    },
    {
      ...createInput(),
      authoredShowJson: JSON.stringify({
        ...JSON.parse(createInput().authoredShowJson),
        id: "source-native",
      }),
    },
  ]) {
    assert.equal(
      (
        await requireInitializedF().request(
          requireInitializedF().sessions[1],
          "/drafts",
          "POST",
          body,
        )
      ).status,
      400,
    )
  }
  assert.equal(
    existsSync(
      requireInitializedF().file(requireInitializedF().sessions[1].owner),
    ),
    false,
  )
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot3)
})
test("create/read/replace use actual auth and SQLite; pending save has no success/consent/native URL", async () => {
  const created = await requireInitializedF().request(
    requireInitializedF().sessions[0],
    "/drafts",
    "POST",
    createInput(),
  )
  assert.equal(created.status, 201)
  assert.equal(created.headers.get("cache-control"), "no-store")
  const body = requireObservedRecord(
    await created.json(),
    "HTTP created draft envelope",
  )
  assert.equal(body.ok, true)
  const id = requireObservedString(
    requireObservedRecord(body.data, "HTTP created draft").draftId,
    "HTTP draft id",
  )

  const read = await requireInitializedF().request(
    requireInitializedF().sessions[0],
    `/drafts/${id}`,
  )
  assert.equal(read.status, 200)
  assert.deepEqual(
    requireObservedRecord(await read.json(), "HTTP read draft envelope").data,
    body.data,
  )
  const input = {
    contractVersion: "0.1.0",
    draftId: id,
    expectedRevision: 1,
    authoredShowJson: createInput("updated title").authoredShowJson,
    idempotencyKey: key(),
  }
  assert.equal(
    (
      await requireInitializedF().request(
        requireInitializedF().sessions[0],
        `/drafts/${key()}`,
        "PUT",
        input,
      )
    ).status,
    400,
  )
  const replace = await requireInitializedF().request(
    requireInitializedF().sessions[0],
    `/drafts/${id}`,
    "PUT",
    input,
  )
  assert.equal(replace.status, 200)
  assert.equal(
    requireObservedRecord(
      requireObservedRecord(
        await replace.json(),
        "HTTP replaced draft envelope",
      ).data,
      "HTTP replaced draft",
    ).revision,
    2,
  )
  const saved = await requireInitializedF().request(
    requireInitializedF().sessions[0],
    `/drafts/${id}/save-intents`,
    "POST",
    {
      contractVersion: "0.1.0",
      draftId: id,
      expectedRevision: 2,
      intent: "createNew",
      idempotencyKey: key(),
    },
  )
  assert.equal(saved.status, 409)
  const outcome = requireObservedRecord(
    await saved.json(),
    "HTTP save-intent envelope",
  )
  assert.equal(outcome.ok, false)
  assert.equal(
    requireObservedRecord(outcome.error, "HTTP save-intent error").code,
    "DEPENDENCY_UNAVAILABLE",
  )
  assert.equal(
    requireObservedRecord(outcome.preparation, "HTTP save-intent preparation")
      .state,
    "PENDING_C1",
  )
  assert.equal(outcome.data, undefined)
  for (const forbidden of [
    "quizId",
    "studioUrl",
    "consentUrl",
    "consentRequestId",
    "downloadUrl",
  ]) {
    assert.equal(JSON.stringify(outcome).includes(forbidden), false)
  }
})
test("actual streamed bytes override an underreported Content-Length and invalid UTF8 is rejected", async () => {
  const priorSnapshot4 = snapshot(requireInitializedF().root)
  const tooLarge = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(HTTP_LIMITS.bytes + 1))
      c.close()
    },
  })
  assert.equal(
    (
      await requireInitializedF().app.fetch(
        streamed(requireInitializedF().sessions[1], tooLarge, {
          "content-length": "1",
        }),
      )
    ).status,
    413,
  )
  const utf8 = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array([0xc3, 0x28]))
      c.close()
    },
  })
  assert.equal(
    (
      await requireInitializedF().app.fetch(
        streamed(requireInitializedF().sessions[1], utf8),
      )
    ).status,
    400,
  )
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot4)
})
test("revocation during the body await is reverified before parsing or store allocation", async () => {
  const minted = await requireInitializedF().tokens.mintToken(
    requireInitializedF().sessions[1].owner,
    "manager",
  )
  const claims = await requireInitializedF().tokens.verifyToken(minted.token)
  assert.ok(claims.sid)
  let reachedRead: () => void = () => {
    /* The following Promise executor installs this callback synchronously. */
  }
  let finish: () => void = () => {
    /* The following Promise executor installs this callback synchronously. */
  }
  const reading = new Promise<void>((resolve) => {
    reachedRead = resolve
  })
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const body = new ReadableStream<Uint8Array>(
    {
      async pull(c) {
        reachedRead()
        await gate
        c.enqueue(new TextEncoder().encode(JSON.stringify(createInput())))
        c.close()
      },
    },
    { highWaterMark: 0 },
  )
  const priorSnapshot5 = snapshot(requireInitializedF().root)
  const response = requireInitializedF().app.fetch(
    streamed(
      { ...requireInitializedF().sessions[1], token: minted.token },
      body,
    ),
  )

  try {
    await Promise.race([
      reading,
      response.then(() => {
        throw new Error("Rejected before body await")
      }),
    ])
    requireInitializedF().accounts.revokeAccountSession(claims.sid)
  } finally {
    finish()
  }

  assert.equal((await response).status, 401)
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot5)
})
test("a public cancel promise that stalls keeps body work unresolved", async () => {
  let cancelReached: () => void = () => {
    /* The following Promise executor installs this callback synchronously. */
  }
  let allowCancel: () => void = () => {
    /* The following Promise executor installs this callback synchronously. */
  }
  const cancelling = new Promise<void>((resolve) => {
    cancelReached = resolve
  })
  const held = new Promise<void>((resolve) => {
    allowCancel = resolve
  })
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(c) {
        c.enqueue(new Uint8Array(HTTP_LIMITS.bytes + 1))
      },
      cancel() {
        cancelReached()

        return held
      },
    },
    { highWaterMark: 0 },
  )
  let settled = false
  const result = bodyText(streamed(requireInitializedF().sessions[0], stream))
  void result.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  await cancelling
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
  assert.equal(settled, false)
  allowCancel()
  await assert.rejects(
    result,
    (error) =>
      error instanceof Error && "status" in error && error.status === 413,
  )
})
test("32 real authenticated body lifetimes exhaust anonymous admission until they finish", async () => {
  let releaseBodies: () => void = () => {
    /* The following Promise executor installs this callback synchronously. */
  }
  const gate = new Promise<void>((resolve) => {
    releaseBodies = resolve
  })
  const input = JSON.stringify(createInput("bounded admission"))
  const reached: Array<Promise<void>> = []
  const responses: Array<Promise<Response>> = []
  for (let i = 0; i < HTTP_LIMITS.inFlight; i += 1) {
    let mark: () => void = () => {
      /* The following Promise executor installs this callback synchronously. */
    }
    reached.push(
      new Promise<void>((resolve) => {
        mark = resolve
      }),
    )
    const body = new ReadableStream<Uint8Array>(
      {
        async pull(c) {
          mark()
          await gate
          c.enqueue(new TextEncoder().encode(input))
          c.close()
        },
      },
      { highWaterMark: 0 },
    )
    responses.push(
      requireInitializedF().app.fetch(
        streamed(requireInitializedF().sessions[0], body),
      ),
    )
  }

  try {
    await Promise.race([
      Promise.all(reached),
      Promise.race(responses).then(() => {
        throw new Error("A body lifetime ended before release")
      }),
    ])
    assert.equal(
      (
        await requireInitializedF().request(
          requireInitializedF().sessions[0],
          `/drafts/${key()}`,
        )
      ).status,
      429,
    )
  } finally {
    releaseBodies()
    await Promise.allSettled(responses)
  }

  for (const response of await Promise.all(responses)) {
    assert.equal(response.status, 201)
  }
  assert.equal(
    (
      await requireInitializedF().request(
        requireInitializedF().sessions[0],
        `/drafts/${key()}`,
      )
    ).status,
    404,
  )
})
