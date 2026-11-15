# Production entry v1 — source-only candidate

**Not approved, installed, executed or deployed.** Independent review and a
separately granted server test of this exact revision remain required. The
prior `80de09` QA helper and its version history remain byte-for-byte frozen.
The existing production operator and disabled legacy/manual wrapper remain
untouched. This candidate must not be copied into production merely because its
entry can admit a correctly approved fixed target.

## Exact source delta

- Predecessor: `80de09e02b483377cfdf984fab9ca2c144ae224ace8f7e6756aef8e7a0d2a20b`.
- Candidate: `352734823777d3397ebea2515323f6565c22a22437e8cde6392526534b7003a2`.
- Candidate admission-test source:
  `4979931b6016241b99f350b043c197bb3707f92af46d1f617d118300c2c6754a`.
- Byte comparison: removing exactly predecessor lines 40, 545–546 and
  1130–1131 yields the candidate byte-for-byte. Those are the old false
  `REVIEW_GATE` declaration and its two deny branches; all remaining bytes,
  including line endings and the complete Engine, hold, target, input,
  embedded child and filesystem implementation, are unchanged. Embedded
  `INNER` UTF-8 SHA-256 is
  `2e214044101543b6ab05656d4c0a94f0733c3d060c7d3a2cba6ab9cd663646f5`.

The unchanged `run()` constructs the fixed production identity, image, start,
operator, control, lock, owner and mount tuple without any environment or CLI
override. Under the existing helper-owned flock, the unchanged coordinator
requires the manager-provisioned approved-helper pin to equal the executing
source and requires the non-expiring manager lease to match target, image,
start, helper and requested action. Missing or incorrect inputs deny dispatch.
The manager must issue a fresh lease nonce and bind the full intended action
set—including rollback and reconcile—up front. The exact lease bytes are
retained through the rollback window; changing them between actions conflicts
with the durable hold. The existing target nonce remains `production`.

## Test and review gate

`test_production_admission.py` uses a synthetic hold and mocked Engine/target
checks to exercise missing approval, wrong helper, missing lease, wrong target,
stale start, wrong action, wrong lease helper, and a matching approval/full
action lease. It also checks fixed production construction despite environment
values and rejection of a production object by the fixture entry. No test in
this directory has yet run. These tests must run in a separately granted,
bounded, network-none server runner and must verify zero Engine dispatch for
every denial and one synthetic create attempt for the positive control.

An independent owner must review the exact source/byte-delta and then exercise
the exact candidate through `coordinate_fixture` on a fresh, fully gated
synthetic target, preserving one target/operator/control/lock/lease throughout
publish and rollback. Repeat positive web serving and game-continuity checks on
the exact candidate; separately retain the authorized lost-ack and write/fence
fault evidence. Actual child EIO targeting remains unproved. A positive
`80de09` fixture run or these mocked admission tests alone do not establish
this candidate's full runtime behavior or authorize production.
