import { normalizePhoneE164 } from "@razzia/extensions/core"
import {
  capabilityHash,
  Denied,
  digest,
  fail,
  identifier,
  type Action,
  type OperationInput,
  type Receipt,
  type RegistrationInput,
  type VerifiedServiceContext,
} from "./contracts"
import { RealGameFacade } from "./game-facade"
import { PrototypeStore } from "./store"

// Deliberately unmounted: no HTTP handler, service credential provisioning,
// server export or gateway import. Synchronous projection is only a prototype
// boundary, not a durable transaction with Game's heap/events/scoring.
export class LifecyclePrototype {
  constructor(
    private readonly store: PrototypeStore,
    private readonly game: RealGameFacade,
    private readonly verifyLiveAuthority: (
      context: VerifiedServiceContext,
      action: Action,
    ) => boolean,
  ) {}

  private authorize(context: VerifiedServiceContext, action: Action) {
    this.store.authorize(context, action)

    if (!this.verifyLiveAuthority(context, action)) {
      throw new Denied("service_denied")
    }

    if (!this.game.exists(context)) {
      throw new Denied("game_unavailable")
    }
  }

  register(context: VerifiedServiceContext, input: RegistrationInput): Receipt {
    try {
      this.authorize(context, "register")
      identifier(input.requestId)
      identifier(input.providerReference)

      if (
        !Number.isSafeInteger(input.expectedPredecessor) ||
        input.expectedPredecessor < 0 ||
        input.expectedPredecessor >= Number.MAX_SAFE_INTEGER
      ) {
        return fail("invalid_predecessor")
      }

      const phone =
        typeof input.phone === "string" ? normalizePhoneE164(input.phone) : null

      if (!phone) {
        return fail("invalid_phone")
      }

      const capHash = capabilityHash(input.capability)
      const callerHash = digest(phone),
        referenceHash = digest(input.providerReference)
      const fingerprint = digest(
        JSON.stringify([
          2,
          "register",
          context.owner,
          context.game,
          context.provider,
          context.issuerSid,
          context.service,
          context.executorId,
          input.requestId,
          callerHash,
          referenceHash,
          capHash,
          input.expectedPredecessor,
        ]),
      )

      // Even a cached successful receipt cannot be used to target another room
      // after backend loss. No active/global fallback exists here.
      if (!this.game.exists(context)) {
        return fail("game_unavailable")
      }

      const decision = this.store.reserveRegistration(context, {
        requestId: input.requestId,
        callerHash,
        referenceHash,
        capabilityHash: capHash,
        expectedPredecessor: input.expectedPredecessor,
        fingerprint,
      })
      // Recheck after SQLite wait and on receipt replay.

      this.authorize(context, "register")

      if (decision.kind === "receipt") {
        if (
          decision.receipt.ok &&
          decision.row &&
          !this.game.matches(context, decision.row)
        ) {
          return fail("game_binding_changed")
        }

        return decision.receipt
      }

      const result = this.game.admit(context, decision, phone)

      if (result.status.endsWith("_unknown")) {
        return result
      }

      return this.store.completeRegistration(context, decision, result)
    } catch (error) {
      // Exceptions after a reservation leave it durably pending. A coarse
      // response cannot assert rollback or mint/reveal a replacement secret.
      return fail(error instanceof Denied ? error.reason : "outcome_unknown")
    }
  }

  operate(context: VerifiedServiceContext, input: OperationInput): Receipt {
    try {
      if (!["poll", "answer", "hangup"].includes(input.action)) {
        return fail("invalid_action")
      }

      this.authorize(context, input.action)

      if (!Number.isSafeInteger(input.generation) || input.generation < 1) {
        return fail("invalid_generation")
      }

      if (
        input.action === "answer" &&
        (!Number.isSafeInteger(input.epoch) ||
          typeof input.answerIndex !== "number" ||
          !Number.isSafeInteger(input.answerIndex) ||
          input.answerIndex < 0)
      ) {
        return fail("invalid_answer")
      }

      if (!this.game.exists(context)) {
        return fail("game_unavailable")
      }

      const decision = this.store.reserveOperation(context, input)
      this.authorize(context, input.action)

      if (decision.kind === "receipt") {
        if (
          decision.receipt.ok &&
          decision.row &&
          !this.game.matches(context, decision.row)
        ) {
          return fail("game_binding_changed")
        }

        return decision.receipt
      }

      const result = this.game.operate(context, decision.row, input)

      if (result.status.endsWith("_unknown")) {
        return result
      }

      return this.store.completeOperation(context, input, result)
    } catch (error) {
      return fail(error instanceof Denied ? error.reason : "outcome_unknown")
    }
  }
}
