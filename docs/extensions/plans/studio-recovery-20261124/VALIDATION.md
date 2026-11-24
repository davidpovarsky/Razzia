# Original Studio draft recovery and structural history

## Scope and source identity

This isolated change completes the two implementation gaps documented in Asana tasks **1219889489915775** (durable unsaved Studio recovery) and **1219895230030140** (structural timeline Undo). It is based on commit `142c178de33737b6fdfff87fefa466fe6652363d` and belongs to branch `codex/tadazz-studio-recovery-20261124`.

The change stays in the original `/manager/quizz` editor, its shared form/sidecar providers, original header controls, and nine locale files. It does not create a gameplay engine or change site, billing, Worker, runtime, deployment, customer data, media files, lockfiles, or licensing.

The final exact-source browser run started at **2026-11-24T01:11:01.471Z** with Node **v26.13.1**, esbuild **0.28.2**, and Playwright **1.64.0**. The real modified providers, header controls, and save hook were bundled for an isolated fixture server.

- Browser bundle SHA256: `d193026f1e528c59ec8949181dc4c268d7182ddffede03c77b0e1538125e5c14`.
- Final source manifest: [source-receipt.json](source-receipt.json), containing SHA256 pins for all 22 changed source, locale, test, and browser-fixture files.
- Final browser receipt: [browser-result.json](browser-result.json).
- Source manifest SHA256: `5a7c831d8e0c1e19acd5c05c756f220bcd07777a8ab8cfc044eceee6b9e45c52`.
- Browser receipt SHA256: `175380b286b24c340620d4e1066816dae5502fabf0e10393d9f2dda900c04f9a`.

## Behavior

### Durable recovery

The browser backup stores incomplete form values, stable question IDs, the complete sidecar, and editor selection together. Envelope and identity validation deliberately permits empty questions and answers; publication validation remains on Save.

Backups are scoped to the actual session subject returned by `getClientId()` and the quiz identity. New quizzes use the owner's new-draft scope with independent version IDs, so multiple new drafts can coexist. Every write allocates an immutable UUID key. The new record must be stored successfully before the editor removes its own prior record. Recovery cleanup can only target the exact immutable version that was recovered; a concurrent writer's newer key survives even if its write occurs between inspection and cleanup.

Writes are debounced by 350 ms, with flushes on page hiding, unload, and unmount. Each record has a 2 MiB budget. Quota, denied storage, malformed records, and unknown versions do not disable editing. A localized warning makes backup failure visible.

After metadata is ready, the native recovery dialog offers restore or discard with the backup timestamp. Recovery never writes to the server. It retains the original base revision and digest. If the accepted server version changed, Save opens the existing conflict dialog again even after cancellation. Server overwrite still requires that dialog's explicit second confirmation.

Successful Save clears the submitted draft only when its content still matches. Failed validation, network failure, and revision conflict retain the draft. If newer edits exist while a save resolves, they remain in the editor and the immediate durable record adopts the returned quiz ID, revision, and digest while retaining the newer content. Save retries, conflict reload, and explicit overwrite use that persisted identity, including a just-created quiz whose route still has no server ID.

### Structural Undo and Redo

Add, remove, duplicate, reorder, question/scene conversion, quiz/survey conversion, and bulk question-mode changes pass through the existing atomic Studio mutation adapter. History stores linked composite snapshots, bounded to 50 entries and 8 MiB.

Undo restores structural fields and IDs without discarding later unrelated question text, title, scene, audio, roster, or default edits. Redo captures edits made to a duplicated card before Undo so that its content returns with the same identity. A new edit invalidates Redo. History is cleared at accepted server reload/save boundaries and when account or quiz identity changes.

Native header buttons expose localized accessible Undo/Redo labels in all nine languages. Ctrl/Cmd+Z and Redo shortcuts respect text fields and contenteditable controls. Existing save, exit, metadata retry, conversion confirmation, and conflict flows remain in place.

## Validation

| Check                                   | Actual result                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| New history/storage unit tests          | 13 passed                                                                                                      |
| Existing Studio question-mutation tests | 5 passed                                                                                                       |
| Total focused unit run                  | **18/18 passed**                                                                                               |
| Changed production/test source lint     | **0 warnings, 0 errors** across 10 files                                                                       |
| Locale additions                        | All nine added keys present and nonempty in en, he, de, fr, es, it, ja, tr, vi                                 |
| Final real-provider browser flows       | **9/9 passed**, zero browser errors                                                                            |
| Read-only peer review                   | Persisted-new identity, immutable version keys, cleanup ordering, and native restore flush correction accepted |

The browser flows verify mixed structural operations and preserved metadata, existing and new quiz hard-reload recovery, actual composite Save/reopen, failed-save retention, stale-server conflicts, both conflict actions on a just-created persisted identity, concurrent tabs, account isolation, and Hebrew mobile storage-denial behavior. The late-create case also inspects the **first successful storage write after the create response**, asserting that it contains the actual saved identity/revision/digest and the newer unsaved text.

The fixture API validates both the base quiz and V2 sidecar before accepting saves. No live server, customer quiz, or account data was used.

Commands used, from the repository root with existing dependencies:

```sh
node node_modules/vitest/vitest.mjs run --project web --maxWorkers 1 \
  packages/web/src/features/quizz/components/studio/studio-history-draft.test.ts \
  packages/web/src/features/quizz/components/studio/studio-question-mutations.test.ts

node node_modules/oxlint/bin/oxlint <the ten changed TypeScript files>

TMPDIR=/mnt/development/projects/diagnostics/tadazz-studio-recovery-20261124/tmp \
STUDIO_DIAGNOSTICS=/mnt/development/projects/diagnostics/tadazz-studio-recovery-20261124 \
PLAYWRIGHT_BROWSERS_PATH=/mnt/development/tooling/tadazz/ms-playwright \
node docs/extensions/plans/studio-recovery-20261124/browser-check.mjs
```

See [focused-unit.log](focused-unit.log), [changed-files-lint.log](changed-files-lint.log), and [format-check.log](format-check.log).

## Failures found and corrected

The initial browser execution passed the first five functional groups, then failed the immediate two-tab record-count assertion (**1 observed, 2 expected**). The native field-array restore flush could run effects before the recovered snapshot was copied to durable state. Recovery now republishes the snapshot and dirty state after the native restore returns, before persistence.

The original failed receipt and screenshot are preserved as [browser-initial-result.json](browser-initial-result.json) and [browser-initial-failure.png](browser-initial-failure.png). The intermediate corrected nine-case result is [browser-corrected-before-final.json](browser-corrected-before-final.json). The final receipt and exact source pins above include the later immediate post-create identity correction as well.

Read-only review also found that the initial new-quiz retry implementation resolved the saved identity only for Save; both conflict handlers still guarded on the route ID. All three paths now share the effective saved identity. The focused browser case confirms both reload and explicitly confirmed overwrite.

The conditional cleanup review identified a possible mutable-key cross-tab race. Immutable per-write version keys remove that race. A dedicated unit test interleaves a newer write between inspection and cleanup and confirms the newer content survives. Another test verifies that a failed new write leaves the prior durable version intact.

## Acceptance boundaries

The final browser evidence uses the real providers, native controls, and save hook with a narrow fixture shell and minimal fixture CSS. It establishes editor behavior and accessibility labels; it is **not** a full Studio design qualification, release Native/Operator gate, or live-production acceptance. The screenshots show the fixture environment.

Browser backups stay on that browser origin and account; they are not a cross-device server save. An abrupt process crash can lose changes inside the 350 ms debounce window. Storage denial or a draft exceeding the stated budget leaves normal server Save available and visibly warns that the local backup is unavailable.

The release integrator must merge this commit with the other approved branches, run the combined-head gates, deploy, and verify the live site. This isolated agent has not pushed, merged, deployed, or closed the two Asana tasks.
