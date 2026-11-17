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
