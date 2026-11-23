import { promiseFrom } from "../../shared/promise-operation.ts"
import assert from "node:assert/strict"
import test from "node:test"
import { CallToolResultSchema } from "@modelcontextprotocol/core"
import { harness, principal, newKey, code } from "./fixtures.ts"

test("real SDK malformed tool calls are authenticated, limited once and sanitized before strict validation", async () => {
  const p = principal()
  let auth = 0,
    ingress = 0,
    budget = 0
  const h = await harness(
    {
      authorize: () => {
        auth += 1

        return Promise.resolve(p)
      },
      prevalidationLimit: () => {
        ingress += 1

        return Promise.resolve(true)
      },
      rateLimit: () => {
        budget += 1

        return Promise.resolve(true)
      },
    },
    p,
  )
  const marker = "arbitrary-reflected-input-must-never-appear"

  try {
    for (const params of [
      {
        name: "get_game_draft",
        arguments: {
          contractVersion: "0.1.0",
          draftId: newKey(),
          [marker]: marker,
        },
      },
      { name: marker, arguments: {} },
      {
        name: "get_game_draft",
        arguments: {
          contractVersion: "0.1.0",
          draftId: newKey(),
          [marker]: "x".repeat(65_537),
        },
      },
      { name: "get_game_draft", arguments: [] },
      {
        name: "get_game_draft",
        arguments: {
          contractVersion: "0.1.0",
          draftId: newKey(),
          many: Array(101).fill(0),
        },
      },
    ]) {
      const result = CallToolResultSchema.parse(
        await h.client.request({ method: "tools/call", params }),
      )
      assert.equal(code(result), "VALIDATION_FAILED")
      assert.equal(JSON.stringify(result).includes(marker), false)
      assert.ok(JSON.stringify(result).length < 2048)
    }
    assert.deepEqual(
      { auth, ingress, budget },
      { auth: 5, ingress: 5, budget: 5 },
    )
    assert.equal(
      code(await h.call("get_game_draft", { draftId: newKey() })),
      "NOT_FOUND",
    )
    assert.deepEqual(
      { auth, ingress, budget },
      { auth: 6, ingress: 6, budget: 6 },
    )
    assert.equal(h.store.audit.length, 0)
    const tools = await h.client.listTools()
    assert.equal(
      tools.tools.find((t) => t.name === "get_game_draft")?.inputSchema
        .additionalProperties,
      false,
    )
    assert.equal(
      code(await h.call("get_game_draft", { [marker]: marker })),
      "VALIDATION_FAILED",
    )
    assert.deepEqual(
      { auth, ingress, budget },
      { auth: 7, ingress: 7, budget: 7 },
    )
  } finally {
    await h.close()
  }
})

test("unauthenticated malformed call consumes ingress budget and cannot reflect schema issues", async () => {
  let auth = 0,
    ingress = 0,
    budget = 0
  const h = await harness({
    authorize: () => {
      auth += 1

      return Promise.reject(new Error("secret-authorizer-detail"))
    },
    prevalidationLimit: () => {
      ingress += 1

      return Promise.resolve(true)
    },
    rateLimit: () => {
      budget += 1

      return Promise.resolve(true)
    },
  })

  try {
    const result = await h.call("get_game_draft", {
      arbitrarySecretKey: "secret-body",
    })
    assert.equal(code(result), "SCOPE_REQUIRED")
    assert.deepEqual(
      { auth, ingress, budget },
      { auth: 1, ingress: 1, budget: 0 },
    )
    assert.equal(JSON.stringify(result).includes("secret"), false)
    assert.equal(h.store.audit.length, 0)
  } finally {
    await h.close()
  }
})

test("denied or missing ingress guard fails closed before token verification and schema work", async () => {
  for (const prevalidationLimit of [undefined, () => Promise.resolve(false)]) {
    let auth = 0
    const h = await harness({
      prevalidationLimit,
      authorize: () =>
        promiseFrom(() => {
          auth += 1

          return principal()
        }),
    })

    try {
      const result = await h.call("get_game_draft", { untrusted: true })
      assert.equal(
        code(result),
        prevalidationLimit ? "RATE_LIMITED" : "DEPENDENCY_UNAVAILABLE",
      )
      assert.equal(auth, 0)
      assert.equal(h.store.audit.length, 0)
    } finally {
      await h.close()
    }
  }
})
