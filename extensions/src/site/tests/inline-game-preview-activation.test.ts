import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createPreviewActivation,
  type PressInput,
} from "../components/game-preview/activation"

const press: PressInput = {
  pointerId: 7,
  pointerType: "mouse",
  x: 40,
  y: 40,
  button: 0,
  primary: true,
  nestedAction: false,
}
afterEach(() => vi.useRealTimers())

describe("inline preview cover hold", () => {
  it("preserves an ordinary click and the scroll threshold", () => {
    vi.useFakeTimers()
    const open = vi.fn()
    const activation = createPreviewActivation(open)
    activation.down(press)
    vi.advanceTimersByTime(449)
    activation.up(press.pointerId)
    vi.advanceTimersByTime(1000)
    expect(open).not.toHaveBeenCalled()
    expect(activation.consumeClick()).toBe(false)
    activation.down(press)
    activation.move(press.pointerId, 50, 40)
    vi.advanceTimersByTime(450)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it.each(["mouse", "touch", "pen"])(
    "%s input activates at450ms, release stays open, suppresses one ghost click",
    (pointerType) => {
      vi.useFakeTimers()
      const open = vi.fn()
      const activation = createPreviewActivation(open)
      activation.down({ ...press, pointerType })
      expect(activation.interceptContextMenu()).toBe(false)
      vi.advanceTimersByTime(450)
      activation.up(press.pointerId)
      expect(open).toHaveBeenCalledTimes(1)
      expect(activation.interceptContextMenu()).toBe(true)
      expect(activation.consumeClick()).toBe(true)
      expect(activation.consumeClick()).toBe(false)
    },
  )

  it.each(["scroll", "pointercancel", "leave", "blur", "route"])(
    "%s cancels before activation without suppressing a normal click",
    () => {
      vi.useFakeTimers()
      const open = vi.fn()
      const activation = createPreviewActivation(open)
      activation.down(press)
      vi.advanceTimersByTime(200)
      activation.cancel()
      vi.advanceTimersByTime(500)
      expect(open).not.toHaveBeenCalled()
      expect(activation.consumeClick()).toBe(false)
    },
  )

  it("cancels movement beyond10px and ignores another pointer's coordinates", () => {
    vi.useFakeTimers()
    const open = vi.fn()
    const activation = createPreviewActivation(open)
    activation.down(press)
    activation.move(8, 300, 300)
    activation.move(7, 48, 48)
    vi.advanceTimersByTime(450)
    expect(open).not.toHaveBeenCalled()
  })

  it.each([{ nestedAction: true }, { primary: false }, { button: 2 }])(
    "rejects nested actions, secondary pointers or context clicks: %o",
    (change) => {
      vi.useFakeTimers()
      const open = vi.fn()
      const activation = createPreviewActivation(open)
      activation.down({ ...press, ...change })
      vi.advanceTimersByTime(1000)
      expect(open).not.toHaveBeenCalled()
    },
  )

  it("does not swallow a subsequent new real gesture if the browser omitted a click", () => {
    vi.useFakeTimers()
    const activation = createPreviewActivation(vi.fn())
    activation.down(press)
    vi.advanceTimersByTime(450)
    activation.up(7)
    activation.down(press)
    activation.up(7)
    expect(activation.consumeClick()).toBe(false)
  })

  it("unmount clears the pending timer and prevents later activation", () => {
    vi.useFakeTimers()
    const open = vi.fn()
    const activation = createPreviewActivation(open)
    activation.down(press)
    activation.dispose()
    activation.down(press)
    vi.advanceTimersByTime(1000)
    expect(open).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
