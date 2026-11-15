import { describe, expect, it, vi } from "vitest"
import { createPreviewCoordinator } from "../components/game-preview/coordinator"
import { createPreviewRequestOwner } from "../components/game-preview/request-owner"

function deferred<T>() {
  return Promise.withResolvers<T>()
}

describe("inline UI resource ownership (synthetic ports, no renderer parity claim)", () => {
  it("20 rapid card switches abort old leases and mount only after teardown", async () => {
    const owner = createPreviewCoordinator()
    const active = { count: 0 }
    const leases = []
    const drains: Array<ReturnType<typeof deferred<undefined>>> = []
    for (let index = 0; index < 20; index += 1) {
      const drain = deferred<undefined>()
      drains.push(drain)
      const lease = owner.claim(() => {
        active.count -= 1

        return drain.promise
      })
      leases.push(lease)
      // Model resource ownership separately from the real stage/provider.
      active.count += 1
      expect(active.count).toBe(1)
    }

    expect(leases.slice(0, -1).every((lease) => lease.signal.aborted)).toBe(
      true,
    )
    let ready = false
    const waiting = leases[19].ready().then((value) => {
      ready = value
    })
    await Promise.resolve()
    expect(ready).toBe(false)
    for (const drain of drains.slice(0, -1)) {
      drain.resolve(undefined)
    }
    await waiting
    expect(ready).toBe(true)
    for (const lease of leases.slice(0, -1)) {
      expect(await lease.ready()).toBe(false)
      lease.release()
    }
    expect(leases[19].isCurrent()).toBe(true)
    owner.dispose()
    drains[19].resolve(undefined)
    expect(active.count).toBe(0)
    expect(leases.every((lease) => lease.signal.aborted)).toBe(true)
  })

  it("a cleanup rejection fails closed before the next mount", async () => {
    const owner = createPreviewCoordinator()
    const first = owner.claim(() => Promise.reject(new Error("dispose failed")))
    expect(await first.ready()).toBe(true)
    const second = owner.claim(vi.fn())
    expect(await second.ready()).toBe(false)
    expect(first.signal.aborted).toBe(true)
    owner.dispose()
  })

  it("a synchronous cleanup failure cannot admit another stage", async () => {
    const owner = createPreviewCoordinator()
    owner.claim(() => {
      throw new Error("dispose failed")
    })
    const second = owner.claim(vi.fn())
    expect(await second.ready()).toBe(false)
    owner.dispose()
  })

  it("20 out-of-order UI seek results cannot replace the final request", async () => {
    const owner = createPreviewRequestOwner()
    const operations = Array.from({ length: 20 }, () => deferred<number>())
    const signals: AbortSignal[] = []
    const results = operations.map((operation) =>
      owner.run((signal) => {
        signals.push(signal)

        return operation.promise
      }),
    )
    operations[19].resolve(19)
    expect(await results[19]).toEqual({ status: "completed", value: 19 })
    for (let index = 18; index >= 0; index -= 1) {
      operations[index].resolve(index)
      expect(await results[index]).toEqual({ status: "superseded" })
    }
    expect(signals.slice(0, -1).every((signal) => signal.aborted)).toBe(true)
    owner.dispose()
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  it("disposal masks late failure and prevents new provider calls", async () => {
    const owner = createPreviewRequestOwner()
    const operation = deferred<undefined>()
    const pending = owner.run(() => operation.promise)
    owner.dispose()
    operation.reject(new Error("late private response"))
    expect(await pending).toEqual({ status: "superseded" })
    const unused = vi.fn()
    expect(await owner.run(unused)).toEqual({ status: "superseded" })
    expect(unused).not.toHaveBeenCalled()
  })
})
