import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { fixture, createInput, key, origin, snapshot } from "./fixtures.ts"
import { bodyText, HTTP_LIMITS } from "../../first-party/ingress.ts"
import type { Session } from "./fixtures.ts"

let f: Awaited<ReturnType<typeof fixture>>
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
      authorization: "Bearer " + session.token,
      ...headers,
    },
  }
  return new Request(origin + "/drafts", init)
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
  const request = streamed(f.sessions[0], body)
  request.headers.delete("authorization")
  const before = snapshot(f.root)
  assert.equal((await f.app.fetch(request)).status, 401)
  assert.equal(pulled, false)
  assert.deepEqual(snapshot(f.root), before)
  await body.cancel()
})
test("wrong Host/Origin, forwarded headers, routes, methods and body types are rejected before storage", async () => {
  const before = snapshot(f.root)
  const cases: [string, string, Record<string, string>, number][] = [
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
    ["/drafts", "POST", { authorization: "Bearer " + "a".repeat(4096) }, 400],
    ["/drafts/" + key(), "GET", { "content-length": "1" }, 400],
  ]
  for (const [path, method, headers, status] of cases) {
    assert.equal(
      (
        await f.request(
          f.sessions[0],
          path,
          method,
          method === "GET" ? undefined : {},
          headers,
        )
      ).status,
      status,
    )
  }
  assert.deepEqual(snapshot(f.root), before)
})
test("malformed JSON and native/enhanced envelopes are rejected before private/native allocation", async () => {
  const before = snapshot(f.root)
  const malformed = new Request(origin + "/drafts", {
    method: "POST",
    headers: {
      host: new URL(origin).host,
      origin,
      "content-type": "application/json",
      authorization: "Bearer " + f.sessions[1].token,
    },
    body: "{",
  })
  assert.equal((await f.app.fetch(malformed)).status, 400)
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
  ])
    assert.equal(
      (await f.request(f.sessions[1], "/drafts", "POST", body)).status,
      400,
    )
  assert.equal(existsSync(f.file(f.sessions[1].owner)), false)
  assert.deepEqual(snapshot(f.root), before)
})
test("create/read/replace use actual auth and SQLite; pending save has no success/consent/native URL", async () => {
  const created = await f.request(
    f.sessions[0],
    "/drafts",
    "POST",
    createInput(),
  )
  assert.equal(created.status, 201)
  assert.equal(created.headers.get("cache-control"), "no-store")
  const body = await created.json()
  assert.equal(body.ok, true)
  const id = body.data.draftId
  const read = await f.request(f.sessions[0], "/drafts/" + id)
  assert.equal(read.status, 200)
  assert.deepEqual((await read.json()).data, body.data)
  const input = {
    contractVersion: "0.1.0",
    draftId: id,
    expectedRevision: 1,
    authoredShowJson: createInput("updated title").authoredShowJson,
    idempotencyKey: key(),
  }
  assert.equal(
    (await f.request(f.sessions[0], "/drafts/" + key(), "PUT", input)).status,
    400,
  )
  const replace = await f.request(f.sessions[0], "/drafts/" + id, "PUT", input)
  assert.equal(replace.status, 200)
  assert.equal((await replace.json()).data.revision, 2)
  const saved = await f.request(
    f.sessions[0],
    "/drafts/" + id + "/save-intents",
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
  const outcome = await saved.json()
  assert.equal(outcome.ok, false)
  assert.equal(outcome.error.code, "DEPENDENCY_UNAVAILABLE")
  assert.equal(outcome.preparation.state, "PENDING_C1")
  assert.equal(outcome.data, undefined)
  for (const forbidden of [
    "quizId",
    "studioUrl",
    "consentUrl",
    "consentRequestId",
    "downloadUrl",
  ])
    assert.equal(JSON.stringify(outcome).includes(forbidden), false)
})
test("actual streamed bytes override an underreported Content-Length and invalid UTF8 is rejected", async () => {
  const before = snapshot(f.root)
  const tooLarge = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(HTTP_LIMITS.bytes + 1))
      c.close()
    },
  })
  assert.equal(
    (
      await f.app.fetch(
        streamed(f.sessions[1], tooLarge, { "content-length": "1" }),
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
  assert.equal((await f.app.fetch(streamed(f.sessions[1], utf8))).status, 400)
  assert.deepEqual(snapshot(f.root), before)
})
test("revocation during the body await is reverified before parsing or store allocation", async () => {
  const minted = await f.tokens.mintToken(f.sessions[1].owner, "manager")
  const claims = await f.tokens.verifyToken(minted.token)
  assert.ok(claims.sid)
  let reachedRead: () => void = () => {}
  let finish: () => void = () => {}
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
  const before = snapshot(f.root)
  const response = f.app.fetch(
    streamed({ ...f.sessions[1], token: minted.token }, body),
  )
  try {
    await Promise.race([
      reading,
      response.then(() => {
        throw new Error("Rejected before body await")
      }),
    ])
    f.accounts.revokeAccountSession(claims.sid)
  } finally {
    finish()
  }
  assert.equal((await response).status, 401)
  assert.deepEqual(snapshot(f.root), before)
})
test("a public cancel promise that stalls keeps body work unresolved", async () => {
  let cancelReached: () => void = () => {}
  let allowCancel: () => void = () => {}
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
  const result = bodyText(streamed(f.sessions[0], stream))
  void result.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  await cancelling
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(settled, false)
  allowCancel()
  await assert.rejects(
    result,
    (error) =>
      error instanceof Error && "status" in error && error.status === 413,
  )
})
test("32 real authenticated body lifetimes exhaust anonymous admission until they finish", async () => {
  let releaseBodies: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    releaseBodies = resolve
  })
  const input = JSON.stringify(createInput("bounded admission"))
  const reached: Promise<void>[] = []
  const responses: Promise<Response>[] = []
  for (let i = 0; i < HTTP_LIMITS.inFlight; i++) {
    let mark: () => void = () => {}
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
    responses.push(f.app.fetch(streamed(f.sessions[0], body)))
  }
  try {
    await Promise.race([
      Promise.all(reached),
      Promise.race(responses).then(() => {
        throw new Error("A body lifetime ended before release")
      }),
    ])
    assert.equal(
      (await f.request(f.sessions[0], "/drafts/" + key())).status,
      429,
    )
  } finally {
    releaseBodies()
    await Promise.allSettled(responses)
  }
  for (const response of await Promise.all(responses))
    assert.equal(response.status, 201)
  assert.equal((await f.request(f.sessions[0], "/drafts/" + key())).status, 404)
})
