# Studio Undo and durable draft assessment

Read-only assessment against the current editor on2026-11-18. No application source was changed for either feature. Both are concrete feasible implementation tasks; neither depends on missing artwork, external telephony, legal rights or hardware access.

## Tasks and actual gap

| Asana task                                                              | Current capability                                                                                                                                             | Remaining requirement                                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1219895230030140 — versioned timeline, stable identities and migrations | Versioned mixed timeline, stable question/scene references, atomic composite persistence, migration, clone/delete/reorder and revision-conflict behavior exist | Studio has no user-facing Undo for timeline editing                                              |
| 1219889489915775 — mixed draggable cards and dynamic editor             | Mixed cards, original components, shared media picker, live preview, duplicate/delete/reorder and exit guard exist                                             | In-memory state does not survive reload/crash; no persistent Studio draft save/restore was found |

The exact task notes were retrieved from Asana. They explicitly distinguish confirmation before deletion/conversion from Undo, and exit warnings from durable recovery.

## Reusable existing code

- packages/web/src/features/quizz/contexts/quizz-editor-context.tsx owns react-hook-form values and exposes replaceQuestions, setQuestionIds, updateQuestion and the stable identity state.
- contexts/extensions/use-quizz-extras.ts owns the complete sidecar, its baseline digest, dirty flag, metadata readiness/error/retry, revision conflicts and stable IDs. It has no draft storage.
- components/studio/studio-editor-context.tsx has applyStudioMutation and syncToExtras. Structural mutations already carry questions, question IDs, timeline, scenes, selection, per-question metadata and optional defaults. It also normalizes answer-recap start references. Direct scene/default edits and ordinary form fields have additional paths outside that structural helper.
- components/studio/use-composite-quizz-save.ts uses expectedRevision, handles409 separately, and exits after successful save. Server reload deliberately resets form values and accepts a new extras baseline. These are the success/reload boundaries where history and local backup need deliberate handling.
- extensions/src/components/theme-builder/document.ts already has a tested50-entry snapshot history with past/present/future and saved fingerprint. This is a useful pattern, not a directly reusable Studio schema: its parser requires a valid BuilderDocument, while the game editor must preserve incomplete and temporarily invalid drafts.
- packages/web/src/lib/session.ts already exposes getClientId(), derived from the session subject. Account sessions use the account subject. It can namespace local drafts without storing bearer tokens or adding an authentication endpoint.

## Proposed shared foundation

Add a bounded, versioned editor snapshot that stores editable state together: form values, full sidecar, stable question IDs and selected timeline item. Keep transient network/loading state, auth tokens, DOM objects and playback handles out of it.

The snapshot must support incomplete authoring states. Do not run the strict final quizzValidator or authored-show compiler as a prerequisite for backup: a blank question or temporarily incomplete media card is precisely when backup is needed. Validate the envelope, identity/ref integrity and size budget separately from publishability.

One restore adapter should update form, question identity, extras and selection together. It must suppress recording its own restore as a new edit and let the existing provider recompute dirty state against the accepted server baseline.

This foundation avoids building one subtly different state format for Undo and another for recovery.

## Undo implementation scope

1. Add a bounded history helper with immutable snapshots, no-op detection, redo invalidation and a bounded memory budget.
2. Integrate structural operations at applyStudioMutation, while also defining how field, scene, per-question and default edits enter history. A timeline-only snapshot that silently discards later form edits is not acceptable.
3. Group a burst of typing into an edit; record duplicate/delete/reorder/conversion as explicit complete transactions. Capture only settled composite states so asynchronous form/extras synchronization cannot record mismatched IDs.
4. Add original Button controls with disabled empty-stack states and localized accessible names. Keyboard handling should respect native text-input editing and should not steal Ctrl/Cmd+Z from active inputs.
5. On undo/redo, preserve exact question/scene IDs and recap references. Do not regress the current accepted server revision or turn an expected409 into an overwrite.
6. Reset or deliberately rebase history after server reload, successful save/exit and changes of quiz identity. External permanent media deletion must not let Undo resurrect a missing file as though it had been restored.

Minimum meaningful checks: mixed-card reorder undo/redo, deletion restoring original IDs/metadata, conversion restoration, duplicate identities, no-op/limit behavior, redo invalidation, dirty/baseline correctness and existing409 handling. Browser proof should show a mixed sequence restored and then saved/reopened with stable IDs.

**Cost:** medium. The state boundaries already exist, but ordinary form edits and sidecar edits are not one existing history transaction. Expect a helper/hook plus provider/header/save-boundary integration, rather than changing only the timeline array.

## Durable browser draft implementation scope

1. Add owner+quiz namespacing using the existing session subject; give a new unsaved quiz a stable local draft identity rather than one global anonymous bucket.
2. Write the composite snapshot after a bounded debounce while dirty and metadata-ready. IndexedDB supports atomic asynchronous snapshots and avoids synchronous localStorage writes on each keystroke; a bounded localStorage implementation is possible if quota and serialization limitations are explicitly handled.
3. Load the server's current composite metadata first. Offer the relevant local draft for restore/discard, including its timestamp. Never overwrite the server automatically during recovery.
4. Preserve the saved base revision/digest when restoring a stale draft so the existing conflict behavior remains meaningful. Recovery must not silently convert a stale local draft into force-overwrite authority.
5. Retain the draft on validation failure, network failure and409. Clear only the snapshot that actually saved successfully; do not erase edits made while an earlier save was in flight. Explicit discard should remove its matching backup.
6. Handle unavailable storage, quota failure, corrupt/unknown-version data, stale records and two tabs. Report local backup failure without disabling normal editing or claiming a backup exists.
7. Keep URIs/references rather than duplicating uploaded binary assets. A restored reference whose underlying file was deleted must use the existing missing-media/error behavior.

Minimum meaningful checks: new and existing quiz reload recovery, partial/invalid form retention, sidecar-only change recovery, stable IDs, stale server revision/409, successful-save cleanup, failed-save retention, corrupt record, storage denial/quota, account isolation and two-tab freshness. Browser proof should hard-reload a mixed unsaved draft and verify recovered text, mode, scene settings and identities.

**Cost:** medium. No backend endpoint is required, but there is no existing Studio persistence hook to turn on. The main work is the storage adapter, lifecycle integration and recovery UI.

## Practical sequencing

The two features share approximately5–8 production files plus focused helper/integration tests and two substantial browser flows. The exact count depends on whether the draft/history adapters are combined in one hook. A sensible sequence is:

1. Commit the already-tested editor/Hebrew/font work as a clear source boundary.
2. Implement and test the shared snapshot/restore helper.
3. Add Undo/Redo and verify stable identity/dirty/conflict behavior.
4. Add persistent backup and verify crash/reload recovery and cleanup.
5. Regenerate final locale parity and release gates for the new source identity.

These are implementation estimates from inspected source, not completion claims or a guarantee that a quick localStorage write satisfies the full requirement.
