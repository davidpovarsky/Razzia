# Tzila: duplicate roster slides, soundtrack looping, answer-number cleanup

Date: 2026-11-07. Prepared locally from branch `agent/tadazz-next-20261105`.

## Completed source changes
- Removed the four per-ten-table `representative-directory` steps (`groupPage=0,1,2,3`) from `completeCreatingWorldsShow`. The original all-40 directory remains once, followed immediately by `phone-instructions`. New timeline length is 66 steps (was 70).
- Removed the small top-corner 01-05 badge in `AnswerSlotV4`. The large 01-05 number below each answer remains, as do percentage overlays and the winner label.
- AudioCuePlayer loops all configured background soundtrack slots except the deliberately time-limited 12-second `openingIntro`. Non-opening tracks ignore any legacy `maxDurationMs` cutoff.
- A manually previewed track is scoped to its current show stage, so it cannot remain stuck on `Opening Intro` during the next result/question/scene.

## Evidence
- Focused Vitest: 23/23 passed, followed by 7/7 after fixture isolation.
- Full extension regression: 485/485 tests passed across 48 files.
- `pnpm -C extensions exec tsc -b --pretty false`: exit 0.
- `pnpm build`: exit 0.
- Safe copy of the stored *local release candidate* was prepared by:
  `python scripts/patch-tzila-presentation-config.py --source work/successor-release-extras.json --output work/tzila-presentation-fixed-20261107.json`
  Verified original 70 steps, updated 66, preserved one full directory and openingIntro, set roundStart/finale loop true and removed their duration caps. Source was not modified.
- Updated `live-production-tzila.spec.ts` to expect a single directory (not the four extra pages); **not executed against production**.

## Production synchronization STILL REQUIRED
As inspected on 2026-11-07, the actual server container was `tadazz:p0-successor-20261106`. Logs indicated **one active room** (latest Remaining games: 1). Accordingly, no restart, container activation, production sidecar update or modification to the active room was performed.

To ship: first confirm there are no active real rooms or sockets; snapshot the current Docker image and the *current live* show sidecar/database; verify the current live show still matches expected, then apply the safe migration to a fresh copy of the current live sidecar (not blindly overwrite from the local candidate). Review a semantic diff (only four grouped scenes/timeline steps and audio loop flags). Deploy a built image from the committed source through the existing staged/rollback release path. Verify the original 40 representative names/IDs, 10 questions, all five picture answers, timer, voting track, TADAZZ soundtrack, corrected timeline and stage UI on https://tadazz.com. Abort/rollback on any mismatch. Do not replace unrelated tenant data.

**Changes were developed and tested locally, not verified live until the release gates above are completed.**
