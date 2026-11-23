import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import {
  fixture,
  createInput,
  origin,
  snapshot,
  requireObservedRecord,
  type Session,
} from "./fixtures.ts"
import { preserveWitness } from "./review-evidence.fixture.ts"

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

function request(session: Session, controller: AbortController) {
  return new Request(`${origin}/drafts`, {
    method: "POST",
    signal: controller.signal,
    headers: {
      host: new URL(origin).host,
      origin,
      "content-type": "application/json",
      authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify(createInput()),
  })
}

test("post-body abort retains pending real authentication work and creates no private store", async () => {
  const [session] = requireInitializedF().sessions
  const controller = new AbortController()
  const { subtle } = globalThis.crypto
  const original = subtle.verify
  const descriptor = Object.getOwnPropertyDescriptor(subtle, "verify")
  let calls = 0
  let reached: () => void = () => {
    /* The following Promise executor installs this callback synchronously. */
  }
  let release: () => void = () => {
    /* The following Promise executor installs this callback synchronously. */
  }
  const finalAuthEntered = new Promise<void>((resolve) => {
    reached = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  Reflect.defineProperty(subtle, "verify", {
    configurable: true,
    writable: true,
    value: async (...args: Parameters<typeof original>) => {
      calls += 1

      if (calls === 2) {
        reached()
        await gate
      }

      // Actual WebCrypto verification, not a fabricated valid-token result.
      return Reflect.apply(original, subtle, args)
    },
  })
  const beforeState = snapshot(requireInitializedF().root)
  let settled = false
  const response = requireInitializedF().app.fetch(request(session, controller))
  void response.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  const timeout = setTimeout(() => {
    release()
  }, 10_000)

  try {
    await Promise.race([
      finalAuthEntered,
      response.then(() => {
        throw new Error("Final real-auth barrier was not reached")
      }),
    ])
    controller.abort()
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
    assert.equal(controller.signal.aborted, true)
    assert.equal(settled, false)
    assert.equal(existsSync(requireInitializedF().file(session.owner)), false)
    release()
    const result = await response
    assert.equal(result.status, 400)
    assert.equal(requireObservedRecord(await result.json()).data, undefined)
    assert.equal(calls, 2)
    assert.equal(existsSync(requireInitializedF().file(session.owner)), false)
    assert.deepEqual(snapshot(requireInitializedF().root), beforeState)
    preserveWitness("abort-post-body", {
      status: result.status,
      realVerifyCalls: calls,
      responsePendingUntilAuthSettled: true,
      privateStoreCreated: false,
      snapshotEqual: true,
    })
  } finally {
    clearTimeout(timeout)
    release()
    await Promise.allSettled([response])

    if (descriptor) {
      Reflect.defineProperty(subtle, "verify", descriptor)
    } else {
      Reflect.deleteProperty(subtle, "verify")
    }
  }
})

test("abort at the verified-principal promise handoff prevents private work", async () => {
  const [, session] = requireInitializedF().sessions
  const controller = new AbortController()
  const original = Object.freeze
  const descriptor = Object.getOwnPropertyDescriptor(Object, "freeze")
  assert.ok(descriptor)
  let scheduled = false
  Reflect.defineProperty(Object, "freeze", {
    ...descriptor,
    value: (value: unknown) => {
      const frozen = original(value)

      if (
        value &&
        typeof value === "object" &&
        "kind" in value &&
        value.kind === "first-party-session" &&
        "sid" in value &&
        value.sid === session.sid
      ) {
        scheduled = true

        // The principal finishes its synchronous live-authority checks before this

        // microtask; abort runs before dispatch's await continuation resumes.
        queueMicrotask(() => controller.abort())
      }

      return frozen
    },
  })
  const beforeState = snapshot(requireInitializedF().root)

  try {
    const result = await requireInitializedF().app.fetch(
      request(session, controller),
    )
    assert.equal(scheduled, true)
    assert.equal(controller.signal.aborted, true)
    assert.equal(result.status, 400)
    assert.equal(requireObservedRecord(await result.json()).data, undefined)
    assert.equal(existsSync(requireInitializedF().file(session.owner)), false)
    assert.deepEqual(snapshot(requireInitializedF().root), beforeState)
    preserveWitness("abort-post-auth", {
      status: result.status,
      verifiedPrincipalObserved: scheduled,
      privateStoreCreated: false,
      snapshotEqual: true,
    })
  } finally {
    Reflect.defineProperty(Object, "freeze", descriptor)
  }
})

test("postcommit abort withholds disclosure without claiming rollback", async () => {
  const [session] = requireInitializedF().sessions
  const controller = new AbortController()
  const original = DatabaseSync.prototype.exec
  let committed = false
  DatabaseSync.prototype.exec = function exec(this: DatabaseSync, sql: string) {
    const result = original.call(this, sql)

    if (sql === "COMMIT") {
      committed = true
      controller.abort()
    }

    return result
  }

  try {
    const result = await requireInitializedF().app.fetch(
      request(session, controller),
    )
    assert.equal(committed, true)
    assert.equal(result.status, 400)
    assert.equal(requireObservedRecord(await result.json()).data, undefined)
  } finally {
    DatabaseSync.prototype.exec = original
  }

  const db = new DatabaseSync(requireInitializedF().file(session.owner), {
    readOnly: true,
  })

  try {
    const counts = ["drafts", "operations", "audit"].map(
      (name) => db.prepare(`SELECT count(*) AS n FROM ${name}`).get()?.n,
    )
    assert.deepEqual(counts, [1, 1, 1])
    preserveWitness("abort-postcommit", {
      committed: true,
      privateDisclosureWithheld: true,
      counts,
    })
  } finally {
    db.close()
  }
})
