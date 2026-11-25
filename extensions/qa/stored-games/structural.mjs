import {
  computeCanonicalBaseDigest,
  isQuizExtrasV2,
} from "../../src/core/index.ts"
import { quizExtrasV2Schema } from "../../src/core/studio-timeline-schema.ts"
import { StudioShowCoordinator } from "../../src/server/game/studio-show-coordinator.ts"
import { createShowRoundHooks } from "../../src/server/game/round-policy.ts"
import { isCreatingWorldsProgram } from "../../src/server/game/runtime-policy.ts"

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)

/**
 * Read-only structural playback of private fixture data through the real server
 * coordinator. No rendered, audio, scoring or live-host acceptance is claimed.
 * Receipts contain fixture IDs, counts and fixed check labels; never game text.
 * Raw authored timelines include conditional tie-break scenes. The live factory
 * may legitimately omit those when no tie remains; the browser verifies that.
 */
export function verifyStoredStructure(games) {
  const rows = []
  for (const fixture of games) {
    const row = {
      fixtureId: fixture.fixtureId,
      layer: "canonical-authored-structure",
      schemaVersion: fixture.extras?.schemaVersion ?? null,
      questionCount: fixture.quizz?.questions?.length ?? 0,
      checks: [],
    }
    const check = (name, passed) =>
      row.checks.push({ name, passed: Boolean(passed) })
    let coordinator = undefined

    try {
      const { extras } = fixture
      const base = fixture.quizz
      check(
        "stored game has questions",
        Array.isArray(base?.questions) && base.questions.length > 0,
      )

      if (extras) {
        check("sidecar belongs to the original game", extras.quizId === base.id)
        const { id: _storageId, ...logicalBase } = base
        check(
          "sidecar digest matches the stored questions",
          extras.baseDigest === computeCanonicalBaseDigest(logicalBase) ||
            extras.baseDigest === computeCanonicalBaseDigest(base),
        )
        check(
          "question identity count matches the base game",
          extras.questionIds?.length === base.questions.length,
        )
        check(
          "question identities are unique",
          new Set(extras.questionIds ?? []).size ===
            (extras.questionIds?.length ?? 0),
        )

        if (fixture.expected?.questionIds) {
          check(
            "fixture question identities are retained",
            same(extras.questionIds, fixture.expected.questionIds),
          )
        }
      }

      if (!extras || !isQuizExtrasV2(extras)) {
        row.layer = "legacy-data-structure-only"
        row.authoredTimeline = false
        row.nativeRoundPlayback =
          "covered by isolated native-host/browser verification"
        row.passed = row.checks.every((item) => item.passed)
        rows.push(row)

        continue
      }

      const validation = quizExtrasV2Schema.safeParse(extras)
      check(
        "stored authored sidecar satisfies the current schema",
        validation.success,
      )

      if (!validation.success) {
        row.schemaIssueCount = validation.error.issues.length
      }

      const { timeline } = extras
      const questionItems = timeline.filter((item) => item.kind === "question")
      const questionOrder = questionItems.map((item) => item.questionId)
      const referencedScenes = new Set(
        timeline
          .filter((item) => item.kind !== "question")
          .map((item) => item.sceneId),
      )
      const unusedScenes = new Set(
        Object.keys(extras.scenes).filter((id) => !referencedScenes.has(id)),
      )
      row.authoredTimeline = true
      row.timelineCount = timeline.length
      row.authoredSceneCount = timeline.length - questionItems.length
      row.unusedSceneCount = unusedScenes.size
      row.conditionalTieBreakCount = timeline.filter(
        (item) =>
          item.kind !== "question" &&
          extras.scenes[item.sceneId]?.preset === "tie-break",
      ).length
      check(
        "every stored question appears once in the authored timeline",
        questionOrder.length === extras.questionIds.length &&
          new Set(questionOrder).size === questionOrder.length &&
          extras.questionIds.every((id) => questionOrder.includes(id)),
      )

      if (fixture.expected?.timelineIds) {
        check(
          "fixture timeline identities are retained",
          same(
            timeline.map((item) => item.id),
            fixture.expected.timelineIds,
          ),
        )
      }

      if (fixture.expected?.timelineKinds) {
        check(
          "fixture timeline kinds are retained",
          same(
            timeline.map((item) => item.kind),
            fixture.expected.timelineKinds,
          ),
        )
      }

      if (fixture.expected?.unusedSceneIds) {
        check(
          "unused scene definitions remain outside the timeline",
          same(
            [...unusedScenes].sort((left, right) => left.localeCompare(right)),
            [...fixture.expected.unusedSceneIds].sort((left, right) =>
              left.localeCompare(right),
            ),
          ),
        )
      }

      const questionStarts = [],
        visitedSteps = [],
        visitedScenes = []
      const authoredBoards = [],
        automaticBoards = []
      let finishCount = 0,
        completedQuestions = 0,
        acceptedOnlyQuestions = true
      let staleSceneCommandsRejected = true,
        ordinalsCorrect = true
      coordinator = new StudioShowCoordinator({
        timeline,
        scenes: extras.scenes,
        questionIds: extras.questionIds,
        defaults: extras.defaults,
        callbacks: {
          onStartQuestion(index) {
            questionStarts.push(index)
          },
          onFinish() {
            finishCount += 1
          },
          onBroadcastState() {
            /* This structural fixture checks scene transitions without broadcasting state. */
          },
        },
      })
      const hooks = createShowRoundHooks({
        extensionSession: {
          extras,
          consumeManualLeaderboardRequest: () => false,
        },
        showCoordinator: coordinator,
        isCreatingWorldsShow: isCreatingWorldsProgram(extras),
        gameMode: base.gameMode,
        round: { currentQuestionIndex: 0 },
        roster: {},
        setLastDistribution() {
          /* This structural fixture does not store a vote distribution. */
        },
        syncRosterScoresFromPlayers() {
          /* This structural fixture has no player scores to synchronize. */
        },
        broadcastHostPresence() {
          /* This structural fixture has no connected host to notify. */
        },
        broadcastExtensionState() {
          /* This structural fixture observes the session directly instead of broadcasting it. */
        },
      })
      row.nativeStartCountdownSkipped =
        hooks.skipShowStartCountdown?.() ?? false
      hooks.onShowStart(() => {
        throw new Error("unexpected fallback start")
      })
      for (
        let guard = 0;
        coordinator.currentPhase !== "finished" && guard <= timeline.length;
        guard += 1
      ) {
        const step = coordinator.getAuthoritativeStepEnvelope("manager")

        if (!step) {
          throw new Error("missing active step")
        }

        visitedSteps.push(step.id)

        if (step.kind === "question") {
          const index = extras.questionIds.indexOf(step.questionId)
          completedQuestions += 1
          acceptedOnlyQuestions &&= coordinator.canAcceptAnswers()
          ordinalsCorrect &&= step.questionOrdinal === completedQuestions

          if (
            hooks.shouldShowLeaderboard?.({
              currentQuestionIndex: index,
              totalQuestions: base.questions.length,
              currentCategory: base.questions[index]?.category,
              nextCategory: base.questions[index + 1]?.category,
            })
          ) {
            automaticBoards.push(completedQuestions)
          }

          hooks.onQuestionCompleted(index, () => {
            throw new Error("unexpected fallback advance")
          })
        } else {
          visitedScenes.push(step.sceneId)
          acceptedOnlyQuestions &&= !coordinator.canAcceptAnswers()

          if (step.kind === "leaderboard") {
            authoredBoards.push(completedQuestions)
          }

          const before = coordinator.currentIndex
          staleSceneCommandsRejected &&= !coordinator.advanceScene(
            step.sceneId,
            step.epoch - 1,
            step.stepIndex,
          )
          staleSceneCommandsRejected &&= coordinator.currentIndex === before

          if (
            !coordinator.advanceScene(step.sceneId, step.epoch, step.stepIndex)
          ) {
            throw new Error("canonical advance rejected")
          }
        }
      }

      row.visitedQuestionCount = questionStarts.length
      row.visitedTimelineCount = visitedSteps.length
      row.authoredLeaderboardAfterQuestions = authoredBoards
      row.automaticLeaderboardAfterQuestions = automaticBoards
      check(
        "canonical coordinator visits every authored step once and in order",
        same(
          visitedSteps,
          timeline.map((item) => item.id),
        ),
      )
      check(
        "canonical coordinator starts every question exactly once in authored order",
        same(
          questionStarts,
          questionOrder.map((id) => extras.questionIds.indexOf(id)),
        ),
      )
      check(
        "question ordinals count questions without scene cards",
        ordinalsCorrect,
      )
      check("only question phases accept answers", acceptedOnlyQuestions)
      check(
        "stale scene commands do not advance the timeline",
        staleSceneCommandsRejected,
      )
      check(
        "unused scene definitions never become active",
        visitedScenes.every(
          (id) => referencedScenes.has(id) && !unusedScenes.has(id),
        ),
      )

      if (fixture.expected?.leaderboardAfterQuestions) {
        check(
          "authored leaderboards occur at their stored question boundaries",
          same(authoredBoards, fixture.expected.leaderboardAfterQuestions),
        )
      }

      if (
        ["cardOnly", "disabled"].includes(extras.defaults.leaderboardPolicy)
      ) {
        check(
          "authored leaderboard policy prevents duplicate automatic boards",
          automaticBoards.length === 0,
        )
      }

      check(
        "authored timeline reaches finished once",
        coordinator.currentPhase === "finished" && finishCount === 1,
      )
      coordinator.onQuestionCompleted(extras.questionIds.length - 1)
      coordinator.advanceScene()
      coordinator.start()
      check(
        "duplicate terminal messages cannot finish the show again",
        finishCount === 1 && coordinator.currentPhase === "finished",
      )
      row.passed = row.checks.every((item) => item.passed)
    } catch {
      // Exceptions may contain private question text; never serialize their message.
      row.errorCode = "STRUCTURAL_PLAYBACK_FAILED"
      row.passed = false
    } finally {
      coordinator?.dispose()
    }

    rows.push(row)
  }

  return {
    schemaVersion: 1,
    layer: "structural-only",
    fixtureCount: rows.length,
    passed:
      games.length > 0 &&
      rows.length === games.length &&
      rows.every((row) => row.passed),
    games: rows,
  }
}
