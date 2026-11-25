# Independent continuity source review

Reviewed current working changes on the unified checkout after the shared renderer agent's final rewind adjustment. This is a source review; browser execution and release qualification remain the coordinator's evidence.

## Findings

No blocking source issue found in the requested forward question/answer/result continuity path.

- MCP FullShowDemoQuestionV3 no longer gives its native child a new key at every phase clock epoch. The enclosing full-show question still owns question, revision and explicit replay identity.
- NativeRazziaPreviewV2 uses question identity for continuous playback and retains the existing answer entrance preset through ordinary result updates. Snapshot identity remains phase-sensitive. Positive-vote photo ranking retains its deliberate hero/runners composition.
- The V4 adapter flags an already-visible question only when the same question key is in a question/voting/locked/results mode. Existing same-options updates still patch data without replay.
- V4 contentRevision is retained only for an explicit continuation flag, the same nonempty question key and both scenes in the common question family. Cold snapshots, explicit replay, a new question, and unrelated/image compositions do not retain that key.
- StageSceneV4 renders QuestionFrameV4 and FivePictureAnswersV4 at stable React positions across that common family. With the scene-root key retained, the actual question and card DOM can survive updates.
- NativePreviewStage retains the visible scene for forward same-question steps even while paused. Rewinding explicitly chooses cold phase reconstruction so later-phase answers/results cannot remain. Same-phase pause/resume follows the existing direct control path.

## Requested early-transition animation review

The feared inline hidden-node residue was not found in this path. questionMotion and cardsMotion create WAAPI effects with fill both and do not commitStyles or write inline opacity/transform. The corresponding base CSS keeps the question and answer slots visible; an incorrect answer is intentionally dimmed, not hidden. Canceling an old entrance restores that visible base.

NativePreviewStage revokes the old transition owner before finishAnimations. V4 finishAll completes finite effects and runs the timer/result finalizers, then the next play cancels the old effects. The inspected finalizers update the timer, result percentages/tracks, and owned scene clock; they do not leave question/card roots hidden.

No speculative motion-engine change or additional broad test was requested by this reviewer. The real browser regression should still demonstrate retained DOM and no duplicate entrances across forward steps in playing and paused modes, with normal and reduced motion, plus new-question/replay resets. A passing cold snapshot or pure mocked WAAPI count alone is insufficient evidence for the user's reported defect.

## Public demo regression

Latest public demo commit6b973ecffac2d075268dad08627a59e680e8eb66 is present in the unified base. Its canonical CTA/balanced-results smoke must be run on this current candidate because the V4 stage is shared. The older visible-results-no-repeat smoke has superseded winner-tag and label-size assertions; see RELEASE_PLAN.md before reusing it.

## Limits

No product source was edited by this reviewer. No heavy test, qualification, deployment, cache restore/start, customer data access, or Git mutation was performed. Release helper compilation is syntax validation only.
