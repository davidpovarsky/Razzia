# Phase 3 — capacity-safe acceptance checkpoint

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

| Candidate | Source status | Manager result | Acceptance |
|---|---|---|---|
| A repair `02d752c04a5d9bef1d670d3f613ea9e921f0506a` | Seven owned files, clean child tree; no protected source edits | Actual service suite **11/12** on tmpfs and **11/12** on ext4; focused QA types PASS | **NOT MERGED / changes required** |
| C phone `4a1d92b03d734d96717c26873686c68d6c76735c` | Six owned files; one narrowly scoped runtime change | Live-game Vitest **4/4**; POSIX full-chain fixture **0/2** | **NOT MERGED / acceptance incomplete** |

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
