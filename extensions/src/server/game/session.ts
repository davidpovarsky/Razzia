import {
  extensionCommandSchema,
  type ExtensionCommand,
  type ExtensionPhase,
  type ExtensionStateEnvelope,
  type QuizExtrasV1,
} from "../../core/index"
import {
  assignManual,
  assignRoundRobin,
  projectTeamScores,
  type PlayerScoreInfo,
  type TeamScoreProjection,
} from "../../gameplay/index"

export class ExtensionGameSession {
  readonly gameId: string
  readonly extras: QuizExtrasV1 | null

  private seq = 0
  private epoch = 0
  private currentQuestionIndex = 0
  private phase: ExtensionPhase = "lobby"
  private startedAt = Date.now()
  private teamAssignments = new Map<string, string>()
  private revealedMedia = new Set<string>()
  private processedRequestIds = new Set<string>()
  private manualLeaderboardRequested = false

  constructor(gameId: string, extras: QuizExtrasV1 | null) {
    this.gameId = gameId
    this.extras = extras
  }

  get isEnabled(): boolean {
    return this.extras !== null
  }

  get currentSeq(): number {
    return this.seq
  }

  get currentEpoch(): number {
    return this.epoch
  }

  get currentPhase(): ExtensionPhase {
    return this.phase
  }

  get isManualLeaderboardRequested(): boolean {
    return this.manualLeaderboardRequested
  }

  consumeManualLeaderboardRequest(): boolean {
    const was = this.manualLeaderboardRequested

    this.manualLeaderboardRequested = false

    return was
  }

  getCurrentQuestionId(): string | undefined {
    if (!this.extras?.questionIds) {
      return undefined
    }

    return this.extras.questionIds[this.currentQuestionIndex]
  }

  onPlayerJoin(clientId: string): void {
    if (!this.extras?.teams.enabled) {
      return
    }

    // Auto-assign in lobby if not already assigned
    if (this.phase === "lobby" && !this.teamAssignments.has(clientId)) {
      const currentAssigned = Array.from(this.teamAssignments.keys())
      const allPlayers = [...currentAssigned, clientId]
      const newAssignments = assignRoundRobin(
        this.extras.teams.teams,
        allPlayers,
      )

      this.teamAssignments = newAssignments
    }
  }

  onPlayerKicked(clientId: string): void {
    this.teamAssignments.delete(clientId)
  }

  onQuestionStart(questionIndex: number): void {
    this.epoch += 1
    this.currentQuestionIndex = questionIndex
    this.phase = "question"
    this.seq += 1
    this.startedAt = Date.now()
    this.manualLeaderboardRequested = false
  }

  setPhase(phase: ExtensionPhase): void {
    if (this.phase === phase) {
      return
    }

    this.phase = phase
    this.seq += 1
    this.startedAt = Date.now()
  }

  getTeamAssignments(): Map<string, string> {
    return new Map(this.teamAssignments)
  }

  getTeamScores(players: PlayerScoreInfo[]): TeamScoreProjection[] {
    if (!this.extras?.teams.enabled) {
      return []
    }

    return projectTeamScores(
      this.extras.teams.teams,
      players,
      this.teamAssignments,
    )
  }

  /**
   * Generates authoritative state snapshot for either 'manager' or 'player'.
   * Never leaks solutions or answers to players during question phase.
   */
  getStateSnapshot(
    forRole: "manager" | "player",
    players: PlayerScoreInfo[],
  ): ExtensionStateEnvelope {
    const questionId = this.getCurrentQuestionId()
    const questionExtras =
      questionId && this.extras?.perQuestion
        ? this.extras.perQuestion[questionId]
        : undefined

    const extrasPayload: Record<string, unknown> = {}

    // Team scores and assignments
    if (this.extras?.teams.enabled) {
      extrasPayload.teamScores = this.getTeamScores(players)
      extrasPayload.teams = {
        enabled: true,
        teams: this.extras.teams.teams,
        assignments: Object.fromEntries(this.teamAssignments),
      }
    }

    // Audio cues
    if (this.extras?.audio) {
      extrasPayload.audio = this.extras.audio
    }

    // Current question visuals & reveal
    if (questionExtras) {
      const isMediaRevealed = questionId
        ? this.revealedMedia.has(questionId)
        : false

      if (questionExtras.reveal) {
        const canViewReveal =
          forRole === "manager" || questionExtras.reveal.audience === "all"

        if (canViewReveal) {
          extrasPayload.reveal = {
            ...questionExtras.reveal,
            isRevealed: isMediaRevealed,
          }
        }
      }

      // Safe answer visuals (alt and URL; answers strings stay in base question)
      if (questionExtras.answerVisuals) {
        extrasPayload.answerVisuals = questionExtras.answerVisuals
      }

      // Interlude
      if (this.phase === "interlude" && questionExtras.interlude) {
        extrasPayload.interlude = questionExtras.interlude
      }
    }

    return {
      v: 1,
      gameId: this.gameId,
      seq: this.seq,
      epoch: this.epoch,
      questionId,
      phase: this.phase,
      startedAt: this.startedAt,
      extras: extrasPayload,
    }
  }

  /**
   * Processes manager command with authentication, deduplication, and phase validation.
   */
  handleCommand(
    rawCommand: unknown,
    isManager: boolean,
    isLobby = this.phase === "lobby",
  ): { success: boolean; deduplicated?: boolean; action?: string } {
    if (!isManager) {
      throw new Error("errors:auth.unauthorized")
    }

    const parsed = extensionCommandSchema.safeParse(rawCommand)

    if (!parsed.success) {
      throw new Error(
        `errors:extensions.invalidCommand: ${JSON.stringify(parsed.error.issues)}`,
      )
    }

    const command: ExtensionCommand = parsed.data

    if (command.gameId !== this.gameId) {
      throw new Error("errors:extensions.gameIdMismatch")
    }

    // Deduplication by requestId
    if (this.processedRequestIds.has(command.requestId)) {
      return { success: true, deduplicated: true, action: command.action }
    }

    this.processedRequestIds.add(command.requestId)

    switch (command.action) {
      case "ASSIGN_TEAM": {
        if (!isLobby) {
          throw new Error("errors:extensions.teamAssignmentOnlyInLobby")
        }

        if (!this.extras?.teams.enabled) {
          throw new Error("errors:extensions.teamsDisabled")
        }

        this.teamAssignments = assignManual({
          teams: this.extras.teams.teams,
          currentAssignments: this.teamAssignments,
          clientId: command.payload.clientId,
          teamId: command.payload.teamId,
        })

        this.seq += 1

        break
      }

      case "REVEAL_MEDIA": {
        const qId = command.payload.questionId ?? this.getCurrentQuestionId()

        if (qId) {
          this.revealedMedia.add(qId)
          this.seq += 1
        }

        break
      }

      case "SHOW_LEADERBOARD": {
        this.manualLeaderboardRequested = true

        break
      }

      case "SKIP_INTERLUDE": {
        if (this.phase === "interlude") {
          // Will be advanced by caller
          this.seq += 1
        }

        break
      }
    }

    return { success: true, action: command.action }
  }
}
