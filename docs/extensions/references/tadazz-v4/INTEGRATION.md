# Project installation map — TADAZZ v4

Base: branch `agent/tadazz-full-show-20261105`, commit `158c589`.

| Kit path | Destination within Razzia repo |
| --- | --- |
| `src/*.ts*`, `src/*.css` | `extensions/src/presentation/tadazz-v4/` |
| `assets/tadazz-brand-logo.png`, `assets/*.webp`, `assets/cards/*.svg` | `packages/web/public/tadazz-show/v4/` |
| `reference/*`, `assets-manifest.json`, `design-tokens.json` | `docs/extensions/references/tadazz-v4/` (retain old source too) |
| `qa/` | `docs/extensions/qa-evidence/tadazz-v4/` |

No live game is modified by adding the files to the project. `extensions/src/presentation/tadazz-v4/index.ts` exports every component and the stage ref API. To expose through a barrel, add `export * from "./tadazz-v4"` in `extensions/src/presentation/index.ts`, subject to build verification.

### Host adapter contract

- Current screen `SHOW_QUESTION` -> `question`
- `SELECT_ANSWER` picture answers -> `picture-answers`, then optionally `voting-open` or `countdown`.
- voting closed -> `vote-locked`; do not publish a private player's selected index on public `/display`.
- `SHOW_RESPONSES` with `revealDistribution` -> `survey-results`; optionally `top-pick` with server `winnerIndices` (only a unique winner).
- `SHOW_LEADERBOARD` -> `leaderboard`, real team names/scores.
- `answerRecap` timeline -> `round-recap`, use five *actual* selected winners in chronological order, never sample cards.
- `transition` -> `z-wipe` or `interlude` using timed completion.
- Question with question image and 4 textual choices -> `question-image` (if the actual question uses that layout).
- Other cinematic/media/card-specific scenes continue through the existing `CinematicLayerStack`/`TadazzOpening`; don't replace them.
- Authored backgrounds remain higher priority than the v4 defaults.
- v4 props/labels support localization. All scene numbers, answers, images, percentages, times and rankings come from live state.

### Expected visual pixel values

Full 1920x1080. Question frame 171px at Y=137px. Cards top=353px; five equal grid columns, 19px gap; card height 462px, radius 32px; index numeral 60px. Round pill top=61px/right=94px. Floating timer left=1694px, top=154px, diameter 181px. Scene question background `question-bg.webp`; stage background `show-stage.webp`. Animation springs and 55/22 particles are in `motion.ts`.

### Integration gates

1. Confirm source checksum and eight extracted binary hashes.
2. Build extension TypeScript with no changes to legacy code and editor.
3. Compare native React renders against reference snapshots at several timestamps.
4. Test surveys (multi-select/ties/no votes) and scored quizzes (no extra right/wrong badges in survey).
5. Verify MP4+Lottie opener, audio, telephony, scene advance, `/display` parity, host skip, no legacy flash.
6. Only after approval merge/deploy. Preserve original v1 files and rollback branch.
