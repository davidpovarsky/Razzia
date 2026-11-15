# C1 additional post-commit I/O acceptance — evidence only

Product source remains `1909da2f653377c545923b2e91dd2f4b1a2cf802`.
Scoped source intake accepted by the manager at `e444b480aea76fee5bf17f1b96998432134c5ba6`,
evidence `8786d8e6ea13b07084d9d576786e369dc4187331`.
The current server barrel/startup leaf/C/E hooks are untouched; no production
source or shared contract changes accompany this packet. Original create/import
source task `1219882508725158` remainsOPEN.

## Three new executed cases

Final **3/3PASS**,0fail/skip,13distinct fresh child processes all exit0.
Existing local WSL Ubuntu Linux6.18/Node26.11.1, actual persistent ext4 private
/tmp fixtures. Synthetic fs-call faults, not physical disk-full/device failures:

1. ENOSPC when renaming the committed operation result: the native intent remains
   committed; the operation stays reserved with its fully written unknown .next
   evidence. Fresh lookup reports unresolved, retry refuses, startup recovery
   refuses. The complete tree and later public edits remain unchanged, no second
   target. Those two deliberate logical denials are captured by child outputs;
   they are not child-process failures.
2. EIO at the operation outcome directory fsync after its committed rename:
   initial caller gets unresolved, original native commit and visible receipt
   remain. Fresh lookup re-fences the historical result and retry returns it.
   Two new startup processes finish private cleanup then report recovered0,
   retaining both later base/sidecar edits and the identical outcome bytes.
3. EACCES unlinking the committed resolved private base witness: caller gets
   unresolved with committed outcome/intent preserved. Fresh lookup/retry returns
   the same result; repeated startup cleanup removes only private evidence and
   never restores or deletes later public edits.

Original/native and sidecar sentinels for two synthetic tenants remain intact.
Actual startup, operation lookup/create, private fences and native preparation
are exercised. Parent fault injection is fully restored before each new child;
children load the real immutable executable in independent Node processes.
The fixture ownership marker, canonical root and exact prefix are checked before
owned cleanup. Uncertainty was not repaired or auto-published by these tests.

## Exact proof and unchanged scope

`formatted.mjs` is the final executable, built by the existing installed
esbuild0.28.2 targetingnode24. Actual execution is Node26, not pinnedNode24.
`formatted.inputs.json` binds187 inputs;186 non-entry bodies are byte-identical
to the accepted original producer packet. The sole new input is this separate
three-case entry. Neither original15 nor real F605619c consumer is imported or
executed. Their existing evidence and broader acceptance are not relabelled.

`FINAL_VERIFICATION.json` verifies source/input/bundle hashes, all3raw receipts,
13unique PIDs/raw child stdout outcomes, expected denials, repeated cleanup,
identical historical receipt and public/sentinel hashes. Scoped source/test
TypeScript exit0; actual Prettier.check API passes both test/builder files.
No production lint or old suite rerun is claimed. The431-line test entry is an
explicit size exception: it keeps one ownership-checked native fixture, its
self-contained fresh-process commands and the three coupled transition probes
in one separate evidence executable, without importing the old15-test runner.

Initial unformatted entry also executed3/3PASS and is retained. Formatting
changed emitted layout, so the exact-byte bridge assertion correctly stopped;
FORMAT_LAYOUT_COMPARISON.json preserves both hashes. The final formatted three
cases were then executed directly3/3PASS. No old case was repeated.

No installation, Oracle runtime claim/job, provider, customer/production action,
new agent, polling or change to C1/writer fences. All16 inherited untracked files
retain their hashes/status. Hardware power loss, all-writer B/F1, real F
session/grant/consent ledger and integrated/pinned runtime remain separate open
acceptance. This packet advances the original owned storage/recovery fault
criteria without widening the source implementation.
