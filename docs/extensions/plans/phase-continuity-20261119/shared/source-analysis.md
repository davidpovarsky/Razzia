# Shared question phase continuity — 19 November 2026

## Scope and baseline

Implemented on unified HEAD `34a9e0a59482fa035ab98338f7c977589e46287d`, after the latest GGO branch was merged. No commit, staging, push, deployment, account data, or credential access was performed by this worker. The MCP lifecycle worker owns `full-show-demo-question.tsx` and actual AppBridge browser verification; this report covers shared/native changes.

## Diagnosed causes

1. The full-show widget keyed its native child by chapter and phase-clock epoch. The sibling worker removes that redundant key; the parent retains deliberate question/revision/replay resets.
2. `NativeRazziaPreviewV2` used phase epoch and result visibility in its question/answer entrance identity. Even with a persistent widget, those values remounted the question and text answers. The result phase also changed the text cards' entrance preset.
3. The shared V4 adapter called `picture-answers` after a question without expressing that the question was already visible. The motion engine unconditionally animated both question and cards. The V4 scene root also used the animation revision as its React key, replacing all content on each scene request.
4. `NativePreviewStage` reconstructed every paused phase as a cold snapshot and hid the entire surface while doing so. This recreated unchanged content during a paused manual reveal.
5. Once the widget became persistent, explicit backward navigation could leave later-phase content visible: the director correctly treats the same active question as continuous, so it needs an explicit rewind boundary for preview scrubbing.

These are project rendering/lifecycle issues, including the MCP integration, rather than evidence of an MCP-host transport fault.

## Implemented behavior

- Continuous Razzia preview uses question identity for entrance ownership. Phase clocks still reset for their authored deadlines. Text cards keep their entrance preset through the result update; selection, correct highlighting, counts, and percentages update existing content. Snapshot mode retains its old phase-specific entrance identity.
- Positive-vote photo results retain the native winner/runner ranking composition and its legitimate results entrance. This intentionally changes the answer layout and DOM; it must not be confused with replaying the previous question. Zero-vote results remain in the original grid and now retain its existing entrance preset. `PhotoCardGrid.tsx` itself is unchanged.
- `presentOptions` tells V4 when the same question is already visible. The picture-answer motion enters new cards without re-entering the question. A photo-question transition keeps its already-readable question panel visible while introducing new artwork/options; a cold photo scene still enters fully.
- V4 preserves a scene's React content identity only when the incoming data explicitly declares continuity, the previous and next nonempty question IDs match, and both scenes use the shared question composition. The common family is question, picture-answers, voting-open, countdown, vote-locked, chosen, and survey-results. Other compositions, cold snapshots, and another question keep a fresh identity. Explicit native replay clears continuity flags and remounts a fresh entrance.
- Paused, forward manual phases of the same continuous question use the normal transition plan and retain the visible stage. New answer/result details may enter, and the stage is paused afterward if transport is still paused. A pause/resume toggle during that asynchronous work respects the latest transport state.
- A backward phase change reconstructs the requested phase, clearing later answers/results. It does not share the forward-continuity path. Same-phase pause/resume retains its previous fast path.

## Source ownership

- `extensions/src/presentation/show-library-preview/NativePreviewStage.tsx`
- `extensions/src/presentation/show-library-preview/NativeRazziaPreviewV2.tsx`
- `extensions/src/presentation/tadazz-show/TadazzV4StageAdapter.tsx`
- `extensions/src/presentation/tadazz-v4/TadazzV4Stage.tsx`
- `extensions/src/presentation/tadazz-v4/motion.ts`
- `extensions/src/presentation/tadazz-v4/types.ts`
- Focused regressions added to existing `tadazz-v4/types.test.ts` and `tadazz-v4/full-show.test.ts`.

Scoped lint cleanup in these already-touched files adds required braces/spacing and removes an equivalent nested color ternary; it does not change their product behavior.

## Verification

- Existing focused Vitest files: **32 tests passed, 2 files passed**. New regressions verify explicit continuity/new-key/cold/replay boundaries; question entrance is requested once through answers, voting, selection and results while cards enter only once; photo-question continuation versus cold entry; and existing result label rules remain covered.
- Scoped Oxlint over all eight owned source/test files: **0 warnings and 0 errors**.
- `git diff --check` for owned files: **passed**.
- All test files and relative imports resolved from the current unified checkout. `verification.json` records resolved source paths and hashes. Installed dependency tools are shared through existing node_modules links, but no old source checkout was used for the test graph.
- Initial `pnpm exec` failed before running tests because pnpm attempted automatic dependency installation and refused an existing node_modules link outside this worktree. No dependency directory was removed or repaired. Running the already-installed Vitest entry directly with Node succeeded. Oxlint required the project's existing `--experimental-strip-types` Node option to load its TypeScript config.
- The existing SSR company-opening test emits a missing-i18next-instance warning; all assertions pass. This is recorded in `unit.log`.
- Actual widget browser acceptance is owned by the MCP worker and was still pending when this report was written. Required coverage includes forward phase identity/animation calls, playing and paused choice/reveal, explicit Replay/New Question, and AppBridge chapter rewind. Positive-vote native photo ranking is allowed to form its authored results composition; the question must remain stable.

## Receipts

`verification.json`, `unit.log`, `lint.log`, `diff-check.log`, and the final rewind guard receipt `rewind-guard-lint.log` live beside this report. No deployment success is claimed here.

A redundant final receipt-refresh lint command later timed out under concurrent host load (`job_85ab959983bf`). It did not change source. The earlier successful final-guard check is recorded separately, and no additional pass is attributed to the timed-out command.
