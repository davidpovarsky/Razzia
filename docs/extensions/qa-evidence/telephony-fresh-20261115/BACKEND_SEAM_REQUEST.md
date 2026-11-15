# Conditional backend seam request — P3_NEXT

No backend edit is authorized or applied. Actual negative API execution is pending the manager-controlled remote window. Source below was inspected at producer `30280fa18398b8608d5800eb160726f027042eef` (backend identical to `8a43c99`). These are proposed minimal boundaries, contingent on real reproductions and explicit manager approval of exact implementation hunks.

1. `packages/socket/src/api/extensions/game-routes.ts`, `/pilot-phone`, lines 266–277, `expectedSecret` conditional. Desired contract: absent configuration denies private pilot actions without roster mutation. Small candidate replacement, not applied:

```ts
const expectedSecret = process.env.TADA_PILOT_SECRET
const providedSecret = c.req.header("x-tada-pilot-secret") ?? ""
if (!expectedSecret || providedSecret !== expectedSecret) {
  return c.json(
    { error: "errors:auth.unauthorized" },
    StatusCodes.UNAUTHORIZED,
  )
}
```

Before approval, decide whether to require minimum key length and timing-safe comparison as part of this exact seam. Regressions: API01/02, valid configured call, feature-off original game unaffected. No upstream edit should be needed outside this route for fail-closed absence alone.

2. Same file, `join_or_poll`, lines 295–343: connected cached `rosterPlayerId` must not return joined/phone/state to an unbound call. Disconnected-roster rebind must require a matching normalized phone or stronger server-issued caller capability; arbitrary supplied roster ID cannot select a victim. Suggested exact owner surface: this action block and a shared private pilot binding-validation helper in this file. Tests API03/06/07. The current branch also does not check `joinRes.ok` after disconnected-entry rebind; retain denial if invite/billing/lock admission fails. Import the existing public `normalizePhoneE164` if a phone match is approved; do not invent a second normalization policy.

3. Same file, `answer` and `hangup` blocks, lines 346–438: validate the agreed caller identity/binding consistently before selecting a supplied roster. API08's threat model includes a valid shared gateway key plus copied call/roster IDs with a different claimed phone. A phone equality check alone is not cryptographic provider authentication. Preserve actual controller's stale-call and epoch checks; report actual disconnect result rather than implying an ignored stale hangup disconnected the current caller. Tests API04/05/08 plus positive valid redial. Exact hunks require the owner-approved caller-proof contract; no blanket controller/route write lease is requested.

4. TTL/restart/out-of-order replay, API09/10/11: **no honest tiny route hunk can establish this guarantee with current wire semantics**. `callId` plus phone is not a trusted call-generation ordering signal. After gateway restart the same new/retired ID callback is indistinguishable unless the backend retains registration/retirement state or receives a trustworthy per-call capability/generation. First approve a versioned lifecycle contract: registration identity and scope; first-seen vs retired call handling; who may rebind; durable retention and provider retry horizon; gateway restart reconciliation; normalized identity aliases; cleanup retry ownership; idempotent answer/disconnect. An abort can occur after backend commit and must be reconciled, not treated as rollback. Then enumerate exact route/controller/storage symbols and tests before any edit. Provider CallId uniqueness/retry guarantees remain unverified.

Downstream composition was tried first: gateway-only ordering, local closed gates, confirmed roster retirement and cleanup retry in `30280fa`; thirty-four producer tests passed. That runtime cannot make direct API callers honor its local memory or retain proof across a real restart. The new harness checks actual authoritative state so future approval is based on evidence, not the old backend model. No security/release completion is requested now.
