# e583 V2 SIGKILL byte mismatch: exact cause and proposed disposition

2026-11-15. Reviewed source: `e58350423727ba1c5aadf4164a2b09ee25745839`.
This is offline analysis of retained independent QA receipts, not a new test run.
All original FAIL results remain FAIL; no production or existing assertion changed.

## Proven cause

The synthetic base fixture and interruption writer use compact `JSON.stringify(data)`
(`recovery-fixture.ts:34,38`, `process-interruption-child.ts:132`). A quiz-save
journal stores the complete parsed `backupBase` object (`journal.ts:27,75`).
Startup recovery without supplied callbacks writes it through the default adapter,
`JSON.stringify(data, null, 2)` (`media-library.ts:1197`). The actual native
`updateQuizz` also writes two-space JSON (`packages/socket/src/services/config.ts:176`).
Unlike Media journals, quiz-save journals do not store original base serialization.

The four copied raw receipts exactly match SHA-256 values read directly from the
retained server evidence. `analyze-receipts.mjs` checks those fixed hashes before
analysis and checks the entire decoded values with `isDeepStrictEqual`, with no
schema parsing, field picking, ID stripping, or type coercion. `analysis.json`
contains every result and the exact source provenance.

For both base-write and sidecar-write, in both dedicated and full-suite receipts:

- Target base raw SHA before is `6b8415950bb1337fa23b28ee14fdabb4df75063e265da0d93c0cd011ce82dce4`.
  Reconstructing compact JSON from the recorded complete base produces exactly
  that SHA: 225 UTF-8 bytes, zero newlines.
- Target base raw SHA after is `e678d7988778e09b452bc17719a801e50c7db1e9a1106bcb41baf425f11720e8`.
  Reconstructing two-space JSON from the same object produces exactly that SHA:
  375 UTF-8 bytes, 22 newlines. Neither candidate adds a trailing newline.
- Complete decoded base, insertion order, and complete V2 extras are equal;
  raw sidecar SHA is unchanged. All V2 fields are retained, including timeline,
  scenes, defaults, teams, audio, perQuestion, roster, authoring, and mediaCatalog.
- Show B and the unrelated show are unchanged including both raw hashes; target
  and unrelated media hashes are unchanged. Startup reports recovery success and
  zero unresolved records; the first replay cleared its journal.
- The interrupted process reports SIGKILL and the first recovery has a distinct
  PID. The old failing assertion stopped execution before the second replay;
  these receipts make no twice-replay success claim.

Thus this precise e583 failure is a serialization-identity oracle mismatch for
the object-backed quiz-save contract. It does not establish that native filename,
ownership, durability, or scope behavior is correct; R1 tests examine those separately.

## Exact test change and disposition

The manager approved this exact patch after checking the original V2 task's
explicit byte/semantic-equivalence acceptance. Applied unchanged on 2026-11-15;
the raw e583 receipts and their FAIL status remain unchanged. The proposal helper
regenerates the patch against the e583 source, before application.

`proposed-v2-semantic-oracle.patch` changes only the two `quiz-*` cases in
`process-interruption.test.ts`. It requires strict full base equality plus the
repository's canonical digest, strict full extras equality plus exact sidecar
bytes, and exact full unaffected-show records including hashes. It does not
normalize either data object through a schema. Media cases keep their existing
whole-state raw byte equality. Binary/reference assertions, original raw hashes
in receipts, second fresh-process replay, distinct PIDs and exact second-state
byte idempotency remain intact.

`prepare-proposal.py` regenerates this patch without applying it. It can be run
with `py -3` on this workstation against e583. The manager authorized only the
exact test patch; no production fix. Changing production JSON formatting, rewriting
the old raw receipts, or making the fixture pretty simply to conceal normalization
is not proposed.

After approval, a new test-only commit and a bounded dedicated run must establish
the new oracle and both replays. The old dedicated 8/10 and full 766/768 results
remain historical failures. R1 native binding failures require separate scope
decisions, not further relaxation of this proposal.
