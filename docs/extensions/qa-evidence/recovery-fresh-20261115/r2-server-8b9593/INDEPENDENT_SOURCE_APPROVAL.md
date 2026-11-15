# Recovery R2 follow-up source review

**Approve the four source corrections on `8b9593787e88ccad37e924a45b820e353074864a`.** The bounded server result for this commit remains the next acceptance gate. Reviewed against `4138cccbb0f234fd4eb4a426c5d12413cddc6535`.

| Prior finding | Verified behavior in the successor |
| --- | --- |
| A vanished sidecar could authorize rollback | Native admission now rejects an absent sidecar when both journal values require one, before either public write. A first-sidecar operation with a recorded null backup still admits absence. See `storage/native-recovery-adapter.ts:113–131`. |
| The native callback could select a different ID-named file | The read-only scan considers the same basename fallback as the real config resolver for non-string IDs. Its kind and identity check rejects an explicitly non-string ID. An idless basename competing with a real native record is ambiguous, and a different string ID remains unrelated. Both update and delete pass through this admission and recheck both public siblings. See `storage/physical-binding.ts:119–171`, `storage/native-recovery-adapter.ts:195–248` and the protected reader in `packages/socket/src/services/config.ts:47–63`. |
| Media could restore a base before discovering a bad sidecar backup | The new group check authenticates every current binding and verifies each still-needed private backup's path, filesystem identity and complete byte image. Both immediate and staged startup rollback call it before restoring the public binary or either sibling, and again before each show's restore. An authenticated sibling already at its original bytes can finish replay after its private backup has been consumed. See `storage/physical-binding.ts:323–350` and `media-library.ts:503,616,1107,1266`. |
| Default replay could erase the storage ID | The getPath-only writer adds the admitted native ID to a wrapper-free logical backup before writing to the bound filename. Subsequent verification resolves the same file and checks its logical content. See `storage/native-recovery-adapter.ts:201–229`. |

## Regression cases and evidence

The test-only commit `3f92ffc` added three harness files to the original candidate. The local producer receipts in `docs/extensions/qa-evidence/recovery-fresh-20261115/r2-review-4138` contain 13 cases, each with two fresh process IDs. Eleven failed their expected assertions and two compatibility cases passed. The missing-sidecar case incorrectly reported recovered then clean. All five non-string cases reached one real native update on first replay, despite an eventual blocked startup. The four private-image faults changed state, and default-wrapper recovery reported failure twice. Those observations reproduce all four findings on the predecessor.

The successor keeps the negative assertions and adds a fourteenth case. The native child counts calls before delegating to the real callbacks. The five ambiguity negatives exercise the update path. Delete protection is verified by the shared admission path in source. The Media cases damage a specific prepared backup, check activation, and compare file contents and identities across both fresh replays. The retry positive consumes a real backup through the restore primitive and checks both final public files against independently captured originals. The first-sidecar positive now stages the null backup from the outset.

The producer's retained-base check counted 1,391 files for `9593f24`. Separate before/after receipts for the effective `4138ccc` runtime source counted 1,274 verified files plus two auxiliary files with zero mismatches. These are predecessor execution and input-integrity receipts. This reviewer performed source, Git and receipt inspection only. Exact `8b9593` runtime evidence was pending at review time.

The production diff is confined to three downstream recovery files. The generic Map stager, protected config and hooks, original tests and digest implementation have no diff in this range. The three original Recovery tasks remain open. F1 durability, C1 pre-ID reservation, tenant startup and trusted migration retain their separate gates.

Dedicated review task `1220557997391183`. Reviewer chat `01a1dd8e-8bd9-7e61-81b7-a24a762986c1`.
