import { describe, expect, it } from "vitest"
import { recentStudioGames } from "../web/studio/recent-games"

describe("Studio dashboard games", () => {
  it("ranks the most recent save or completed play using the stored quiz ID", () => {
    const games = [
      { id: "1", subject: "Alpha", updatedAt: "2026-11-21T10:00:00Z" },
      { id: "2", subject: "Beta", updatedAt: "2026-11-24T10:00:00Z" },
      { id: "3", subject: "Renamed", updatedAt: "2026-11-22T10:00:00Z" },
    ]
    const results = [
      {
        id: "run-1",
        quizId: "3",
        subject: "Title before rename",
        date: "2026-11-25T10:00:00Z",
        playerCount: 3,
      },
      {
        id: "deleted-run",
        quizId: "deleted-quiz",
        subject: "Alpha",
        date: "2026-11-26T10:00:00Z",
        playerCount: 3,
      },
    ]

    expect(recentStudioGames(games, results).map(({ id }) => id)).toEqual([
      "3",
      "2",
      "1",
    ])
    expect(games.map(({ id }) => id)).toEqual(["1", "2", "3"])
  })

  it("matches a legacy result only when its title identifies a single game", () => {
    const games = [
      { id: "one", subject: "Duplicate" },
      { id: "two", subject: "Duplicate" },
      { id: "known", subject: "Unique" },
    ]
    const results = [
      {
        id: "a",
        subject: "Duplicate",
        date: "2026-11-26T10:00:00Z",
        playerCount: 1,
      },
      {
        id: "b",
        subject: "Unique",
        date: "2026-11-25T10:00:00Z",
        playerCount: 1,
      },
    ]

    expect(recentStudioGames(games, results).map(({ id }) => id)).toEqual([
      "known",
      "one",
      "two",
    ])
  })
})
