import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  PLATFORM_OPENING_DURATION_MS,
  type ExtensionStateEnvelope,
} from "@razzia/extensions/core"
import { getSidecarFilePath } from "@razzia/extensions/server"
import { getPath } from "@razzia/socket/services/config"
import Game from "@razzia/socket/services/game"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"
import fs from "node:fs"
import { afterEach, expect, it, vi } from "vitest"

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

it("gives a persisted legacy quiz the platform launch without writing a sidecar or changing its round flow", async () => {
  vi.useFakeTimers()
  const fake = createFakeIo()
  const manager = fake.createSocket("legacy-manager")
  const player = fake.createSocket("legacy-player")
  const quizz = {
    ...createQuizz([createQuestion({ time: 30 })]),
    id: crypto.randomUUID(),
  }
  fs.mkdirSync(getPath("quizz"), { recursive: true })
  const baseFile = getPath(`quizz/${quizz.id}.json`)
  const original = JSON.stringify(quizz)
  fs.writeFileSync(baseFile, original)
  const sidecarFile = getSidecarFilePath(getPath, quizz.id)
  expect(fs.existsSync(sidecarFile)).toBe(false)
  const game = new Game(fake.io, "legacy-manager", quizz)
  const snapshot = () =>
    fake.lastEvent("legacy-manager", EXTENSION_EVENTS.STATE)
      ?.data as ExtensionStateEnvelope

  try {
    game.reconnect(manager)
    game.join(player, "Legacy player")
    expect(snapshot().extras.presentationLaunch).toMatchObject({
      stage: "standby",
    })
    expect(snapshot().extras.defaults).toMatchObject({
      showTheme: { id: "razzia-original" },
    })
    await game.start(player)
    expect(snapshot().extras.presentationLaunch).toMatchObject({
      stage: "standby",
    })
    await game.start(manager)
    expect(snapshot().extras.presentationLaunch).toMatchObject({
      stage: "opening",
    })
    await vi.advanceTimersByTimeAsync(PLATFORM_OPENING_DURATION_MS)
    expect(snapshot().extras.presentationLaunch).toMatchObject({
      stage: "lobby",
    })
    expect(game.started).toBe(false)
    void game.start(manager)
    await vi.advanceTimersByTimeAsync(11000)
    expect(fake.lastEvent(game.gameId, EVENTS.GAME.STATUS)?.data).toMatchObject(
      { name: STATUS.SELECT_ANSWER },
    )
    expect(game.started).toBe(true)
    expect(fs.readFileSync(baseFile, "utf-8")).toBe(original)
    expect(fs.existsSync(sidecarFile)).toBe(false)
  } finally {
    game.dispose()
  }
})
