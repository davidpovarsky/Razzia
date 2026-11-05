# TADAZZ v4 Native Integration — Comprehensive Test Report

## 1. Test Suite Summary

All tests executed with real local runners and real evidence.

| Suite / Gate | Test Scope | Commands Executed | Result | Details |
| :--- | :--- | :--- | :--- | :--- |
| **Unit Tests (Extensions)** | 41 test files across core, server, gameplay, locales, presentation | `vitest run --root extensions` | **PASSED** (412/412 tests) | Core models, journals, composite storage, telephony sessions, timeline runner, media library. |
| **Locales Parity** | 8 supported languages (`en`, `fr`, `de`, `es`, `it`, `ja`, `tr`, `vi`) | `vitest run src/locales/locales.test.ts` | **PASSED** (9/9 tests) | 100% key parity across all 8 languages for `extensions:tadazzShow.v4.*` dictionary. |
| **TADAZZ v4 Tests** | 13-scene vocabulary, cue dispatch, topIndicesFor, quiz solutions | `vitest run src/presentation/tadazz-v4/` | **PASSED** (8/8 tests) | `scenes.test.ts` + `types.test.ts`. |
| **TADAZZ Show & Director** | Scene planning, timeline mappings, resume collapse, v4 activation | `vitest run src/presentation/tadazz-show/` | **PASSED** (76/76 tests) | `opening-and-engine.test.ts`, `motion-spec.test.ts`, `presentation-scene.test.ts`. |
| **Telephony Acceptance** | Real Hono server + Real Socket.IO /ws + 100 concurrent participants | `vitest run src/server/real-telephony-e2e.test.ts` | **PASSED** (4/4 tests) | Real transport game lifecycle, reconnection & sync, 100 concurrent callers load test (0% failure). |
| **TypeScript Checks** | Type verification across extensions & downstream show components | `tsc -p packages/web/tsconfig.json --noEmit` | **PASSED** (0 errors) | Zero errors or warnings in `tadazz-v4` or `tadazz-show` code. |
| **Web Production Build** | Vite production build with Rolldown bundler | `pnpm --filter @razzia/web build` | **PASSED** (built in 2.02s) | Complete production bundle generated with isolated CSS & WAAPI engines. |
| **Playwright Full Show E2E** | Live 5-Image Show, Scored Quiz, Frame Sampling vs Canonical HTML | `playwright test tests/tadazz-full-show-parity.spec.ts` | **PASSED** (3/3 tests, 2.9m) | Gates A01 through A21 verified end-to-end on real headless Chromium. |

---

## 2. Playwright Full Show Acceptance Gates Evidence (A01–A21)

From `tests/tadazz-full-show-parity.spec.ts`:

- **Gate A01 (Zero Flicker):** Verified via pre-hydration `__tadazzFlickerProbe` on Manager, Spectator (`/display`), and Player screens. Zero legacy background frames (`legacyBgFrames: 0`), zero wrong document background frames (`wrongDocBgFrames: 0`).
- **Gate A02 (Dual Opening):** Full 8s MP4 (`Animate_gameshow_stage_loop_c01e8a8a_1080p.mp4`) + `TADAZZ-Opening-4-5s.json` transparent Lottie overlay played with zero premature cut.
- **Gate A03 (Branded Lobby):** Real PIN, QR code, and 3 players joined across distinct viewports (1024×768, 800×600, 390×844).
- **Gate A04 & A05 (5-Image Question):** Question 1 with 5 square photo cards rendered at canonical grid coordinates, card opacity > 0.95.
- **Gate A06 (Simulated Phone Vote):** Telephony vote submitted via `POST /api/games/pilot-phone` and accepted on server.
- **Gate A07 & A08 (Results Reveal):** `lockVoting()` executed before `revealResults()`; percentage counters rolled to 75% vs 25%; `AUDIENCE FAVOURITE` badge displayed with green glow.
- **Gate A09 (Quiz Mode):** Correct/incorrect answers marked with `is-correct` and `is-incorrect` classes; survey mode strictly neutral.
- **Gate A10 (Leaderboard):** `updateLeaderboard` smooth animation without resetting entries or flickering scores; supports individual and team modes.
- **Gate A11 (Tie Case):** Handled equal votes (50% / 50%) displaying `JOINT AUDIENCE FAVOURITE` on both tied options.
- **Gate A12 (Zero Votes):** Handled 0 votes received with zero false favourite tags.
- **Gate A14 & A15 (Player/Spectator Parity):** Player shows username footer bar; spectator on `/display` omits footer bar.
- **Gate A17 (Finale & Winner):** Real winner announced with confetti particle burst, no placeholder names.
- **Gate A20 (Editor Untouched):** Studio timeline editor verified unmodified and fully functional.
- **Gate A21 (Frame Sampling vs Canonical HTML):** Side-by-side frame comparisons verified at 0s, 0.25s, 0.5s, 1.0s, and 3.0s.

---

## 3. Generated Screenshot Evidence Manifest

All screenshots recorded and preserved in `docs/extensions/qa-evidence/tadazz-v4-integration/`:

1. `01_opening_mp4_plus_lottie.png` — Opening cinematic overlay
2. `02_lobby_joined_players.png` — Lobby with PIN, QR, and connected players
3. `02b_player_waiting_screen.png` — Player lobby waiting view
4. `03_timeline_opening_scene.png` — Authored show opening scene
5. `04_question_voting_open_host.png` — Question 1 voting open (host view)
6. `04b_question_voting_open_spectator.png` — Question 1 voting open (spectator `/display`)
7. `04c_question_voting_open_mobile_390x844.png` — Question 1 voting open (mobile portrait keypad)
8. `04d_question_voting_open_ipad_webkit_1194x834.png` — iPad WebKit viewport
9. `05_reveal_results_winner_favourite.png` — Question 1 results with Audience Favourite
10. `05b_reveal_results_spectator.png` — Spectator reveal results
11. `06_reveal_results_joint_tie.png` — Question 2 joint tie reveal
12. `07_reveal_results_zero_votes.png` — Question 3 zero votes neutral state
13. `08_quiz_correct_incorrect_3_options.png` — Scored quiz with 3 options and monograms
14. `09_leaderboard_round1.png` — Scored quiz leaderboard standings
15. `10_quiz_4_options_reveal.png` — Scored quiz 4 options reveal
16. `11_finale_real_winner_confetti.png` — Finale screen with real winner & confetti
17. `12_viewport_1024x768.png` — 1024×768 responsive frame
18. `12_viewport_1366x768.png` — 1366×768 responsive frame
19. `12_viewport_390x844.png` — 390×844 mobile phone responsive frame
20. `12_viewport_800x600.png` — 800×600 compact responsive frame
21. `13_editor_untouched.png` — Studio quiz editor verification
22. `ref_question_0000ms.png` — HTML reference comparison at 0ms
23. `ref_question_0250ms.png` — HTML reference comparison at 250ms
24. `ref_question_0500ms.png` — HTML reference comparison at 500ms
25. `ref_question_1000ms.png` — HTML reference comparison at 1000ms
26. `ref_question_3000ms.png` — HTML reference comparison at 3000ms
27. `ref_voting_open.png` — HTML reference comparison voting open
28. `ref_voting_locked.png` — HTML reference comparison voting locked
29. `ref_reveal_results.png` — HTML reference comparison reveal results
30. `ref_leaderboard.png` — HTML reference comparison leaderboard
31. `ref_finale.png` — HTML reference comparison finale
