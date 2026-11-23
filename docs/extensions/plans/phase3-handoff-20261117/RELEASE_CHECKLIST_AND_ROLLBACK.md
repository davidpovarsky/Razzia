# Phase 3 release checklist and rollback — rolling checkpoint

**OWNER STOP17November2026: this is a preserved checklist, not permission to
continue. Authoritative final state: PHASE_3_HANDOFF_20261117.md.**
Latest accepted runtime mergebe93cd83; D f6fc339 CLEAN/UNMERGED and native-consent
DIRTY/CANCELLED WIP preserved. No production backup hash/restore rehearsal
verified. Live tadazz.com/mcp and /.well-known OAuth are owner-reported HTML SPA,
not ready MCP/discovery. No verified real ChatGPT installation. All automatic
resumption disabled; another owner-assigned agent must take over. NOT READY.

**NOT READY. Nothing in this document authorizes deployment or restoration.**
Source checkpoint5dc99be, accepted source merge30fab7f, baseline12ba2f4.

## Passed scoped gates

- [x] Preserve original source checkout and independent user/agent worktrees.
- [x] Independently review accepted Widget and protected-service diffs.
- [x] Verify service source hashes before/after Linux tmpfs/ext4 fixtures.
- [x] Record real PASS/FAIL/NOT_RUN separately from child done claims.
- [x] Record scoped Asana milestones and verify readback; leave parent OPEN.
- [x] No new packages/editor protected-source changes against12ba2f4.

## Required before release readiness

- [ ] Resolve or explicitly owner-accept broad compiler/freeze gates.
- [ ] Accept phone full-chain fixture after real authority/gateway/game checks.
- [ ] Human browser consent -> native Save -> same-account Studio reopen.
- [ ] Native full-show Widget and media/CSP integration acceptance.
- [ ] Isolated recovery restart/crash/backup/restore/rollback qualification.
- [ ] Fresh independent high-risk review on a stable combined source.
- [ ] One final immutable source/lock/runtime matrix with both browser engines.
- [ ] Genuine external host and PSTN/device gates resolved where required.
- [ ] Fresh read-only production preflight, exact current backup identity/hash,
      release-specific restoration commands and owner approval.
- [ ] Explicit owner approval for any production release or provider spend.

## Preserved rollback anchors

Approved source checkout remains at
`12ba2f4f4a0185762cf43944aacafe2b5bc31dab`; manager's pre-service checkpoint
`fba4b5000a76f766839a5f62c985c6a18b8e4310` and accepted Widget merge
`ee846f2ed1ebbdcec07501d429bf31b323e83d52` remain in Git.
Current accepted service source is retained atdd6fd439 and merge30fab7f.
These are source recovery anchors, **not** production data backups.

No production data migration occurred, so no production rollback is currently
necessary or authorized. Do not reset, clean, delete a branch, overwrite a
worktree, stop the metadata keeper or restore a customer DB as a rehearsal.
For a future approved release, validate source rollback in a separate isolated
checkout and data rollback on disposable synthetic copies first. Exact live
backup SHA and deploy/restore commands are intentionally **NOT VERIFIED** at
this checkpoint; never substitute historical12November production details.

All tests so far use the existing network-none/no-published-ports QA container
and synthetic task-owned directories. Its `/evidence` ext4 fixture is not a
customer backup; tmpfs tests do not prove storage power-loss durability.
