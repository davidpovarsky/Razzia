# Frozen 4138 independent-review counterexamples

Application candidate: `4138cccbb0f234fd4eb4a426c5d12413cddc6535`. Review-only test additions: `3f92ffca1f35029d1d5a7e9180151545e15ef8c7`. This is producer execution of the manager-adopted source review, not independent acceptance.

The complete HQ review `RECOVERY_R2_4138_REVIEW_20261115.md` had SHA-256 `3b8e643c1c93ce11369dff3a0fefbee19f90f2999615fa8d76145e4de0b40606`. Manager approved only its four downstream fixes. No broader suite ran on frozen 4138.

Actual server result: **11 failed, 2 passed / 13**, exit 1. Each receipt captures both fresh PID attempts before assertions. `analysis.json` indexes callback counts and exact changed file identities/bytes; raw receipts and Vitest output are retained unchanged.

- Missing non-null sidecar: replay wrongly restores public state and removes intent.
- Five non-string native fallback cases: a native callback executes before the adapter detects unsafe resolution. The original Vitest display labels the array row `undefined`; the retained `ambiguous-[].json` receipt and test source identify the actual array input. The successor uses explicit object rows for unambiguous labels.
- Missing/corrupt private sidecar backup: immediate and startup rollback restore the base before detecting the unavailable sidecar image. Four raw failures retain the mixed-state witness.
- Default getPath-only replay: wrapper-free backup publication erases the ID needed to rediscover the random-basename native file.
- The foreign string-ID sentinel and explicit null-backup sidecar path pass. The successor strengthens the latter fixture so absence genuinely precedes journal staging, and adds the consumed-backup retry positive.

The read-only prior 9593 source/dependencies were reused. A bounded read-only storage directory overlay permits three new test files without creating files in the prior snapshot. All other overlay differences are the six previously approved 4138 source/test files. No .git, dependency tree, package store, full root, install or image pull was copied or run. The initial setup stopped on permission denial while creating an empty cache mountpoint; it ran no test. The corrected harness creates only exact empty output/cache mountpoints with sudo. All 1,391 prior delivered inputs and 1,274 staged inputs plus two freeze policy files verify before/after without mismatch. The mounted source remains immutable.

Runner is stopped. New source/fixture/evidence/container bytes at stop: 10,530,680. Free disk at stop: 2,808,410,112 bytes. No prior dependency or fixture was deleted. `runner-after-stop.json`, `resources-final.json`, manifests, merged and prior-input verification are included.

Successor source commit: `8b9593787e88ccad37e924a45b820e353074864a`. Its results are recorded separately. Original Media, V2 and create/import tasks remain open pending independent acceptance and remaining gates.
