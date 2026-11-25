import { describe, expect, it } from "vitest"
import { STATUS } from "@razzia/common/types/game/status"
import {
  resolveShowTheme,
  RAZZIA_THEME_ID,
  type ExtensionStateEnvelope,
} from "../../core"
import { showViewportStyle, viewportSlot } from "./viewport"

describe("show viewport backdrop ownership", () => {
  it("leaves original Razzia background ownership untouched", () => {
    const theme = resolveShowTheme({
      selection: { id: RAZZIA_THEME_ID, version: "1.0.0", overrides: {} },
      role: "manager",
    })
    expect(theme.definition.id).toBe(RAZZIA_THEME_ID)
    expect(showViewportStyle(theme, null, STATUS.SHOW_ROOM)).toBeUndefined()
  })
  it("uses the selected show's tokens rather than the platform/editor palette", () => {
    const theme = resolveShowTheme({ role: "manager" })
    const style = showViewportStyle(theme, null, STATUS.SHOW_ROOM)
    expect(style?.backgroundColor).toBe(theme.definition.tokens.background)
    expect(style?.backgroundImage).toMatch(/tadazz-show/u)
    expect(style?.backgroundSize).toBe("cover")
    expect(JSON.stringify(style)).not.toMatch(/assets\/background\.png|--tds-/u)
  })
  it("uses an explicit per-slot custom media fit without changing the selected theme", () => {
    const theme = resolveShowTheme({
      role: "manager",
      selection: {
        id: "tadazz-classic",
        version: "1.0.0",
        overrides: {
          slots: {
            question: {
              mediaUrl: "/media/fixture-background.png",
              fit: "contain",
            },
          },
        },
      },
    })
    const before = JSON.stringify(theme)
    expect(showViewportStyle(theme, null, STATUS.SHOW_QUESTION)).toMatchObject({
      backgroundImage: 'url("/media/fixture-background.png")',
      backgroundSize: "contain",
    })
    expect(JSON.stringify(theme)).toBe(before)
  })
  it("resolves live status slots and scene priority without advancing the game", () => {
    expect(viewportSlot(null)).toBe("firstPaint")
    expect(viewportSlot(null, STATUS.SHOW_ROOM)).toBe("lobby")
    expect(viewportSlot(null, STATUS.SELECT_ANSWER)).toBe("voting")
    expect(viewportSlot(null, STATUS.SHOW_RESULT)).toBe("resultsReveal")
    expect(viewportSlot(null, STATUS.SHOW_LEADERBOARD)).toBe("leaderboard")
    expect(viewportSlot(null, STATUS.SUMMARY)).toBe("closing")
    expect(
      viewportSlot(
        { phase: "scene" } as ExtensionStateEnvelope,
        STATUS.SHOW_QUESTION,
      ),
    ).toBe("interlude")
  })
})
