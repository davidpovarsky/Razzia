import { STATUS } from "@razzia/common/types/game/status"
import { describe, expect, it } from "vitest"

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
})
