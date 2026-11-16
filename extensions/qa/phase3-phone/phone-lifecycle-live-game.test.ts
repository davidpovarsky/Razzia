import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createDefaultGameSettings,
  QUIZZ_MODES,
} from "@razzia/common/constants"
import Game from "@razzia/socket/services/game"
import Registry from "@razzia/socket/services/registry"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import {
  createEstimationQuestion,
  createQuestion,
  createQuizz,
} from "@razzia/socket/test/fixtures"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  Action,
  Receipt,
  VerifiedServiceContext,
} from "../../src/server/phone-lifecycle-v2/contracts"
import { RealGameFacade } from "../../src/server/phone-lifecycle-v2/game-facade"
import { PrototypeStore } from "../../src/server/phone-lifecycle-v2/store"
import { LifecyclePrototype } from "../../src/server/phone-lifecycle-v2/prototype"
import { operationReceipt } from "../../src/telephony/pilot-runtime/gateway-v2/adapter"

const ALL_ACTIONS: readonly Action[] = ["register", "poll", "answer", "hangup"]
const CAP_A = "a".repeat(64)
const CAP_B = "b".repeat(64)
const MANAGER_ID = "phase3_manager_001"
const PROVIDER = "synthetic-provider"
const SERVICE = "service_phase3_01"

function makePrivateRoot(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  writeFileSync(join(dir, "PHONE_V2A_SYNTHETIC_ONLY"), "synthetic-v2a-only\n")

  return dir
}

async function advanceUntil(
  predicate: () => boolean,
  stepMs = 100,
  maxSteps = 400,
): Promise<void> {
  for (let i = 0; i < maxSteps; i += 1) {
    if (predicate()) {
      return
    }

    await vi.advanceTimersByTimeAsync(stepMs)
  }

  throw new Error("Timed out advancing fake timers until predicate matched")
}

interface Harness {
  game: Game
  managerSocket: ReturnType<ReturnType<typeof createFakeIo>["createSocket"]>
  lifecycle: LifecyclePrototype
  store: PrototypeStore
  facade: RealGameFacade
  context: VerifiedServiceContext
  cleanup: () => void
}

function createHarness(
  quizz: ReturnType<typeof createQuizz>,
  options: { phoneInviteOnly?: boolean; seedLongName?: boolean } = {},
): Harness {
  const root = makePrivateRoot("phase3-v2a-live-")
  const fake = createFakeIo()
  const game = new Game(fake.io, MANAGER_ID, quizz)
  const managerSocket = fake.createSocket("manager-sock", MANAGER_ID)
  game.reconnect(managerSocket)

  if (options.seedLongName) {
    game.upsertRosterParticipant({
      rosterPlayerId: "roster_pre_long",
      displayName: "Synthetic Invited Caller 1234567890",
      phone: "+15550100001",
    })
  }

  if (options.phoneInviteOnly) {
    game.updateSettings({
      ...createDefaultGameSettings(),
      phoneInviteOnly: true,
      endOnAllAnswered: false,
    })
  } else {
    game.updateSettings({
      ...createDefaultGameSettings(),
      endOnAllAnswered: false,
    })
  }

  Registry.getInstance().addGame(game)

  const games = new Map([[game.gameId, game]])
  const facade = new RealGameFacade(game, (gameId, owner) => {
    const found = games.get(gameId)

    return found?.manager.clientId === owner ? found : undefined
  })

  const context: VerifiedServiceContext = {
    verified: true,
    owner: MANAGER_ID,
    issuerSid: "issuer_sid_01",
    game: game.gameId,
    provider: PROVIDER,
    service: SERVICE,
    executorId: facade.executorId,
    actions: ALL_ACTIONS,
    expiresAt: Date.now() + 60 * 60_000,
  }

  const verifyLiveAuthority = (ctx: VerifiedServiceContext, action: Action) =>
    ctx.actions.includes(action)

  const store = new PrototypeStore(root, context, verifyLiveAuthority)
  const lifecycle = new LifecyclePrototype(store, facade, verifyLiveAuthority)

  return {
    game,
    managerSocket,
    lifecycle,
    store,
    facade,
    context,
    cleanup: () => {
      game.dispose()
      Registry.getInstance().removeGame(game.gameId)

      try {
        store.close()
      } catch {
        // Ignore double close
      }

      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3 })
      } catch {
        // Ignore transient Windows lock
      }
    },
  }
}

function assertGatewayOperateReceipt(receipt: Receipt) {
  expect(() => operationReceipt(receipt)).not.toThrow()
}

describe("Phase 3 Unit C: Phone Lifecycle v2 against real isolated Game", () => {
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    while (cleanups.length > 0) {
      cleanups.pop()?.()
    }

    vi.useRealTimers()
  })

  it("enforces full 20s window + deterministic non-mutating answer rejections without bricking Q2 voting/scoring", async () => {
    const q1 = createQuestion({
      answers: ["Red", "Blue", "Green", "Yellow"],
      solutions: [1],
      time: 20,
      cooldown: 3,
    })
    const q2 = createQuestion({
      answers: ["Alpha", "Beta", "Gamma", "Delta"],
      solutions: [2],
      time: 20,
      cooldown: 3,
    })
    const quizz = createQuizz([q1, q2], QUIZZ_MODES.QUIZ)
    const h = createHarness(quizz, {
      phoneInviteOnly: true,
      seedLongName: true,
    })
    cleanups.push(h.cleanup)

    // Pre-registered invited caller with 35-char display name registers cleanly
    const regReqId = "req_reg_1"
    const reg = h.lifecycle.register(h.context, {
      requestId: regReqId,
      providerReference: "prov_call_A",
      phone: "+15550100001",
      expectedPredecessor: 0,
      capability: CAP_A,
    })
    expect(reg.ok).toBe(true)
    expect(reg.status).toBe("active")
    expect(reg.rosterPlayerId).toBe("roster_pre_long")
    expect(h.game.players[0]?.username).toBe(
      "Synthetic Invited Caller 1234567890",
    )

    // Lost-ACK register retry is idempotent
    const regRetry = h.lifecycle.register(h.context, {
      requestId: regReqId,
      providerReference: "prov_call_A",
      phone: "+15550100001",
      expectedPredecessor: 0,
      capability: CAP_A,
    })
    expect(regRetry).toEqual(reg)

    // Pre-start answer hits no_active_question cleanly without PENDING lockup
    const prePoll = h.lifecycle.operate(h.context, {
      requestId: regReqId,
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_pre_poll",
      action: "poll",
    })
    expect(prePoll.ok).toBe(true)
    expect(prePoll.epoch).toBe(0)

    const preAnswer = h.lifecycle.operate(h.context, {
      requestId: regReqId,
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_pre_ans",
      action: "answer",
      epoch: 0,
      answerIndex: 1,
    })
    expect(preAnswer.ok).toBe(false)
    expect(preAnswer.status).toBe("no_active_question")
    assertGatewayOperateReceipt(preAnswer)

    // Start game and reach Q1 entrance (SHOW_PREPARED: epoch is already 1, acceptingAnswers is false)
    void h.game.start(h.managerSocket)
    await advanceUntil(
      () => h.game.getQuestionStateForGateway(reg.rosterPlayerId).epoch >= 1,
    )
    const entranceState = h.game.getQuestionStateForGateway(reg.rosterPlayerId)
    expect(entranceState.acceptingAnswers).toBe(false)

    // Answer pressed during entrance (not_accepting_answers) MUST NOT brick the caller
    const earlyAnswer = h.lifecycle.operate(h.context, {
      requestId: regReqId,
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_early_ans",
      action: "answer",
      epoch: entranceState.epoch,
      answerIndex: 1,
    })
    expect(earlyAnswer.ok).toBe(false)
    expect(earlyAnswer.status).toBe("not_accepting_answers")
    assertGatewayOperateReceipt(earlyAnswer)

    // Advance until voting opens for the full 20s window
    await advanceUntil(
      () =>
        h.game.getQuestionStateForGateway(reg.rosterPlayerId).acceptingAnswers,
    )
    expect(h.game.roundManager.getRemainingSeconds()).toBe(20)

    // Verify invalid keypad digit (key 5 / index 4 on a 4-option question) rejects deterministically without bricking
    const badDigit = h.lifecycle.operate(h.context, {
      requestId: regReqId,
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_bad_digit",
      action: "answer",
      epoch: entranceState.epoch,
      answerIndex: 4,
    })
    expect(badDigit.ok).toBe(false)
    expect(badDigit.status).toBe("invalid_answer_index")
    assertGatewayOperateReceipt(badDigit)

    // Pause -> answer while paused -> resume -> must NOT brick caller
    expect(h.game.roundManager.pauseGame()).toBe(true)
    const pausedAns = h.lifecycle.operate(h.context, {
      requestId: regReqId,
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_paused_ans",
      action: "answer",
      epoch: entranceState.epoch,
      answerIndex: 1,
    })
    expect(pausedAns.ok).toBe(false)
    expect(pausedAns.status).toBe("game_paused")
    assertGatewayOperateReceipt(pausedAns)
    expect(h.game.roundManager.resumeGame()).toBe(true)

    // Valid Q1 answer accepted & scored after 20s close (second caller absent, or single caller with endOnAllAnswered=false waits 20s)
    const q1Vote = h.lifecycle.operate(h.context, {
      requestId: regReqId,
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_q1_vote",
      action: "answer",
      epoch: entranceState.epoch,
      answerIndex: 1,
    })
    expect(q1Vote.ok).toBe(true)
    expect(q1Vote.status).toBe("accepted")
    assertGatewayOperateReceipt(q1Vote)

    // Duplicate vote with NEW operationId rejects cleanly without bricking
    const dupVote = h.lifecycle.operate(h.context, {
      requestId: regReqId,
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_q1_dup",
      action: "answer",
      epoch: entranceState.epoch,
      answerIndex: 2,
    })
    expect(dupVote.ok).toBe(false)
    expect(dupVote.status).toBe("duplicate_answer")
    assertGatewayOperateReceipt(dupVote)

    // Voting stays open for the full 20s window (not closed prematurely after 1 player answers)
    await vi.advanceTimersByTimeAsync(19 * (1000 / 5) - 50)
    expect(
      h.game.getQuestionStateForGateway(reg.rosterPlayerId).acceptingAnswers,
    ).toBe(true)

    // Complete the 20s window
    await advanceUntil(
      () =>
        !h.game.getQuestionStateForGateway(reg.rosterPlayerId).acceptingAnswers,
    )

    // Late answer right after 20s window closes (epoch still == 1) rejects deterministically AND stays unbricked!
    const lateVote = h.lifecycle.operate(h.context, {
      requestId: regReqId,
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_q1_late",
      action: "answer",
      epoch: entranceState.epoch,
      answerIndex: 0,
    })
    expect(lateVote.ok).toBe(false)
    expect(lateVote.status).toBe("not_accepting_answers")
    assertGatewayOperateReceipt(lateVote)

    // Retry of the deterministically rejected late answer replays identically; conflicting payload rejects cleanly
    const lateRetry = h.lifecycle.operate(h.context, {
      requestId: regReqId,
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_q1_late",
      action: "answer",
      epoch: entranceState.epoch,
      answerIndex: 0,
    })
    expect(lateRetry).toEqual(lateVote)

    const lateConflict = h.lifecycle.operate(h.context, {
      requestId: regReqId,
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_q1_late",
      action: "answer",
      epoch: entranceState.epoch,
      answerIndex: 1,
    })
    expect(lateConflict.ok).toBe(false)
    expect(lateConflict.status).toBe("operation_conflict")

    // Q1 score recorded on real Game player & visible on poll
    const q1Points = h.game.getQuestionStateForGateway(
      reg.rosterPlayerId,
    ).points
    expect(q1Points).toBeGreaterThan(0)

    // Advance Reveal -> Leaderboard -> Q2 and verify caller STILL polls, votes, and scores on Q2!
    h.game.advance()
    h.game.advance()
    await advanceUntil(
      () =>
        h.game.getQuestionStateForGateway(reg.rosterPlayerId).epoch >
          entranceState.epoch &&
        h.game.getQuestionStateForGateway(reg.rosterPlayerId).acceptingAnswers,
    )

    const q2Poll = h.lifecycle.operate(h.context, {
      requestId: regReqId,
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_q2_poll",
      action: "poll",
    })
    expect(q2Poll.ok).toBe(true)
    expect(q2Poll.status).toBe("observed")
    expect(q2Poll.points).toBe(q1Points)
    expect(q2Poll.answered).toBe(false)

    // Stale epoch from Q1 rejects deterministically
    const staleQ1 = h.lifecycle.operate(h.context, {
      requestId: regReqId,
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_stale_q1",
      action: "answer",
      epoch: entranceState.epoch,
      answerIndex: 1,
    })
    expect(staleQ1.ok).toBe(false)
    expect(staleQ1.status).toBe("stale_epoch")

    // Caller votes correctly on Q2 and earns additional points!
    const q2Vote = h.lifecycle.operate(h.context, {
      requestId: regReqId,
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_q2_vote",
      action: "answer",
      epoch: q2Poll.epoch!,
      answerIndex: 2,
    })
    expect(q2Vote.ok).toBe(true)
    expect(q2Vote.status).toBe("accepted")

    await advanceUntil(
      () =>
        !h.game.getQuestionStateForGateway(reg.rosterPlayerId).acceptingAnswers,
    )
    expect(
      h.game.getQuestionStateForGateway(reg.rosterPlayerId).points,
    ).toBeGreaterThan(q1Points)
  })

  it("handles unsupported PSTN questions, manual skip, A->B explicit replacement, delayed A callbacks, and post-hangup terminal state", async () => {
    const q1 = createQuestion({
      answers: ["A", "B", "C", "D"],
      solutions: [0],
      time: 20,
      cooldown: 3,
    })
    const qMulti = createEstimationQuestion({
      time: 20,
      cooldown: 3,
    })
    const q3 = createQuestion({
      answers: ["Right", "Wrong", "Other"],
      solutions: [0],
      time: 20,
      cooldown: 3,
    })
    const quizz = createQuizz([q1, qMulti, q3], QUIZZ_MODES.QUIZ)
    const h = createHarness(quizz)
    cleanups.push(h.cleanup)

    const regA = h.lifecycle.register(h.context, {
      requestId: "req_a",
      providerReference: "call_a",
      phone: "+15550100099",
      expectedPredecessor: 0,
      capability: CAP_A,
    })
    expect(regA.ok).toBe(true)

    void h.game.start(h.managerSocket)
    await advanceUntil(
      () =>
        h.game.getQuestionStateForGateway(regA.rosterPlayerId).acceptingAnswers,
    )
    const epoch1 = h.game.getQuestionStateForGateway(regA.rosterPlayerId).epoch

    // Caller votes on Q1 and earns points
    const vote1 = h.lifecycle.operate(h.context, {
      requestId: "req_a",
      registrationId: regA.registrationId!,
      generation: regA.generation!,
      capability: CAP_A,
      operationId: "op_vote1",
      action: "answer",
      epoch: epoch1,
      answerIndex: 0,
    })
    expect(vote1.ok).toBe(true)

    // Complete Q1 so points are awarded before replacement
    await advanceUntil(
      () =>
        !h.game.getQuestionStateForGateway(regA.rosterPlayerId)
          .acceptingAnswers,
    )
    const scoreAfterQ1 = h.game.getQuestionStateForGateway(
      regA.rosterPlayerId,
    ).points
    expect(scoreAfterQ1).toBeGreaterThan(0)

    // Move to Q2 (multiple choice - unsupported on PSTN)
    h.game.advance()
    h.game.advance()
    await advanceUntil(
      () =>
        h.game.getQuestionStateForGateway(regA.rosterPlayerId).epoch > epoch1,
    )
    const q2State = h.game.getQuestionStateForGateway(regA.rosterPlayerId)
    expect(q2State.isSupportedOnPstn).toBe(false)

    // Pressing keypad on unsupported question maps to valid snake_case status and keeps caller unbricked
    const unsupportedAns = h.lifecycle.operate(h.context, {
      requestId: "req_a",
      registrationId: regA.registrationId!,
      generation: regA.generation!,
      capability: CAP_A,
      operationId: "op_unsup",
      action: "answer",
      epoch: q2State.epoch,
      answerIndex: 0,
    })
    expect(unsupportedAns.ok).toBe(false)
    expect(unsupportedAns.status).toBe("unsupported_question_type")
    assertGatewayOperateReceipt(unsupportedAns)

    // Host manually skips Q2 -> advances directly to Q3
    expect(h.game.roundManager.skipQuestion("host_manual_skip")).toBe(true)
    const afterSkipState = h.game.getQuestionStateForGateway(
      regA.rosterPlayerId,
    )
    expect(afterSkipState.epoch).toBeGreaterThan(q2State.epoch)

    // Stale Q2 answer fails deterministically with stale_epoch
    const staleAfterSkip = h.lifecycle.operate(h.context, {
      requestId: "req_a",
      registrationId: regA.registrationId!,
      generation: regA.generation!,
      capability: CAP_A,
      operationId: "op_stale_skip",
      action: "answer",
      epoch: q2State.epoch,
      answerIndex: 0,
    })
    expect(staleAfterSkip.ok).toBe(false)
    expect(staleAfterSkip.status).toBe("stale_epoch")

    // Wait for Q3 voting window to open
    await advanceUntil(
      () =>
        h.game.getQuestionStateForGateway(regA.rosterPlayerId).acceptingAnswers,
    )

    // Explicit replacement A -> B while live game is running!
    const regB = h.lifecycle.register(h.context, {
      requestId: "req_b",
      providerReference: "call_b",
      phone: "+15550100099",
      expectedPredecessor: regA.generation!,
      capability: CAP_B,
    })
    expect(regB.ok).toBe(true)
    expect(regB.generation).toBe(2)
    expect(regB.rosterPlayerId).toBe(regA.rosterPlayerId)

    // Delayed hangup / answer / poll from predecessor A MUST NOT affect B!
    const delayedAHangup = h.lifecycle.operate(h.context, {
      requestId: "req_a",
      registrationId: regA.registrationId!,
      generation: regA.generation!,
      capability: CAP_A,
      operationId: "op_delayed_a_hangup",
      action: "hangup",
    })
    expect(delayedAHangup.ok).toBe(false)
    expect(delayedAHangup.status).toBe("registration_retired")

    const delayedAAnswer = h.lifecycle.operate(h.context, {
      requestId: "req_a",
      registrationId: regA.registrationId!,
      generation: regA.generation!,
      capability: CAP_A,
      operationId: "op_delayed_a_ans",
      action: "answer",
      epoch: afterSkipState.epoch,
      answerIndex: 0,
    })
    expect(delayedAAnswer.ok).toBe(false)
    expect(delayedAAnswer.status).toBe("registration_retired")

    const delayedAPoll = h.lifecycle.operate(h.context, {
      requestId: "req_a",
      registrationId: regA.registrationId!,
      generation: regA.generation!,
      capability: CAP_A,
      operationId: "op_delayed_a_poll",
      action: "poll",
    })
    expect(delayedAPoll.ok).toBe(false)
    expect(delayedAPoll.status).toBe("registration_retired")

    const delayedARegRetry = h.lifecycle.register(h.context, {
      requestId: "req_a",
      providerReference: "call_a",
      phone: "+15550100099",
      expectedPredecessor: 0,
      capability: CAP_A,
    })
    expect(delayedARegRetry.ok).toBe(false)
    expect(delayedARegRetry.status).toBe("registration_retired")

    // B still sees Q1 score preserved and answers Q3 to gain more points!
    const pollB = h.lifecycle.operate(h.context, {
      requestId: "req_b",
      registrationId: regB.registrationId!,
      generation: regB.generation!,
      capability: CAP_B,
      operationId: "op_poll_b",
      action: "poll",
    })
    expect(pollB.ok).toBe(true)
    expect(pollB.points).toBe(scoreAfterQ1)

    const voteB = h.lifecycle.operate(h.context, {
      requestId: "req_b",
      registrationId: regB.registrationId!,
      generation: regB.generation!,
      capability: CAP_B,
      operationId: "op_vote_b",
      action: "answer",
      epoch: pollB.epoch!,
      answerIndex: 0,
    })
    expect(voteB.ok).toBe(true)
    expect(voteB.status).toBe("accepted")

    await advanceUntil(
      () =>
        !h.game.getQuestionStateForGateway(regB.rosterPlayerId)
          .acceptingAnswers,
    )
    expect(
      h.game.getQuestionStateForGateway(regB.rosterPlayerId).points,
    ).toBeGreaterThan(scoreAfterQ1)

    // B hangs up cleanly -> binding becomes TERMINAL and refuses re-registration
    const hangupB = h.lifecycle.operate(h.context, {
      requestId: "req_b",
      registrationId: regB.registrationId!,
      generation: regB.generation!,
      capability: CAP_B,
      operationId: "op_hangup_b",
      action: "hangup",
    })
    expect(hangupB.ok).toBe(true)
    expect(hangupB.status).toBe("disconnected")

    const redialAfterHangup = h.lifecycle.register(h.context, {
      requestId: "req_redial",
      providerReference: "call_c",
      phone: "+15550100099",
      expectedPredecessor: regB.generation!,
      capability: "c".repeat(64),
    })
    expect(redialAfterHangup.ok).toBe(false)
    expect(redialAfterHangup.status).toBe("binding_pending_unknown")

    const postHangupPollB = h.lifecycle.operate(h.context, {
      requestId: "req_b",
      registrationId: regB.registrationId!,
      generation: regB.generation!,
      capability: CAP_B,
      operationId: "op_post_hangup_poll_b",
      action: "poll",
    })
    expect(postHangupPollB.ok).toBe(false)
    expect(postHangupPollB.status).toBe("registration_retired")
  })

  it("maps scene_active deterministically without bricking subsequent Q1 answers once scene clears", async () => {
    const q1 = createQuestion({
      answers: ["A", "B", "C", "D"],
      solutions: [0],
      time: 20,
      cooldown: 3,
    })
    const quizz = createQuizz([q1], QUIZZ_MODES.QUIZ)
    const h = createHarness(quizz)
    cleanups.push(h.cleanup)

    const reg = h.lifecycle.register(h.context, {
      requestId: "req_scene",
      providerReference: "call_scene",
      phone: "+15550100188",
      expectedPredecessor: 0,
      capability: CAP_A,
    })
    expect(reg.ok).toBe(true)

    void h.game.start(h.managerSocket)
    await advanceUntil(
      () =>
        h.game.getQuestionStateForGateway(reg.rosterPlayerId).acceptingAnswers,
    )
    const state = h.game.getQuestionStateForGateway(reg.rosterPlayerId)

    const submitSpy = vi
      .spyOn(h.game, "submitPhoneAnswerByRosterId")
      .mockReturnValueOnce({
        accepted: false,
        epoch: state.epoch,
        reason: "scene_active",
      })
    const sceneBlocked = h.lifecycle.operate(h.context, {
      requestId: "req_scene",
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_scene_blocked",
      action: "answer",
      epoch: state.epoch,
      answerIndex: 0,
    })
    expect(sceneBlocked.ok).toBe(false)
    expect(sceneBlocked.status).toBe("scene_active")
    assertGatewayOperateReceipt(sceneBlocked)
    submitSpy.mockRestore()

    // Subsequent real answer succeeds once scene clears
    const acceptedAfterScene = h.lifecycle.operate(h.context, {
      requestId: "req_scene",
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_after_scene",
      action: "answer",
      epoch: state.epoch,
      answerIndex: 0,
    })
    expect(acceptedAfterScene.ok).toBe(true)
    expect(acceptedAfterScene.status).toBe("accepted")
  })

  it("preserves fail-closed answer_outcome_unknown for genuine engine rejections without leaving false terminal acceptance", async () => {
    const q1 = createQuestion({
      answers: ["A", "B", "C", "D"],
      solutions: [0],
      time: 20,
      cooldown: 3,
    })
    const quizz = createQuizz([q1], QUIZZ_MODES.QUIZ)
    const h = createHarness(quizz)
    cleanups.push(h.cleanup)

    const reg = h.lifecycle.register(h.context, {
      requestId: "req_reg_eng",
      providerReference: "call_eng",
      phone: "+15550100123",
      expectedPredecessor: 0,
      capability: CAP_A,
    })
    expect(reg.ok).toBe(true)

    void h.game.start(h.managerSocket)
    await advanceUntil(
      () =>
        h.game.getQuestionStateForGateway(reg.rosterPlayerId).acceptingAnswers,
    )
    const state = h.game.getQuestionStateForGateway(reg.rosterPlayerId)

    // Simulate a direct game-engine rejection after pre-checks pass (not in deterministic pre-check set)
    vi.spyOn(h.game.roundManager, "selectAnswer").mockImplementation(() => ({
      accepted: false,
      reason: "invalid_answer",
    }))

    const engFail = h.lifecycle.operate(h.context, {
      requestId: "req_reg_eng",
      registrationId: reg.registrationId!,
      generation: reg.generation!,
      capability: CAP_A,
      operationId: "op_eng_fail",
      action: "answer",
      epoch: state.epoch,
      answerIndex: 0,
    })
    expect(engFail.ok).toBe(false)
    expect(engFail.status).toBe("answer_outcome_unknown")
  })
})
