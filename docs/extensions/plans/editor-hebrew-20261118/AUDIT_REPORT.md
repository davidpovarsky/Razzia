# Tadazz editor, Hebrew and live preview audit — 18 November 2026

## Scope and source

Worktree: `codex/tadazz-editor-hebrew-20261118`, created from latest fetched `codex/tadazz-mcp-connect-20261118` at `c9b2483b8719b4357852f105e91369e4ffb592e8`. Existing dirty worktrees and historical evidence were left intact.

The user explicitly authorized editor changes, full Hebrew/RTL, executions, builds and deployments. Original Razzia typography, colors and actual native controls remain the editor design foundation. This document records verified behavior; release qualification and deployment are recorded separately when completed.

## Editor surface and visibility map

| Surface or state               | Correct behavior now                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Header navigation              | Questions, Participants, Settings and Launch; active state announced; all four visible in a two-column mobile grid.                          |
| Card type toolbar              | Only on Questions, after metadata is ready and a real timeline item is selected.                                                             |
| Text-only answer               | Text editor and visible display-mode selector; no image upload, image removal or alternative-text field.                                     |
| Image / text-and-image answer  | Actual image chooser, thumbnail, removal and alternative text; switching back to text preserves dormant media without rendering it.          |
| Single / multiple / estimation | Visible native toggles; only relevant scoring, choices, estimates, margins and input modes.                                                  |
| Quiz / survey                  | Per-card mode controls correctness and scoring; survey previews and thumbnails do not imply a correct answer.                                |
| Authored type conversion       | Confirmation before replacing content; cancellation preserves it. Empty draft conversion is immediate. Only the selected item changes.       |
| Question media                 | Upload, library and URL input; logical RTL placement and accessible controls; no fabricated asset URL.                                       |
| Scene media / animation        | Draft values and real asset picker; type-specific media, playback and overlay controls.                                                      |
| Background                     | Slot options follow the selected theme and card type; resets appear only where an override exists.                                           |
| Audio                          | Events follow card/theme capabilities; no mute/playback control without playable source; Stop only while playing.                            |
| Participants                   | Localized roster/import/validation, phone fields LTR and surrounding layout RTL.                                                             |
| Settings                       | Visible mode and advance selectors, original native theme cards with readable mobile copy.                                                   |
| Launch                         | Requires a saved valid game, loaded metadata and no unsaved form or sidecar changes.                                                         |
| Loading / failure              | Editing and saving wait for sidecar metadata. Failure shows an explicit retry, without overwriting unknown server state.                     |
| Leaving editor                 | Exit and browser Back require confirmation for unsaved form or sidecar changes.                                                              |
| Timeline                       | Mouse and keyboard sorting, localized announcements, active selection reconciled after metadata load, stable question IDs after save/reopen. |
| Media deletion                 | Referenced media shows a conflict confirmation; explicit detach-and-delete completes and leaves the editor usable.                           |

## Preview architecture

Each question has a live, unsaved preview with Question, Answers and Results phases, 16:9 and 4:3 choices, replay, reveal and hide controls. It uses the selected built-in native stage and actual renderer. Estimation uses the native estimation components because the external authored-show interchange schema does not admit estimation; this preserves supported editor functionality without fabricating interchange data.

Each scene previews the relevant native screen. Scene recap and interim results receive the actual preceding questions and correct positions, including mixed estimation cards, without inventing audience votes. Classic opening/finale use the native preset semantics: the card name is distinguished from a title that actually appears on stage.

The preview does not save the game, create a live room or issue a live player command. It is muted during editing. Undefined optional data is normalized before strict JSON snapshot validation; malformed data does not crash the editor. Sibling estimation questions do not prevent valid choice previews.

Final visual review corrected Classic custom-scene inner-stage sizing by extracting the exact live native screen components. Six Hebrew countdown/recap measurements at1440,390,320 show the inner screen fills the actual native stage. Lottie proof verifies real frame movement60→120, WASM200, deliberate bad-source404, and correction to a valid source recovering without a page reload. The broad final native preview matrix passed83 checks. These receipts supersede earlier container-only checks.

## Hebrew and RTL

Hebrew is admitted through the editor, core namespaces, extension resources, native-stage schemas, site, widget, Theme Builder and consent screens. Nine locale key sets remain compatible; existing required eight-locale theme packages remain valid while Hebrew is optional for legacy packages.

Document language/direction and Radix direction are synchronized. Logical layout and directional controls follow RTL. Authored text uses automatic direction. Numeric, email, URL and telephone values remain readable in LTR. Tests retain unsupported-locale rejection.

The implementation retains Rubik and the native Razzia components. Dedicated browser checks cover mixed Hebrew/Latin text, negative numbers, portals, confirmation dialogs, estimation, roster imports and mobile layouts. Actual decoded font evidence is recorded separately.

## Verification completed before final release gates

- Root unit suite: **384 passed, 11 existing skipped** across 38 passing and one skipped file.
- Full editor workflow: **19/19 passed**, no browser page errors, including unauthenticated editor/API rejection and actual PNG upload/decode, mode preservation, legacy sidecar initialization, synthetic metadata failure/retry, navigation guards, safe conversion, keyboard ordering and persisted original question identity.
- Layout: all four editor screens at **1920×1080, 1280×800, 1024×768, 844×768, 768×768, 390×844 and 320×640**. The final navigation check also verifies all four tab bounds before interaction.
- Hebrew: 79-screen main matrix, 13 roster screens and 14 final-review screens; additional exact native-scene and font evidence accompanies the final preview receipt.
- Native control and fifth-answer-token contracts: **13/13 passed**. Raw feature buttons were replaced with the actual Razzia Button; no allowlist was expanded.
- Locale, standalone recap and source-copy regressions: **46/46 passed**; fallback labels interpolate even without an initialized translation provider.
- Frozen-source full web application TypeScript passed. The solution-only tsconfig run was rejected as insufficient and replaced with the actual tsconfig.app.json check.
- Frozen-source full extension suite: **1,428 passed, 38 existing skipped**, 150 passing and 4 skipped files. Frozen root suite: **384 passed, 11 existing skipped**. A first concurrent root run passed its assertions but timed out during browser teardown under CPU contention; the complete root suite reran alone with four workers and passed. The original failed receipt is retained.
- All 208 formatted source paths passed the frozen formatting check. Scoped strict typed lint passed; full immutable Linux release gates follow after remaining draft and host-modal integration.

Expected local HTTP responses are explicitly distinguished from failures: optional disabled theme/catalog/package endpoints return 404, the failure-retry scenario intentionally returns 500, and protected referenced-media deletion first returns 409. A zero-page-error assertion does not hide these responses.

## Additional regressions closed during the audit

The private immutable renderer now includes the original Rubik font bytes and registers its font faces in the owning document, including iframe/ShadowRoot use. Ten real-browser assertions verified six decoded embedded subsets, Hebrew Unicode coverage, the actual computed Rubik family, shared mounts, document isolation, final disposal, early disposal and the non-constructable stylesheet fallback. The parent editor font evidence and private renderer evidence are separate. The temporary font audit manifest is not a release qualification or a source of production pins.

A real audio-preview ownership race was reproduced before the fix. Late completion, error or rejected-play callbacks from an old audio instance no longer clear the owner of a newer instance. The same React lifecycle harness failed against the previous source and passed all seven assertions after the change.

The stable-question-identity witness uses the verbatim historical provider from commit 5d94754 and the current provider in the same React/RHF and composite-client fixture. Historical behavior passed 1/8 assertions and failed 7/8; current behavior passed 8/8. It proves the identified front-end identity, metadata and interlude regression, without claiming to rebuild the entire historical backend.

The native recap page size now matches the selected renderer: Classic 6 and Original 8. Switching themes preserves a stored 8 until an explicit edit; entering 8 for Classic clamps to 6. Three unit and five real-browser assertions verify this contract.

Background position and overlay opacity now propagate from validated authored card data through the real live scene, stage adapter and renderer, as well as editor previews. Inherited defaults remain centered with no extra overlay, explicit zero is preserved, and the overlay affects the backdrop rather than foreground text. The focused 53-test gate, TypeScript and 12-file strict lint passed; the real-browser receipt is recorded separately.

## Committed follow-up verification

Foundation source is committed as af1d879431d3461c7f937a6c5f580eee97b073e2. Linux-generated renderer pins are committed as 8f965fe8e63a3989a41483d78856a45b43d0a530. These generated pins are release inputs, not a deployment receipt.

The immediate End Timer fix is integrated as 2858d1292c73019817c6aed5ef6ffedefc1b1a78. It passed 108 distinct focused and related tests; an authenticated Socket.IO flow revealed results in 4.58 ms rather than waiting for the 1,000 ms countdown tick. Ordinary abort semantics and paused, repeated, stale and deferred-waiter behavior remain covered.

The XLSX expansion fix is committed as bca67d9fd0ea58d422008b897fada07c4d0b0a6e. Both roster and show readers now enforce 50 entries and 25 MiB of actual expanded bytes, reject declared/actual mismatches and bound decompression before allocation. The focused matrix passed 45/45 and the actual browser import/export suite passed 6/6, including downloaded workbook bytes and zero-write rejection. A stale Edge empty-download-tab cleanup was repaired in the test fixture; application navigation protections remain enabled.

The complete committed branch through bca67d9 was pushed to origin. Durable draft/history and the localized host roster are being validated in separate worktrees; their final integration and release evidence will be added below.

## Release and Asana handling

No release is inferred from local success. Native renderer pins must be generated on the actual Linux Node/dependency image from committed source, committed, and verified by the existing immutable host, browser, build, proxy and staging gates. Deployment uses a qualified consistent backup, existing rollback procedure and actual post-deployment observations.

Asana tasks are updated with receipts and closed only for completed deliverables. Historical STOP handoffs are closed only where a later integration and the user's explicit resumed authorization resolve them. External PSTN/provider, hardware/Safari, licensed assets, host installation and account-dependent gates remain open until their own evidence exists. Renaming the Asana project is currently blocked by the available connector operation set and the browser sign-in wall.

## Evidence index

- `EDITOR_SCOPE.md`, `HEBREW_SCOPE.md`, `PREVIEW_SCOPE.md`, `SITE_HEBREW_SCOPE.md`: ownership and implementation decisions.
- `functional/result.json`, `root-functional-final.log`: 19-step real-browser functional receipt.
- `visual/audit.json`, `root-layout-final.log`: screen/viewport measurements and screenshots.
- `keyboard-dnd/receipt.json`: three actual keyboard sorting traces, including measured drag state and order.
- `root-unit-final.log`, `native-controls-and-tokens.log`, `hebrew-gate-regressions.log`: test evidence.
- `extensions-unit-verified.log`, `web-types-verified.log`, `root-lint-verified.log`, `source-format-verified.log`: complete extension/type/style receipts.
- `visual-preview/native-scenes/audit.json`, `visual-preview/lottie/after-fix.json`: actual stage-boundary and animation recovery proof.
- `font-proof/receipt.json`: decoded editor Hebrew/Latin Rubik evidence; isolated-frame evidence is tracked independently.
- private-font-build/iframe-font-proof.json: 10 actual private-renderer font/lifecycle assertions and screenshots.
- visual-preview/audio-lifecycle/{before,after}.json: actual old/new audio ownership regression.
- stable-id-witness/result.json: same-fixture historical red/current green stable-ID proof.
- backdrop-gates.json: authored-background resolver, live-scene and native renderer gate.
- frozen-source-gates.json: original frozen run, including the retained first-run teardown failure.
- frozen-source-reconciliation.json: successful full root rerun and actual web application type check.
- frozen-source-final.json: frozen application source hashes.
- followups/end-timer/ and xlsx-limits/VERIFICATION.md: scoped follow-up source and regression evidence.
- import-acceptance-after/result.json: six actual browser import/export cases.
- Immutable Linux release receipts are linked in the final completion section.

## Completion record

Foundation source, current native preview visual verification and complete frozen unit/type gates are finished. Remaining release work is integration of the separately verified draft/history and host-roster follow-ups, final combined source verification, regenerated Linux native pins, immutable Linux host/browser/build/proxy gates, qualified staging/deployment and post-deployment observation. No production deployment of this editor branch is claimed at this checkpoint.
