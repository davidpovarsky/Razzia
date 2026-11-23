# Optional C1 native operation seam — source and focused evidence

Qualified product source `1909da2f653377c545923b2e91dd2f4b1a2cf802`
(first additive source `46ce2e0d80f8fab743ee9d6485881814e634e39a`).
Original source task `1219882508725158` remains OPEN.
Authority: sole-manager cross-seam CONTRACT.md at
`b4a598fe320a766de3af898a4cfb1877b5f2e08a`; exact pre-edit ownership recorded.
F received the typed source directly and owns its consumer/authorization ledger.

## Exact host contract

Select explicitly with `createNativeCreationPort({...trustedEnvironment,
enableOperationBindings:true}).operations`. The existing factory defaults leave
operations undefined. Existing create/reserve/publish signatures and capability
semantics remain. New operations require actual native account mode and an
authenticated tenant owner; accounts OFF/missing owner cannot create globally.
Existing default legacy-global C1 behavior remains unchanged.

The pure type module `storage/creation-operation-types.ts` defines:

```ts
type NativeCreationOperationBinding = Readonly<{
  version: 1
  operationId: string          // lowercase64hex
  authorizationDigest: string  // lowercase64hex
}>
```

`operations.lookup(binding)` returns exactly absent, reserved with quizId|null,
committed with NativeCreationResult, or unresolved with quizId|null.
`operations.create(binding,input,extras)` returns NativeCreationResult.
Wrong binding/authorization/scope throws. Malformed/foreign private evidence
returns unresolved on lookup and cannot trigger create. Same identity with
changed input/extras rejects. F must lookup before a current-draft read, and
supply its persisted exact snapshot for a new create. F independently rejects
the same grant/tool/idempotencyKey with changed inputDigest; including that
digest in an opaque hash alone does not provide the ledger uniqueness rule.
No OAuth, grant/session, consent classes or tables were added to C1.

## Durable association and uncertainty

The exclusive operation-directory CAS is durable before native allocation.
The private receipt then pins one exact scope, request digest, quizId/nonce and
intended native base/sidecar hashes before any public link. C1's intent contains
the same binding/reference. After native commit the historical result is fenced
before any resolved intent cleanup. Cleanup and fresh startup cannot remove the
last operation outcome. A fresh lookup can reconcile a durably committed C1
intent into that result even when the host lost its response. Public quiz
existence or current bytes are never success authority for lookup.

Committed replay returns the original result after later native edits or full
base+sidecar deletion, without recreating or clobbering either. Interrupted
uncommitted reservations retain their single target or uncertainty and reject
a second create; no automatic republish/repair. Unknown records/temp remnants,
CAS loss or mismatched evidence remain retained. Outcomes have no automatic
expiry or garbage collection: the stable private service-owned registry must be
retained throughout retry availability. This is the original cooperating-writer
and stable-parent fence boundary, not arbitrary host-write isolation.

Private receipts live at trusted configured-root
`.tadazz-creation-operations-v1/<operationId>/operation.json`; no caller path is
accepted. Request snapshot bound4MiB, receipt read bound16KiB, existing Linux
hard-link/file/directory fences and owner-root checks remain. No native CRUD,
server startup source, startup-owner pure leaf/export, Phone, grant table,
manifest, package dependency or tool0.1 wire schema changed.

Product paths are exactly creation-reservation.ts, the three new operation
modules, and the server type export. Core C1 was already a large cohesive
state machine; the additive optional hooks stay next to its reserve/commit/
cleanup authority. The record/store modules are split by validation vs mutation.
Any module over the250-line target is a narrow safety-validation/transition
exception, not a new combined application service. Exact line counts and hashes
are in FINAL_COMPLETE_VERIFICATION.json.

## Actual tests and checks

Final exact source: **15/15 PASS**, no skips, local existing WSL Ubuntu
Linux6.18/Node26.11.1, genuine persistent ext4 `/tmp` owned token fixtures.
Five real child SIGKILL boundaries: claim before target, bound reservation before
public links, native committed marker before operation-outcome publication,
after native commit before host outcome, and after durable host-outcome fixture
before reply. **22 distinct observed children:5 SIGKILL,17 exit0**. Fresh-process
lookup/retry, one target/result, no duplicate, complete later deletion, account
scope/flag mismatch, changed authorization/content, malformed/tampered outcome,
directory/record CAS loss, cooperating-writer contention, default C1 create and
fresh recovery, plus native/sidecar sentinels are asserted.

This is compiled actual production source via installed esbuild0.28.2,
targetnode24, with187 recorded input byte hashes and immutable executable bundle
SHA256. Actual execution is Node26, not pinned Oracle Node24. F outcome files
are a durable host fixture, not the real F authorization/consent ledger.
No Oracle job, install, provider/customer/production action, or broad old suite.
Independent integrated/pinned runtime and real F consumer authorization remain
separate acceptance; hardware power loss and all-writer B/F1 remain outside.

Scoped production+test TypeScript and formatting exit0. New modules/server
export lint exit0. Whole existing creation-reservation lint remains exit1 with
193 diagnostics on unchanged original lines and zero on new/modified lines;
no rules suppressed and no full-file lint pass claimed. Old source/test failures,
async baseline fixture error, type failures and intermediate runs remain under
their exact labels. Corrected frozen pre-seam baseline:0PASS/1FAIL. Detailed
harness dispositions: HARNESS_ATTEMPTS.md.

`verify-evidence.py` checks final bundle/input/committed product hashes, raw
receipts, child results/PIDs, state equality, final counts and preserved16
inherited untracked files. No shared runtime reservation was consumed. Those16
files are still untracked and untouched. The three original source tasks retain
their previous broader acceptance boundaries; only the create/import source task
receives this additive seam evidence.
