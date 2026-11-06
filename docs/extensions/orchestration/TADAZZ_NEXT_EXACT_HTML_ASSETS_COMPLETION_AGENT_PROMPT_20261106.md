# TADAZZ NEXT — EXACT SOURCE-OF-TRUTH RECONCILIATION, ASSET RECOVERY & FINAL ACCEPTANCE
**Master execution prompt for the coding agent | 6 November 2026**
**Status: NOT ACCEPTED.** Existing test reports do NOT certify pixel-perfect parity or real end-to-end readiness.

## Your mission (read carefully)
You are the engineering agent responsible for completing—not merely describing—the **TADAZZ Creating Worlds** show inside the **isolated TADAZZ Next worktree**, using the actual bundled HTML documents and embedded assets as the primary design and motion reference. The user explicitly requires:
1. **`second library.html` is the PRIMARY authority** for every scene, motion, transition, asset, visual, text treatment, and timing.
2. **`animation library iwth thier logo.html` is the SECONDARY authority** for any feature, component, motion or state absent from the primary library, not for overwriting differences intentionally made in the primary library.
3. Implement and test the full game (studio, host, spectator/projector, player, telephony gateway and timeline)—not a static isolated preview.
4. Fix **missing captions under each answer image**, **missing card numbers** and **missing percentage/progress tracks during answer highlighting/results** on BOTH host and projector/display.
5. Protect the original game and production. Stop only when there is convincing evidence of functionality and close visual/motion parity; never inflate a test result into a visual PASS.

Follow this document as an executable task. Do not request the same ZIP or ask the user to re-upload images. You have the complete archive locally.

## 0. Exactly where to work — safety invariants
- **Authoritative download:** `C:\Users\DAVID\Downloads\tadazz_second_library_source_and_assets.zip`
- **Only writable game worktree:** `C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105`
- **Required branch:** `agent/tadazz-next-20261105`
- **Observed starting HEAD:** `9d8cd9f` (verify HEAD and working state again before touching anything).
- **Protected original worktree:** `C:\Users\DAVID\Code\Razzia-worktrees\tadazz-full-show`; original HEAD observed `158c589`.
- **Protected production:** `https://tadazz.com`; do not deploy, publish, change Oracle/Docker/DNS, touch production databases, switch production container, or perform real paid PSTN dialing without separate explicit user permission.
- **Do not modify other worktrees or their untracked files.**
- **Important: TADAZZ Next currently has 9 untracked QA artifacts** in `docs/extensions/qa-evidence/tadazz-phone-load50-20261106/`, including `RESULTS.md`, `ROLLBACK.md`, logs, metrics, Python and gateway test scripts. Inspect and preserve; do not `git clean`, `reset --hard`, `checkout -f`, or overwrite blindly. Commit relevant evidence after reviewing for secrets and authenticity.
- Make narrowly scoped commits on TADAZZ Next only. Keep an audit trail and give a final branch/commit/status summary.

## 1. Source ZIP has now ARRIVED — remove the previous source-blocker
Verified on the Windows computer:
- ZIP exists and is **19,601,205 bytes**.
- ZIP SHA-256: **`D500710CA8E9EB05A5787AC3DAA06E5E8FF9FC158E44F7137823C3CB5A9624C3`**.
- ZIP contains **15 entries**: two source HTMLs, `extracted/manifest.json`, and **12 distinct source assets**.
- Primary HTML ZIP entry: `source/second library.html`, **12,933,137 bytes**, SHA-256 `a9328b7d2931dcaee7ae3efa00389fe49130acab71fe8621cb35d97d69d220fa`.
- Secondary HTML ZIP entry: `source/animation library iwth thier logo.html`, **3,533,424 bytes**, SHA-256 `1c072312e139c6cdf36ab5f7cf6cb2767b40a0da300c6f1946d2a256a204c103`.
- Titles: `TADAZZ! × Creating Worlds — Complete Show Motion System` (primary) and `TADAZZ • Survey Motion Kit v6` (secondary).
- The prior `SOURCE_MATRIX.md` and `VISUAL_PARITY_REPORT.md` incorrectly say the source is unavailable on disk **as of now**. Update those reports after actually verifying and using the source. Never claim pixel parity until the visual comparison is performed.

### 1A. Extract safely, preserving source and provenance
Extract **within the isolated worktree** to a new reference folder, e.g.:
`docs/extensions/references/user-20261106/source/` and `docs/extensions/references/user-20261106/extracted/`.
Use Python `zipfile`/safe tools, inspect entries and reject absolute paths, drive prefixes, `..`, symlink traversal, unsafe MIME/content and overwrites. Preserve names and bytes exactly. Reconcile every `extracted/manifest.json` SHA-256 and size to actual extracted files, and compare with the original HTML embedded data URIs—verify the embedded asset output really matches, not merely the manifest. Generate machine-readable `SOURCE_ASSET_AUDIT.json`. If source images are Git LFS/size sensitive, document storage; do not silently omit assets.

### 1B. Explicit inventory of all 12 files from the archive
All these must be processed, mapped to actual runtime URLs and tested (never assume they're already deployed):
| ZIP path | Bytes | Expected destination / required check |
|---|---:|---|
| `extracted/assets/show-stage.webp` | 261,066 | Compare with `/tadazz-show/v4/show-stage.webp` |
| `extracted/assets/tadazz-brand-logo.png` | **1,976,726** | **Critical:** `/tadazz-show/v4/tadazz-brand-logo.png` is present with same byte count; still verify SHA-256. Use the authentic logo everywhere rather than plain-text pseudo-logo |
| `extracted/assets/curtain-left.png` | 1,132,717 | **MISSING from runtime** `/tadazz-show/second-library/curtain-left.png` — install exact byte-identical asset |
| `extracted/assets/curtain-right.png` | 1,132,143 | **MISSING** `/tadazz-show/second-library/curtain-right.png` — install exact asset |
| `extracted/assets/question-bg.webp` | 87,904 | Compare with existing `/tadazz-show/v4/question-bg.webp` |
| `extracted/assets/creating-worlds-intro.png` | 2,410,686 | **MISSING** in current runtime `/tadazz-show/second-library/` — use the exact original for the 2-second Creating Worlds opener |
| `extracted/assets/teaser-screen.jpg` | **266,631** | **IMPORTANT CONFLICT:** an existing `/tadazz-show/second-library/teaser-screen.jpg` is **3,780,431 bytes**, so it is NOT the same file. Do NOT replace globally without checking actual primary HTML usage and source comparison; store the exact source under a distinct explicit filename / path and fix the scene references deliberately |
| `extracted/assets/cards/lamplighter.svg` | 2,039 | Compare SVG hashes, preserve original artwork and map to cards |
| `extracted/assets/cards/pirate.svg` | 1,923 | Same |
| `extracted/assets/cards/dog.svg` | 1,962 | Same |
| `extracted/assets/cards/shadchan.svg` | 1,932 | Same |
| `extracted/assets/cards/therapist.svg` | 1,847 | Same |

Inventory actual existing runtime assets with `Get-ChildItem packages/web/public/tadazz-show -Recurse -File` and compare hashes and image dimensions/transparency. Different byte size is a conflict, not proof of a “better” image. Use explicit provenance when remapping names.

## 2. Reverse-engineer and compare ACTUAL source code and visual results — no more guessed recreation
The primary source contains **`TadazzStageKit` (baseline stage engine) and `TadazzFullShowKit` (Creating Worlds extension)**. The secondary contains `TadazzStageKit` and its survey showcase. Build a **complete authoritative matrix** by reading both HTMLs, not prior prose reports:
- All public and private scene methods, `play(sceneName, data)` variants, scene order and narration beats.
- Every class/component, background, texture, logo, image, overlay, neon effect, transition, sound/impact, and caption.
- All source DOM structures and scoped styles, z-index, positioning, responsive/scaling behavior, display/visibility, SVG assets, CSS animations and JS Web Animations API keyframes.
- Exact cues, delays, durations, easing curves, staggers, animation pause/resume/skip/replay and `prefers-reduced-motion`.
- Input fields, dynamic data updates, zero votes, ties, host selection, stage/projector output, and reconnect/refresh.
- What appears in the secondary but not in the primary, with a *true* difference classification; preserve secondary-only features.
- Identify any **demo-only** data, UI and placeholders (test names, fake phone numbers, synthetic winners). Never ship those as authoritative game state.
- Capture actual HTML reference screenshots and/or video at deterministic timestamps (0ms, early/mid/late and final), using local static hosting/browser and the source files directly. Extract full show sequence scenes, then capture native implementation at matching timestamps and viewport size (1920×1080), compare side-by-side and with overlays/difference metrics. Screenshot alone does not prove temporal behavior: include video or timestamped sequence.
- For every discrepancy, record exact expected appearance, actual difference, code owner and fix. Update `SOURCE_MATRIX.md` to include **all** primary and secondary scenes, assets, code paths, behaviors and parity outcomes.
- Do not copy original demo HTML into production iframe or use HTML interpreters; port real behavior with native React/WAAPI/CSS while preserving fidelity.
- Verify all source legal/technical dependencies and keep internal resources local and safe.

## 3. What exists in TADAZZ Next (NOT sufficient proof of parity)
The prior agent implemented baseline 13 v4 scenes plus 12 extension scene IDs, committed as:
- `1633c57` feature, `ce31557` tests, `3d461cb` QA reports, `9d8cd9f` load test report.
The 12 extension scene IDs in `FullShowScenes.tsx`:
`company-opening`, `grand-opening`, `representative-directory`, `phone-instructions`, `connection-readiness`, `round-one`, `story-progress`, `tie-break`, `story-assembly`, `story-live`, `round-two`, `grand-finale`.
Relevant files:
- `extensions/src/presentation/tadazz-v4/FullShowScenes.tsx` (484 lines observed)
- `extensions/src/presentation/tadazz-v4/full-show.css` (910 lines)
- `extensions/src/presentation/tadazz-v4/motion.ts` (951 lines)
- `extensions/src/presentation/tadazz-v4/components.tsx` (674 lines)
- `extensions/src/presentation/tadazz-v4/TadazzV4Stage.tsx`
- `extensions/src/presentation/tadazz-show/TadazzV4StageAdapter.tsx`
- `extensions/src/presentation/tadazz-show/show-director.ts` (596 lines)
- `extensions/src/presentation/tadazz-show/presentation-scene.ts`
- `packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx`
- `extensions/src/core/studio-timeline-schema.ts` (658 lines)
- `packages/e2e/tests/tadazz-full-show-parity.spec.ts` (**existing older E2E**, not automatically evidence for newly-added extension).
Previous local results report **450/450 extensions tests and 0 TypeScript errors**. This proves only those checks passed, not pixel fidelity, projector correctness or live phone concurrency.

## 4. P0: Make all scenes visually match primary reference
Implement and verify source-accurate behavior/visuals at minimum for the primary eight show beats and every extension:
1. Creating Worlds **company ident**: actual `creating-worlds-intro.png` holds approx. 2000ms, correct fading/shock, authentic logo. Distinguish it from **grand-opening** portal. Use true source assets.
2. **Representative directory**: full 40 table list, optional 10-table focus pages, original texts, actual roster + dial number, the joining table only lights up, smooth updates without remount.
3. **Phone instructions**: accurate device/keypad design, 3 actual instructions, animated step sequencing, real configured number (no fabricated default on live stage).
4. **Readiness**: 40 independent joined/not joined indicators, join glow, correct `N/40` status, persistent authoritative status; no fake `LIVE` label.
5. **Round one/two**: correct distinct banners, backgrounds, transition timing, live-ready stage.
6. **Voting/question/results**: original `TadazzStageKit` scenes, options, progress bars, winner highlights, cue order and durations, consistent with secondary extras.
7. **Tie-break**: two true top-tied candidates with equal votes, host choice in manager controls, projector presents neutral unresolved state then chosen/muted, one authoritative server-persisted decision; forbid automatic invented winner.
8. **Story progress/assembly/live**: five *real* winning cards **per round**, exact images, captions, roles, badges 01–05, captions below images, bridge, stage held during narrator/host—must never skip/fade prematurely. The two rounds must not mix: round 1 questions 1–5 versus round 2 questions 6–10.
9. **Finale**: exact original left/right transparent curtains, real branded logo, two Z wings, timing/cues, no missing image or visible fallback.
10. **Z-wipe and secondary-only v6 effects**: preserve all source effects, no legacy Razzia background flash, no black frame between scenes.
11. Full host-visible scene sequencing, manual replay/pause/skip/advance, correct screen ownership and activity state.

Do not substitute approximate graphics, generic gradients, newly generated art or text logo when the source contains an authentic image. Ensure opening/transition media paths load through local static server with no 404.

## 5. P0: Fix the three known live-card defects, with projector-specific evidence
The user specifically reported: **“captions under each card, as well as the number do not appear ... it could appear on host screen but not presenter ... progress bars missing when chosen answer is highlighted.”** Test the exact symptom; don't treat DOM existence as proof:
- For photo answers, ensure caption is legible **below** image, visible throughout question, voting, locked, selected and reveal results; support long captions, RTL/Hebrew and text-only cases. Avoid cropping / masking / opacity zero.
- 01–05 numbering must be overlaid and visible **on photo cards** as well as without image; consistent typography/z-index; no mixed up numbering after updates.
- Vote percentage values/counts and filled tracks appear at the right reveal phase and remain visible when an answer is highlighted, selected, lifted, winner/tied; correct values from server snapshot.
- Check CSS transform stacking, overflow clipping, z-index, opacity, animation fill mode, transitions and display scaling.
- Check `AnswerSlotV4`, `FivePictureAnswersV4`, `TadazzV4Motion.results`, `buildStageQuestion`, `computeShowScene`, scene director, host/spectator role and stage adapter.
- Screenshot and screen-record **manager and `/display` side by side for SAME gameId, same event, same timestamps**, and on actual iPad/WebKit viewport too. Confirm both display correct labels and bar values from authoritative server; repeat on reconnect and refresh.

## 6. P0: Real authoritative data, transitions and scene lifetime
- Trace full data path **DB/editor schema → timeline configs → socket/server authoritative snapshot → `ActiveSceneData.fullShow` / reveal data → `show-director` → adapter → React components → spectator**. Prove each field exists, survives serialization, is validated, and actually updates upon server events.
- Existing code merges `fullShowAuth` with authored config in `show-director.ts`, but merely declaring `PublicFullShowData` or `updateFullShowData(patch)` is NOT enough. Demonstrate real source and delivery of `connectedTables`, `representatives`, `dialNumber`, `tieResolvedIndex`, round-specific winners, percentages.
- Distinguish presentation-only demo preview from real `isLive` status. Assert no false live indicator or fake 40 connected.
- Tie decision: host controls, authorization, persistence and broadcast, retry/reconnect; test tie, multiway tie, no vote and delayed vote scenarios.
- 40-table directory and 50-load test are separate configurations. For Tzila, 40 representatives and ~10 questions; do not misstate 50 simulated users as real invited 40.
- Audit stage transitions in `show-director.ts` and `TadazzShowView.tsx`, especially `isCinematicScene`, `collapseForResume`, autoplay, scene reentrancy, and cards when next questions start; a scene may not be accidentally hidden by a later custom layer.
- Audit WAAPI/CSS lifecycle. Source timing in `motion.ts` currently uses `holdScene(durationMs)` and cue schedule for new scenes. Prove every CSS animation actually reaches its final frame, stays/advances as the source intends, and respects cancel/replay/reduced-motion/pause. **`story-live` should remain until explicit host advance**, not auto-complete just because a 900ms clock promise resolves.
- Avoid forceful remount on one table joining; use patch data and highlight the joining table only.
- Verify media cached/offline/failure fallbacks without regressions; use secure URL path validation.

## 7. P0: Browser visual QA, E2E, realistic gameplay
**Do not mark anything complete without evidence** saved in `docs/extensions/qa-evidence/tadazz-next-source-parity-20261106/`:
1. Browser load both extracted ORIGINAL HTML files via safe static local server. Capture complete source stage and navigation, 1920×1080 baseline, 1366×768, 1024×768, 800×600, iPad WebKit 1194×834, and phone 390×844 where relevant.
2. Capture the NEW native show at same timings and scenes, with 40 names, realistic images and actual state. Compare crops, fonts, colors, exact images, placements, effects, timings, winner conditions. Provide before/after images, side-by-side panels and motion video/webm for key transitions. No scrollbars on public projector.
3. Automated Playwright Chromium AND WebKit host + spectator; no console errors, no missing assets, no 404, no hydration errors, no React #300, no Lottie watermark or legacy flash.
4. End-to-end full 10-question show: open company ident; 40-person roster; number display; 40 join indications; question/voting/lock/reveal 1–5; tie-break and authorized choice; five winners story assembly/live hold; second round 6–10; repeated result bar QA; story assembly/live; finale curtain closure. Verify transitions, replay, back/skip, refresh, reconnect and restoration. No invented output when zero votes.
5. Regress normal quiz/survey, multi-select, 3/4/5 photo cards, text-only answers, image questions, long/hebrew captions, responsive projector and mobile phone; editor untouched unless necessary.
6. Distinguish unit/integration assertions from **actual browser pixels**. JSX snapshots and source manifests do not certify screen visibility.

## 8. Telephony, performance and risk gates (do not re-run costly provider calls)
- Existing load evidence folder `docs/extensions/qa-evidence/tadazz-phone-load50-20261106/` has results and scripts. Reported isolated Oracle server simulation: **50/50 concurrent socket clients, 500/500 accepted answers over 10 questions**; fake phone identities and gateway simulation. Validate provenance and methodology. There are **nine untracked original files** in this folder; review them for secrets and commit preserved safe evidence.
- This is **NOT** a 50-call PSTN carrier capacity test. A real inbound phone call with audio/DTMF 1–5 and provider concurrency (Yemot HaMashiach) remain unverified; document as external acceptance blockers. Do not claim physical phone readiness or initiate paid calls without permission.
- Avoid touching production game server, existing deployed quiz/media, credentials and account balances.
- Performance acceptance: no regressions compared with baseline; 40 concurrent representative state updates, 50 simulated socket users where isolated/staging available, server data consistent with presenter and audience state.
- Repeat a backend-only test in safe isolated environment only if needed and authorized for that host; no production writes.

## 9. Concrete checks and commands (adapt paths, fail visibly)
Begin:
```powershell
cd 'C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105'
git status --short
git branch --show-current
git log -1 --oneline
Get-FileHash 'C:\Users\DAVID\Downloads\tadazz_second_library_source_and_assets.zip' -Algorithm SHA256
Get-ChildItem 'packages\web\public\tadazz-show' -Recurse -File
```
Use trusted Python stdlib for ZIP listing/extraction and SHA checks; do NOT execute scripts from the archive. Mount/serve local HTML safely (do not route embedded code to production).
Check:
```powershell
pnpm --filter @razzia/extensions test
pnpm exec tsc --noEmit -p packages/web/tsconfig.json
pnpm exec prettier --check extensions/src/presentation/tadazz-v4 extensions/src/presentation/tadazz-show
pnpm test
pnpm --filter @razzia/e2e test
git diff --check
git status --short
```
Note: `pnpm test` / all E2E may be expensive—run targeted tests first, broader checks before final. Existing `packages/e2e/tests/tadazz-full-show-parity.spec.ts` predates latest source integration: **add/update tests for the new 12 scenes**. If commands fail due to environment, show exact error and clearly mark BLOCKED; do not falsely report PASS.

## 10. Explicit acceptance gates (ALL required)
| Gate | Must demonstrate | Failure if |
|---|---|---|
| SOURCE | Both raw HTMLs accessible/extracted, hashed, audited | Still marked source “missing” |
| ASSETS | Every 12 source assets hashed and mapped; no missing curtains/intro | 404/mismatch; fake replacement |
| PRIMARY PARITY | All primary show beats accurately compare visually and temporally | Only DOM tests or verbal claims |
| SECONDARY DELTA | Every secondary-only feature accounted for in matrix and implemented or justified | Unreviewed scene |
| ROLE PARITY | Host + display same real answer content, badge, percent, bar | Caption/number/bar hidden on projector |
| STAGE | All 12 extension + 13 baseline core scenes in real timeline | Only static demo |
| DATA | 40 roster, dial number, join updates, rounds, winners and tie from authoritative state | Fake/demo labels in live |
| FLOW | Full 10-question two-round rehearsal to curtain finale | Hanging or auto-skip |
| MOTION | Source-accurate timing, cue and frame, playable/replayable | WAAPI clock masks CSS divergence |
| TESTS | Unit+integration+Chromium/WebKit E2E, screenshot/video evidence | Merely `tsc` success |
| SECURITY | No unsafe ZIP handling, path traversal, auth bypass, secret exposure | Any breach |
| PRODUCTION | Absolutely unchanged; isolated commits only | Deployment or prod mutation |

If an external prerequisite (actual physical phone call/carrier 50 PSTN capacity) is not testable, classify it **EXTERNAL BLOCKER** separate from local software acceptance, never call it PASS.

## 11. Deliverables and what to write back
Commit source evidence and safe assets in TADAZZ Next; provide:
- `SOURCE_ASSET_AUDIT.json` with all 12 source ZIP asset hashes, source HTML hashes, compare-to-existing results and exact deployed URLs.
- A **per-scene + per-motion comparison spreadsheet/table** with primary/secondary source HTML method, native implementation, expected/actual timing, missing vs fixed and evidence IDs.
- `SOURCE_MATRIX.md`, `IMPLEMENTATION_REPORT.md`, `TEST_REPORT.md`, `VISUAL_PARITY_REPORT.md`, `SECURITY_REPORT.md`, `ROLLBACK_PLAN.md` and authentic screenshots/videos plus scriptable Playwright test runs.
- A **local preview** with instructions/URL and safe seeded local event. No production deploy.
- Git diff scope, commits, original HEAD remains `158c589`, latest TADAZZ Next HEAD, `git status --short`, hashes and test command outcomes.
- Distinguish DONE, PARTIAL, BLOCKED truthfully. Do not say “everything implemented exactly” if any visual cue/asset/dynamic behavior is missing.
- Do NOT finish only with an impressive report. Make the concrete code/asset/test corrections. Test everything. Only then deliver evidence and a concise factual summary.

## 12. Priority execution order — act now, no needless questions
**P0-A:** Inspect real ZIP, hash and extract raw HTML + 12 assets into isolated folder; resolve teaser mismatch; install exact missing curtain and Creating Worlds opener image paths. **P0-B:** Inventory source methods, motion/states, secondary-only delta, and record source screenshots. **P0-C:** Fix missing captions/numbers/result bars in host/projector and source fidelity of all show scenes. **P0-D:** Reconcile authoritative joins, tie decision, rounds and runtime timing. **P0-E:** Browser regression/E2E screenshots/videos + safe QA of 10-question show. **P1:** Review and check in existing untracked phone QA evidence after redaction checks. **P1:** Reports, final diff/branch/prod guard and acceptance verdict.

**The user's actual goal is a visually faithful, functioning show—not merely tests that pass. Continue until local work is complete or a truly external blocker is documented with evidence.**
