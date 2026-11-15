# Filename/publication precision — 15 November 2026

Documentation-only correction after manager steering, based on unchanged
`14faea86a7c22a16cb4ff5391e4e3c70aaea62ec`. The previous plan's assertion that
subject-based naming demonstrated a title collision/overwrite was too strong.

[normalizeFilename](../../../../../packages/socket/src/utils/file.ts#L3) creates
a normalized subject slug **plus a fresh `nanoid(8)` suffix**.
[saveQuizz](../../../../../packages/socket/src/services/config.ts#L266) generates
the stored native ID separately with `nanoid()`, calls that filename helper,
writes the JSON file and returns only `{id}`. Equal titles therefore do not
deterministically select the same basename. No actual same-title collision,
overwrite, customer failure or collision probability was established here.

The narrower source observations remain:

- The write supplies no exclusive-create flag or reserved-path handle. A future
  safe-create adapter needs to prove create-if-absent publication rather than
  infer an absolute guarantee from a random suffix. This is a guarantee gap,
  not an observed collision.
- The caller gets an ID after the write returns; there is no durable operation
  intent/target mapping in this function before the write. In
  [createCompositeQuiz](../../../../../extensions/src/server/storage/service.ts#L246),
  `quizId` is assigned from the returned result before sidecar creation and
  best-effort cleanup. A pre-return failure/recovery boundary needs later fault
  testing; this inspection did not produce a crash or data-loss witness.
- [Startup recovery](../../../../../packages/socket/src/index.ts#L18) is called
  with the root resolver and no tenant traversal at this call site.
  [Its base lookup](../../../../../extensions/src/server/media-library.ts#L1072)
  uses `quizz/<id>.json`; normal saved basenames and native IDs are independent.
  This does not establish tenant-aware new-create recovery.

`REAL_ADAPTER_PLAN.md` and its descriptive handoff wording now distinguish these
observations from hypothetical collisions. Future same-title/collision/fault
cases remain proposed acceptance tests, not historical failures.

No module bytes, lock, 125-input manifest, 27-test proof, raw failure/success logs,
independent review artifact or runner allocation changed. No tests, install,
remote job, production/customer data or credential access was performed for this
documentation correction. Original implementation/security tasks remain OPEN.
