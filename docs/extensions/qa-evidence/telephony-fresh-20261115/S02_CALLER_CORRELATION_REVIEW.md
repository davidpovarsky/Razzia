# S02 proposed caller correlation — NOT APPLIED

Historical proposal update: manager later approved this bounded patch in PHONE_S02_CALLER_CORRELATION_20261115.md. Implementation and actual validation are recorded in [S02_RESULTS.md](S02_RESULTS.md). The original proposal and its approval boundary are retained below.

Base: S01 implementation `0ba26fd025ca0e0cd9d7997b7d900cf9c8001e48`. The manager approved ONLY S01's two hunks. `S02_CALLER_CORRELATION_PROPOSED.patch` is a separate exact review artifact; SHA256 `81fdec956eaa229a3d01da901dd27e513cb73f2b7b4adcd93050603da5c96c1b`. `git apply --check` passes against S01; the protected route was not changed by preparing this proposal.

Measured causes: API07 supplied a disconnected victim roster ID with a different phone and was rebound as the victim; API08 supplied copied active call/roster IDs with a different phone and set the victim's authoritative answered flag. Both tests possessed the shared gateway key. These results prove missing caller correlation, not ability to forge a cryptographically authenticated provider identity.

Proposed exact route-only hunks in `packages/socket/src/api/extensions/game-routes.ts`:

1. Add existing public `normalizePhoneE164` to the current core import.
2. After trusted-secret and game resolution, if a roster ID is supplied, require an existing entry, a present/valid normalized body.phone, and equality with that entry's canonical phone. Missing, invalid, unknown and mismatched identities all return the same 403 `{ok:false,reason:"caller_binding_mismatch"}`, without phone, display name, roster, state or admission data. This shared guard covers supplied-roster poll, answer and hangup consistently before mutation. The original active-call and epoch checks remain in place after correlation.
3. In the disconnected cached-roster join branch, propagate `!joinRes.ok || !joinRes.rosterPlayerId` as generic 403 `caller_admission_denied`; never return joined/private state after failed admission. The existing fresh-registration path's admission checks are untouched.

No controller, storage, schema, key, provider or global config change is proposed in this patch. A fresh call without a supplied roster remains on the existing registration path. Correlating phone strings is not caller authentication: a service-key holder can still claim another phone or submit registration without a per-call proof. Those privileges require the separate v2 lifecycle/identity contract; S02 cannot close the full security task.

Review decisions needed before approval:

- Supplied-roster calls without a usable phone must fail closed. Legacy anonymous cached polling/rebind would therefore require an agreed alternative per-call capability, rather than deriving phone from the selected victim roster. New anonymous registration is not changed here; its answer/resume policy needs explicit disposition.
- The same guard intentionally covers hangup as well as API07/08. This prevents copied call/roster IDs with a mismatched phone from disconnecting a victim. If only poll/answer hunks are authorized, split the exact review patch rather than silently broadening a lease.
- Gateway currently terminates only some explicit 403 reasons. A future approved companion should treat caller-binding/admission denial as terminal without revealing private details; the proposed HTTP route already denies joining/answering. No companion runtime edit is applied here.

Required actual-route verification after approval: all thirteen original assertions and S01-C1/C2; missing/invalid phone, unknown supplied roster, mismatch on connected/disconnected poll/answer/hangup; correct-phone valid current poll and disconnected score-preserving rebind; no private fields or victim mutation on denial; stale-call/epoch guards unchanged. Admission-denial propagation needs an independently controlled real synthetic admission rejection (e.g. approved isolated billing/quota fixture), not a helper-only green test or provider operation. No billing fixture/config change is authorized by this proposal itself.

API09/10/11 remain outside this patch. All source Asana tasks stay OPEN. Approval of S01 is not approval of S02.
