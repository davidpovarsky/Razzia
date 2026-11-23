import { describe, expect, it, vi } from "vitest"
import { createApplicationFrameCommitOwner } from "./application-frame-commit"

describe("native application frame completion ownership", () => {
  it("keeps same-chapter pause/resume updates pending until actual presentation", async () => {
    const owner = createApplicationFrameCommitOwner()
    const first = owner.request("question:1")
    const observed = vi.fn()
    void first.promise.then(observed)
    const resumed = owner.request("question:1")
    expect(first.isCurrent()).toBe(false)
    expect(resumed.isCurrent()).toBe(true)
    expect(resumed.isPresented()).toBe(false)
    await Promise.resolve()
    expect(observed).not.toHaveBeenCalled()
    resumed.acknowledge()
    await Promise.all([first.promise, resumed.promise])
    expect(observed).toHaveBeenCalledTimes(1)
    expect(resumed.isPresented()).toBe(true)
    owner.dispose()
  })

  it("retains a real same-chapter acknowledgement arriving before the latest render", async () => {
    const owner = createApplicationFrameCommitOwner()
    const painting = owner.request("question:1")
    const update = owner.request("question:1")
    painting.acknowledge()
    await update.promise
    expect(update.isPresented()).toBe(true)
    const elapsedUpdate = owner.request("question:1")
    expect(elapsedUpdate.isPresented()).toBe(true)
    elapsedUpdate.settle()
    await elapsedUpdate.promise
    owner.dispose()
  })

  it("settles superseded chapters without treating cancellation as presentation", async () => {
    const owner = createApplicationFrameCommitOwner()
    const old = owner.request("question:1")
    const next = owner.request("question:2")
    await old.promise
    expect(next.isPresented()).toBe(false)
    const observed = vi.fn()
    void next.promise.then(observed)
    old.acknowledge()
    await Promise.resolve()
    expect(observed).not.toHaveBeenCalled()
    expect(next.isPresented()).toBe(false)
    next.acknowledge()
    await next.promise
    owner.dispose()
  })

  it("does not grant the fast path after an unavailable or canceled completion", async () => {
    const owner = createApplicationFrameCommitOwner()
    const canceled = owner.request("question:1")
    canceled.settle()
    await canceled.promise
    const retry = owner.request("question:1")
    expect(retry.isPresented()).toBe(false)
    retry.acknowledge()
    await retry.promise
    expect(retry.isPresented()).toBe(true)
    owner.dispose()
  })

  it("rejects an old acknowledgement after leaving and returning to the same key", async () => {
    const owner = createApplicationFrameCommitOwner()
    const first = owner.request("question:1")
    first.acknowledge()
    const other = owner.request("question:2")
    const replayed = owner.request("question:1")
    await other.promise
    first.acknowledge()
    expect(replayed.isPresented()).toBe(false)
    replayed.acknowledge()
    await replayed.promise
    expect(replayed.isPresented()).toBe(true)
    owner.dispose()
  })

  it("settles all same-key waiters on latest render failure without granting readiness", async () => {
    const owner = createApplicationFrameCommitOwner()
    const first = owner.request("question:1")
    const latest = owner.request("question:1")
    latest.unavailable()
    await Promise.all([first.promise, latest.promise])
    first.acknowledge()
    latest.acknowledge()
    expect(first.isPresented()).toBe(false)
    expect(latest.isPresented()).toBe(false)
    const retry = owner.request("question:1")
    expect(retry.isPresented()).toBe(false)
    latest.acknowledge()
    expect(retry.isPresented()).toBe(false)
    retry.acknowledge()
    await retry.promise
    expect(retry.isPresented()).toBe(true)
    owner.dispose()
  })

  it("cannot fail a replacement chapter through a stale unavailable callback", async () => {
    const owner = createApplicationFrameCommitOwner()
    const old = owner.request("question:1")
    const current = owner.request("question:2")
    const observed = vi.fn()
    void current.promise.then(observed)
    old.unavailable()
    await Promise.resolve()
    expect(observed).not.toHaveBeenCalled()
    expect(current.isCurrent()).toBe(true)
    expect(current.isPresented()).toBe(false)
    current.acknowledge()
    await current.promise
    expect(current.isPresented()).toBe(true)
    owner.dispose()
  })

  it("settles all pending same-chapter work on disposal and ignores late acknowledgement", async () => {
    const owner = createApplicationFrameCommitOwner()
    const first = owner.request("question:1")
    const second = owner.request("question:1")
    owner.dispose()
    await Promise.all([first.promise, second.promise])
    first.acknowledge()
    expect(second.isPresented()).toBe(false)
    expect(second.isCurrent()).toBe(false)
    expect(() => owner.request("question:2")).toThrow("Preview disposed")
  })
})
