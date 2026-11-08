import { describe, expect, it, vi } from "vitest"
import {
  resolvePresentationShortcut,
  shouldIgnorePresentationShortcut,
  isDoublePress,
  DOUBLE_PRESS_WINDOW_MS,
} from "./host-presentation-controller"

describe("P0 host presentation keyboard map", () => {
  it("blocks game keys while a modal is open even if fullscreen moves focus outside it", () => {
    vi.stubGlobal("document", { querySelector: () => ({}) })
    try {
      expect(
        shouldIgnorePresentationShortcut({
          target: { tagName: "BODY", closest: () => null },
        } as unknown as KeyboardEvent),
      ).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })
  const key = (value: string, shiftKey = false) =>
    resolvePresentationShortcut({ key: value, shiftKey })

  it("keeps next, timer and pause as separate actions", () => {
    expect(key(" ")).toBe("pause-toggle")
    expect(key("Enter")).toBe("end-timer")
    expect(key("ArrowRight")).toBe("next")
    expect(key("t")).toBeNull()
    expect(key("P")).toBeNull()
  })

  it("maps destructive chords without using browser Alt+Left", () => {
    expect(key("ArrowRight", true)).toBeNull()
    expect(key("S", true)).toBeNull()
    expect(key("ArrowLeft", true)).toBeNull()
    expect(key("ArrowLeft")).toBe("previous")
    expect(key("Escape")).toBe("exit")
  })

  it("requires two matching presses inside the half-second window", () => {
    expect(DOUBLE_PRESS_WINDOW_MS).toBe(500)
    expect(isDoublePress(null, "ArrowRight", 1000)).toBe(false)
    expect(
      isDoublePress({ chord: "ArrowRight", until: 1500 }, "ArrowRight", 1300),
    ).toBe(true)
    expect(
      isDoublePress({ chord: "ArrowRight", until: 1500 }, "ArrowLeft", 1300),
    ).toBe(false)
    expect(
      isDoublePress({ chord: "ArrowRight", until: 1500 }, "ArrowRight", 1501),
    ).toBe(false)
  })

  it("ignores repeats, modifiers, interactive focus and dialogs", () => {
    const base = {
      defaultPrevented: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      repeat: false,
    }
    expect(
      shouldIgnorePresentationShortcut({
        ...base,
        repeat: true,
      } as KeyboardEvent),
    ).toBe(true)
    expect(
      shouldIgnorePresentationShortcut({
        ...base,
        altKey: true,
      } as KeyboardEvent),
    ).toBe(true)
    expect(
      shouldIgnorePresentationShortcut({
        ...base,
        target: {
          tagName: "INPUT",
          isContentEditable: false,
          closest: () => null,
        },
      } as unknown as KeyboardEvent),
    ).toBe(true)
    expect(
      shouldIgnorePresentationShortcut({
        ...base,
        target: {
          tagName: "DIV",
          isContentEditable: false,
          closest: () => ({}),
        },
      } as unknown as KeyboardEvent),
    ).toBe(true)
  })
})
