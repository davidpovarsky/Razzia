import type { Question, Quizz } from "@razzia/common/types/game"
import { QUESTION_LEAD_IN_MS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import Game from "@razzia/socket/services/game"
import { createFakeIo } from "./fake-io"
import { expect, vi } from "vitest"

// Legacy round startup: 3s title + 3s countdown + 2s prepared state.
export const FIRST_QUESTION_DELAY_MS = 8000

export const NEXT_QUESTION_DELAY_MS = 2000

export const TICK_MS = 1000

export const MANAGER = "manager"

export const setup = (quizz: Quizz, players = ["Alice", "Bob"]) => {
  const fake = createFakeIo()
  const game = new Game(fake.io, MANAGER, quizz)
  const manager = fake.createSocket(MANAGER)

  game.reconnect(manager)

  const sockets = players.map((username) => {
    const socket = fake.createSocket(username.toLowerCase())

    game.join(socket, username)

    return socket
  })

  const status = (room: string) => fake.lastStatus(room)

  const reachAnswers = async (question: Question, first = true) => {
    await vi.advanceTimersByTimeAsync(
      (first ? FIRST_QUESTION_DELAY_MS : NEXT_QUESTION_DELAY_MS) +
        QUESTION_LEAD_IN_MS,
    )

    expect(game.roundManager.isCurrentlyAcceptingAnswers).toBe(true)
    expect(status(game.gameId)).toMatchObject({
      name: STATUS.SELECT_ANSWER,
      data: { time: question.time, votingStartsAt: Date.now() },
    })
  }

  const start = async () => {
    void game.start(manager)
    await reachAnswers(quizz.questions[0])
  }

  return { ...fake, game, manager, sockets, status, start, reachAnswers }
}
