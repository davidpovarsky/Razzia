# Phase 3 - capacity-safe acceptance checkpoint

> **OWNER STOP / FINAL HANDOFF — 17 November 2026.**
> No development, tests, dispatch, retries, reviews, remote jobs, merges or
> deployments may continue under this manager. All chronological continuation
> instructions below are superseded. Read
> `phase3-handoff-20261117/PHASE_3_HANDOFF_20261117.md`.
> D latest f6fc339 is CLEAN/UNMERGED, latest Linux check NOT_RUN; native-consent
> is CANCELLED/DIRTY and preserved. Per-task auto-resume disabled for this
> manager and ten children. Phase3 NOT_READY/NOT_DONE; different agent required.

## Capacity and existing work

The owner's 17 November instruction distinguishes Sol organization TPM429
throttling from subscription exhaustion. Preserve the same manager/session,
respect retry-after, use bounded retries, and do not recreate tasks or switch
model/account/provider. Keep manager inputs small.

Antigravity task `e17507c7` separately reached an individual quota limit.
Its latest retained refusal at `2026-11-16T23:41:57.557Z` reports a reset in
25m49s: do not issue new Hydrogen work before approximately `00:07:47Z`.
Repeated delivered reports are one receipt, not new tasks or acceptance.
The task lifecycle remains **FAILED**, despite its later source report saying
done. Its final committed source is preserved and independently testable.

Six child tasks have been issued. No replacement manager or extra child was
created during this checkpoint. New agents requested by the owner will address
remaining independently testable work only after the capacity gate.

## Source receipts and independent Linux verification

| Candidate                                           | Source status                                                  | Manager result                                                                       | Acceptance                             |
| --------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| A repair `02d752c04a5d9bef1d670d3f613ea9e921f0506a` | Seven owned files, clean child tree; no protected source edits | Actual service suite **11/12** on tmpfs and **11/12** on ext4; focused QA types PASS | **NOT MERGED / changes required**      |
| C phone `4a1d92b03d734d96717c26873686c68d6c76735c`  | Six owned files; one narrowly scoped runtime change            | Live-game Vitest **4/4**; POSIX full-chain fixture **0/2**                           | **NOT MERGED / acceptance incomplete** |

Manager uploaded exact Git archives to the existing isolated QA scratch,
verified every changed file SHA256 before and after execution, and ran tests
sequentially under nice19 / one CPU / 1024MiB heap / 120s per command.
No new containers, dependency installs, ports, or production/customer changes.
Raw retained receipts are in this task's Assets:

- `server-phone-4a1d92b-verification.json`
- `server-service-02d752c-verification.json`

### A — reproduced boundary requiring diagnosis, not blind assertion edits

Both actual Linux runs fail the same assertion in
`extensions/qa/phase3-mcp-service/http-listener.nodecheck.ts:923`:
`slowReaderResult.drainedWhilePaused` is true, expected false.
The fixture pauses client reads while serving approximately1.5MiB; OS buffering
may allow server `finish` before the client resumes. Determine whether this is
an invalid platform-dependent fixture premise or a real send/admission defect.
Do not simply invert the assertion or weaken the drain/deadline invariant.

Real C1 Linux Save/reopen/replay/cross-account cases pass in both filesystems.
The ext4 run explicitly logs magic `0xef53`, `isExt4:true`, with
`TMPDIR=/evidence/phase3-999ed90c-fixtures`. This is not hardware power-loss proof.
The broad MCP TypeScript command fails with SQLite typing diagnostics outside
the newly changed service/index files; QA-scoped types pass. Establish the
correct installed compiler/type graph or compare baseline diagnostics before
classifying these as inherited. No root TypeScript PASS is claimed.

### C — reproduced full-chain fixture failure

Both actual Linux cases fail at
`phone-v2-live-fixture.node.ts:191`, during `initializeAuthority`, with
`owner_authority_denied`. No gateway-v2 full-chain acceptance is claimed.
The fixture statically imports `UnmountedPhoneAuthority` before setting its
synthetic `JWT_SECRET`; that module imports native authority/env code which
captures verification settings at module load. This is a source-pinned
**hypothesis**, not yet an independently confirmed root cause. Test a minimal
fixture import-order correction before considering any runtime auth change.
Never weaken `NativeAccountAuthority` or fabricate an authenticated lease.

The first manager phone-type command had a nonexistent compiler path; its
failure is a runner setup error. Use the already proven
`node node_modules/typescript/lib/tsc.js` under the source root for retry.
Do not reinstall dependencies or overwrite the original failed receipt.

### Follow-up deterministic checks

Manager ran the corrected phone compiler command: **PASS**. Actual source-pinned
MCP server regressions **64/64 PASS**, first-party regressions **68/68 PASS**
(the explicitly Linux-path-bound native-save-client suite excluded), and
site metadata/locales/inline locales **42/42 PASS** in three existing files.
These are separate overlapping suites, not a sum of unique product acceptance.
Receipt: `server-phase3-followup-regressions.json`. They do not erase the A
slow-reader failure, C full-chain failures, or broad-MCP typing diagnostic gate.
At `2026-11-17T00:12:21Z`, the retained provider reset time has passed. Owner-
requested fresh bounded agents may now be dispatched on the same approved
Hydrogen account/model, stopping again if quota is refused. No quota-probe
request, account switch, replacement manager, or automatic paid fallback.

## Next independent packets

1. Fresh A repair/review: establish exact `02d752c` source in its isolated child;
   own first-party/service and Phase3 service QA only. Diagnose slow-reader
   lifecycle with a deterministic backpressure barrier, verify the full prior
   security finding matrix, and return a compact committed receipt.
2. Fresh C fixture repair: establish exact `4a1d92b` source; initially own only
   `extensions/qa/phase3-phone/**`. Prove import-order root cause and run real
   authority/gateway/game tests without bypassing auth. Manager executes remote
   tests; no worker provisioning or external calls.
3. D recovery qualification remains independent of A/C; follow existing scalar,
   C1, Sidecar, restart and backup/rollback sources rather than rebuilding them.
4. Native consent/browser Studio reopen and full-show Widget wiring remain
   internal implementation gaps. Final independent security review follows a
   stable integrated candidate. All remain within the original Phase3 scope.

No candidate above is release-ready. Feature gates stay off; original Asana
tasks and release parent remain open.

## Recovered A source accepted independently — 17 November 04:32 UTC

Child `482771e7` lifecycle is **FAILED**, confirmed by the project-scoped live
Cockpit API. Its report is not lifecycle success. Exact committed source
`dd6fd4392d44932fd63a80837abadece416e5ade` was independently reviewed and
accepted into manager branch only, merge
`30fab7f63a5208e9c2b95e023aa399ece623bb21`.

- Exactly seven allowed files; clean child tree; no protected package/editor
  changes. No source rerun, duplicate task, account switch or paid fallback.
- Manager exact seven-file hashes verified before/after Linux execution:
  service **14/14 PASS on tmpfs**, **14/14 PASS on ext4**, SDK/server
  **64/64 PASS**, first-party **68/68 PASS**, QA TypeScript **PASS**.
  These are separate overlapping suites, not a unique acceptance total.
- New deterministic `Duplex` barriers exercise the actual listener and real
  `ServerResponse`, without pretending paused peer reads must exhaust kernel
  buffers. TCP protocol tests remain real loopback tests. Response deadline,
  cancellation, 32-slot response lifetime and non-last retirement cases pass.
- Real C1 consent/save/reopen/replay/cross-account passes on synthetic ext4
  state, **not** actual human browser/Studio or hardware power-loss proof.
  Historical `native-save-client.nodecheck.ts` remains **NOT_RUN** in this
  environment because it hardcodes the Phase1 ext4 parent path.
- Scoped oxlint **PASS**. Repository-configured local Prettier on all seven
  files **PASS**. Remote Prettier without full formatting setup **FAIL** is
  retained, not silently relabeled as a product-formatting failure.
- Broad MCP TypeScript still **FAIL** with 147 diagnostics. Corrected read-only
  compilerHost baseline overlay independently produces **the identical 147
  diagnostics**, zero new. Neither choosing the MCP compiler alone nor a
  `--typeRoots` override repaired the existing dependency graph. Initial invalid
  comparison without `configFilePath` is retained as a runner error; only the
  corrected comparison is acceptance evidence.
- Postmerge `pnpm --dir extensions run ui:check`: initial **exit1** was Node22
  TypeScript-import setup failure, not freeze execution. Process-only
  `NODE_OPTIONS=--experimental-strip-types` retry executes the guards:
  **exit1**, 23 historical protected-hash mismatches and old-allowlist denied
  paths (including this new scoped service/QA). Protected delta against
  `12ba2f4` is empty; neither guard attempt is claimed green.
- Recovery supervisor ACK written `accepted` at its requested external path.
  ACK acceptance applies to source, not the FAILED child lifecycle or release.
- Asana MCP02 comment `1220598003080149` and MCP10 comment `1220598197357728`
  both **readback verified**. Both tasks and the parent remain OPEN.

Evidence is retained in task999ed90c Assets:
`server-service-dd6fd43-verification.json`,
`server-service-dd6fd43-types-baseline-comparison-corrected.json`,
`server-service-dd6fd43-quality.json`, `merged-a-ui-receipt.json`,
`merged-a-ui-strip-types-receipt.json`.
The remote source scratch contains layered candidate files, so this is
source-pinned **scoped A acceptance**, not a claim of full integrated-SHA QA.

Existing phone repair `8de82781` remains queued; live API wait reason is
`usage-reset` until `2026-11-17T04:37:28.122Z`. Respect that hold; do not duplicate
or restart it. Eight children issued, four remaining. No renewed quota probe.
The shared multi-project Cockpit boot project is Maktabah; all task operations
and reads use explicit Tadazz project ID and the same existing manager/worktree.
No second Cockpit or project migration was started.

Next independent work after provider availability: accept repaired phone;
qualify disposable recovery; complete downstream browser consent/Studio reopen
and Widget full-show seams without protected edits; final independent security
review and single-source acceptance. Site checks stay affected-first. All
external hosts/PSTN/deployments remain separately gated. Release **NOT READY**.

## 09:40 UTC capacity and queue recovery

Repeated e17507c7 deliveries were deduplicated without rerunning settled tests,
remerging source or creating workers. Its new postturn note alleges a
tools=0 closeout quota loop; manager's live API independently confirms original
task plus continue1..17 all FAILED with the same quota error. No clean lifecycle
is inferred. No Cezar/tooling/configuration repair or account fallback attempted.

The same project-scoped read now shows existing phone8de82781 **RUNNING**,
first iteration, no queue hold. This is actual task state, not a model-list
quota claim. The separate D qualification packet was therefore dispatched as
child9of12: `1e96bb6f-0451-4568-aeab-c14c0fb708cd`, Antigravity Hydrogen XHigh,
retry-limit0. Exclusive new QA scope `extensions/qa/phase3-recovery/**`;
storage/product/protected sources read-only. It must reuse existing C1,
journal/Sidecar/process witnesses and add only the missing coherent synthetic
restart/backup/restore/rollback qualification. Manager owns all remote tests.
Quota refusal checkpoints/stops; no automatic closeout retry requests.

Three slots remain for downstream consent/Studio, Widget full-show and final
independent security review. Site verification remains deterministic manager
work. Both original service repair lifecycles remain FAILED; source acceptance
and recovery ACK decisions are unchanged.

All five required HQ Phase3 files now exist as clearly marked **rolling**
checkpoints, not completed delivery. Parent Asana checkpoint1220598431410135
was readback verified. Original parent/tasks stay OPEN; release NOT READY.

## 10:16 UTC phone accepted, native-consent work assigned

Phone worker8de82781 delivered clean
`62a9cbea2846711a8392d695be02f9f82f635536`, lifecycle DONE. Manager reviewed
the QA import-order/marker/status fixes and inherited narrow pre-engine rejection
classification. All seven changed-file hashes match before/after actual Linux
execution in the existing isolated container:

- Portable startup/live-game Vitest **7/7 PASS**.
- POSIX real authority + gateway-v2 custody + native game full-chain **2/2 PASS**.
  Static-import RED witness, verified/unverified authority, real Socket.IO20s
  status, replacement and old-callback boundaries remain asserted.
- Phone TypeScript **PASS**. Exact committed formatting configuration supplied
  to QA scratch; all seven files Prettier **PASS**.
- Full-file oxlint **FAIL38**, all diagnostics on unchanged game-facade lines;
  independently intersecting diagnostic positions with added-line ranges
  gives **zero changed-line diagnostics**; no diagnostics in new QA.
  Unsupported lint-stdin baseline attempt is retained as setup FAIL, not a
  successful baseline execution. Missing local dependency links were not fixed
  or installed; no broad runtime-style rewrite.

Accepted via manager-only merge
`be93cd8310818387733c88658e46f06d66cb6ad7`. Postmerge UI guard **FAIL**
old boundary/allowlist, protected packages/editor delta empty. Recovery ACK
updated accepted for the **delivered62a9cbea**. Initial c55ffe9 silence alert
was checked against a live exact-run process, not killed or restarted.
Asana identity comment1220603683086966 and phone parent1220603588097769
both readback verified, tasks OPEN. Real PSTN/provider load remain external
gates; no new500-call/50-session acceptance is claimed.

Raw Assets: `server-phone-62a9cbe-verification.json`,
`server-phone-62a9cbe-quality.json`,
`server-phone-62a9cbe-lint-changed-lines.json`, `merged-c-ui-receipt.json`.

Child10of12 dispatched: `fd341b34-dbd2-436d-a3fd-afe9e140fba3`,
Hydrogen XHigh/retry0. Narrow downstream native-host/consent composition and
exact Studio lazy route plus its new QA; all upstream/editor/storage/phone/
widget/contract/global sources protected. It must reuse existing native app,
account/JWT, C1 service and consent pages, limit HTML/HEAD headers to consent
routes and prove real human approval/model retry/Studio reopen without mocking
authority. No source rewrites or protected seam without separate approval.
D remains independently assigned QA-only. Two slots remain for Widget full-show
and final independent security. Manager alone performs remote QA. NOT READY.

## 11:01 UTC D failed acceptance; bounded same-worker rework

D delivered clean `f2e20424a954c44b44fce67aba714f6a01befb0b`, four QA-only
files, lifecycle DONE. Manager actual ext4 qualification **1/5 PASS,4 FAIL**;
QA types/oxlint/configured format **PASS**. Candidate **NOT ACCEPTED/NOT MERGED**.
Test1 passes all six genuine C1 SIGKILL/replay checkpoints and tenantB sentinel.
Remaining failures: committed-operation retry child exits2 at930; native
sidecar logical-intent mismatch during startup recovery at1089; restored quiz
404 at1386; expected linked-tenant exception absent at1622. Differentiate QA
root/env/checkpoint errors from actual runtime faults before proposing changes.
Storage/packages/runtime remain read-only; original assertions cannot be skipped.

Two malformed hashes in worker receipt were detected before remote execution;
manager recomputed Git and actual child bytes, then verified21 source/runtime
hashes before/after. Original receipt retained, not silently trusted/corrected.
Raw Assets `server-recovery-f2e2042-verification.json` and
`recovery-f2e2042-child-hash-errors.json`. Supervisor ACK D now needs_rework.
One bounded SAME-worker rework via supported Continue; no additional child/slot.
Asana Sidecar comment1220604758652630 readback verified, task OPEN.

Native-consent initial start failed empty conversation ID, zero source delta at
actual fork a7c7c8f. Verified no exact-run AGY process; ONE supported idempotent
same-run start recovery was accepted (receipt
`native-consent-start-recovery.json`). No implementation/test acceptance yet.
Supervisor ACK remains blocked; do not repeat startup retry on another failure.
Original D silence warning was checked against a live AGY process and preserved.

Ten children issued; two slots remain, no replacement worker/model/account.
Widget full-show is not compatible with frozen single-frame DTO/producer/
renderer as documented in the accepted probe; do not dispatch a pretend
widget-only completion or change redaction/rights/CSP without an explicit
manager-owned contract revision. Native host and final security sequencing
must preserve that boundary. No production/customer/provider actions.

## 11:16 UTC exact downstream recovery correction authorization

Rework `2ede51d6dc311c32d0bcdee66e57730c144682e7` is still NOT ACCEPTED:
manager actual Linux ext4 **3/5 PASS,2 FAIL**, QA types/lint/format PASS.
Test2's remaining failure expects an Error constructor to throw by itself
(line998), not an actual operation boundary; preserve the real tampered-lookup
`unresolved` assertion and strengthen no-mutation checks instead. Test5 now
correctly rejects earlier at native owner metadata snapshot, but its regex only
recognizes the later recovery-root rejection; assert the exact earlier deny and
unchanged linked target, not an arbitrary exception. Raw
`server-recovery-2ede51d-verification.json`; worker receipt hashes now computed.

**Do not accept removed post-detach digest assertion as a repair.** Manager
independently executed the actual `detachMediaFromShowData` and canonical digest
functions without filesystem/customer mutation. After question media removal,
the stored base digest stays old while the recomputed changed-base digest
differs; assertion fails. Receipt `server-media-detach-digest-red-stdin.json`.
Initial tsx `--eval` emitted no witness and is NOT proof; retained separately.
This confirms a real downstream invariant defect, not merely a QA premise.

The existing service failure is also source-pinned: `saveCompositeQuiz`
validates a Zod-normalized V2 value but stages raw extras; next read adds defaults
and fails the complete-intent recovery comparison. Original ext4 crash failure
and worker's isolated reproduction are retained. Normalizing only the new QA
input avoids the bug but does not qualify this internal service boundary.

### Manager-owned pre-edit ledger — this task's authorized D correction

| Exact file / symbol                                                                                                  | Minimal authorized change                                                                                                                                                                  | Required proof                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extensions/src/server/storage/service.ts` / `CompositeStorageService.saveCompositeQuiz` updated-extras construction | Persist the already successfully validated canonical `extrasValidation.data`, consistent with create path; preserve revision/CAS/digest/account/journal APIs                               | Failing valid-raw-V2/defaulted-scene regression before fix; persisted canonical sidecar, original crash/replay witness, invalid payload/CAS rejection unchanged        |
| `extensions/src/core/card-media-references.ts` / `detachMediaFromShowData`                                           | Preserve correct base/sidecar binding when actual native question media is removed; do not manufacture a digest on partial legacy extras or launder an already mismatched original binding | Manager actual-helper RED above; V1/V2 digest-after-detach GREEN, unrelated/sidecar-only refs unchanged, original input immutable, stale-original binding fails closed |
| `extensions/qa/phase3-recovery/**`                                                                                   | Exact regressions, remaining invalid QA assertions/root guards, restore post-detach `digestMatches === true`, programmatic receipts                                                        | Full new ext4 suite and focused media/storage regressions, raw RED/GREEN, real source hashes                                                                           |

This is an explicit narrow downstream scope revision within the owner's Phase3
Recovery/Media mandate, not permission for `packages/**`, original editor,
schemas/contracts, runtime rewrites, new storage engines, deployments or customer
data access. No other runtime files may change. Native-host worker owns disjoint
paths; API/DTO/IDs stay frozen. Existing same D worker only; no new child slot.
If the two exact changes cannot satisfy the demonstrated invariants, stop and
report the exact blocker rather than widening scope or weakening tests.
