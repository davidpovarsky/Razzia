import assert from "node:assert/strict"
import test from "node:test"
import {
  deferred,
  drain,
  until,
  lifecycleHarness,
} from "./lifecycle-fixture.ts"
import { code, harness, newKey, principal } from "./fixtures.ts"

test(
  "32 cancelled response writes retain the budget until public send promises settle",
  { timeout: 15_000 },
  async () => {
    const gate = deferred()
    const p = principal()
    let auth = 0,
      held = 0
    const h = await lifecycleHarness(
      {
        authorize: async () => {
          auth++
          return p
        },
      },
      undefined,
      async (message) => {
        if (
          !("method" in message) &&
          "id" in message &&
          String(message.id).startsWith("send-budget-")
        ) {
          held++
          await gate.promise
        }
      },
    )
    try {
      for (let i = 0; i < 32; i++) await h.injectRead("send-budget-" + i)
      await until(() => held === 32)
      for (let i = 0; i < 32; i++) await h.cancel("send-budget-" + i)
      await drain()
      await h.injectRead("send-budget-overflow")
      await until(() => h.flags.closed)
      assert.equal(auth, 32)
      gate.resolve()
      await drain()
    } finally {
      gate.resolve()
      await h.close()
    }
  },
)

test(
  "a cancelled in-flight response reserves its wire ID before public send completion",
  { timeout: 15_000 },
  async () => {
    const gate = deferred()
    const p = principal()
    let auth = 0,
      held = false
    let armed = false
    let wireId: string | number = "not-started"
    const h = await lifecycleHarness(
      {
        authorize: async () => {
          auth++
          return p
        },
      },
      undefined,
      async (message) => {
        if (
          armed &&
          !held &&
          !("method" in message) &&
          "id" in message &&
          (typeof message.id === "string" || typeof message.id === "number")
        ) {
          wireId = message.id
          held = true
          await gate.promise
        }
      },
    )
    try {
      armed = true
      const controller = new AbortController()
      const rejected = assert.rejects(h.read(controller.signal))
      await until(() => held)
      controller.abort()
      await rejected
      await drain()
      await h.injectRead(wireId)
      await until(() => h.flags.closed)
      assert.equal(auth, 1)
    } finally {
      gate.resolve()
      await drain()
      await h.close()
    }
  },
)

test(
  "overlapping response/related owner releases once after send settles and reuse reauthorizes",
  { timeout: 15_000 },
  async () => {
    const gate = deferred()
    const a = principal(),
      b = principal()
    let auth = 0,
      ingress = 0,
      budget = 0,
      held = false
    const readers: string[] = []
    let related: unknown
    const h = await lifecycleHarness(
      {
        authorize: async () => (++auth === 1 ? a : b),
        prevalidationLimit: async () => {
          ingress++
          return true
        },
        rateLimit: async () => {
          budget++
          return true
        },
        drafts: {
          async get(p) {
            readers.push(p.accountId)
            return undefined
          },
          async create() {
            throw 0
          },
          async replace() {
            throw 0
          },
        },
      },
      undefined,
      async (message, options) => {
        if (
          !held &&
          !("method" in message) &&
          "id" in message &&
          message.id === "owner-overlap"
        ) {
          held = true
          related = options?.relatedRequestId
          await gate.promise
        }
      },
    )
    try {
      // Strict schema rejection sends a response AND relatedRequestId for the same owner.
      await h.injectRead("owner-overlap", { syntheticUnknown: true })
      await until(() => held)
      assert.equal(related, "owner-overlap")
      await h.cancel("owner-overlap")
      await drain()
      gate.resolve()
      await drain()
      await h.injectRead("owner-overlap")
      await until(() => readers.length === 1)
      await drain()
      assert.deepEqual(readers, [b.accountId])
      const results = await Promise.all(
        Array.from({ length: 32 }, () => h.read()),
      )
      assert.ok(results.every((result) => code(result) === "NOT_FOUND"))
      assert.equal(h.flags.closed, false)
      assert.deepEqual(
        { auth, ingress, budget },
        { auth: 34, ingress: 34, budget: 34 },
      )
    } finally {
      gate.resolve()
      await h.close()
    }
  },
)

test(
  "rejected delayed response write terminates only its connection with safe errors",
  { timeout: 15_000 },
  async () => {
    const gate = deferred()
    const p = principal()
    let auth = 0,
      held = false
    const h = await lifecycleHarness(
      {
        authorize: async () => {
          auth++
          return p
        },
      },
      async () => ({ content: [{ type: "text", text: "synthetic read" }] }),
      async (message) => {
        if (
          !("method" in message) &&
          "id" in message &&
          message.id === "reject-write"
        ) {
          held = true
          await gate.promise
        }
      },
    )
    const other = await harness()
    try {
      await h.injectRead("reject-write")
      await until(() => held)
      await h.cancel("reject-write")
      gate.reject(new Error("synthetic-secret-async-write"))
      await until(() => h.flags.closed)
      await drain()
      assert.ok(
        h.errors.some((error) => error.includes("Transport send failed")),
      )
      assert.equal(
        h.errors.some((error) => error.includes("synthetic-secret")),
        false,
      )
      await h.injectRead("after-rejected-write")
      await drain()
      assert.equal(auth, 1)
      assert.equal(h.flags.closes, 1)
      assert.equal(
        code(await other.call("get_game_draft", { draftId: newKey() })),
        "NOT_FOUND",
      )
    } finally {
      gate.resolve()
      await Promise.all([h.close(), other.close()])
    }
  },
)

for (const duplicate of [true, false]) {
  test(
    "pending related progress keeps its parent reserved: " +
      (duplicate ? "duplicate denied" : "settled reuse reauthorizes"),
    { timeout: 15_000 },
    async () => {
      const gate = deferred()
      const p = principal()
      let auth = 0,
        held = false
      let related: unknown
      const writes: Promise<void>[] = []
      const h = await lifecycleHarness(
        {
          authorize: async () => {
            auth++
            return p
          },
        },
        async (context) => {
          const write = context.mcpReq.notify({
            method: "notifications/progress",
            params: { progressToken: "synthetic-progress", progress: 1 },
          })
          writes.push(write)
          void write.catch(() => {})
          return { content: [{ type: "text", text: "synthetic read" }] }
        },
        async (message, options) => {
          if (
            !held &&
            "method" in message &&
            message.method === "notifications/progress"
          ) {
            held = true
            related = options?.relatedRequestId
            await gate.promise
          }
        },
      )
      const responses = () =>
        h.serverMessages.filter(
          (m) => !("method" in m) && "id" in m && m.id === "progress-parent",
        )
      try {
        await h.injectRead("progress-parent")
        await until(() => held && responses().length === 1)
        assert.equal(related, "progress-parent")
        await h.cancel("progress-parent")
        await drain()
        if (duplicate) {
          await h.injectRead("progress-parent")
          await until(() => h.flags.closed)
          assert.equal(auth, 1)
        } else {
          gate.resolve()
          await Promise.all(writes)
          await drain()
          await h.injectRead("progress-parent")
          await until(() => responses().length === 2)
          assert.equal(auth, 2)
          assert.equal(h.flags.closed, false)
        }
      } finally {
        gate.resolve()
        await Promise.allSettled(writes)
        await drain()
        await h.close()
      }
    },
  )
}
