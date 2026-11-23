# TADAZZ NEXT — MASTER AGENT IMPLEMENTATION & ACCEPTANCE PROMPT

**Status:** engineering handoff / execution brief; NOT an acceptance certificate.
**Prepared:** 2026-11-06 (Israel time).
**Primary brief:** complete and verify the real TADAZZ Creating Worlds show, matching **`second library.html`** first, retaining anything unique to **`animation library iwth thier logo.html`**, without modifying the stable game or live production.

## 0. YOU ARE THE IMPLEMENTING AGENT — DO THE WORK, NOT JUST A REVIEW

Act as a senior full-stack React/TypeScript motion engineer, QA automation engineer and production-safety lead. Audit, implement, integrate, exercise, photograph and report. Do not declare completion based on compile success or passing existing tests. Work autonomously within the specifically authorized **isolated development worktree only**. Do not request approval between ordinary local development steps. Production deployment, production data mutations, network load tests against live systems, and changes to the protected original require **explicit approval**; do not do them.

Keep all changes isolated. Before editing, check git branch/HEAD/working tree; never perform a destructive reset, checkout, cleanup, or delete. Write clear, small commits and a complete end-to-end verification report. Do not invent demo votes, participant names, phone numbers, winners or connected-state signals in actual game mode.

## 1. IMMUTABLE BASELINE AND VERIFIED WORKSPACE

Machine: connected authorized Windows/SentinelX device. Root:

`C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105`

Expected branch: **`agent/tadazz-next-20261105`**
Verified HEAD when this brief was written: **`ef4535a5ace4`** (`feat(tadazz-next): add isolated second-library full-show scenes`).

Protected original worktree:

`C:\Users\DAVID\Code\Razzia-worktrees\tadazz-full-show`

Original branch `agent/tadazz-full-show-20261105`; verified HEAD **`158c58967593...`**. **Do not change this worktree or any live deployment.** It has **untracked** `docs/extensions/orchestration/prompts/` and `tadazz-source-158c589.tar.gz`; do not touch or remove them. The isolated worktree was clean at inspection. The distinct existing `agent/tadazz-v4-design-kit-20261105` at `...\tadazz-v4-design-kit` is a *reference only*: earlier v4 integration work was cherry-picked into TADAZZ Next. Never overwrite it.

**PRODUCTION SAFETY:** `https://tadazz.com` must remain unaffected. Do not merge to production, push a deployment branch, change Oracle/Docker, alter DNS, or modify Chila/Tzila's saved quiz, uploaded media, users or telephony configurations. Use dedicated local/test ports, isolated fixture game IDs and mock telephony as default. No live 50-caller load test without explicit approval.

## 2. AUTHORITATIVE SOURCE OF TRUTH AND PRECISE SCOPE

**PRIMARY:** uploaded `second library.html` (actual file: 12,933,137 bytes; title *TADAZZ! × Creating Worlds — Complete Show Motion System*). This is the visual, compositional, easing, transition, asset and copy reference for this event. It includes the original `TadazzStageKit` v4 and a separate `TadazzFullShowKit` show-extension layer. Its demonstration controller is **not** backend/telephony logic. Read CSS, JS, and embedded `window.TADAZZ_ASSETS`; don't eyeball from screenshots alone.

**SECONDARY:** `animation library iwth thier logo.html` (3,533,424 bytes; title *TADAZZ • Survey Motion Kit v6*). Preserve additional behavior/coverage from this library that is not in primary. Their original stage-kit JavaScript is **byte-for-byte the same when stripped** (verified SHA-256: `73c2a18991d73f981c0427d906936f1e9844e8e7ce3ee105f3502f879d9e10a9`). Do not implement or import the old engine twice.

The two attached HTML reference files exist in the ChatGPT conversation artifacts. **They have NOT been verified as copied into the Windows worktree.** First locate a legitimate local copy or safely transfer them under `docs/extensions/references/user-20261106/` and confirm SHA256 and file sizes; the existing `docs/extensions/references/tadazz-v4/animation-library-set-v4.html` is an older *v4* baseline, **not** the primary "second library". If the source files are unavailable to an autonomous agent, stop claims of pixel parity, record the blocker and request their upload — do not substitute the older HTML.

Primary's **demonstration navigation** lists 8 beats, which must be reproduced in event show order: (1) `company-opening`, (2) `representative-directory`, (3) `tie-break`, (4) `story-assembly`, (5) second-round `survey-results`, (6) second-round `story-assembly`, (7) `grand-finale`, (8) `z-wipe`. The `TadazzFullShowKit` class additionally supports `grand-opening`, `phone-instructions`, `connection-readiness`, `round-one`, `story-progress`, `story-live`, `round-two`, and updates to connected tables and dial number. Include all supported scenes as real selectable/evaluable show actions, without forcing optional scenes into the primary 8-beat sequence. The secondary/original v4 13-scene vocabulary is: `question`, `picture-answers`, `voting-open`, `countdown`, `vote-locked`, `chosen`, `survey-results`, `top-pick`, `question-image`, `leaderboard`, `round-recap`, `interlude`, `z-wipe`.

Important user instructions from this thread: card captions **below each photo**, the visible card **number**, and **progress/percentage bars on winner reveal** must be displayed on both host and presenter/projector screens; do not regress these while integrating full-show scenes. Preserve the current Goldy brand rather than old Razzia flashes. The public stage must **never scroll, crop critical content, or show old legacy screens**.

## 3. WHAT WAS VERIFIED — DO NOT MISTAKE IT FOR COMPLETION

- The new isolated branch already imports three known v4 commits and includes 13 original React/WAAPI stage scenes, plus new `FullShowScenes.tsx` and `full-show.css` showing 12 proposed full-show scenes (25 identifiers total).
- Current `show-director.ts` recognizes some `animation` presets with `isFullShowScene`, and `TadazzV4StageAdapter.tsx` dispatches `showFullShowScene` to `v4Ref.current.play(...)`. Types compile.
- **40 focused unit tests passed** (8 `types.test.ts`, 2 `scenes.test.ts`, 30 `presentation-scene.test.ts`) and `pnpm exec tsc --noEmit -p packages/web/tsconfig.json` passed in the previous run. These are not visual/functional integration tests of the new twelve scenes. There is **no dedicated new full-show parity E2E test** yet. The preexisting E2E screenshots and tests evidence the earlier *v4* implementation, not the newly authored full-show extensions.
- Existing repository includes `packages/e2e/tests/tadazz-full-show-parity.spec.ts`, `docs/extensions/qa-evidence/tadazz-v4-integration/`, a `TEST_REPORT.md` and `PARITY_REPORT.md`. Treat their previous claims as historical; produce fresh evidence for new HEAD.
- Source references, actual data wiring, visual parity, host/projector synchronization, camera/layout scaling, and production readiness were **not established**. Do not present them as done.

## 4. CRITICAL DEFECTS OBSERVED IN CURRENT IMPLEMENTATION

**P0 — Not canonical and missing assets.** `extensions/src/presentation/tadazz-v4/FullShowScenes.tsx` is a simplified reconstruction and `full-show.css` is authored approximation, NOT a proven pixel/timing match to the supplied full-show reference. It renders text for logos instead of the canonical image in several scenes; `company-opening` falls back to a gradient and does not use `assets/creating-worlds-intro.png` unless a custom URL is supplied; `grand-finale` substitutes a CSS curtain and oversized Z glyphs for the source's actual left/right curtain PNGs, lighting arcs, zigzag paths and particles; other effects/cues are missing. Actual primary embedded assets include:

`assets/curtain-left.png`, `assets/curtain-right.png`, `assets/teaser-screen.jpg`, `assets/question-bg.webp`, `assets/creating-worlds-intro.png`, `assets/tadazz-brand-logo.png`, `assets/show-stage.webp`, and five card SVG assets (`dog.svg`, `lamplighter.svg`, `shadchan.svg`, `pirate.svg`, `therapist.svg`). The new worktree's `packages/web/public/tadazz-show/v4/` currently has question/show backdrops, logo, and five card SVGs but **not** `curtain-left.png`, `curtain-right.png`, `creating-worlds-intro.png`, or `teaser-screen.jpg`. Extract from authorized embedded assets and add under versioned public path, without renaming or recompressing without QA. Create a manifest with expected SHA256/dimensions and assert all render as HTTP 200.

**P0 — Timeline schema silently drops desired data.** `extensions/src/core/studio-timeline-schema.ts` has `animationSceneSchema = z.strictObject(...)` with only `preset`, `title`, `durationMs`, `advance`, Lottie and appearance fields. New `show-director.ts` pretends the scene descriptor has `representatives`, `dialNumber`, `connectedTables`, `winners`, `contestants`, `voteCount`, `resolvedIndex`, `round`, `completed` and image URLs, but those fields **aren't in the persisted scene schema**. Do not just cast TypeScript: properly extend validated schema/serialization/API/editor or read authoritative `activeSceneData` and current game state through secure, existing typed transports. Check independent host and spectator payloads. Never leak private vote/leaderboard info earlier than reveal.

**P0 — 'Live' readiness is fake.** `show-director.ts` currently passes `isLive:false`, so the connected table screen labels actual use as preview. `FullShowScenes.tsx` derives connected indicators entirely from supplied `connectedTables` which are not wired to active telephony/socket state. Build authoritative 40-table representative model, server-side counts by table ID, redraw only transitions, reconcile redial/hangup/rejoin and late updates. Avoid marking 40 boxes green merely because people are in the room; define exactly what 'connected' means for telephony. Page 0=all 40, pages 1–4=10 table focus if user uses those views. The primary source has `updateConnectedTables()` with a **790ms new-join pulse**, and `updateDialNumber()`. Add React props/state patching that does not remount/replay the scene for each connection update. Test on public `/display` separately from host.

**P0 — Animation promises resolve too early.** `extensions/src/presentation/tadazz-v4/motion.ts` just `break`s for all 12 full-show scenes, leaving CSS animations unmanaged. `TadazzV4Motion.play` waits on `Promise.allSettled(this.active.map(a => a.finished))` — empty for those scenes; `showFullShowScene` can resolve immediately, permitting next stage to stomp an ongoing 3–9 second animation. Implement scene animation orchestration via WAAPI/finite choreography and completion/hold/cancel semantics. Check `show-director`'s step execution, scene `durationMs`, auto/manual advance, `collapseForResume`, `wipe-covered` cue, reconnect/skip/pause/resume, and no stale callbacks. Time-based demo frames should be deterministic and genuinely visually comparable.

**P0 — Visual bugs from user's latest game.** In `extensions/src/presentation/tadazz-v4/components.tsx` and data mapping (not only CSS), ensure caption exists for every image option, with explicit fallback if data legitimately has a nonempty choice label; a visible 01–05 badge below/at each card without hiding photos; results show correct authoritative counts and animated fill/percentage; winner/tag/outline must not obscure or hide the corresponding progress track. Test manager, spectator projector, and private player independently. Investigate missing labels due to answerVisual/label mapping, blank data, layout clipping, state change, race, and CSS `opacity/visibility/overflow`; instrument DOM and compare actual persisted game data. Verify again after replay, refresh and reconnect. Don't invent text if source data truly lacks a caption: report missing authoring and provide validation warnings.

**P1 — Missing source parity.** Existing `FullShowScenes.tsx` creates its own `phone-instructions`, 40-box readiness, story, tie and finale arrangements. Audit against source DOM/classes/CSS/keyframes and original `TadazzFullShowKit` JS. The source `representative-directory` supports groupPage 0–3 (10 names each) and real-time join highlights; current new directory displays all 40 and lacks group focus. The source tie reveals two candidates and server/host-driven resolution; there is no real host tie-break command in this new UI. Source story progress, assembly and story-live must use actual 5 selected winners over rounds, not an empty/default `Choice N` card. Missing winners must show an explicit empty/awaiting state and must never silently substitute demo character images.

**P1 — Real timing/cue parity.** Source-specific checkpoints to reproduce (inspect complete source, not only these notes): `company-opening` holds Creating Worlds artwork for **exactly 2000ms**, crossfade timeline 2850ms, Tadazz image enter delayed 1960ms for 980ms, `company-ident` cue at 0, `tadazz-welcome` at 2070ms. `grand-opening` cues `opening-portal` 1600ms and `opening-logo` 2650ms. Directory rows: staggered 650ms. `tie-break`: two cards ~1260ms entrance, equality ~940ms from 720ms, `tie-unresolved` at 1510ms or `tie-resolved` at 1810ms, never autoplay resolution. `story-assembly`: cards ~1280ms staggered 195ms starting at 280ms; ribbon 1640ms starting 930ms; story caption 1210ms starting at 1830ms; `story-assembled` cue at 2400ms. `story-live-hold` cue at 900ms; maintain the composited five cards until explicit next step. `grand-finale` should hold its ~9200ms full dramatic sequence; `finale-impact` cue at 3920ms; actual curtain PNGs move closed at delay 6500ms over 2180ms; `curtains-closed` cue at 8680ms. Original survey results bar duration 1070ms and progressive reveal; Z-wipe uses `wipe-covered` at 720ms. All should respect reduced-motion and proper skip-to-end.

**P1 — Bugs/performance/UX.** Current `FullShowScenes.tsx` has hardcoded English labels, no real groupPage, no per-show customization for all copy, and accepts arbitrary `eventArtworkUrl` and curtain URLs without verified safe-media validation. Add proper localization, safe asset URLs, browser-appropriate Lottie/MP4 checks, accessibility, RTL handling if Hebrew event copy exists, responsive 1920x1080 fixed-stage compositor with no vertical scroll on projector/iPad/desktop. Avoid scroll, overflow, stretched cards, blurry backgrounds, wrong aspect ratio or disappearing captions.

## 5. REQUIRED IMPLEMENTATION PHASES — DO THEM IN ORDER

### Phase A — Freeze and extract ground truth

1. Verify authorized Windows machine, correct worktree, branch, expected commit, clean status. If HEAD changed, inspect difference and rebase work *safely*, no blind reset. Record source asset hashes and Git HEAD.
2. Get actual two uploaded HTML files; parse CSS & JS programmatically with a browser/DOM tool (BeautifulSoup/Node parsing if useful), extract embedded images to versioned assets without transcoding, record dimensions/hashes and map each relative URL. Verify matching original `TadazzStageKit` script and classify all unique additions in second library.
3. Produce `docs/extensions/qa-evidence/tadazz-next-20261106/SOURCE_MATRIX.md` with **every** 8-beat show step, each extra full-show API action, each 13-scene v4 action, source method/class, expected duration/cue/asset/copy, implementing React component, data source, host visibility, spectator visibility, and status (pass/fail/blocked).
4. Render the original `second library.html` in Playwright/Chromium. Capture `0ms, 250ms, 500ms, 1000ms, 2000ms, 3000ms, final` for relevant scene animations, and all eight show beats. Control fixed viewport and animation clock; export PNGs / optional frame sequence. Avoid judging mere existence of classes as parity.

### Phase B — Match stage compositions and choreography

5. Replace approximate/new CSS/React scene implementations with faithful **native** React+TypeScript+Web Animations API (WAAPI) components; no runtime iframe, injection of standalone HTML, static screenshot trick, or invented replacement graphics. Reuse existing `TadazzV4Stage`, stage adapter, motion utilities and authentic assets. Keep backdrop/overlay architecture isolated from old Razzia.
6. Preserve complete canonical visual details: logo image/brand artwork, 40 table columns/focus, actual neon palette, 5 image cards and role labels, caption placement, 01–05 numbers, result percentage bar + winner highlighting, confetti/lighting/curtains, Z transition, teaser and properly timed crossfade. Respect source 1920×1080 grid and scale as a unit.
7. Implement deterministic managed animations with cue events, correct completion promises, cancellation, skip, pause, resume, reduced motion, progress updates and persistent story-live mode. Extend motion spec with full-show timing/cues (do NOT change original v4 spec except additive entries). No premature advancement.
8. Add snapshot/perceptual-diff visual comparisons; specify threshold and document intentional divergences. Verify logo, typography, card proportions, clipping and background at multiple timestamps, not just scene start/end.

### Phase C — Wire actual game data and control surface

9. Map all new scene inputs from **validated, authoritative backend and editor data**, not type assertions on nonexistent fields. Update schema, serializers, game routes and editable scene configuration where appropriate. Identify whether number, representatives, table IDs and connected presence are sourced from host configuration, roster/telephony or Socket.IO. Maintain tenant isolation and auth.
10. Add official show steps to the editor/timeline picker with human-readable names, previews and repeat/reorder, so the host can author/select scenes. If a 'company opening' is configured for an event, show the configured **Creating Worlds** image for exactly 2 sec; generic TADAZZ events use their own configured artwork. Preserve MP4/Lottie opening and fallback logic, never lose previously uploaded media.
11. Wire **40 representatives**, group 1–4 directory filtering, real phone number, live join lights, reconnect and delayed hangup, with proper rehearsal/demo mode visibly labeled only in previews. Honor existing secure telephone identity binding; don't use client-claimed table number to grant connected state. Redial must not create duplicate participants or stale lights.
12. Tie resolution requires deliberate host choice and authoritative single update. No phantom vote changes, no tie automatically considered resolved, host action reflected on projector exactly once. Test zero-vote, multiway tie and no-resolution states. Do not leak private selections to public displays before reveal.
13. For each of the two 5-question story rounds, ensure the five selected story pieces are real question winners, retain image+caption+role+round, support tie resolution, continue to storytelling hold, then start second story with a distinct reset. Finale only at explicit show step. Connect actual survey percentages and counts from server.
14. Ensure the manager/operator can see/use host controls without leaking manager-only UI onto projector; `/display` is a clean show surface. Player touch/call interaction remains correct and distinct.

### Phase D — Prove real end-to-end acceptance

15. **Unit tests**: new source-matrix spec; parsed scene table, asset integrity, all cues and timings; caption+number+result bars, winner/tie/zero-vote, group pagination, 40 connected states, dynamic updates without rerender, 2 story-round state, valid/invalid schema, reconnect/resume and cancellation. Assertions must fail without the intended features; avoid simply testing array length.
16. **Integration tests**: use simulated server/socket/telephone provider with 40 simultaneous **test** representatives; can safely test 50 concurrent simulated participants against a **local isolated server** to check 40 cap/extras/no corruption, but do not run a production load test. Verify separate host and spectator live state, no unintended duplicate votes, late hangup, redial, host manual tie selection and scoreboard. Snapshot actual server game state, not hardcoded data.
17. **E2E Playwright**: run full 8-beat canonical flow + extra optional scenes; Chromium desktop, WebKit/iPad, projector 1920×1080, laptop 1366×768, tablets 1024×768 / 800×600, mobile 390×844. Before/after screenshot at each key cue; verify DOM visibility and bbox for captions and numbers, track width matches percent, winning card remains visible, all images loaded, no clipped off-screen text, no vertical scrolling, no obsolete Razzia flashes; host and spectator show the **same public truth**.
18. **Stability**: show mid-reveal refresh, WebSocket disconnect/reconnect, second skip, repeated transition, rapid question switch, multiple times voting open/lock/reveal, custom Lottie/MP4 fallback, missing asset, slow image load, reduced motion, 0 votes, two tied answers, leaderboards, second round, final curtains. Check console errors, React errors, memory/WAAPI leaks and unhandled rejections.
19. **Build**: run `pnpm exec tsc --noEmit -p packages/web/tsconfig.json`, `pnpm --filter @razzia/extensions test -- src/presentation/tadazz-v4/types.test.ts src/presentation/tadazz-v4/scenes.test.ts src/presentation/tadazz-show/presentation-scene.test.ts`, all relevant extension tests, `pnpm build`, full web/socket/common unit suites and `pnpm --filter @razzia/e2e test -- tadazz-full-show-parity.spec.ts` after confirming actual supported E2E CLI and local test server. Record exact commands and exit codes. `git diff --check` must be clean. Do not claim tests run unless actually executed.
20. **Visual QA**: save comparison screenshots and computed difference diagnostics in `docs/extensions/qa-evidence/tadazz-next-20261106/` with `REFERENCE` and `IMPLEMENTED` for all scenes and cue timestamps; write scene-by-scene PASS/FAIL, blockers, browser/device, date, commit and source hashes. A human must be able to inspect the images.

## 6. PRECISE ACCEPTANCE CHECKLIST (ALL REQUIRED)

- [ ] All authentic source assets present, hashed, load correctly; no substitute curtains/logo/artwork.
- [ ] Primary 8 demo beats and additional supported source scenes precisely implemented, repeatable and editor-selectable.
- [ ] 13 original animations remain intact; no regressions in original cards, time ring, locked state, leaderboard, interlude, Z wipe.
- [ ] Two-second Creating Worlds artwork hold; full-show source timings and cues consistent to the frame/tolerance documented.
- [ ] Manager, spectator/projector and player each render intended UI; never reveal private data early.
- [ ] Every image card displays caption AND option number; winning highlight preserves full progress bar and percentage.
- [ ] Stage never scrolls vertically, clips captions or displays old Razzia background at any moment.
- [ ] 40-table directory, 10-table focused pages, dial number and join-lights reflect authorized **real** state.
- [ ] Tie resolution requires and records host decision, synchronizes to projector, produces correct story choice.
- [ ] Both rounds display five actual selected images/captions in order; story-live cards remain until explicit advance.
- [ ] Full finale lighting and authentic curtains close at correct cue; no stuck overlay after switch.
- [ ] Reconnect, skip, replay, pause/resume, rapid scene switching and reduced-motion pass.
- [ ] Browser E2E/visual checks run with preserved screenshots and quantitative scene matrix.
- [ ] All tests/build green, Git worktree clean, commit hash reported; original branch untouched, tadazz.com untouched.

## 7. EXPECTED DELIVERABLES

A. **Working isolated code** on `agent/tadazz-next-20261105` — do not deploy.
B. Source assets placed under `packages/web/public/tadazz-show/second-library/` (or a documented versioned alternative), an asset manifest and a deterministic source hash record.
C. New robust tests at `extensions/src/presentation/tadazz-v4/` and `packages/e2e/tests/`, with meaningful negative assertions.
D. `docs/extensions/qa-evidence/tadazz-next-20261106/SOURCE_MATRIX.md`, `IMPLEMENTATION_REPORT.md`, `TEST_REPORT.md`, `VISUAL_PARITY_REPORT.md`, `ROLLBACK_PLAN.md` plus all timestamped evidence images.
E. A **local preview address** (or safe QA-only staging URL after separately authorized staging action), with working sample event and scene controls, so Goldy can inspect visual details before production.
F. Closing summary: commit(s), changed files, what is visibly identical, what deliberately differs, data source for every scene, number of passed/failed tests, remaining issues and explicit **NOT DEPLOYED** status.

## 8. ACTUAL PROJECT PATH MAP

- `extensions/src/presentation/tadazz-v4/FullShowScenes.tsx`: **current approximate 12-scene React views**; replace/harden.
- `extensions/src/presentation/tadazz-v4/full-show.css`: **current approximate CSS choreography**; verify vs canonical.
- `extensions/src/presentation/tadazz-v4/TadazzV4Stage.tsx`: compositor, scene lifecycle, resize, render.
- `extensions/src/presentation/tadazz-v4/components.tsx`: answer cards/captions/number/progress.
- `extensions/src/presentation/tadazz-v4/motion.ts`: WAAPI engine, timings, cue emission, promise completion.
- `extensions/src/presentation/tadazz-v4/types.ts`: 25 scene IDs/data/labels; add validated full-show contracts.
- `extensions/src/presentation/tadazz-v4/motion-spec-v4.json`: original 13-scene motion reference.
- `extensions/src/presentation/tadazz-show/TadazzV4StageAdapter.tsx`: stage public API, scene playback.
- `extensions/src/presentation/tadazz-show/TadazzStage.tsx`: shared handle and original show components.
- `extensions/src/presentation/tadazz-show/show-director.ts`: maps authoritative scene to motion steps. Currently `isLive:false` for custom scenes; do not carry fake status into production.
- `extensions/src/presentation/tadazz-show/presentation-scene.ts`: extracts real game state/answer visuals and scenes.
- `extensions/src/core/studio-timeline-schema.ts`: validated persisted scene schema, missing new fields.
- `packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx`: host/player/spectator roles, scene planner, reconnect/skip and data bindings.
- `packages/web/public/tadazz-show/v4/`: existing v4 assets; partial primary show assets missing.
- `packages/e2e/tests/tadazz-full-show-parity.spec.ts`: older full-show E2E baseline, expand it.
- `docs/extensions/references/tadazz-v4/`: previous v4 library **not equivalent** to the user's `second library.html`.

## 9. EXECUTION RULES / NON-NEGOTIABLE QUALITY BAR

- Work from the canonical file, **not** from visually similar guesses.
- Instrument and verify real state paths; screenshots alone cannot prove live data wiring, tests alone cannot prove visual parity.
- Preserve all existing gameplay and uploaded media; do not mutate production.
- Never silently fall back to hard-coded sample characters, voters, tables, correct answers, phone numbers or participants in live mode.
- For unsafe or missing external access (telephony provider/server), implement isolated mocks and clearly record what remains unverified; do not claim live success.
- Use source-specific timing and video-frame comparisons; all missing source methods/assets receive explicit issue entries.
- No vague assurances: every asserted PASS must link to a concrete test/screenshot/log and exact Git HEAD.
- Finish the work and document it; do not stop at a planning document or a test count.

**BEGIN NOW:** verify branch/worktree, acquire the real primary and secondary HTML source, extract asset manifest and full source-to-code gap matrix, then implement in isolated commits, run QA, and report with evidence. Do not push to or deploy tadazz.com.