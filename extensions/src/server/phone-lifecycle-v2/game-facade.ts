import type Game from "@razzia/socket/services/game"
import { randomUUID } from "node:crypto"
import {
  digest,
  fail,
  type OperationInput,
  type Receipt,
  type RegistrationRow,
  type Reservation,
  type VerifiedServiceContext,
} from "./contracts"

// Non-mutating guard reasons returned before RoundManager.selectAnswer runs.
// Everything else (including "rejected_by_engine") stays answer_outcome_unknown
// so post-mutation ambiguity fails closed rather than falsely settling.
const DETERMINISTIC_ANSWER_REJECTIONS = new Set([
  "phone_protocol_required",
  "scene_active",
  "game_paused",
  "no_active_question",
  "unsupported_question_type",
  "invalid_answer_index",
  "not_accepting_answers",
  "player_not_joined",
  "stale_call",
  "player_not_found",
  "duplicate_answer",
])

function answerStatus(
  answer: ReturnType<PublicPhoneGame["submitPhoneAnswerByRosterId"]>,
  isSupportedOnPstn: boolean,
): string {
  if (answer.accepted) {
    return "accepted"
  }

  if (answer.reason && DETERMINISTIC_ANSWER_REJECTIONS.has(answer.reason)) {
    return answer.reason
  }

  if (!isSupportedOnPstn && answer.reason !== "rejected_by_engine") {
    return "unsupported_question_type"
  }

  return "answer_outcome_unknown"
}

export type PublicPhoneGame = Pick<
  Game,
  | "gameId"
  | "manager"
  | "players"
  | "findRosterByPhone"
  | "getRosterEntry"
  | "joinOrRebindPhoneCaller"
  | "getQuestionStateForGateway"
  | "submitPhoneAnswerByRosterId"
  | "disconnectPhoneCallerByRosterId"
>

// This facade calls the real Game. It has no substitute roster/scoring engine.
export class RealGameFacade {
  readonly executorId = randomUUID()
  constructor(
    private readonly owningGame: PublicPhoneGame,
    private readonly resolveGame: (
      gameId: string,
      owner: string,
    ) => PublicPhoneGame | undefined,
  ) {}

  private game(context: VerifiedServiceContext) {
    const game = this.resolveGame(context.game, context.owner)

    return game === this.owningGame &&
      game.gameId === context.game &&
      game.manager.clientId === context.owner &&
      context.executorId === this.executorId
      ? game
      : undefined
  }

  private static bound(
    game: PublicPhoneGame,
    row: RegistrationRow,
  ): row is RegistrationRow & { roster_id: string } {
    const entry = row.roster_id ? game.getRosterEntry(row.roster_id) : null

    return (
      entry !== null &&
      entry.clientId === row.client_id &&
      typeof entry.phoneE164 === "string" &&
      entry.phoneE164.length > 0 &&
      digest(entry.phoneE164) === row.caller_hash &&
      entry.activeCallId === row.registration_id &&
      entry.status === "connected" &&
      game.players.some((p) => p.clientId === row.client_id && p.connected)
    )
  }

  exists(context: VerifiedServiceContext) {
    return this.game(context) !== undefined
  }

  matches(context: VerifiedServiceContext, row: RegistrationRow) {
    const game = this.game(context)

    return game !== undefined && RealGameFacade.bound(game, row)
  }

  admit(
    context: VerifiedServiceContext,
    reservation: Reservation,
    phone: string,
  ): Receipt {
    const game = this.game(context)

    if (!game) {
      return fail("game_unavailable")
    }

    const previous = reservation.predecessor

    if (previous && !RealGameFacade.bound(game, previous)) {
      return fail("game_binding_changed")
    }

    if (!previous && game.findRosterByPhone(phone)?.clientId) {
      return fail("untracked_existing_binding")
    }

    const result = game.joinOrRebindPhoneCaller({
      rosterPlayerId: previous?.roster_id ?? undefined,
      phoneRaw: phone,
      callId: reservation.row.registration_id,
    })

    // Billing admission may have run a joining callback before returning an
    // error. Never certify no-effect from this generic result.
    if (!result.ok) {
      return fail("admission_outcome_unknown")
    }

    const row = {
      ...reservation.row,
      roster_id: result.rosterPlayerId ?? null,
      client_id: result.clientId ?? null,
    }

    if (
      !result.rosterPlayerId ||
      !result.clientId ||
      !RealGameFacade.bound(game, row)
    ) {
      return fail("projection_outcome_unknown")
    }

    return {
      ok: true,
      status: "active",
      registrationId: row.registration_id,
      generation: row.generation,
      rosterPlayerId: result.rosterPlayerId,
      clientId: result.clientId,
    }
  }

  operate(
    context: VerifiedServiceContext,
    row: RegistrationRow,
    input: OperationInput,
  ): Receipt {
    const game = this.game(context)

    if (!game) {
      return fail("game_unavailable")
    }

    if (!RealGameFacade.bound(game, row)) {
      return fail("game_binding_changed")
    }

    const rosterId = row.roster_id
    const state = game.getQuestionStateForGateway(rosterId)

    if (input.action === "poll") {
      return {
        ok: true,
        status: "observed",
        epoch: state.epoch,
        points: state.points,
        answered: state.answeredCurrentQuestion,
      }
    }

    if (input.action === "answer") {
      if (input.epoch !== state.epoch) {
        return fail("stale_epoch")
      }

      const { answerIndex } = input

      if (answerIndex === undefined) {
        throw new Error(
          "Phone answer reached the facade without an admitted index",
        )
      }

      const answer = game.submitPhoneAnswerByRosterId(
        rosterId,
        answerIndex,
        row.registration_id,
      )

      return {
        ok: answer.accepted,
        status: answerStatus(answer, state.isSupportedOnPstn),
        accepted: answer.accepted,
        epoch: answer.epoch,
      }
    }

    const disconnected = game.disconnectPhoneCallerByRosterId(
      rosterId,
      false,
      row.registration_id,
    )

    return {
      ok: disconnected,
      status: disconnected ? "disconnected" : "disconnect_outcome_unknown",
    }
  }
}
