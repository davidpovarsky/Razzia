import Game from "@razzia/socket/services/game"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"
import { STATUS } from "@razzia/common/types/game/status"
import { afterEach, expect, it, vi } from "vitest"

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

it.each(["elapsed", "manual", "allAnswered"] as const)(
  "observes %s completion without changing scoring or round flow",
  async (reason) => {
    vi.useFakeTimers()
    const io = createFakeIo()
    const manager = io.createSocket("manager")
    const player = io.createSocket("alice")
    const question = createQuestion({ time: 10 })
    const game = new Game(io.io, "manager", createQuizz([question]))
    game.reconnect(manager)
    game.join(player, "Alice")
    game.updateSettings({ endOnAllAnswered: reason === "allAnswered" })
    void game.start(manager)
    await vi.advanceTimersByTimeAsync(11_000)
    expect(io.lastStatus(game.gameId)?.name).toBe(STATUS.SELECT_ANSWER)
    expect(game.getVoteCompletionReason()).toBeNull()

    if (reason === "manual") {
      game.advance()
    } else if (reason === "allAnswered") {
      game.selectAnswer(player, [0])
    }

    await vi.advanceTimersByTimeAsync(reason === "elapsed" ? 10_000 : 1000)
    expect(game.getVoteCompletionReason()).toBe(reason)
    expect(io.lastStatus("manager")?.name).toBe(STATUS.SHOW_RESPONSES)

    if (reason === "allAnswered") {
      expect(game.players[0].points).toBe(1000)
    }
  },
)
