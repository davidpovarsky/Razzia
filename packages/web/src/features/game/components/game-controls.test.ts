import { STATUS } from "@razzia/common/types/game/status"
import { describe, expect, it } from "vitest"
import { shouldIgnoreKeyboardShortcut } from "./ManagerControlToolbar"

describe("A2: Host Control Surface & Permissions Logic (Maya V3)", () => {
  const evaluatePermissions = (
    statusName: string,
    currentQuestionIdx: number,
    isInterlude = false,
  ) => {
    const isLobby = statusName === STATUS.SHOW_ROOM
    const isFinished =
      statusName === STATUS.FINISHED || statusName === STATUS.SUMMARY
    const canSkipQuestion =
      statusName === STATUS.SHOW_PREPARED ||
      statusName === STATUS.SHOW_QUESTION ||
      statusName === STATUS.SELECT_ANSWER
    const canEndTimer = statusName === STATUS.SELECT_ANSWER
    const canNextScreen =
      statusName === STATUS.SHOW_RESPONSES ||
      statusName === STATUS.SHOW_LEADERBOARD ||
      isInterlude
    const canViewHistory = currentQuestionIdx > 0 && !isLobby && !isFinished

    return {
      isLobby,
      isFinished,
      canSkipQuestion,
      canEndTimer,
      canNextScreen,
      canViewHistory,
    }
  }

  it("lobby (SHOW_ROOM): start game active, exit direct, history disabled, skip disabled", () => {
    const perms = evaluatePermissions(STATUS.SHOW_ROOM, 0)
    expect(perms.isLobby).toBe(true)
    expect(perms.canEndTimer).toBe(false)
    expect(perms.canNextScreen).toBe(false)
    expect(perms.canSkipQuestion).toBe(false)
    expect(perms.canViewHistory).toBe(false)
  })

  it("answering (SELECT_ANSWER): End Timer active, Skip Question with confirm active, Next Screen disabled", () => {
    const perms = evaluatePermissions(STATUS.SELECT_ANSWER, 0)
    expect(perms.canEndTimer).toBe(true)
    expect(perms.canSkipQuestion).toBe(true)
    expect(perms.canNextScreen).toBe(false)
  })

  it("results (SHOW_RESPONSES): Next Screen active, End Timer disabled, Skip Question disabled to protect scores", () => {
    const perms = evaluatePermissions(STATUS.SHOW_RESPONSES, 1)
    expect(perms.canNextScreen).toBe(true)
    expect(perms.canEndTimer).toBe(false)
    // Never allow skipping scored question!
    expect(perms.canSkipQuestion).toBe(false)
    // History available for question 1+
    expect(perms.canViewHistory).toBe(true)
  })

  it("interlude: Next Screen active (delegates to END_OR_SKIP_INTERLUDE)", () => {
    const perms = evaluatePermissions("INTERLUDE", 1, true)
    expect(perms.canNextScreen).toBe(true)
    expect(perms.canEndTimer).toBe(false)
  })

  it("question 1 (idx=0): history button disabled (no past questions yet)", () => {
    const perms = evaluatePermissions(STATUS.SELECT_ANSWER, 0)
    expect(perms.canViewHistory).toBe(false)
  })

  it("question 2+ (idx=1+): read-only history viewer active with Replay option", () => {
    const perms = evaluatePermissions(STATUS.SELECT_ANSWER, 1)
    expect(perms.canViewHistory).toBe(true)
  })

  describe("A4: Keyboard shortcut focus & dialog isolation", () => {
    it("ignores shortcut when modifier keys are held", () => {
      const ctrlEvent = {
        key: " ",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
      } as unknown as KeyboardEvent
      expect(shouldIgnoreKeyboardShortcut(ctrlEvent, false)).toBe(true)

      const metaEvent = {
        key: "Enter",
        ctrlKey: false,
        metaKey: true,
        altKey: false,
      } as unknown as KeyboardEvent
      expect(shouldIgnoreKeyboardShortcut(metaEvent, false)).toBe(true)
    })

    it("ignores shortcut when history modal is already open", () => {
      const event = {
        key: " ",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      } as unknown as KeyboardEvent
      expect(shouldIgnoreKeyboardShortcut(event, true)).toBe(true)
    })

    it("ignores shortcut when focus is on interactive controls (button, link, input, textarea)", () => {
      const makeEventWithTarget = (tag: string, role?: string) =>
        ({
          key: " ",
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          target: {
            tagName: tag,
            getAttribute: (attr: string) => (attr === "role" ? role : null),
            isContentEditable: false,
            closest: () => null,
          },
        }) as unknown as KeyboardEvent

      expect(shouldIgnoreKeyboardShortcut(makeEventWithTarget("BUTTON"))).toBe(
        true,
      )
      expect(shouldIgnoreKeyboardShortcut(makeEventWithTarget("A"))).toBe(true)
      expect(shouldIgnoreKeyboardShortcut(makeEventWithTarget("INPUT"))).toBe(
        true,
      )
      expect(
        shouldIgnoreKeyboardShortcut(makeEventWithTarget("TEXTAREA")),
      ).toBe(true)
      expect(shouldIgnoreKeyboardShortcut(makeEventWithTarget("SELECT"))).toBe(
        true,
      )
      expect(
        shouldIgnoreKeyboardShortcut(makeEventWithTarget("DIV", "button")),
      ).toBe(true)
      expect(
        shouldIgnoreKeyboardShortcut(makeEventWithTarget("SPAN", "link")),
      ).toBe(true)
    })

    it("ignores shortcut when focused element is inside an open dialog or alertdialog", () => {
      const eventInsideDialog = {
        key: "Enter",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        target: {
          tagName: "DIV",
          getAttribute: () => null,
          isContentEditable: false,
          closest: (selector: string) =>
            selector.includes("dialog") ? {} : null,
        },
      } as unknown as KeyboardEvent

      expect(shouldIgnoreKeyboardShortcut(eventInsideDialog)).toBe(true)
    })

    it("allows shortcut when non-interactive element (e.g. background container) is focused", () => {
      const eventOnBody = {
        key: " ",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        target: {
          tagName: "DIV",
          getAttribute: () => null,
          isContentEditable: false,
          closest: () => null,
        },
      } as unknown as KeyboardEvent

      expect(shouldIgnoreKeyboardShortcut(eventOnBody)).toBe(false)
    })

    it("permits Alt key modifier when allowAlt is true (for Alt+ArrowLeft Previous Screen)", () => {
      const altEvent = {
        key: "ArrowLeft",
        ctrlKey: false,
        metaKey: false,
        altKey: true,
        target: {
          tagName: "DIV",
          getAttribute: () => null,
          isContentEditable: false,
          closest: () => null,
        },
      } as unknown as KeyboardEvent

      expect(shouldIgnoreKeyboardShortcut(altEvent, false, true)).toBe(false)
      expect(shouldIgnoreKeyboardShortcut(altEvent, false, false)).toBe(true)
    })
  })

  describe("P1: Previous Screen Toolbar Permissions", () => {
    const evaluatePreviousPermission = (
      statusName: string,
      canPrevious: boolean,
    ) => {
      const isAnswering = statusName === STATUS.SELECT_ANSWER
      const isAllowed = canPrevious && !isAnswering
      let reason: string | null = null

      if (isAnswering) {
        reason = "Cannot go back while answers are being accepted"
      } else if (!canPrevious) {
        reason = "At the beginning of show"
      }

      return { isAllowed, reason }
    }

    it("disallows Previous Screen during active answering even if canPrevious is true", () => {
      const res = evaluatePreviousPermission(STATUS.SELECT_ANSWER, true)
      expect(res.isAllowed).toBe(false)
      expect(res.reason).toContain(
        "Cannot go back while answers are being accepted",
      )
    })

    it("disallows Previous Screen when at start of show (canPrevious is false)", () => {
      const res = evaluatePreviousPermission(STATUS.SHOW_PREPARED, false)
      expect(res.isAllowed).toBe(false)
      expect(res.reason).toContain("At the beginning of show")
    })

    it("allows Previous Screen during results when canPrevious is true", () => {
      const res = evaluatePreviousPermission(STATUS.SHOW_RESPONSES, true)
      expect(res.isAllowed).toBe(true)
      expect(res.reason).toBeNull()
    })

    it("allows Previous Screen during leaderboard when canPrevious is true", () => {
      const res = evaluatePreviousPermission(STATUS.SHOW_LEADERBOARD, true)
      expect(res.isAllowed).toBe(true)
      expect(res.reason).toBeNull()
    })
  })
})
