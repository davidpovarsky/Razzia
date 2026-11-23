import assert from "node:assert/strict"
import test from "node:test"
import {
  deferred,
  drain,
  until,
  lifecycleHarness,
} from "./lifecycle-fixture.ts"
import { code, principal, harness, newKey } from "./fixtures.ts"
import { synchronousPromise } from "../../../core/synchronous-promise.ts"

test(
  "SDK cancellation during pending authorization restores capacity only after real work settles",
  { timeout: 15_000 },
  async () => {
    const gate = deferred<unknown>()
    const p = principal()
    let auth = 0,
      reads = 0
    const h = await lifecycleHarness({
      authorize: async () => {
        auth += 1

        return auth === 1 ? gate.promise : p
      },
      drafts: {
        get() {
          reads += 1

          return Promise.resolve(undefined)
        },
        create() {
          return Promise.reject(
            new Error("Read-only lifecycle fixture must not create drafts"),
          )
        },
        replace() {
          return Promise.reject(
            new Error("Read-only lifecycle fixture must not replace drafts"),
          )
        },
      },
    })

    try {
      const abort = new AbortController()
      const cancelled = h.read(abort.signal)
      const rejected = assert.rejects(cancelled)
      await until(() => auth === 1)
      abort.abort()
      await rejected
      await drain()
      assert.equal(reads, 0)
      gate.resolve(p)
      await drain()
      const results = await Promise.all(
        Array.from({ length: 32 }, () => h.read()),
      )
      assert.ok(results.every((result) => code(result) === "NOT_FOUND"))
      assert.equal(reads, 32)
      assert.equal(auth, 33)
      assert.equal(h.flags.closed, false)
    } finally {
      gate.resolve(p)
      await h.close()
    }
  },
)

test(
  "cancelled unsettled admission stays bounded at32; another factory remains unaffected",
  { timeout: 15_000 },
  async () => {
    const gate = deferred<unknown>()
    const p = principal()
    let auth = 0
    const h = await lifecycleHarness({
      authorize: async () => {
        auth += 1

        return gate.promise
      },
    })
    const other = await harness()

    try {
      for (let i = 0; i < 32; i += 1) {
        await h.injectRead(`held-${i}`)
      }
      await until(() => auth === 32)
      for (let i = 0; i < 32; i += 1) {
        await h.cancel(`held-${i}`)
      }
      await drain()
      await h.injectRead("cannot-admit-33")
      await until(() => h.flags.closed)
      assert.equal(auth, 32)
      assert.equal(
        code(await other.call("get_game_draft", { draftId: newKey() })),
        "NOT_FOUND",
      )
      const { sends } = h.flags
      gate.resolve(p)
      await drain()
      assert.equal(h.flags.sends, sends)
    } finally {
      gate.resolve(p)
      await Promise.all([h.close(), other.close()])
    }
  },
)

test(
  "normal SDK running-handler cancellation releases all32 slots after handlers settle",
  { timeout: 15_000 },
  async () => {
    const gate = deferred()
    let entered = 0,
      slow = true
    const h = await lifecycleHarness({
      drafts: {
        async get() {
          entered += 1

          if (slow) {
            await gate.promise
          }

          return undefined
        },
        create() {
          return Promise.reject(
            new Error("Read-only lifecycle fixture must not create drafts"),
          )
        },
        replace() {
          return Promise.reject(
            new Error("Read-only lifecycle fixture must not replace drafts"),
          )
        },
      },
    })

    try {
      const controllers = Array.from(
        { length: 32 },
        () => new AbortController(),
      )
      const pending = controllers.map((c) => h.read(c.signal))
      const rejections = pending.map((p) => assert.rejects(p))
      await until(() => entered === 32)
      controllers.forEach((c) => {
        c.abort()
      })
      await Promise.all(rejections)
      await drain()
      const before = h.flags.sends
      slow = false
      gate.resolve()
      await drain()
      // SDK abort suppresses the original responses.

      assert.equal(h.flags.sends, before)
      const results = await Promise.all(
        Array.from({ length: 32 }, () => h.read()),
      )
      assert.ok(results.every((r) => code(r) === "NOT_FOUND"))
      assert.equal(entered, 64)
      assert.equal(h.flags.closed, false)
    } finally {
      gate.resolve()
      await h.close()
    }
  },
)

test(
  "duplicate tool/public active IDs close only their owning connection",
  { timeout: 15_000 },
  async () => {
    const gate = deferred<unknown>()
    const p = principal()
    let auth = 0
    const h = await lifecycleHarness({
      authorize: async () => {
        auth += 1

        return gate.promise
      },
    })
    const other = await harness()

    try {
      await h.injectRead("duplicate")
      await until(() => auth === 1)
      await h.injectPublic("duplicate")
      await until(() => h.flags.closed)
      assert.equal(auth, 1)
      assert.equal(
        code(await other.call("get_game_draft", { draftId: newKey() })),
        "NOT_FOUND",
      )
    } finally {
      gate.resolve(p)
      await drain()
      await Promise.all([h.close(), other.close()])
    }
  },
)

test(
  "close while authorization is pending suppresses late rejection, dispatch and send",
  { timeout: 15_000 },
  async () => {
    const gate = deferred<unknown>()
    let auth = 0,
      reads = 0
    const h = await lifecycleHarness({
      authorize: async () => {
        auth += 1

        return gate.promise
      },
      drafts: {
        get() {
          reads += 1

          return Promise.resolve(undefined)
        },
        create() {
          return Promise.reject(
            new Error("Read-only lifecycle fixture must not create drafts"),
          )
        },
        replace() {
          return Promise.reject(
            new Error("Read-only lifecycle fixture must not replace drafts"),
          )
        },
      },
    })

    try {
      await h.injectRead("closing")
      await until(() => auth === 1)
      await h.server.close()
      const { sends } = h.flags
      gate.reject(new Error("synthetic-secret-late-auth"))
      await drain()
      await h.injectRead("after-close")
      await drain()
      assert.equal(reads, 0)
      assert.equal(auth, 1)
      assert.equal(h.flags.sends, sends)
      assert.equal(h.flags.closes, 1)
      assert.equal(
        JSON.stringify(h.serverMessages).includes("synthetic-secret"),
        false,
      )
    } finally {
      await h.close()
    }
  },
)

test(
  "same wire ID reuse is independently authorized after a cancelled lifetime settles",
  { timeout: 15_000 },
  async () => {
    const first = deferred<unknown>()
    const a = principal(),
      b = principal()
    let auth = 0
    const readers: string[] = []
    const h = await lifecycleHarness({
      authorize: async () => {
        auth += 1

        return auth === 1 ? first.promise : b
      },
      drafts: {
        get(p) {
          return synchronousPromise(() => {
            readers.push(p.accountId)

            return undefined
          })
        },
        create() {
          return Promise.reject(
            new Error("Read-only lifecycle fixture must not create drafts"),
          )
        },
        replace() {
          return Promise.reject(
            new Error("Read-only lifecycle fixture must not replace drafts"),
          )
        },
      },
    })

    try {
      await h.injectRead("reused")
      await until(() => auth === 1)
      await h.cancel("reused")
      first.resolve(a)
      await drain()
      assert.equal(readers.length, 0)
      await h.injectRead("reused")
      await until(() => readers.length === 1)
      await drain()
      assert.deepEqual(readers, [b.accountId])
      const replies = h.serverMessages.filter(
        (m) => !("method" in m) && "id" in m && m.id === "reused",
      )
      assert.equal(replies.length, 1)
      assert.equal(h.flags.closed, false)
    } finally {
      first.resolve(a)
      await h.close()
    }
  },
)

test(
  "supported SDK abort signal is preserved; cancellation does not roll back settled work",
  { timeout: 15_000 },
  async () => {
    const gate = deferred()
    let started = 0,
      aborted = false,
      completed = 0
    const h = await lifecycleHarness({}, async (context) => {
      started += 1

      context.mcpReq.signal.addEventListener(
        "abort",
        () => {
          aborted = true
        },
        { once: true },
      )
      await gate.promise
      // Read-only completion marker, not a real durable mutation.

      completed += 1

      return { content: [{ type: "text", text: "synthetic" }] }
    })

    try {
      const controller = new AbortController()
      const rejected = assert.rejects(h.read(controller.signal))
      await until(() => started === 1)
      controller.abort()
      await rejected
      await until(() => aborted)
      const { sends } = h.flags
      gate.resolve()
      await drain()
      assert.equal(completed, 1)
      assert.equal(h.flags.sends, sends)
    } finally {
      gate.resolve()
      await h.close()
    }
  },
)

test(
  "rejected send/close reports safe errors and makes the connection terminal",
  { timeout: 15_000 },
  async () => {
    let runs = 0
    const h = await lifecycleHarness({}, () => {
      runs += 1

      return Promise.resolve({ content: [{ type: "text", text: "synthetic" }] })
    })

    try {
      h.flags.failSend = true
      h.flags.failClose = true
      await h.injectRead("send-fails")
      await until(() =>
        h.errors.some((e) => e.includes("Transport close failed")),
      )
      await assert.rejects(h.server.close(), /^Error: Transport close failed$/)
      const { sends } = h.flags
      await h.injectRead("terminal")
      await drain()
      assert.equal(runs, 1)
      assert.equal(h.flags.sends, sends)
      assert.ok(h.errors.some((e) => e.includes("Transport send failed")))
      assert.equal(
        h.errors.some((e) => e.includes("synthetic-secret")),
        false,
      )
    } finally {
      await h.close()
    }
  },
)
