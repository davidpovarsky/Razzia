# Readonly transport during automatic preview

## Current result

The four-file change is implemented and independently reviewed. Scoped lint and diff validation pass. The exact baseline reproduces the defect: while a genuine automatic preview ACK is held, Pause, Replay, Next and Previous are all disabled.

The fixed Chromium/Classic run passes all four races. WebKit/Classic completes the Pause race once, then crashes its page during the fresh Replay setup. One authorized WebKit-only repeat with the identical source and built widget also page-crashes, this time while reading the state after the Pause case's automatic ACK. No further retry, source change, push or deployment was performed. The parent subsequently authorized a source-only implementation commit; release qualification remains incomplete.

## Change

The widget distinguishes automatic loading from explicit/manual loading for the four readonly transport controls. Each handler consults current module state. Explicit navigation retains the visible logical card, supersedes the pending automatic preview through the existing generation/consumer mechanism, and keeps all controls disabled while its own ACK is pending. Pause remains local, reads the playback owner's current snapshot, and preserves the existing userPaused state through later automatic ACKs. Authoring, mutation, refresh, close and capability guards remain intact.

The canonical Replay verification now awaits a real successful preview_show ACK for the exact logical target, followed by the actual native child remount, target chapter, changed epoch and nonempty content. The original 10-second readiness budget and final remount assertions remain. That canonical assertion path has been reviewed; it still requires execution in the full qualification.

## Real response regression

The helper shares the existing genuine response gate with preference-race.mjs. route.fetch reaches the actual synthetic issuer/MCP backend; route.fulfill returns that unmodified response through the official SDK/AppBridge. The test uses ordinary native controls, records passive pointer events, checks authoring/manual busy guards, and delivers the old ACK after the new manual target has been acknowledged and paused. It asserts no draft changes and no stale response overwrite.

The existing fixture has five contiguous quiz cards q1 through q5. Question3 therefore has question2 and question4 as logical neighbors. Opening is a non-question card, and the native inventory assigns its questionOrdinal exactly null.

## Evidence chronology

- baseline: exact unmodified e663 product, audited rebuild, expected disabled-Pause failure; snapshot shows all four transport controls disabled.
- fixed: audited changed widget, Chromium four cases PASS; WebKit Pause PASS, then page crash before the Replay automatic gate or explicit input.
- fixed-webkit-only: one authorized unchanged-source/widget repeat with DEBUG=pw:browser. It reaches paused question state, fulfills the automatic ACK and passes the voting-plus-paused wait, then the page crashes during state snapshot.
- scoped-validation.json: zero lint errors; formatting and git diff check pass.
- review.patch: complete independently reviewed four-file diff.
- summary.json: exact source, build and receipt hashes.

Both builds contain 2,694 physical modules and no off-worktree product source. Run receipts preserve source hashes before and after. The repeated run uses widget SHA256 88bd7eeeada87452b0325b21eef45349988acbe8cb78405996ebee878a79edcb without rebuilding.

## Crash evidence and limits

The repeated Windows WebKit2370 run reports Target crashed from the page. The browser parent later exits gracefully with code0 during harness cleanup; its stderr contains no native crash stack or memory-error message. Available physical memory was 1,684,440 KiB before and 547,436 KiB after; those snapshots do not establish the crash cause. The earlier owned QA process was gone before the repeat, and the repeat's owned process exited.

The failed mixed run and failed repeat remain failed. WebKit Replay, Next and Previous transport cases are not verified by these results. The prior Linux manual-results Pause click timeout is a separate finding; this automatic-loading fix does not claim to explain or resolve it.

## Ownership

Base: e66317a5385862a3a756a18a5646fad4e64e5c26.
Branch: codex/tadazz-transport-race-20261119.
Worktree: C:/Users/DAVID/Code/Razzia-worktrees/tadazz-transport-race-20261119.
Only the four reviewed source/QA files are modified. Unified checkout was not modified by this work. Parent release coordinator owns the next acceptance decision.

## Source-only commit binding

Commit d99b9c78a8034f9fdde6e5bf528fe4b8ed684e26 contains exactly the four reviewed source/QA files, with parent e66317a5385862a3a756a18a5646fad4e64e5c26. Documentation and evidence are excluded. This implementation commit is not release-qualified, pushed or deployed. See source-commit.json for exact hashes and acceptance limits.
