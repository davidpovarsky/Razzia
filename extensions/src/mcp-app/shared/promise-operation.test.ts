import { describe, expect, it } from "vitest"
import { promiseFrom } from "./promise-operation"

describe("promiseFrom", () => {
  it("runs work immediately and preserves queued reaction order", async () => {
    const events: string[] = []
    const result = { revision: 1 }
    const pending = promiseFrom(() => {
      events.push("operation")
      queueMicrotask(() => events.push("queued"))

      return result
    })
    void pending.then(() => events.push("reaction"))

    expect(events).toEqual(["operation"])
    expect(pending).toBeInstanceOf(Promise)
    expect(await pending).toBe(result)
    expect(events).toEqual(["operation", "queued", "reaction"])
  })

  it("keeps a synchronous failure as the same rejected value", async () => {
    const failure = new Error("owned operation failed")
    const pending = promiseFrom(() => {
      throw failure
    })

    await expect(pending).rejects.toBe(failure)
  })

  it("completes finally before settling and retains a cleanup failure", async () => {
    const events: string[] = []
    const failure = new Error("owned close failed")
    const close = () => {
      events.push("close")
      throw failure
    }
    const pending = promiseFrom(() => {
      try {
        events.push("body")

        return { revision: 1 }
      } finally {
        close()
      }
    })

    expect(events).toEqual(["body", "close"])
    await expect(pending).rejects.toBe(failure)
  })

  it("retains the lexical receiver and exact returned object", async () => {
    const owner = {
      calls: 0,
      value: { revision: 1 },
      read() {
        return promiseFrom(() => {
          this.calls += 1

          return this.value
        })
      },
    }
    const pending = owner.read()

    expect(owner.calls).toBe(1)
    expect(await pending).toBe(owner.value)
  })
})
