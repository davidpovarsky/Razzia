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
      game?.gameId === context.game &&
      game.manager.clientId === context.owner &&
      context.executorId === this.executorId
      ? game
      : undefined
  }

  private bound(game: PublicPhoneGame, row: RegistrationRow) {
    const entry = row.roster_id ? game.getRosterEntry(row.roster_id) : null
    return (
      !!entry &&
      entry.clientId === row.client_id &&
      !!entry.phoneE164 &&
      digest(entry.phoneE164) === row.caller_hash &&
      entry.activeCallId === row.registration_id &&
      entry.status === "connected" &&
      game.players.some((p) => p.clientId === row.client_id && p.connected)
    )
  }

  exists(context: VerifiedServiceContext) {
    return !!this.game(context)
  }

  matches(context: VerifiedServiceContext, row: RegistrationRow) {
    const game = this.game(context)
    return !!game && this.bound(game, row)
  }

  admit(
    context: VerifiedServiceContext,
    reservation: Reservation,
    phone: string,
  ): Receipt {
    const game = this.game(context)
    if (!game) return fail("game_unavailable")
    const previous = reservation.predecessor
    if (previous && !this.bound(game, previous))
      return fail("game_binding_changed")
    if (!previous && game.findRosterByPhone(phone)?.clientId)
      return fail("untracked_existing_binding")
    const result = game.joinOrRebindPhoneCaller({
      rosterPlayerId: previous?.roster_id ?? undefined,
      phoneRaw: phone,
      callId: reservation.row.registration_id,
    })
    // Billing admission may have run a joining callback before returning an
    // error. Never certify no-effect from this generic result.
    if (!result.ok) return fail("admission_outcome_unknown")
    const row = {
      ...reservation.row,
      roster_id: result.rosterPlayerId ?? null,
      client_id: result.clientId ?? null,
    }
    if (!result.rosterPlayerId || !result.clientId || !this.bound(game, row))
      return fail("projection_outcome_unknown")
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
    if (!game) return fail("game_unavailable")
    if (!this.bound(game, row)) return fail("game_binding_changed")
    const rosterId = row.roster_id!
    const state = game.getQuestionStateForGateway(rosterId)
    if (input.action === "poll")
      return {
        ok: true,
        status: "observed",
        epoch: state.epoch,
        points: state.points,
        answered: state.answeredCurrentQuestion,
      }
    if (input.action === "answer") {
      if (input.epoch !== state.epoch) return fail("stale_epoch")
      const answer = game.submitPhoneAnswerByRosterId(
        rosterId,
        input.answerIndex!,
        row.registration_id,
      )
      return {
        ok: answer.accepted,
        status: answer.accepted ? "accepted" : "answer_outcome_unknown",
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
