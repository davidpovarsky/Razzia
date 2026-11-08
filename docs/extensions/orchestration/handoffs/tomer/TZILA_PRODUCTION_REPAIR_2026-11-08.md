# Tzila repair — single-session successor, 2026-11-08

User explicitly requested continuing both handoffs in one agent, choosing the newer scope, repairing production, committing and pushing. No delegated work. Worktree `agent/tadazz-next-20261105`; inherited uncommitted fixes preserved.

## Source and data

Validated the owner-supplied workbook against the staged Oracle payload: SHA-256 `814beb0f94813eb5250ae1fb7c9dfe2d625b475673759c7739a5a81b77aad6aa`. All 37 source records match; 31 distinct tables; no duplicate names, duplicate normalized phones, or missing values. Source row 23/table 19 has a nonstandard phone length: original retained, normalized value retained without guessing a correction, `phoneNeedsReview=true`. No personal contacts or workbook are committed.

`tableNumber` and `phoneNeedsReview` are backward-compatible optional roster fields, validated and propagated into the host's private presence state. Public show envelopes include names/table assignments/connected tables and exclude personal phones. Shared tables group both names and illuminate once. Replacement removes omitted pre-registrations; browser duplicates cannot append another row or take over a connected representative.

Prepared sidecar revision 8 from live revision 7. Removes exactly 10 story-progress, 2 story-assembly, 2 story-live, 1 interlude timeline occurrences: 51 -> 36 steps. All 10 top-pick and 2 round-recap items remain. Question IDs, question data, answer/media associations, base digest and soundtrack are preserved. Z-wipe auto-advances after its existing animation; future Creating Worlds generation uses the same reduced sequence. Historical preset support remains available to other shows.

## Runtime fixes

- Detect Creating Worlds without depending on story-progress.
- Server-owned 4-second entrance preparation, then a complete configured voting window; finite Creating Worlds votes do not close early merely because everyone answered. Legacy quizzes keep their behavior.
- Optional server opening/deadline timestamps; authenticated RTT clock sampling converts them to browser time. Pause/resume shifts authoritative timing; reconnect gets the current window; stale async work is cancelled on skip/replay.
- V4 countdown uses real WAAPI seconds regardless of reduced motion; data patches retime the clock without replaying entrance. Stable voting identity prevents cooldown/status renders from restarting choreography. A visible zero frame precedes result replacement.
- Round recaps retain five positions for zero-vote, skipped and tied questions. Zero votes do not trigger a tie. Host tie resolution survives top-pick and recap.
- Skip preserves round-recap/finale boundaries. Restart/Previous restore both the round state and authored timeline cursor, and clear obsolete tie choices.
- Correct CSS class concatenation using arrays; preserve the inherited opening sequence, manager branding, presentation resize/re-fit and late lobby fixes.
- Repeated fullscreen exit/re-entry exposed a native fullscreen race: restored toolbar could appear before the old exit completed, then cancel a fresh entry. `useHostPresentation` now serializes re-entry after the native exit event. This final frontend-only refinement retains the already-tested socket bundle and gameplay stage; targeted fullscreen/viewports/navigation are rerun on v6.

Upstream touch ledger was recorded in `TZILA_PRODUCTION_REPAIR_2026-11-07.md` before edits. Changes are narrow server/common timing and roster hooks plus the opt-in TADAZZ view, existing manager branding, and tests.

## Actual checks

- Root Vitest: 334/334 PASS. Extensions: 491/491 PASS. Focused coordinator regression: 13/13 PASS.
- Web/socket/extensions TypeScript: PASS. Web and socket production builds: PASS. Diff whitespace check: PASS.
- Full 10-question real-browser run: PASS twice across candidate iterations; final candidate includes restart cursor repair. Host, projector, 4 browser representatives, real images, exact percentages, Q2 tie resolution, 2 five-position recaps and grand finale checked. No page exceptions.
- Full countdown sampled every animation frame: all 21 values 20..00 in order. Final measured 19->00 interval 19,084ms; observed initial 20->00 20,623ms includes the clock entrance/hold. Server acceptance interval is exactly 20,000ms. Timestamp evidence saved with the browser run.
- Real-roster API/socket verification: 37/37 exact phone and table matches, 31 connected tables, reconnect to the same identity, stale hangup ignored, unknown rejected, missing secret 401, no public phone leaks.
- Repaired Creating Worlds 50x10 test: 500/500 acknowledgements, 0 valid answers rejected; every round's distribution exactly matches 50 submissions to its expected answer. Duplicate, stale call, stale epoch and invalid index rejected. Final run p50 361.96ms, p95 873.33ms, p99 913.46ms, max 920.53ms.
- Manager/auth 7 cases, release media/opening smoke, host presentation, keyboard/navigation/refresh, pause during preparation and active voting, zero-vote/no-tie, skipped round recap, and 6 viewport sizes (two passes): PASS in candidate checks; final regression rerun recorded separately in work logs.
- Final v6 fullscreen verification: 4/4 viewport repetitions PASS (24 fullscreen entries covering all six sizes), plus host presentation and extended pause/restart/zero-vote/skipped-recap browser checks 2/2 PASS. Web/socket/extensions/E2E TypeScript checks PASS. The web change after v5 is limited to serializing native fullscreen exit/re-entry; the socket bundle and 500-answer/full-game verification are unchanged.
- Broad repository lint is NOT green: existing violations span reference JavaScript and legacy code. New importer and focused repair test pass their lint check. No unrelated bulk lint repair was made.
- The earlier Python polling-only load harness stalled at question 8; it is not counted as passing. Replaced for this verification by a real socket.io-client harness driving the repaired authored flow and checking every acknowledgement/distribution. The first harness redial attempted polling with an already-bound roster ID; corrected to the gateway's actual new-call join protocol before the passing 500-answer run.

## Release / evidence

Final candidate image: `tadazz:repair-20261108-v6`, SHA `c6b6ee9e4a61dd3b215cb0d3621fada5346168c5d8343d31d800972ffc172909`. It is isolated on Oracle localhost port 3275 through SSH localhost 4263. Its socket bundle is byte-identical to the v5 full-game/load-tested build (SHA `1b652dc783d5596d04d6db60a84d262e880dd532459fc0c4cd94d330b01212d4`). No provider settings or gateway deployment changed.

Production backup completed before activation: `/home/ubuntu/tadazz-repair-20261108/production-backup`, including actual live image `1ffc9627b69d...`, full config, online SQLite backup with integrity `ok`, base quiz and sidecar revision 7. Config archive SHA `e5d0b70fe5470ac27246ea1366420d21736cf4ba370cb599c691ff83f8d1e9fd`; image archive SHA `117e4438c7be23eb77e4393842794b6d160c813b9a0ca573174e32ae3014eaeb`.

Activation script verifies current image/base/sidecar against the backup, checks no recent production connections, uses the exact tested image, injects the existing gateway secret without logging it, and rolls back on failed health/security checks. One-command rollback restores the old image and compatible Tzila sidecar while retaining the pilot secret protection and other tenant data. Full config/SQLite backups are available separately; rollback does not overwrite unrelated tenant data.

Evidence (private work directory, not committed):

- `work/tzila-roster-validation-20261108.json`
- `work/takeover-root-tests-final.log`, `work/takeover-extension-tests-final.log`
- `work/takeover-full-game-v5-results/` (screenshots, video, countdown-timestamps.json)
- `work/takeover-zero-skip-pause-v5-results/`
- `work/takeover-critical-v5-results/`, `work/takeover-viewport-v5-results/`
- `work/takeover-viewport-v6-results/`, `work/takeover-fullscreen-v6-results/` for the final fullscreen refinement. One v5 viewport repeat failed and is explicitly superseded by these targeted checks.
- `work/takeover-real-roster-v4.json`, `work/takeover-repaired-load50-v4.json` (repeated against final candidate in `takeover-repaired-load50-v5.log`)
- `work/production-repair-20261108-evidence/` for subsequent public production verification.

Production activation/public verification results and the immutable release commit are reported after activation. A physical PSTN call has not been made and is not claimed.

## Owner-directed urgent routing update (after verified release)

Owner explicitly requested immediate deployment without tests: homepage opens manager login and restores saved manager session; move room-PIN joining to /game. Minimal frontend touches: auth index redirect with old ?pin compatibility, new auth game route, join Room search from the common auth layout, manager login redirect guard (keep redirects outside catch), party reset target /game, lobby join URLs/QRs /game. Build only; no tests requested or run for this follow-up. Preserve production revision 8 and all quiz/roster/phone settings; activate a web-only image based on the verified production image with rollback container retained.

## Urgent TADAZZ logo/favicon update

Owner requested replacing the visible Razzia heading on /manager/config with the existing official TADAZZ logo and using the supplied Z PNG as favicon, with immediate deployment. Narrow touches: shared Background default logo/name and removal of its Razzia footer; index.html favicon URL; copy the supplied PNG unchanged into public assets. Build and deploy the web only, retaining the current runtime environment and revision-8 quiz data. No test suite for this urgent follow-up.

## Immediate manager background update

Owner requested the management screen use the same TADAZZ background as login and immediate deployment. Replace the /manager/config Background wrapper with existing ManagerAuthBackground. Add an optional language-switch visibility prop so management keeps its existing language control without duplication. Web-only build/deploy; retain runtime environment and quiz/roster data.

## Opening order/smoothness and temporary guest rehearsal

Owner requests TADAZZ video/animation first, then Tzila artwork, then join lobby; investigate frozen animation; temporarily permit non-rostered participants. Scope before edits: downstream TadazzOpening/LottiePlayer coordinate preparation, ready/start, timing and render configuration; opening CSS and focused browser assertions. Existing upstream Game constructor/join guard gets an exact-quiz runtime rehearsal flag (default off), leaving persisted roster and invite policy intact; public table directory remains limited to configured representatives. Runtime activation enables this flag only for Tzila, and retains gateway authentication. No provider settings or credentials change.

## Phone-first owner steering

Owner explicitly prioritizes releasing guest access and both UK/Israel dial-ins, directly bound to Tzila with no room PIN now; opening changes remain uncommitted for the subsequent task. Add exact quiz+owner runtime target selection, runtime-only guest opt-in, and preserve persisted roster/public table layout. Existing protected provider root callbacks were read back OK for 443306131984 and 0772263533. Gateway keypad submission now carries the prompt epoch to prevent a delayed digit being assigned to a newer question. Deploy server/gateway only; preserve the current published web bundle. Verify callbacks for both DIDs and DTMF 1..5 against the actual protected HTTPS gateway. Physical PSTN calls remain a separate unverified step without a handset.

Live owner feedback: provider error no longer reproduced after corrected server activation. Two real PSTN connections and accepted answers observed. Owner opened a newer room while calls remained routed to the earlier started room: change exact-owner direct routing to newest connected room in Registry creation order; reset gateway per-question state on room migration. Remove temporary guest suppression from public lobby directory/count so actual connected test callers are visible. Runtime guest rows are not persisted; original 37 representatives /31 configured tables stay intact on disk. Deployment must use /app/socket/index.cjs (verified live SHA), not /app/server. Opening changes remain pending and unshipped.
