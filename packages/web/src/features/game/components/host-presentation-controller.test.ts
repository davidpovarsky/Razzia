import { describe, expect, it } from "vitest"
import {
  resolvePresentationShortcut,
  shouldIgnorePresentationShortcut,
} from "./host-presentation-controller"

describe("P0 host presentation keyboard map", () => {
  const key = (value: string, shiftKey = false) =>
    resolvePresentationShortcut({ key: value, shiftKey })

  it("keeps next, timer and pause as separate actions", () => {
    expect(key(" ")).toBe("next")
    expect(key("Enter")).toBe("next")
    expect(key("ArrowRight")).toBe("next")
    expect(key("t")).toBe("end-timer")
    expect(key("P")).toBe("pause-toggle")
  })

  it("maps destructive chords without using browser Alt+Left", () => {
    expect(key("ArrowRight", true)).toBe("skip-question")
    expect(key("S", true)).toBe("skip-question")
    expect(key("ArrowLeft", true)).toBe("replay-previous-question")
    expect(key("ArrowLeft")).toBe("previous")
    expect(key("Escape")).toBe("exit")
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
