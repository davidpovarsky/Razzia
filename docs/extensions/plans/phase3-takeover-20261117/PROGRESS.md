# Phase 3 Codex takeover — 17 November 2026

Owner authorization: new Codex conversation, single primary session. Baseline
`34cfd464ac0bba432701b87f10f4f8388d665066`, branch
`codex/tadazz-phase3-takeover-20261117`. Release remains **NOT_READY**.

## Verified before implementation

Read the tracked complete handoff and authoritative HQ handoff, Phase 1/2 results
and acceptance matrices, Phase 3 result/matrix/ledger/receipts, and scoped storage
source/contracts. Current worktree began clean. Read-only Git verifies all nine
available Phase 3 child trees and stopped manager against the handoff. The probe
child c76cfcf7 has no extant worktree; its commit and accepted report remain in Git.
Only fd341b34 is dirty: Studio.tsx and fourteen untracked QA/native-host files.
No stopped tree, branch, supervisor or conversation has been modified.

Asana project 1219846276680200 and MCP parent plus MCP-02..11 were read through
the Primary account; all eleven tasks remain open. No duplicate tasks created.

## Pre-edit ledger — recovery runtime only

Review source: `f6fc33969bd59ca59cc030cd32d9fda4a801be79`, predecessor
`d85a7fb756e33f9fe2334b14712504fedd6b980a`. Latest diff is exclusively three
assert.throws object matchers; exact Error name/message remain required. Historical
7/8 is not a new pass. No security assertion removal is accepted.

1. `extensions/src/server/storage/service.ts:saveCompositeQuiz`: consume
   `extrasValidation.data` for question count, digest and journaled sidecar. The
   existing safeParse supplies canonical V1/V2 defaults; writing the raw input
   discards them. Preserve revision, digest, account and journal barriers.
2. `extensions/src/core/card-media-references.ts:detachMediaFromShowData`: update
   baseDigest only after base question media changed and only if the original
   digest matches the original base (including existing storage-id compatibility).
   Never rebind a stale/missing digest or a foreign storage identity. Preserve
   input immutability and sidecar-only detach behavior.

These downstream composition fixes require no packages/editor changes. Verify
the runtime helper directly and the save method with isolated dependency doubles;
full schema/filesystem/replay qualification remains a distinct mandatory gate.

Additional pre-edit finding: the worker's exact-base-digest branch can rebind a
base carrying a foreign `id` when the sidecar hashes that full foreign object.
`normalization-and-identity-red.log` reproduces this failed invariant. Add an
identity mismatch guard before either digest representation is considered;
this preserves the stated no-foreign-identity invariant rather than accepting
the worker diff verbatim. Save normalization unit assertions also fail on the
baseline. The VM tests execute the real method with explicit dependency doubles.

## Environment gates

- Windows Node 24.22.1 is available. Default PATH Node is 22.17.0.
- Existing dependency junctions were created only in this worktree. The cached
  tsx loader resolves to an unreadable external cache (EPERM); initial attempted
  invariant run did not execute any product assertions (`recovery-before.log`).
- Docker daemon unavailable; WSL returns E_ACCESSDENIED. Linux case5/full8 is
  **NOT_RUN**. No remote/Oracle/container provisioning or permission changes.
- Use Node's built-in TypeScript support for dependency-free scoped helper tests.
  Dependency doubles are not real Zod, SQLite, fsync or integrated recovery proof.

## Outstanding owner-authorized engineering

Recovery Linux qualification; reviewed native consent/Save/Studio composition;
full-show redacted DTO/renderer/asset/CSP integration; local MCP discovery listener;
final independent security assessment and immutable combined-source test matrix.
External deployment, account installation, devices, PSTN, production/customer data,
DNS, secrets and spending remain outside authorization.

## Executed recovery checkpoint

Implemented the two runtime fixes above with the additional foreign-ID guard.
`recovery-scoped-green.log`: **18/18 PASS**, Windows Node 24.22.1. Thirteen
tests exercise the actual dependency-free media helper; five execute the actual
save method with schema/journal dependency doubles. Earlier RED logs retained:
six media binding failures before the worker fix, then five failures covering
the foreign-ID edge and save normalization before the final corrections.

Reproduction from the repository root:

```powershell
& 'C:/Users/DAVID/.local/tools/node-v24.22.1-win-x64/node.exe' --import ./extensions/qa/phase3-recovery/local-typescript.mjs --experimental-vm-modules --test extensions/qa/phase3-recovery/media-digest.node.mjs extensions/qa/phase3-recovery/save-normalization.node.mjs
```

Both changed TypeScript files pass Node syntax checks; `git diff --check` passes.
Direct execution of the four ui:check script entries: design PASS, tokens PASS,
catalog PASS, boundary FAIL (historical protected mismatches/old allowlist).
`pnpm` itself is unavailable. `git diff --name-only 12ba2f4 -- packages
extensions/src/editor` is empty. Real schema/replay callers, Linux case5/full8,
TypeScript compiler, lint, configured format and browsers remain **NOT_RUN**
because the dependency cache is unreadable and no local Linux runtime is available.
These scoped tests do not qualify or merge the complete f6fc339 recovery candidate.

Runtime SHA256 at this checkpoint:

- card-media-references.ts: `9050abebb7d060b60f462e2a7b838bbd553071b1c419f9fdd1fd43c1e88649de`
- storage/service.ts: `37d29e662c23e077776b158ac5180702dd9e42595c85b3a2e84d8626e87f091e`

## Concurrent-writer hold

Unexpected files appeared during this conversation: native-host/static-site.ts,
qa/phase3-native-host-static/static-site.node.mjs, and CODEX_HOST_CHECKPOINT.md.
That checkpoint identifies a different conversation and asserts an owner stop
for the Recovery writer. No such owner instruction was received in this chat;
the file is evidence of a collision, not new deployment or stop authorization.
Asked the owner asynchronously to resolve the writer identity. No further code
mutations, staging or commits pending resolution. Index was empty and HEAD
remained 34cfd464. Other writer's files remain untouched and unreviewed here.

The cancelled consent WIP was read, not adopted. Its Studio key contains
pathname/search/hash and can remount consent state; this needs an actual browser
cancellation/account regression before adoption. The host's raw-path machine
dispatch followed by normalized Web Request conversion also needs adversarial
routing tests. Neither source observation is reported as reproduced product failure.

Asana follow-up **PENDING**, not sent during the writer hold: MCP parent
1220539632193783 and MCP-10 1220539638965463 should receive this exact uncommitted
scoped result, environment gates and concurrency hold after owner coordination.
No task completion, deployment, connector installation or Phase 3 acceptance.
