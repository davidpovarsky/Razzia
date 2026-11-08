import type { Answer, Player, Quizz } from "@razzia/common/types/game"
import { describe, expect, it, vi } from "vitest"
import { createDefaultQuizExtras, generateQuestionIds } from "../../core/index"
import { GameRoster } from "./roster"
import { createRevealDistribution } from "./reveal-distribution"
import { buildInterimResults } from "./interim-results"

const makePlayer = (clientId: string, connected = true): Player => ({
  id: `socket-${clientId}`,
  clientId,
  username: clientId,
  connected,
  points: 42,
  streak: 0,
})

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Missing fixture value")
  }

  return value
}

function rosterFixture() {
  const players = [makePlayer("alice"), makePlayer("bob", false)]
  const renamed = vi.fn()
  const kicked = vi.fn()
  const roster = new GameRoster({
    players: {
      getAll: () => players,
      findByClientId: (id) => players.find((p) => p.clientId === id),
    },
    onPlayerRenamed: renamed,
    kickPlayer: kicked,
    onChange: vi.fn(),
    setPhoneInviteOnly: vi.fn(),
  })

  return { roster, players, renamed, kicked }
}

describe("extracted game/extension boundary", () => {
  it("retains stable roster identity, scores and verdicts after a socket change", () => {
    const { roster, players } = rosterFixture()
    roster.seed([
      {
        rosterPlayerId: "registration",
        displayName: "Alice",
        phoneE164: "+447700900001",
        tableNumber: 3,
      },
    ])
    const entry = required(roster.get("registration"))
    entry.clientId = "alice"
    roster.clientIndex.set("alice", "registration")
    players[0].id = "socket-reconnected"
    roster.recordScores(
      [{ ...players[0], lastCorrect: true, lastPoints: 10 }],
      7,
    )
    roster.sequence += 1
    const snapshot = roster.snapshot("game", true, new Set([players[0].id]))
    expect(
      snapshot.players.find((p) => p.rosterPlayerId === "registration"),
    ).toMatchObject({
      clientId: "alice",
      points: 42,
      tableNumber: 3,
      answeredCurrentQuestion: true,
    })
    expect(snapshot).toMatchObject({
      seq: 1,
      phoneInviteOnly: true,
      connectedNow: 1,
      disconnectedNow: 1,
    })
    expect(roster.verdicts.get("registration")).toEqual({
      epoch: 7,
      correct: true,
      points: 10,
    })
  })

  it("changes the phone index on edits and delegates live renames to the game", () => {
    const { roster, renamed } = rosterFixture()
    const initial = roster.upsert({
      displayName: "Alice",
      phone: "+447700900001",
    })
    required(roster.get(initial.rosterPlayerId)).clientId = "alice"
    roster.upsert({
      rosterPlayerId: initial.rosterPlayerId,
      displayName: "Alicia",
      phone: "+447700900002",
    })
    expect(roster.findByPhone("+447700900001")).toBeNull()
    expect(roster.findByPhone("+447700900002")?.displayName).toBe("Alicia")
    expect(renamed).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "alice", username: "Alicia" }),
    )
    expect(() =>
      roster.upsert({ displayName: "Other", phone: "+447700900002" }),
    ).toThrow()
  })

  it("replacement removes omitted registrations and keeps ad-hoc players", () => {
    const { roster } = rosterFixture()
    roster.seed([
      { rosterPlayerId: "old", displayName: "Old", phoneE164: "+447700900003" },
    ])
    // Indexes ad-hoc live players.
    roster.snapshot("game", false, new Set())
    roster.replace([
      { rosterPlayerId: "new", displayName: "New", phoneE164: "+447700900004" },
    ])
    expect(roster.get("old")).toBeNull()
    expect(roster.findByPhone("+447700900003")).toBeNull()
    expect(roster.clientIndex.has("alice")).toBe(true)
    expect(roster.clientIndex.has("bob")).toBe(true)
    expect(roster.get("new")?.status).toBe("not_joined")
  })

  it("removal delegates kicking and clears all lookup indices", () => {
    const { roster, kicked } = rosterFixture()
    const registration = roster.upsert({
      displayName: "Alice",
      phone: "+447700900001",
    })
    required(roster.get(registration.rosterPlayerId)).clientId = "alice"
    roster.clientIndex.set("alice", registration.rosterPlayerId)
    expect(roster.remove(registration.rosterPlayerId)).toBe(true)
    expect(kicked).toHaveBeenCalledWith("socket-alice")
    expect(roster.clientIndex.has("alice")).toBe(false)
    expect(roster.findByPhone("+447700900001")).toBeNull()
  })
})

describe("read-only reveal projection", () => {
  const quizz: Quizz = {
    subject: "Projection",
    gameMode: "quiz",
    questions: [
      {
        type: "multi",
        question: "Choose",
        answers: ["A", "B", "C"],
        solutions: [0, 2],
        time: 10,
        cooldown: 0,
      },
    ],
  }
  const answers: Answer[] = [
    { playerId: "socket-alice", answerIds: [0, 2], points: 100 },
    { playerId: "socket-bob", answerIds: [1], points: 50 },
  ]
  const make = (survey: boolean, submitted = answers) =>
    createRevealDistribution({
      question: quizz.questions[0],
      answers: submitted,
      players: [makePlayer("alice"), makePlayer("bob", false)],
      survey,
      questionIndex: 0,
      questionId: "question",
      startedAt: 1234,
    })

  it("counts multi-select percentages by respondent, with no score mutation", () => {
    const before = structuredClone(answers)
    const result = make(false)
    expect(result).toMatchObject({
      eligiblePlayers: 1,
      totalResponders: 2,
      revealStartedAt: 1234,
    })
    expect(
      Object.values(required(result.options)).map((p) => p.percentage),
    ).toEqual([50, 50, 50])
    expect(required(result.options)[2].isSolution).toBe(true)
    expect(answers).toEqual(before)
  })

  it("does not expose quiz solutions in survey projections", () => {
    const result = make(true)
    expect(result.solutions).toBeUndefined()
    expect(
      Object.values(required(result.options)).every(
        (p) => p.isSolution === undefined,
      ),
    ).toBe(true)
  })

  it("keeps ties and empty votes distinct in authored result summaries", () => {
    const ids = generateQuestionIds(1)
    const extras = createDefaultQuizExtras("quiz", ids, "b".repeat(64))
    const tied = required(buildInterimResults(make(false), quizz, extras))
    expect(tied).toMatchObject({
      isTie: true,
      winners: [0, 1, 2],
      totalResponders: 2,
    })
    const empty = required(buildInterimResults(make(false, []), quizz, extras))
    expect(empty).toMatchObject({
      isTie: false,
      winners: [],
      totalResponders: 0,
    })
    expect(empty.options.every((p) => p.percentage === 0)).toBe(true)
    expect(buildInterimResults(null, quizz, extras)).toBeNull()
  })
})
