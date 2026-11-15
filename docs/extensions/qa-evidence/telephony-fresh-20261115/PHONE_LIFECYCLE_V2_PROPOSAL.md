# Phone lifecycle v2 — proposed contract 0.1, NOT IMPLEMENTED

Addresses measured API09/10/11 gaps: a retired A call can replace B after gateway tombstone expiry or a real gateway process restart; an earlier request arriving late can replace B when the backend has no trusted registration order. No opaque CallId comparison, provider timestamp guess, longer in-memory TTL or assumption that abort rolled back a mutation can solve these guarantees.

This is a versioned design for manager review, not a wire/schema/storage lease. Keep existing legacy acceptance failures and receipts. Do not change the original thirteen assertions or describe v2 as accepted before its semantics and migration gates are approved.

## Trust and chronology

- Phone text is canonicalized by the existing backend normalizePhoneE164 and used for correlation only. It does not prove who placed a PSTN call. Shared gateway service authentication proves service identity, not possession of a caller number.
- Call IDs are opaque provider references within an authenticated provider/tenant namespace, never an authorization capability or chronological counter. Unique-ID and retry/reuse guarantees are still UNKNOWN for the real provider.
- Proposed v2 uses an explicit trusted registration step before poll/answer/hangup. Backend assigns a monotonic generation transactionally for a tenant/game/participant, plus random registration ID and a high-entropy per-call capability. Store only the capability hash server-side and redact it from logs.
- **Registration order is not physical call order.** If A's first registration itself arrives after B, the server cannot infer that A physically started first without independently verified provider ordering evidence. The manager must choose server-registration precedence, a verified ingress ordering signal, or fail-closed ambiguity handling. Do not claim API11's physical chronology from network arrival.
- To prove stale operation ordering, register A first, register/activate B second, then deliver A's delayed *operation* using A's older issued generation. This is a new versioned test; retain original legacy API11 as unmet until its protocol/compatibility disposition is explicit. Do not rewrite it to manufacture green.

## Proposed protocol and authoritative state

All fields/endpoints below are draft. Version 2 must be explicit and opt-in; no hidden reinterpretation of v1 payloads.

1. `REGISTER(v2, registrationRequestId, providerNamespace, opaqueProviderCallRef, callerClaim, requestedGame)` is accepted only from a configured authorized gateway. Tenant and allowed game are derived/validated from trusted service context. The request ID is random, durably written by the trusted gateway before dispatch and used to resolve uncertain retries. It is not minted anew by every retry callback.
2. Backend transaction checks current generation and participation/admission, creates an immutable registration identity, binds canonical caller to a server-selected roster within the game, and returns `{v:2,registrationId,generation,callCapability}`. Never use caller-supplied roster ID to select another participant. Same trusted registration request retries return the same decision, not a new generation. Any replacement operation requires the approved predecessor/compare-and-swap context.
3. `POLL/ANSWER/HANGUP(v2,registrationId,generation,callCapability,operationId,...)` requires exact tenant/game/participant binding. Poll never registers, rebinds, revives or upgrades a generation. Answer additionally checks current authoritative question epoch/window and canonical first-answer ledger. Provider event timestamps do not determine score.
4. Backend-owned state machine is registered→active→retired/closed. Retirement is terminal for that registration. Atomically activating a replacement retires its predecessor. Old capability/generation can at most observe its own terminal outcome, never return the replacement's private state or disconnect/score for it.
5. Hangup is idempotent per registration/operation. A stale A hangup may close A's own record/resources, but must return `effectOnCurrentBinding:false` when B is active. It must never finish B's session or billing record. No provider/billing integration is implemented by this design.
6. Idempotency and receipts are backend-owned: `(tenant,game,registration,operationId)` records committed/pending/rejected outcome. An answer whose HTTP request times out may already have committed. Reconcile that receipt with the same capability/operation ID; do not replay as fresh registration or assume an abort undid score.

Suggested future persisted records: scoped registration identity/generation/capability hash; current active binding; immutable retirement marker; registration/operation idempotency receipts and outcome references. Use atomic uniqueness/CAS in an approved storage transaction. Exact modules/schema/migrations need a separate pre-edit ledger and approval; this document grants none.

## TTL, restart and ambiguous provider behavior

- Keep backend terminal registration proof for the approved game/lifecycle retention period. Do not revive a retired registration just because a gateway cache expired. Local tombstones may accelerate rejection but are never the authority.
- Real provider retry horizon/reuse rules are unverified. Do not invent a safe numeric TTL. A reused opaque provider ID is ambiguous unless an authenticated new-call attempt/proof can distinguish it; fail closed until that policy is verified. Retention/compaction must preserve terminal decisions across allowed retries and within the tenant/game namespace.
- Gateway restart must recover its durable registration request/capability journal from an approved private store, or use an authenticated recovery mechanism with equivalent caller proof. If neither is available, refuse automatic rebinding. Knowing phone plus old raw CallId is not recovery proof.
- On reconnect after uncertain hangup/join/answer, query the backend operation receipt; do not guess orphan cleanup from a lastSeen timestamp. A process kill or timeout does not imply backend rollback.
- Backend restart must restore durable lifecycle records before accepting v2 operations. If the game cannot be restored, reject the old game/capability (e.g. terminal game-not-restorable outcome); never fall back to the currently active global room. Persisting active game/score state is a separate existing product boundary and must not be silently expanded here.
- Capability and registration scope includes tenant, game and provider namespace. Cross-tenant/game reuse is denied before roster/private-state access. Missing account/service scope fails closed; no global-storage fallback is allowed for private lifecycle state.

## Acceptance and rollout gates

Before implementation: approve correlation/anonymous policy, ordering semantics, provider proof assumptions, registration/capability recovery, storage symbols, retention and legacy API migration. V1 and v2 behavior must remain distinguishable; enabling a version must not silently change original game data/wire IDs. No customer migration/deployment is authorized now.

Future isolated actual-backend tests must include: registration idempotency/CAS races; delayed older-generation poll/answer/hangup after B; active score/roster preservation; gateway clock well beyond cache TTL; actual gateway restart with and without valid journal proof; backend restart after operation commit before response; committed answer/hangup timeout reconciliation; missing/forged/replayed capability; missing canonical caller and aliases; provider ID reuse ambiguity; tenant/game mismatch; admission failure with no victim rebind; closed/missing game rather than fallback; terminal retention/compaction decisions. Fault injection must observe actual controller/storage state, not replace it with a backend model.

Provider identity, signed callback/ordering support, CallId uniqueness/retry limits and physical DTMF/PSTN remain external unverified gates. Synthetic v2 tests cannot establish them. The 100-client actual scoring harness remains deferred while identity/lifecycle safety conditions are unresolved. No real call, provider change, paid operation, production experiment or release is part of this proposal.
