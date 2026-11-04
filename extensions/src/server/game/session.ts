import {
  extensionCommandSchema,
  type ActiveSceneData,
  type AnyQuizExtras,
  type ExtensionCommand,
  type ExtensionPhase,
  type ExtensionStateEnvelope,
  type PublicAnswerRecap,
  type PublicInterimResults,
  type PublicRankEntry,
  type RevealDistributionSnapshot,
  type SceneConfig,
  isQuizExtrasV2,
} from "../../core/index"
import {
  assignManual,
  assignRoundRobin,
  projectTeamScores,
  type PlayerScoreInfo,
  type TeamScoreProjection,
} from "../../gameplay/index"
import type { StudioShowCoordinator } from "./studio-show-coordinator"

export interface ExtensionSessionDelegate {
  endAnswerTimer?: () => boolean
  nextScreen?: () => boolean
  previousScreen?: () => boolean
  cancelActiveVote?: () => boolean
  reopenQuestion?: (questionIndex: number) => boolean
  skipQuestion?: (reason?: string) => boolean
  replayFromCheckpoint?: (questionIndex: number) => boolean
  endOrSkipInterlude?: (reason?: string) => boolean
  getHistory?: (questionIndex?: number) => unknown
  advanceTimelineScene?: (
    sceneId?: string,
    epoch?: number,
    timelineStepIndex?: number,
  ) => boolean
  previousTimelineScene?: () => boolean
  skipTimelineScene?: (
    sceneId?: string,
    epoch?: number,
    timelineStepIndex?: number,
  ) => boolean
  getLeaderboard?: () => Array<{ displayName: string; points: number }>
  getLastCompletedQuestionSummary?: () => PublicInterimResults | null
  getAnswerRecapSummary?: (
    scene: SceneConfig,
    timelineStepIndex: number,
  ) => PublicAnswerRecap | null
  canPrevious?: () => { can: boolean; reason?: string; willReopenQuestion?: boolean; answersReceived?: number }
  isAcceptingAnswers?: () => boolean
  getAnswersCount?: () => number
}

export class ExtensionGameSession {
  readonly gameId: string
  readonly extras: AnyQuizExtras | null

  private seq = 0
  private epoch = 0
  private currentQuestionIndex = 0
  private phase: ExtensionPhase = "lobby"
  private startedAt = Date.now()
  private teamAssignments = new Map<string, string>()
  private readonly revealedMedia = new Set<string>()
  private readonly processedRequestIds = new Set<string>()
  private manualLeaderboardRequested = false
  private latestRevealDistribution: RevealDistributionSnapshot | null = null
  private viewingHistoryIndex: number | null = null
  private delegate: ExtensionSessionDelegate | null = null
  private showCoordinator: StudioShowCoordinator | null = null

  constructor(gameId: string, extras: AnyQuizExtras | null) {
    this.gameId = gameId
    this.extras = extras
  }

  setDelegate(delegate: ExtensionSessionDelegate | null): void {
    this.delegate = delegate
  }

  setShowCoordinator(coordinator: StudioShowCoordinator | null): void {
    this.showCoordinator = coordinator
  }

  get coordinator(): StudioShowCoordinator | null {
    return this.showCoordinator
  }

  get isEnabled(): boolean {
    return this.extras !== null
  }

  get currentSeq(): number {
    return this.seq + (this.showCoordinator?.currentSeq ?? 0)
  }

  get currentEpoch(): number {
    if (this.showCoordinator) {
      return this.showCoordinator.currentEpoch
    }

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

  getQuestionId(questionIndex: number): string | undefined {
    return this.extras?.questionIds[questionIndex]
  }

  hasInterlude(questionIndex: number): boolean {
    if (!this.extras?.questionIds) {
      return false
    }

    const qId = this.extras.questionIds[questionIndex]

    if (!qId) {
      return false
    }

    return Boolean(this.extras.perQuestion[qId]?.interlude)
  }

  getInterludeAdvance(questionIndex: number): "auto" | "manual" {
    if (!this.extras?.questionIds) {
      return "manual"
    }

    const qId = this.extras.questionIds[questionIndex]

    if (!qId) {
      return "manual"
    }

    return this.extras.perQuestion[qId]?.interlude?.advance ?? "manual"
  }

  getInterludeDuration(questionIndex: number): number {
    if (!this.extras?.questionIds) {
      return 5000
    }

    const qId = this.extras.questionIds[questionIndex]

    if (!qId) {
      return 5000
    }

    return this.extras.perQuestion[qId]?.interlude?.durationMs ?? 5000
  }

  onInterludeStart(questionIndex: number): void {
    this.currentQuestionIndex = questionIndex
    this.phase = "interlude"
    this.seq += 1
    this.startedAt = Date.now()
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

  rebindPlayerClientId(oldClientId: string, newClientId: string): void {
    if (oldClientId === newClientId) {
      return
    }

    const assignedTeam = this.teamAssignments.get(oldClientId)

    if (assignedTeam !== undefined) {
      this.teamAssignments.delete(oldClientId)
      this.teamAssignments.set(newClientId, assignedTeam)
    }
  }

  onQuestionStart(questionIndex: number): void {
    this.epoch += 1
    this.currentQuestionIndex = questionIndex
    this.phase = "question"
    this.seq += 1
    this.startedAt = Date.now()
    this.manualLeaderboardRequested = false
    this.viewingHistoryIndex = null
  }

  onReplayCheckpoint(questionIndex: number): void {
    this.epoch += 1
    this.seq += 1
    this.currentQuestionIndex = questionIndex
    this.phase = "prepared"
    this.startedAt = Date.now()
    this.manualLeaderboardRequested = false
    this.latestRevealDistribution = null
    this.viewingHistoryIndex = null
  }

  setRevealDistribution(dist: RevealDistributionSnapshot | null): void {
    this.latestRevealDistribution = dist
    this.seq += 1
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

      // Question stage entrance animation & 4-slot stage animations
      if (questionExtras.questionEntrance) {
        extrasPayload.questionEntrance = questionExtras.questionEntrance
      }

      if (questionExtras.stageAnimations) {
        extrasPayload.stageAnimations = questionExtras.stageAnimations
      }

      if (questionExtras.questionDecoration) {
        extrasPayload.questionDecoration = questionExtras.questionDecoration
      }

      // Per-card background & audio cues
      if (questionExtras.background) {
        extrasPayload.cardBackground = questionExtras.background
      }

      if (questionExtras.audioCues) {
        extrasPayload.cardAudioCues = questionExtras.audioCues
      }

      // Interlude
      if (this.phase === "interlude" && questionExtras.interlude) {
        extrasPayload.interlude = questionExtras.interlude
      }
    }

    // Studio V2 timeline & scene payload
    if (this.extras && isQuizExtrasV2(this.extras)) {
      extrasPayload.defaults = this.extras.defaults

      if (this.showCoordinator) {
        const activeStepEnvelope =
          this.showCoordinator.getAuthoritativeStepEnvelope(forRole)
        extrasPayload.activeTimelineStep = activeStepEnvelope
        extrasPayload.currentScene = this.showCoordinator.currentScene

        if (this.showCoordinator.isSceneActive()) {
          if (activeStepEnvelope?.startedAt) {
            this.startedAt = activeStepEnvelope.startedAt
          }
          const activeScene = this.showCoordinator.currentScene

          if (activeScene) {
            if ("background" in activeScene && activeScene.background) {
              extrasPayload.cardBackground = activeScene.background
            } else {
              delete extrasPayload.cardBackground
            }

            if ("audio" in activeScene && activeScene.audio) {
              extrasPayload.sceneAudio = activeScene.audio
            }

            if ("stageAnimations" in activeScene && activeScene.stageAnimations) {
              extrasPayload.stageAnimations = activeScene.stageAnimations
            } else {
              delete extrasPayload.stageAnimations
              delete extrasPayload.questionEntrance
            }
          }

          const currentStep = this.showCoordinator.currentStep
          const stepKind = currentStep?.item.kind

          if (stepKind === "leaderboard") {
            const rawEntries = this.delegate?.getLeaderboard?.() ?? []
            const sorted = [...rawEntries].sort((a, b) => b.points - a.points)
            const entries: PublicRankEntry[] = sorted.slice(0, 10).map((e, idx) => ({
              rank: idx + 1,
              displayName: e.displayName,
              points: e.points,
            }))
            const activeSceneData: ActiveSceneData = {
              leaderboard: { entries },
            }

            extrasPayload.activeSceneData = activeSceneData
          } else if (stepKind === "interimResults") {
            const summary = this.delegate?.getLastCompletedQuestionSummary?.() ?? null
            const activeSceneData: ActiveSceneData = {
              interimResults: summary,
            }

            extrasPayload.activeSceneData = activeSceneData
          } else if (stepKind === "answerRecap" && activeScene) {
            const recap =
              this.delegate?.getAnswerRecapSummary?.(
                activeScene,
                currentStep?.index ?? 0,
              ) ?? null
            const activeSceneData: ActiveSceneData = {
              answerRecap: recap,
            }

            extrasPayload.activeSceneData = activeSceneData
          }
        }
      }

      if (forRole === "manager") {
        extrasPayload.timeline = this.extras.timeline
        extrasPayload.scenes = this.extras.scenes
        extrasPayload.defaults = this.extras.defaults
      }
    }

    // Manager-only reveal distribution and history snapshot
    if (forRole === "manager") {
      if (this.latestRevealDistribution) {
        extrasPayload.revealDistribution = this.latestRevealDistribution
      }

      if (this.viewingHistoryIndex !== null) {
        extrasPayload.viewingHistory = {
          index: this.viewingHistoryIndex,
          data: this.delegate?.getHistory?.(this.viewingHistoryIndex) ?? null,
        }
      }

      const prevCheck = this.delegate?.canPrevious
        ? this.delegate.canPrevious()
        : this.showCoordinator
          ? this.showCoordinator.canPrevious()
          : { can: false }

      extrasPayload.canPrevious = prevCheck.can
      if (prevCheck.reason) {
        extrasPayload.previousReason = prevCheck.reason
      }
      if (typeof prevCheck.willReopenQuestion === "boolean") {
        extrasPayload.willReopenQuestion = prevCheck.willReopenQuestion
      }
      if (typeof prevCheck.answersReceived === "number") {
        extrasPayload.answersReceived = prevCheck.answersReceived
      }
    }

    const effectivePhase = this.showCoordinator?.isSceneActive()
      ? "scene"
      : this.phase

    const effectiveEpoch = this.showCoordinator
      ? this.showCoordinator.currentEpoch
      : this.epoch

    const effectiveSeq = this.seq + (this.showCoordinator?.currentSeq ?? 0)

    return {
      v: 1,
      gameId: this.gameId,
      seq: effectiveSeq,
      epoch: effectiveEpoch,
      questionId: this.showCoordinator?.isSceneActive() ? undefined : questionId,
      phase: effectivePhase,
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
  ): {
    success: boolean
    deduplicated?: boolean
    action?: string
    history?: unknown
  } {
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

    // Epoch validation if payload specifies epoch
    const payloadEpoch = (command.payload as { epoch?: unknown }).epoch

    if (typeof payloadEpoch === "number" && payloadEpoch !== this.currentEpoch) {
      throw new Error("errors:extensions.staleEpoch")
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
          this.delegate?.endOrSkipInterlude?.("manual")
          this.seq += 1
        }

        break
      }

      case "END_OR_SKIP_INTERLUDE": {
        if (this.phase !== "interlude") {
          return { success: true, deduplicated: true, action: command.action }
        }

        const ok =
          this.delegate?.endOrSkipInterlude?.(command.payload.reason) ?? false

        if (!ok) {
          throw new Error("errors:extensions.interludeAdvanceFailed")
        }

        this.seq += 1

        break
      }

      case "END_ANSWER_TIMER": {
        if (this.phase !== "question") {
          throw new Error("errors:extensions.cannotEndTimerOutsideAnswerPhase")
        }

        const ok = this.delegate?.endAnswerTimer?.() ?? false

        if (!ok) {
          throw new Error("errors:extensions.endTimerFailed")
        }

        this.seq += 1

        break
      }

      case "NEXT_SCREEN": {
        const currentPhase = this.showCoordinator?.isSceneActive()
          ? "scene"
          : this.phase

        if (currentPhase === "question") {
          throw new Error("errors:extensions.cannotNextScreenDuringAnswers")
        }

        if (this.showCoordinator?.isSceneActive()) {
          const ok = this.delegate?.advanceTimelineScene?.() ?? false

          if (!ok) {
            throw new Error("errors:extensions.sceneAdvanceFailed")
          }

          this.seq += 1

          break
        }

        const ok = this.delegate?.nextScreen?.() ?? false

        if (!ok) {
          throw new Error("errors:extensions.nextScreenFailed")
        }

        this.seq += 1

        break
      }

      case "PREVIOUS_SCREEN": {
        const isAccepting = this.delegate?.isAcceptingAnswers?.() ?? false
        const answersCount = this.delegate?.getAnswersCount?.() ?? 0
        const confirmed = Boolean(
          (command.payload as { confirmed?: boolean })?.confirmed,
        )

        if (isAccepting && answersCount > 0 && !confirmed) {
          throw new Error("errors:extensions.previousScreenConfirmationRequired")
        }

        if (isAccepting) {
          this.delegate?.cancelActiveVote?.()
        }

        if (this.showCoordinator?.isSceneActive()) {
          const ok = this.delegate?.previousTimelineScene?.() ?? false

          if (!ok) {
            throw new Error("errors:extensions.scenePreviousFailed")
          }

          this.seq += 1

          break
        }

        const ok = this.delegate?.previousScreen?.() ?? false

        if (!ok) {
          throw new Error("errors:extensions.previousScreenFailed")
        }

        this.seq += 1

        break
      }

      case "ADVANCE_TIMELINE_SCENE": {
        const ok =
          this.delegate?.advanceTimelineScene?.(
            command.payload.sceneId,
            command.payload.epoch,
            command.payload.timelineStepIndex,
          ) ?? false

        if (!ok) {
          if (command.payload.reason === "mediaEnded") {
            return { success: true, deduplicated: true, action: command.action }
          }
          throw new Error("errors:extensions.sceneAdvanceFailed")
        }

        this.seq += 1

        break
      }

      case "SKIP_TIMELINE_SCENE": {
        const ok =
          this.delegate?.skipTimelineScene?.(
            command.payload.sceneId,
            command.payload.epoch,
            command.payload.timelineStepIndex,
          ) ?? false

        if (!ok) {
          if (command.payload.reason === "mediaEnded") {
            return { success: true, deduplicated: true, action: command.action }
          }
          throw new Error("errors:extensions.sceneSkipFailed")
        }

        this.seq += 1

        break
      }

      case "SKIP_QUESTION": {
        if (this.phase === "responses" || this.phase === "leaderboard") {
          throw new Error("errors:extensions.cannotSkipScoredQuestion")
        }

        const ok =
          this.delegate?.skipQuestion?.(command.payload.reason) ?? false

        if (!ok) {
          throw new Error("errors:extensions.skipQuestionFailed")
        }

        this.seq += 1

        break
      }

      case "VIEW_HISTORY": {
        this.viewingHistoryIndex = command.payload.questionIndex ?? null
        this.seq += 1

        const historyData = this.delegate?.getHistory?.(
          command.payload.questionIndex,
        )

        return {
          success: true,
          action: command.action,
          history: historyData,
        }
      }

      case "REPLAY_FROM_CHECKPOINT": {
        const ok =
          this.delegate?.replayFromCheckpoint?.(
            command.payload.questionIndex,
          ) ?? false

        if (!ok) {
          throw new Error("errors:extensions.invalidCheckpoint")
        }

        this.seq += 1

        break
      }
    }

    return { success: true, action: command.action }
  }
}
