# KIRO — P0 MASTER EXECUTION PROMPT | TADAZZ Full Show Audio + Host Presentation Mode
**Decision date:** 2026-11-06  
**Status:** REQUESTED FOR IMPLEMENTATION, NOT YET QA-APPROVED OR DEPLOYED  
**Repository:** `C:\Users\DAVID\Code\Razzia-worktrees\tadazz-next-20261105`  
**Primary goals:** (A) end-to-end professional soundtrack for every Tadazz stage; (B) a keyboard-operated, clean public stage presented directly from the SAME host browser window on a one-PC duplicate/mirror projector setup, including true server-authoritative Pause/Resume.  
**Do NOT connect to Asana.** Its full original task descriptions are reproduced below in appendices. All requirements are already available in this file.

## 0. Your assignment and non-negotiable constraints
You are the coding agent working directly on the existing Windows TADAZZ/Razzia worktree. **Implement, integrate, and test both P0 features end-to-end.** Do not stop after creating a design or partial scaffolding. Use the actual project and source files. Consult the entire file (including the unabridged Asana appendices) BEFORE editing.

**Absolutely no production deployment, changes to the live Tzila quiz, tenant or real players, push, merge, credential change, actual telephony calls, or task-completion claims until the user separately approves.** Local source changes and isolated tests are authorized. Do not update Asana. Do not set any external task to Completed.

**Do not destroy the pre-existing Codex work.** At last verified inspection the worktree was branch `agent/tadazz-next-20261105` at `66626d2`, already DIRTY with 13 modified tracked files plus many untracked files and QA evidence from the Codex session (no local changes by this prompt-author). Re-check `git status --short`, HEAD, last commits and current files. Do NOT `git reset --hard`, `git clean`, `git checkout -- .`, auto-stash, switch to another worktree without carrying changes, overwrite untracked evidence, or build from a stale clean copy. Preserve the in-progress 40-representative + native-show work exactly, especially `extensions/src/core/creating-worlds-show.ts`, `extensions/src/presentation/tadazz-v4/source-layout.css`, `work/verify-goldy-completion.py`, Playwright evidence, session state `seq` and the Goldy Tzila sidecar migration. The last Codex activity had prepared a healthy isolated server **candidate** (loopback port 3257, production unchanged for this newer candidate), with 40 sample representatives, 70 timeline steps and 16 native scene presets; do not confuse this with a production release.

Read the repository root `AGENTS.md`, `docs/extensions/orchestration/00_START_HERE.md`, relevant architecture and acceptance docs, the current actual components and tests; apply current owner-approved P0 requirements without treating outdated October research as proof of current code. Preserve upstream vanilla Razzia, eight locales, question and scoring behavior, existing /display, quiz editor persistence, private tenant media permissions, real telephone provider interfaces, React hooks, media authorization and designs. Never invent that a test passed; cite real test logs and evidence. One agent may complete the full scope without delegating.

### Existing Codex handoff — last task, NOT a new implementation request
Codex was fixing the **existing Tzila quiz in Goldy's account**, not a separate public show. It compared two actual source HTML libraries (25 stage states), added 40 **clearly labelled sample** representatives (4x10 and four focus pages) without phone numbers or fake connected states, built source-matched preparation/instructions/story screens in React+CSS, repaired presence `seq` updates on joins, and prepared a candidate server release. Its last public statement reported 795 automatic tests passing, but ten-question regression and production approval were still release gates. Re-evaluate with direct evidence; do not assume the previous report implies production deployed, and do not overwrite this work.

## 1. Audio P0 — exact user decisions (treat as invariants)
**NEVER change the currently approved answer-selection/voting soundtrack**: same exact media URL, enabled state, loop, volume, starting timing, gain and no new duplicate. The documented current Tzila setting is:
`/media/tzila-determined-pursuit-20261105.mp3`, `enabled=true`, `loop=true`, `volume=0.38`. VERIFY the current effective tenant setting before touching anything. Do not silently substitute the source WAV, `/sounds/answersMusic.mp3`, or any other track. Use a regression assertion for this invariant and capture a before/after comparison.

**Opening video:** `packages/web/public/tadazz-show/opening/Animate_gameshow_stage_loop_c01e8a8a_1080p.mp4` is 7.933 s and contains a built-in AAC audio channel. Its audio must be **always muted**; play **`Production_Theme_Intro__nene.wav` (exact 12 s)** as the ONE audible opening soundtrack, from 0.000 to 12.000 s. At 7.933 s, the video ends and the PUBLIC QR / join-code / roster lobby becomes visible while that SAME opening soundtrack continues uninterrupted until 12.000 s. At 12 s, transition gently to the quiet looping `Exploration Theme`. Do not cut the track at 8 s; do not lengthen or slow the video, alter its animations/graphics or play AAC and new soundtrack together. Work around browser autoplay with real user gesture / explicit enable sound; never fake success or violate Safari/iPad autoplay. Handle when video errors, skip, slow load, re-render, browser blur, or reconnect. The initial video may require an independent muted video timeline but ONE music controller.

Existing official opening animation `packages/web/public/tadazz-show/opening/TADAZZ-Opening-4-5s.json` is NOT to be changed or replaced.

### 1.1 Stage-to-music mapping — exact user-approved choices
| Phase | Music and treatment |
|---|---|
| Opening video (0–7.933 s) | Production Theme Intro, then same track continues through QR until exactly 12 s |
| Lobby, QR, room number, presenting/joined players, ready state | Exploration Theme — quiet seamless loop, begins at 12 s |
| Game start, new round | Prepare to Fight — deliberate short excerpt/stinger, not full 123-s song if scene is brief |
| Question shown BEFORE possible answers | Determination + `/sounds/show.mp3` |
| Choices shown / voting timer | **PRESERVE existing Tzila soundtrack unchanged** (exact approved URL, loop=true, volume=0.38) |
| Result reveal / percentages | Determination + `/sounds/results.mp3` |
| Interim results | Maintain continuity of reveal music; do NOT restart on micro-screen change |
| Leaderboard | Boss Battle Music + synchronized drum effects |
| Tie and host tiebreak | Boss Battle Music maintained, no unwanted restart |
| Round recap and story assembly | Fantasy Orchestral Theme |
| Winner/podium/finale | Epic Endgame Cinematic + podium effects |
| Other transitions | Deterministic transitions; avoid silence and redundant replays. `Determined Pursuit` remains the existing approved voting track; no extra background duplicate. |

Use one **long-lived presenter-scoped AudioManager** with separate background-music and one-shot-SFX channels, rather than remounting HTMLAudioElement or creating `new Audio()` per screen. There can be internally overlapping gain ramps only as an intentionally short, level-controlled crossfade; never two full-gain background songs. Preserve position across short related scenes (question before answers; results/interim; leaderboard/tie). Implement volume/mute, fade/crossfade, ducking, pause/resume, loop only when musically appropriate, safe loading/404 fallback, preloading, lifecycle cleanup and rapid transition cancellation by generation/epoch, timed cue callbacks and host-only role. During question-video/competing media, duck background appropriately. iPad Safari / Chrome / Edge autoplay gating. By default participant phones get NO backing music. Single-PC mirror must have exactly one audio engine and one active stage; no double playback. Host mute/pause/track preview is available in normal manager UI but not projected.

### 1.2 Eight approved-source FILES (local filenames and durations)
Source root: `C:\Users\DAVID\Code\Tada-media-curation\approved\`.

| Filename | Duration | Official source |
|---|---:|---|
| `Exploration_Theme__CleytonKauffman.ogg` | 134.4 s | https://opengameart.org/content/exploration-theme |
| `Production_Theme_Intro__nene.wav` | 12.0 s | https://opengameart.org/content/production-theme-intro-epic-orchestra |
| `Prepare_To_Fight__Basil.mp3` | 123 s | https://opengameart.org/content/prepare-to-fight |
| `Determination__artisticdude.mp3` | 220.29 s | https://opengameart.org/content/determination |
| `Determined_Pursuit__Emma_MA.wav` | 108 s | https://opengameart.org/content/determined-pursuit-epic-orchestra-loop |
| `Boss_Battle_Music__SubspaceAudio.wav` | 123.43 s | https://opengameart.org/content/boss-battle-music |
| `Fantasy_Orchestral_Theme__Joth.mp3` | 191.69 s | https://opengameart.org/content/fantasy-orchestral-theme |
| `Epic_Endgame_Cinematic__cynicmusic.wav` | 91.21 s | https://opengameart.org/content/epic-endgame-cinematic |

Media provenance/QA: `C:\Users\DAVID\Code\Tada-media-curation\manifest.json`; `SOURCE_AND_LICENSE.md`; `round2-feedback.json`, `round3-feedback.json`, `round4-feedback.json`, `license_evidence\`.

All eight files were present at last direct SentinelX inspection. Verify size and SHA256 against manifest. Manifest marks them **CC0 but `readyForProductBundling=false`**. Do not falsely mark cleared or bundle/ship publicly or publish/commit converted copies until actual evidence for each file is reviewed and commercial-use clearance explicitly granted. Specifically investigate Apple Loops remark regarding Determination. You MAY prepare local converted/test copies outside public build/artifact destinations for evaluation; keep original assets unmodified. Support browser-compatible MP3/AAC/OGG as appropriate after rights clearance. If full legal clearance cannot be proven, fully implement music architecture and local staging/test with no unauthorized production asset bundling; report precise blocker instead of marking P0 complete.

### 1.3 Current SFX and paths
`packages/web/public/sounds/answersMusic.mp3` 77.85s (do not use to replace Tzila approved voting track); `answersSound.mp3` 0.104s; `boump.mp3` 0.302s; `show.mp3` 0.496s; `results.mp3` 3.25s; `snearRoll.mp3` 24.375s; `first.mp3` 4.049s; `second.mp3` 4.8s; `three.mp3` 3.75s.
**Browser URLs use `/sounds/<filename>`, NOT `/sfx/`.** Verify actual HTTP success for every referenced media asset and fix mismatched fallback routes in existing audio cue code; do not treat silent 404 as success.
Wire animation `onCue` events: `impact`, `survey-reveal`, `round-launch`, `finale-impact`, `curtains-closed`, and every event actually emitted in current code; map to exact reliable SFX on an explicit deterministic event timeline. Trigger idempotently by phase/epoch; no duplicate when reconnect/skip/resume.

### 1.4 Primary code files to inspect (NOT an exhaustive list)
- `extensions/src/presentation/audio-cue-player.tsx`, `extensions/src/core/audio-catalog.ts`, `extensions/src/core/constants.ts`, `extensions/src/core/quiz-extras.ts`, `extensions/src/core/card-appearance.ts`
- `extensions/src/presentation/tadazz-show/TadazzOpening.tsx`, `TadazzV4StageAdapter.tsx`, `tadazz-show/show-director.ts`
- `extensions/src/presentation/tadazz-v4/TadazzV4Stage.tsx`, `motion.ts`, `FullShowScenes.tsx`
- `extensions/src/server/game/session.ts`, `extensions/src/editor/components/AudioCuesSection.tsx`
- `packages/web/src/features/game/components/GameWrapper.tsx`, `packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx`, `ManagerControlToolbar.tsx`
- editor shared MediaLibrary, existing schema migration, stage presets, question-level overrides, source media catalog and authorized upload routes.

The current implementation has `AudioCuePlayer` (likely new Audio per cue), `shouldDuckMusic`, default fallbacks possibly pointing to nonexistent `/sfx`, and `TadazzOpening.tsx` explicitly trying `video.muted = false` before autoplay fallback — you MUST repair this conflict with mandatory muted source video. `TadazzV4Stage` produces `onCue`, but full audio routing was incomplete at last inspect. Inspect current HEAD rather than assuming this remains unchanged.

## 2. Host Presentation Mode P0 — user-approved behavior
**IMPORTANT: exactly one Windows PC; monitor/projector in DUPLICATE/MIRROR (same pixels).** An extra `/display` tab/window or a second connected spectator is NOT a solution. Add a prominent "מצב הקרנה / Present from Host" button on the existing authorized host view, which displays the existing live stage fullscreen in the SAME window/session/role, hiding ALL manager UI while keyboard shortcuts still control it. Public visuals must match the normal /display content including opening, room join CODE + QR, representative roster, readiness, five 1:1 answer cards, results, percentages, ties, stories, leaderboard, finale, video/Lottie/media. Keep /display available separately. No host-only overlay/control/modal even for one frame, no PII and no scroll/distortion at 16:9/4:3 and zoom. Do not hide controls merely by opacity while leaving focus/events accessible; host controller must persist when toolbar is absent.

Separate `isHostPresenting` from browser `isFullscreen`. Enter via gesture-triggered `requestFullscreen`; handle `fullscreenchange`, `fullscreenerror`, Escape, denial, page focus/reconnect/reload; Escape should return to manager without leaving game. **Keep same stage component, socket, timers, visual phase and audio instance mounted** across entry/exit (no double render or remount). New mode is opt-in and must not alter original vanilla Razzia.

### 2.1 Keyboard controls (controller mounted independently of toolbar)
| Keys | Action | Guard |
|---|---|---|
| Space / Enter / ArrowRight | Next legal stage/screen | Only when server permits; NOT implicit End Timer while voting |
| ArrowLeft | Previous safe screen | No votes/score mutation |
| T | End Answer Timer NOW | Authorized host only; legal voting phase; synchronized result animation |
| P | Real Pause/Resume | SERVER authoritative, not visual freeze |
| Shift+ArrowRight or Shift+S | Skip entire question | Destructive if votes present; confirm via same chord twice within 2 seconds or block until manager UI |
| Shift+ArrowLeft | Rewind/replay previous question | Destructive; double-chord confirm or manage outside projected mode |
| Esc | Exit presentation to normal host controls | Do not exit room; browser may auto-exit fullscreen |

Important: avoid Alt+ArrowLeft browser back; no key capture while input, textarea, dialog, portal or contenteditable has focus; clear accidental focus; avoid `event.repeat`, duplicate listeners, stale closures (notably `ManagerControlToolbar` `isScene` dependency), rapid double firing, browser auto-submit, Space affecting hidden answer buttons, lost command ACK, reconnect and cancelled stage epoch. For destructive actions first keypress must NOT mutate game state or show public modal; use keyboard-only confirmation or safe no-op requiring exit to UI. Pending/invalid actions are idempotent no-op with manager-only permission checks on server. No host toolbar/keymap overlay projected.

### 2.2 Server authoritative Pause/Resume (new functionality if absent)
Check real HEAD first. Implement manager-only commands `PAUSE_GAME/RESUME_GAME` (names consistent with current protocol), pause state and deadline/remainingMs/phase/epoch persisted/sent by server. Pause actual timer, cooldown, auto advance, interlude transition, scene/show music, nontrivial animations and relevant media while preserving visual frame. Don't erase votes or disconnect phone participants. Define explicit consistent policy for votes received during pause (reject with synchronized reason, or fully bounded pause behavior). Resume exact time remaining, same question, no double scoring or timer fires from stale `setTimeout`, `sleep`, `mediaEnded` or generation. Restart/reconnect/reload is stable. Keep Pause distinct from T (End Timer) and Shift+skip. Verify player, phone gateway and spectator state independently. Do not fabricate client-only pause.

### 2.3 Preserve result reveal contract
At end of voting by timer, all-answered or T, send each player's personal `SHOW_RESULT` **immediately**, with correct/points, just as authoritative Razzia does. Projector plays independent dramatic percentage reveal animation 0.65–1.0 s plus correct/wrong highlighting 0.2–0.35 s. Never delay or change user scoring/answer notifications to synchronize music. Survey has no right/wrong; multiple correct options can sum over 100%; keep stable snapshots on reconnect. Previous/skip and timer controls must not double-score or retroactively change committed results without explicit controlled replay semantics.

## 3. Integrated execution sequence (do the actual work, not just planning)
1. **Baseline evidence/read-only:** inspect all current source/AGENTS docs, branch, dirty files and untracked QA files; capture `git diff --check`, relevant component, tests, current effective voting cue setting and operating production-vs-candidate distinction. Confirm existence/license/manifest of 8 tracks; do NOT modify live sidecar. Confirm required files and authorized path.
2. **Design integration strategy in <=1 page of implementation notes:** show exact current component lifetime, stage phase/command event map and proposed single AudioManager owner + host presentation controller. Preserve Razzia vanilla and Goldy Tzila custom scenes.
3. **Implement audio first:** cue mapping per stage; muted opening/12s intro/7.933s QR transition, continuous lobby track, stable voting track invariant, all transitions, event SFX, fades/ducking, autoplay, lifecycle. Implement schema/picker stage/question override correctly with backward compatible persistence, including preview cleanup; no duplicate engines.
4. **Implement host presentation:** one stage and one AudioManager, clean public fullscreen stage, controller independent of toolbar, keymap and manager-only server command path, correct fail/exit handling; preserve QR and scene chronology.
5. **Implement authoritative server Pause/Resume** and all cancellation/idempotency flows for timers/animations/audio, including phone and reconnect. Connect P to same server state; pause/resume presentation track position without restarting after resumption. Verify skip and rewind policies.
6. **Verify against actual sources and real browsers:** add unit/contract/integration tests for audio/phase policy, clip overlap, source video mute, 12s intro, QR at 7.933, vote music URL/gain/loop invariant, media 200/401 as appropriate, event cue sync, paused votes and timers, keymap, access guard, idempotency and reconnect. Use real React/playwright app, no fabricated page.setContent as sole proof. Run 10-question/two-round E2E with host/projector-like mirror, player, phone simulator and independent display comparison. Test 1920x1080,1366x768,1280x720,1024x768, zoom and 8 locales, Chrome/Edge and Safari/WebKit where available. Check browser autoplay refusal without claiming it played, visual and listenable QA. Manual listening and actual hardware iPad/Mirror require explicit HUMAN sign-off if unavailable; don't fabricate.
7. **QA evidence and hold release:** write timestamped QA report with exact file list, commands + exit codes, actual screenshot/log/audio traces, remaining issues and rollback steps, legal/asset clearance status, no false passed tests. Preserve existing candidate/production. Optionally save scoped local commits only if safe and disentangled from Codex's dirty changes; no pushing/deploying or altering current live Tzila data. **Wait for separately granted production deployment approval.**

### Required acceptance matrix (all must be proven or explicitly blocked)
- Intro MP4's own audio silent and user-approved new 12s soundtrack audible for FULL duration; QR appears at ~7.933s while music continues; Exploration loop starts ~12s.
- Tzila voting audio source `/media/tzila-determined-pursuit-20261105.mp3`, enabled, loop, volume .38, timing all IDENTICAL; no audio doubling.
- Each phase has stable mapped background; animations emit correct one-shot SFX; no audio gap/restart on micro-cues; fade/duck volume controlled.
- No background music on phones, Safari autoplay restrictions visibly handled, file HTTP paths correct, no unsupported/unlicensed asset release.
- One-PC mirror host mode entered without new room/spectator/URL; complete public stage and QR/room code, no controls or PII; Escape restores same game; /display unchanged.
- Keys with server authorization; T is End Timer (not Skip); P is real authoritative Pause/Resume; destructive skips require safe confirm; rapid presses/reconnect cannot double-advance or score.
- 10 questions/2 rounds, all-answered and manual timer ends, results per player immediate, tie, round transition, podium; participant phone integration unaffected.
- Build/typecheck/lint/Vitest/Playwright and independent visual/listening QA evidence. Production release remains BLOCKED pending owner's separate approval.

## 4. Result reporting format
At end respond **in Hebrew** with: (1) exact changes per file, (2) how source-track and current voting music integrity were verified, (3) host mirror and server pause tests, (4) exact commands/results + screenshot/audio evidence, (5) any unresolved rights and Safari/manual verification, (6) current Git branch/status and candidate vs production, (7) clearly say **NOT DEPLOYED**. Never claim all done while manual listening, rights or other gates are missing.

---

# APPENDIX A — FULL ASANA TASK, UNABRIDGED
The text below is copied directly from Asana task descriptions, not paraphrased. These Asana copies are local reference material. The implementing agent need NOT connect to Asana.

# APPENDIX A — HOST PRESENTATION P0 MAIN TASK

## A.0 — P0 | Host Presentation Mode — מקרן במצב שכפול ממחשב מנחה יחיד, מסך נקי + מקלדת + Pause/Resume
**Asana ID:** `1220285541641534`  
**URL:** https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1220285541641534  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-11-06T01:29:11.790Z

### Exact Asana task description (verbatim)

P0 | Host Presentation Mode — מצב הקרנה מתוך מסך המנחה, למחשב אחד ולמקרן שמשכפל מסך
עדכון דרישה: 06.11.2026. מצב: OPEN / NOT IMPLEMENTED. מסמך דרישות וביצוע מחייב לסוכן קוד; לא אישור שפרסנו.

1. הבעיה והתוצאה הנדרשת — חשוב מאוד
המנחה מפעיל משחק חי במחשב יחיד המחובר למקרן/מסך LED במצב Duplicate/Mirror (המקרן משכפל *בדיוק* את מסך המחשב). לפעמים אין אפשרות להקרין חלון נפרד או להשתמש ב-Extend. לכן /display בחלון/טאב אחר **אינו פתרון**. נדרש כפתור בממשק המנחה הקיים "מצב הקרנה / Present from Host": בלחיצה המשחק *שכבר רץ* מוצג באותו חלון ובאותו מחשב כשטח ציבורי נקי במסך מלא, ובמקביל כל פקודות המנחה נשארות פעילות מהמקלדת. מעבר חזרה לניהול אינו מנתק את החדר, אינו מפעיל משחק שני, אינו מייצר שחקן ואינו מאפס שאלות/סאונד/טיימר/הצבעות. פתרון זה תוספת על /display הקיים, לא החלפתו.

2. נקודת מוצא מאומתת בקוד (לא להניח שענף זה כבר בפרודקשן)
נבדק ב-SentinelX ב-06.11 בענף agent/tadazz-next-20261105 commit 6990ed6. יש לוודא HEAD ו-image שרת production בנפרד לפני שינוי/פריסה. קיימים:
- packages/web/src/features/game/components/GameWrapper.tsx — מארח GameWrapper; ב-Tadazz פעיל עובר ל-TadazzShowView, ובמצב legacy יש header / manager bottom bar נפרדים.
- packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx — shell מלא לבמה, ManagerControlToolbar כשיש extensionState וגם סרגל host תחתון משלו, לובי/QR, תמונות, audio, stage v4. FULLSCREEN כעת קורא רק useFullscreen.
- packages/web/src/features/game/components/ManagerControlToolbar.tsx — פקדי host קיימים, כולל NEXT_SCREEN, PREVIOUS_SCREEN, END_ANSWER_TIMER, SKIP_QUESTION, END_OR_SKIP_INTERLUDE, הרחבות cinema. מאזין keydown יושב **בתוך הסרגל**: Space/Enter עוברים/מסיימים טיימר לפי phase, Alt+ArrowLeft לחזרה. אם פשוט לא מרנדרים את הסרגל — המאזין נעלם. יש להפריד את שליטת המקלדת מהרכיב הגרפי.
- packages/web/src/hooks/useFullscreen.ts — document.documentElement.requestFullscreen/exitFullscreen בלבד; אין מצב presentation ואין הסתרת סרגלים.
- packages/socket/src/services/game/round-manager.ts — endTimer, nextScreen, previousScreen, skipQuestion וכד'; extensions/src/server/game/session.ts ו-extensions/src/core/commands.ts — פקודות manager-only והגבלות/epoch. לא נמצא מנגנון pause/resume authoritative של משחק/טיימר באזורים שנבדקו.
- packages/web/src/features/game/components/game-controls.test.ts ו-packages/web/src/features/game/phase-a-flow.browser.test.ts — בדיקות קיצורים קיימות.
- הסרגל והבמה קיימים בשני מסלולים: Tadazz show מלא והמסלול המקורי. חובה לשמור תאימות ל-Razzia vanilla ול-8 שפות.
- נמצא גם פער טכני לבדיקת הסוכן: ManagerControlToolbar משתמש ב-isScene במאזין keydown אך אינו כולל אותו ברשימת תלויות useEffect; לבדוק closure stale ולתקן בבדיקות.

3. UX — כניסה, תצוגה ויציאה
- כפתור ברור במסך המנחה הרגיל: "מצב הקרנה" עם אייקון; הצגה זהה למשחק שעל /display מבחינת *תוכן ציבורי*, אך עדיין session/role של Host ולא חיבור spectator ולא ניווט ל-/display. השלב אינו מתחיל מחדש.
- קליק של המשתמש מפעיל browser native requestFullscreen על root הבמה או document root לפי בדיקת התאימות, ומפעיל isHostPresenting עצמאי מ-isFullscreen. יש לסנכרן fullscreenchange/fullscreenerror, Escape, שינוי חלון, ניתוק, רענון. אם הבקשה נכשלת אין לציין "מסך מלא" בהצלחה, יש חזרה למצב ניהול ברור. אין להיכנס עם F11/חלון חדש כפתרון חובה.
- בזמן הצגה: ה-UI הציבורי בלבד, ללא toolbar/header/footer host, סרגל תחתון, הגדרות, roster, נתוני טלפון, כפתורי דילוג, Exit, אייקון fullscreen, overlays ניהוליים, בועות tooltip, אינדיקטור keymap, modal, פקד אודיו של המנחה או ממשק פנימי. *לא* להסתיר רק ע"י opacity/CSS אם הוא עדיין יכול ללכוד פוקוס/אירועים/מודלים.
- להציג את כל נכסי השעשועון המאושרים: פתיח, lobby כולל מספר/קוד משחק ו-QR להצטרפות כשהם חלק מהבמה הציבורית, שאלה, תמונות 1:1, טיימר, תוצאות, סקר, 0/תיקו, leaderboard, scene/video/Lottie, מעבר סבב, סיום. אסור לאבד קוד הצטרפות רק בגלל סינון סרגל Host.
- תוכן stage בגודל מלא, אין גלילה/no overflow/שיבוש יחסי תמונות. לתמוך 16:9 ו-4:3 ו-DPI/zoom ו-safe areas. אין הבזק של רקע ישן, header או toolbar אפילו פריים יחיד בעת מעבר/כניסה/יציאה/החלפת scene.
- לשמור על חיבור socket manager, הרשאות manager-only, state envelope/epoch/seq, media authorization cookies, timer state ו-audio lifetime. לא להרכיב מופע משחק שני שיפעיל אנימציות וסאונד כפולים. לא להרכיב spectator כמכפיל חיבור. אין חשיפת PII/טלפון למקרן.
- לחיצה על Esc מחזירה לממשק המנחה הרגיל *בלי לצאת מהחדר*. דפדפנים יוצאים בעצמם מ-Fullscreen ב-Esc: להאזין ל-fullscreenchange ולשחזר UI. שינוי פאזה, reconnect והשהיה לא יוציאו מהמצב.

4. קיצורי מקלדת מחייבים במצב ההקרנה (לממש API לפי הרשאת שרת אמיתית)
- Space / Enter / ArrowRight — Next Screen/Advance חוקי, *רק כשהשרת מאפשר*; בשלב הצבעה חיה אין להסתיר סיום טיימר בתוך Next. Enter לא ילחץ על כפתור נסתר ולא ישלח הצבעה.
- ArrowLeft — Previous Screen כשמעבר בטוח ואינו מבטל הצבעות או ניקוד. לשמור על הבחנת Step vs Question. Alt+ArrowLeft הקיים בדפדפן עלול לעשות Back ולכן לא להשתמש בו כקיצור ההצגה החדש.
- T — End Answer Timer באופן מיידי ומסונכרן, רק אם שלב ההצבעה פעיל והפעולה חוקית.
- P — Pause/Resume אמיתי (ראו סעיף 5), toggle עם state מהשרת.
- Shift+ArrowRight — Skip Entire Question / מעבר לשאלה הבאה (בניגוד ל-Next Stage), רק כשמותר.
- Shift+ArrowLeft — חזרה אמיתית לשאלה קודמת (לא רק Preview History), תוך טיפול בטוח בניקוד/הצבעות.
- Shift+S — Skip Entire Question חלופה נוחה; לא להפעיל פעמיים אם בוצע קודם Shift+Right.
- Esc — יציאה ממצב הקרנה לניהול, לא יציאה מהמשחק.
- בפעולה הרסנית (חזרה אמיתית שמשחזרת הצבעות/ניקוד, דילוג שאלה עם תשובות) אסור להציג modal לאישור על מסך המקרן. יש להגדיר מנגנון אישור מהמקלדת בלבד, לדוגמה הקשה כפולה *של אותו צירוף* בתוך חלון קצר של 2 שניות, ללא שכבת UI ציבורית; או לחסום בבטחה ולדרוש יציאה לממשק הניהול. ההחלטה תוסדר ב-QA, לעולם לא ביצוע הרסני בהקשה בודדת. פעולה ראשונה אינה משנה מצב. אם אין אישור תקין — no-op. מעבר רגיל שאינו הרסני ללא modal.
- מניעת תקלות: event.repeat; double-fire; לחיצות מהירות; קליטת shortcuts כש-focus ב-input/dialog/contenteditable או בתוך portal; דפדפן מול host; חיבור socket חסר; פקודה בזמן מעבר; disabled/pending; requestId; ack/timeout/idempotency/epoch; הגנה מ-Space שמבצע בחירה של תשובה. לא לתפוס קיצורים גלובליים מחוץ למסך Host. להבטיח focus על stage לא אינטראקטיבי בכניסה ולהסיר listeners ביציאה.
- במצב הניהול הרגיל יש להשאיר כפתורים והסברים לקיצורים. לא להוסיף UI להסברים בתוך הבמה הציבורית.

5. Pause/Resume — דרישת Backend חדשה, לא רק freeze חזותי
- לבדוק מה כבר קיים ב-mainline וב-worktree העדכני; אם אין, לממש פקודות שרת manager-only (למשל PAUSE_GAME/RESUME_GAME) ו-state authoritative {paused, remainingMs/deadline, phase, epoch/generation}; לא invent client-only timer.
- בזמן Pause לעצור/להשהות timer, auto-advance, interlude/scene transitions, countdown, שידורי timeout וניגון מדיה/אנימציות ניתנות לעצירה באופן עקבי. לשמר את הפריים/המצב הציבורי; אין להפוך את הבמה לממשק ניהול.
- החלטת מדיניות ברורה להצבעות בזמן pause: אין לאבד הצבעות שכבר התקבלו; למנוע ניקוד כפול או תשובות שמתחברות אחרי timeout; אם קבלת תשובות נחסמת בזמן pause, להחזיר ל-web player/phone adapter מצב מסונכרן/סירוב מפורש ולא לתעד vote כתקין. אין להניח שכל ספק טלפוניה תומך pause באותה צורה: לבצע התאמה ובדיקות. אין מחיקת שיחות או ניתוק.
- Resume ממשיך בדיוק מהזמן שנותר, אותו step ועם אותה תוצאה/שאלות; clocks מחושבים בשרת ומתמודדים עם reconnect/reload. מניעת stale sleep/setTimeout/cooldown/mediaEnded events ו-double-scoring; שימוש ב-generation/epoch/cancellation ואידמפוטנטיות. להפריד Pause מ-End Timer ומ-Skip.
- לא להציג למקרן modal או קוד פרטי בעקבות Pause. הקפאת תמונה/טיימר ציבורי מספיקה; טיפול בנגישות/שגיאה בממשק ניהול רגיל.

6. ארכיטקטורה והוראות לסוכן
- להוסיף מצב HostPresentationMode ברמת shell של המשחק, לא ליצור עמוד משחק נפרד, לא להחליף את host ב-spectator, לא לנווט ל-/display. ליצור Controller/Hook יחיד לפקודות וקיצורים, mounted גם כשה-Toolbar אינו מוצג; הפקודות יהיו זהות מבחינת backend לכפתורים הרגילים.
- לשלב בתצוגת Tadazz v4/Goldy וב-fallback legacy לפי קוד source; לכסות גם את ManagerControlToolbar של GameWrapper וגם את ה-Toolbar והסרגל התחתון של TadazzShowView, וגם host-only overlays של cinematic/interludes/Opening.
- לבדוק React hooks unconditional, לא ליצור render loops ושינוי stage remount שאינו נדרש. לא לשנות את UI העורך, עיצוב התמונות, ערכות brand, תזמון סצנות או URL הציבורי.
- שינויי source המקורי מינימליים ומוגנים ב-opt-in extensions; לא לפגוע upstream vanilla Razzia / בדיקות 8 שפות / telephony / multi-tenant / auth. לא לדלג על בנייה/בדיקות. לבצע בענף מבודד מהראש המעודכן, לא לדרוס שינויים אחרים ולא למזג קוד לא מאומת. אין שינוי נתוני מופע צילה בפרודקשן ואין פריסה לשרת ללא תיאום ואישור נפרד.
- ממשקי יכולת/הרשאות ייגזרו ממצב שרת, לא מלוגיקה מקומית בלבד. סטטוס disabled/illegal יתורגם ל-no-op בטוח ללא קפיצה לניקוד או בחירה של תשובה.

7. Acceptance / QA חובה בטרם "הושלם"
A. One-PC Mirror: להפעיל Host במחשב בודד עם Windows + Chrome/Edge במצב Duplicate/Mirror; ללא המסך השני, ללא טאבים/חלונות נוספים. Enter Presentation מציג *רק* תוכן ציבורי, מקלדת שולטת, Esc חוזר לניהול וניתן להיכנס שוב באותה שאלה.
B. שמירת זהות הבמה: compare צילומי /display מול host presenting לכל screen public. בדוק lobby room code + QR, סקר 5 תמונות, 10 שאלות/2 סבבים, תוצאה עם אחוזים, Lottie/MP4/audio, מסכי סוף, no scroll/no distort/no old design flash. 1920x1080, 1366x768, 1280x720, 1024x768 (4:3), הגדלת טקסט/zoom. גם צג קטן וגם projector.
C. E2E Host + browser player + spectator + phone simulator: הצבעה נכונה, טיימר End, Pause באמצע ספירה, Resume, מעבר שלב, חזרה בטוחה, דילוג הרסני מוגן, ניקוד/ledger, אין הורדה/שינוי פרטי שחקנים; verify spectator/player in sync, phone answers unaffected.
D. Regression: לחיצות Space/Enter/Arrow/T/P/Shift מהירות, key repeat, click at fullscreen transition, focus על control מוסתר, dialogs, browser Escape/fullscreenchange, fullscreen refusal, browser tab blur, disconnect/reconnect ו-refresh. לא יותר מ-1 command/step, לא 2 מצביעים ולא מעבר אחרי epoch שפג.
E. QA לפחות Vitest למיפוי מקשים ול-server pause + cancellation, Playwright Chromium תרחיש mirror/fullscreen, smoke Edge, בדיקות Safari/WebKit היכן שנתמך. להגיש הקלטת מסך/צילומי before/after, test command/log, רשימת קבצים ששונו, commit/branch, rollback steps.
F. Gate לסימון Completed: מימוש משולב בענף הנבחר, build+tests pass, smoke אמיתי בדפדפן שמייצג מחשב יחיד עם Mirror, QA ויזואלי של host publicly clean ללא פקדים בשום שלב, אישור בעלים לפני deploy. עד אז להשאיר OPEN.

8. קישורים ומשימות קשורות
Project: Tada / Tadazz, https://tadazz.com
General host controls: 1219846277923284
End timer: 1219846277925221
Previous/rewind: 1219846387400318
Existing independent /display (COMPLETED, does NOT solve mirror): 1220039057632603
Host QA: 1219851365181749
Production QA: 1220193632309266
עדיפות P0 לתרחיש אירוע עם מחשב אחד. לא לטעון שהמימוש קיים או נפרס עד בדיקה.

### Linked subtasks
- 1220285573483365 — 01 | Frontend — Host Presentation Shell ומסך ציבורי מלא על אותו Host
- 1220285715778551 — 05 | Release Gate — מיזוג מבוקר, בדיקות, Rollback וללא פריסה אוטומטית
- 1220285432942506 — 03 | Server — Pause/Resume authoritative לטיימר, מעבר, הצבעה ומדיה
- 1220285573482237 — 04 | QA E2E — מחשב יחיד במצב Mirror, Host/Player/Phone/Display, תרחישי קצה
- 1220285432942442 — 02 | מקלדת — Controller משותף ופונקציית פקודות בטוחה ללא Toolbar

### Comments
(No comments returned)

# APPENDIX B — ALL FIVE HOST PRESENTATION SUBTASKS (FULL DESCRIPTIONS)

## B.1 — 01 | Frontend — Host Presentation Shell ומסך ציבורי מלא על אותו Host
**Asana ID:** `1220285573483365`  
**URL:** https://app.asana.com/1/1219597879016953/task/1220285573483365  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-11-06T01:29:11.776Z

### Exact Asana task description (verbatim)

לבצע מצב isHostPresenting עצמאי מ-Fullscreen בתוך TadazzShowView ו-GameWrapper. כפתור במנחה; Native Fullscreen + fullscreenchange/Escape/failure; אותו משחק/Socket/Stage בלי spectator, remount או URL חדש; הסתרה מוחלטת של שני סרגלי host וכל host-only overlays/modals/tooltips/PII; להציג lobby כולל מספר חדר ו-QR, קוד הצטרפות, כל שאלה/תוצאות/פודיום/מדיה; כניסה/יציאה ללא reset. לשמור /display קיים בנפרד. QA 16:9/4:3, no scroll, no old background flash; 8 locales/vanilla; פירוט מחייב במשימת האב 1220285541641534.

### Linked subtasks
None

### Comments
(No comments returned)

## B.2 — 02 | מקלדת — Controller משותף ופונקציית פקודות בטוחה ללא Toolbar
**Asana ID:** `1220285432942442`  
**URL:** https://app.asana.com/1/1219597879016953/task/1220285432942442  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-11-06T01:29:11.121Z

### Exact Asana task description (verbatim)

לנתק keydown מ-ManagerControlToolbar לתוך Hook/Controller יציב שנשאר mounted כשהסרגל מוסתר; אותו backend command path עם manager-only auth. Map: Space/Enter/Right next חוקי, Left previous safe, T end timer, P pause/resume, Shift+Right/Shift+S skip question, Shift+Left previous question disruptive, Esc exit presentation. לפתור Alt+Left של browser; אין הצבעה שנלחצת בעת דילוג; no hidden button focus; no modal on projected screen; destructive requires two presses same combo <=2s (או חסימה וחזרה לניהול). Guard key repeat, dialog/input, stale state, pending, epoch/requestId/ack/reconnect, double fire. בדיקות יחידה+Playwright. פירוט במשימת האב.

### Linked subtasks
None

### Comments
(No comments returned)

## B.3 — 03 | Server — Pause/Resume authoritative לטיימר, מעבר, הצבעה ומדיה
**Asana ID:** `1220285432942506`  
**URL:** https://app.asana.com/1/1219597879016953/task/1220285432942506  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-11-06T01:29:11.159Z

### Exact Asana task description (verbatim)

לאמת קודם אם קיים כבר ב-HEAD; אם חסר, הוסף manager-only PAUSE_GAME/RESUME_GAME או שמות תואמי ארכיטקטורה. Server state paused/remainingMs/phase/epoch; freeze timer/auto-advance/cooldown/interlude/scene/video/Lottie/audio במידת האפשר, לא disconnect; define accept/reject votes during pause for player+phone, preserve votes/score; resume exact remaining, no stale timeouts/double-scoring; recover on reload/reconnect. Phone integration checks. Cancellation/generation/idempotency. בדיקות unit integration across server+web+pilot phone. פירוט במשימת האב.

### Linked subtasks
None

### Comments
(No comments returned)

## B.4 — 04 | QA E2E — מחשב יחיד במצב Mirror, Host/Player/Phone/Display, תרחישי קצה
**Asana ID:** `1220285573482237`  
**URL:** https://app.asana.com/1/1219597879016953/task/1220285573482237  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-11-06T01:29:11.222Z

### Exact Asana task description (verbatim)

להוכיח בפועל Host-to-projector במחשב יחיד כאשר OS רק משכפל את מסך המחשב ולא ניתן להשתמש בטאב נוסף. QA fullscreen no host controls/PII מכל שלב (כולל lobby QR, opening, 5 photo answers, scores, result, closing, cinematic overlays). Test Escape returns same game; T end timer, P pause/resume, Right/Left, safe destructive skip; phone votes, multiple browser clients/reconnect/reload; automated Chromium + manual Edge and Safari supported; resolutions 1920x1080/1366x768/1280x720/1024x768; no flicker/scroll/distortion. Evidence screenshots, tests/logs, no business data modification. Acceptance steps documented in parent.

### Linked subtasks
None

### Comments
(No comments returned)

## B.5 — 05 | Release Gate — מיזוג מבוקר, בדיקות, Rollback וללא פריסה אוטומטית
**Asana ID:** `1220285715778551`  
**URL:** https://app.asana.com/1/1219597879016953/task/1220285715778551  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-11-06T01:29:11.689Z

### Exact Asana task description (verbatim)

לעבוד בענף נקי מה-HEAD המעודכן, לא לדרוס worktrees. preserve original Razzia source, 8 locales and tenants, editor, /display, existing Tzila show settings. Build/typecheck/lint/Vitest/Playwright; peer QA; record exact commit, touched files, evidence, regression results; staged review, rollback plan, explicit approval *before* production deployment. No marking P0 complete before visual QA of real Mirror + owner sign-off. Existing prod https://tadazz.com should not change as part of planning task. מותר לסוכן יחיד לבצע את כל השלבים ברצף; אלו שלבי קבלה ולא דרישה לפצל לכמה סוכנים.

### Linked subtasks
None

### Comments
(No comments returned)

# APPENDIX C — ALL THREE RELATED HOST CONTROL TASKS (FULL DESCRIPTIONS)

## C.1 — בקרות מנחה: Next / Skip Stage / Skip Question בכל שלבי המשחק
**Asana ID:** `1219846277923284`  
**URL:** https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1219846277923284  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-11-06T01:29:40.918Z

### Exact Asana task description (verbatim)

נבדק בקוד: EXISTS/PARTIAL — EVENTS.MANAGER.ADVANCE ממומש, וה-manager UI מציג Skip בעת SELECT_ANSWER, Next בעת SHOW_RESPONSES ו-SHOW_LEADERBOARD; SKIP_INTERLUDE קיים דרך extension. GAP — MANAGER_SKIP_BTN=null עבור SHOW_START/SHOW_PREPARED/SHOW_QUESTION/SHOW_RESULT/WAIT ולכן אי אפשר לדלג מיד על כל מסך או שאלה. RoundManager.newQuestion() כולל sleep(2), sleep(cooldown) ו-await cooldown.start, ולכן הוספת דילוג נאיבית עלולה להפעיל תשובות משאלה שנדחתה או להתקדם כפול. נדרש להפריד Next Stage מסיום טיימר ומ-Skip Entire Question (ללא ניקוד ותשובות). Tomer: פקודות שרת manager-only, cancellation token/epoch, ניטרול setTimeout/sleep ישן, rollback/advance מדויק, record skip בלי double scoring. Maya: בקרי שליטה עקביים, confirmation לדילוג על שאלה עם תשובות, disabled/pending, feedback, כל 8 שפות, אנימציות אודיו. QA עם לחיצות מהירות, reconnect, מצבי סקירה/פודיום, ושמירה על vanilla.

=== CROSS-REFERENCE 06.11.2026 ===
06.11.2026 | קריטי למקרן במצב Duplicate/Mirror: נפתחה משימת P0 ייעודית Host Presentation Mode — 1220285541641534 (https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1220285541641534). דרישת משתמש: מחשב אחד שבו המקרן מציג בדיוק את חלון המנחה — אין להסתפק ב-/display חדש. ה-Toolbar הקיים חייב להשאיר את מאזין הקיצורים פעיל גם כשכל ה-UI הניהולי מוסתר; keyboard actions דרך אותו authorized server. פרטי קבצים, ארכיטקטורה, keymap, safe destructive actions, full QA ב-P0. המחקר למעלה מ-24.10 היסטורי; בענף agent/tadazz-next-20261105 קיימות כבר NEXT_SCREEN/SKIP_QUESTION/PREVIOUS_SCREEN/END_ANSWER_TIMER (שילוב+בדיקה נדרשים). אין לסמן Completed בגלל קיום הקוד בלבד.

### Linked subtasks
- 1219846387458512 — QA — דילוג בכל שלב עם בדיקות מירוץ, שחקנים וספק טלפוניה מדומה
- 1219846371518386 — Maya — פקדי מנחה אחידים בכל שלב ו־8 שפות
- 1219846277961159 — Tomer — מדיניות ודיווח לשאלה שדולגה ללא חישוב ניקוד
- 1219846157830320 — Tomer — פקודות Next Stage ו־Skip Entire Question עם cancellation

### Comments
(No comments returned)

## C.2 — בקרות מנחה: סיום טיימר תשובות מיידי עם אנימציית סיום תקינה
**Asana ID:** `1219846277925221`  
**URL:** https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1219846277925221  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-11-06T01:29:41.583Z

### Exact Asana task description (verbatim)

קוד קיים: common:skip בעת SELECT_ANSWER שולח EVENTS.MANAGER.ADVANCE ואז cooldown.abort()->showResults(). endIfEveryoneAnswered() מסיים מוקדם. הרחבה מתוכננת: שלושת מסלולי סיום ההצבעה (טבעי/כולם ענו/End Timer) ממשיכים לשלוח לכל שחקן מיד את SHOW_RESULT האישי עם correct/points — אין לעכב, לסנכרן בכוח או להמתין לחשיפת המקרן. במקביל המנחה מתחיל לחשוף את התפלגות אחוזי הבחירה באנימציה מהירה (0.65–1.0s מילוי פסי התשובות, 0.2–0.35s נכון ירוק/שגוי אדום). יש לשמר timing server, למנוע timers ישנים/כפל אירועים וניקוד כפול. הוראות מלאות במשימת האב 1219846702589614. נדרשות בדיקות End Timer, all answered, unlimited time, reconnect וטיפול באודיו. הכפתור כיום נקרא Skip; לשנות ל-End Timer בהתאם לחוקיות המעבר.

=== CROSS-REFERENCE 06.11.2026 ===
06.11.2026 | הרחבה קשורה ל-Host Presentation Mode P0 1220285541641534: End Timer בקיצור T ממסך מנחה נקי שאותו מחשב משדר במקרן; Space/Enter מיועדים ל-Next כשחוקי, ללא ביטול טיימר בלתי צפוי. יש להוסיף Pause/Resume שרת authoritative (P), להמשיך מהזמן שנותר ולשמר תוצאות/הצבעות במחשב/טלפון; להפריד לחלוטין בין Pause, End Timer ו-Skip Question. QA timeout/cooldown/epoch/reconnect/phone. דרישות ושער QA מלאים במשימה הקשורה; המחקר מ-24.10 היסטורי.

### Linked subtasks
- 1219846296304502 — QA — סיום טיימר ידני, אוטומטי וזמן בלתי מוגבל
- 1219846277961095 — Maya — כפתור End Timer ותיאום HUD, אנימציות ומוזיקה
- 1219846387458576 — Tomer — End Answer Timer בטוח בשרת ללא דילוג על שלב התוצאות

### Comments
(No comments returned)

## C.3 — בקרות מנחה: חזרה למסכים ולשאלות קודמות במהלך משחק פעיל
**Asana ID:** `1219846387400318`  
**URL:** https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1219846387400318  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-11-06T01:29:40.957Z

### Exact Asana task description (verbatim)

תכנון למימוש אחרי אינטגרציה בסיסית. נבדק בקוד Tomer/Maya ב-24.10.2026: אין פקודת PREVIOUS/REWIND ב-Socket או RoundManager; onBack ב-GameWrapper הוא Exit לחזרה להגדרות, לא חזרה לשאלה. goPrev הקיים מופיע רק ב-ResultModal לאחר המשחק. נדרש להבחין בין VIEW_PREVIOUS_READ_ONLY (צפייה בהיסטוריה ללא שינוי המשחק/ניקוד) לבין REPLAY_FROM_PREVIOUS (חזרה אמיתית עם אישור המנחה, שחזור תשובות וניקוד). Tomer בעל packages/socket/common + extensions/core/server/gameplay; Maya בעל packages/web/src + extensions/presentation. אל לשנות קוד עכשיו בלי אינטגרציה מבוקרת. בדיקות קריטיות: טיימרים תלויים, נקודות, leaderboard, קבוצות, היסטוריית שאלות, clientId וסימולטור טלפוני, reconnect, משחק ללא extensions. יומן פעולות ושמירת עקביות חשובים.

=== CROSS-REFERENCE 06.11.2026 ===
06.11.2026 | שייכות ל-Host Presentation Mode P0 1220285541641534: קיצורי חזרה מתוך אותו מחשב שמוקרן ב-Duplicate/Mirror. בקוד העדכני קיימת PREVIOUS_SCREEN בשרת, עם confirmed ויכולת reopen; המפרט למעלה מ-24.10 היסטורי. בחזרה שאינה משנה scoring: Left; בחזרה אמיתית/שחזור שאלה: Shift+Left + מנגנון אישור מקלדת בלבד או חסימה עד יציאה לממשק הניהול. לעולם לא modal שמוקרן לציבור. לנהל ledger/votes/epoch והגנה מפני undo מקרי. כל הדרישות והבדיקות במשימת P0 החדשה.

### Linked subtasks
- 1219846157830256 — Tomer — להגדיר ניווט אחורה כצפייה בלבד לעומת שחזור סבב אמיתי
- 1219846157830192 — Maya — כפתורי Previous ו־Exit נפרדים ותצוגת סקירה ברורה
- 1219846371518478 — Tomer — ליישם checkpoint, שחזור ניקוד ותשובות וביטול אירועים ישנים
- 1219846296304311 — QA — בדיקות ניווט אחורה ושחזור ללא פגיעה בנתוני המשחק

### Comments
(No comments returned)

# APPENDIX D — RELATED ASANA AUDIO / MEDIA INTEGRATION TASKS (FULL DESCRIPTIONS)

## D.1 — נגן אודיו מרכזי ואמין — Loop, Fade, Ducking, השמעה מוקדמת ושליטה חיה של המנחה
**Asana ID:** `1219846911605148`  
**URL:** https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1219846911605148  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-10-25T00:17:08.977Z

### Exact Asana task description (verbatim)

Reuse extensions/src/presentation/audio-cue-player.tsx (resolveAudioCue, shouldDuckMusic, <AudioCuePlayer>) + upstream SFX; no second playback engine. כיום יוצר new Audio per cue, loop/volume enabled, cleanup on unmount, handles autoplay and competing media by blocking music; fallback DEFAULT_CUE_URLS = /sfx/{start,show-question,answers-music,...}. חובה לוודא קיום קבצי /sfx לפי actual build/public paths; אין להציג כתקין fallback שקט עם 404. EditorEnhancementPanel.handleTestPlay uses new Audio without pausing previous audio or unmount cleanup.
Target AudioManager single instance per presenter/playback scope: separate background_music and one-shot_sfx channels, never two songs overlapping; fade in/out and optional crossfade, loop seamless when recorded, volume/mute and manual Play/Pause/Skip, respects browser autoplay, choice of stop vs continue, audio onended -> interlude auto advance guarded idempotent by epoch. Audio duck/pause under question video/audio, resume if configured, avoid background playing on player phones unless expressly intended (default presenter/large-screen only); no surprises from reconnect/replay/skip/end-timer; no duplicates in WebSockets. Editor preview is isolated, stops on modal close. Background uploads: safe formats, loading/error fallback, no crash; memory cleanup.
Add host controls in-game for manager: mute, pause, change track from catalog, fade, quick short interlude song without entering editor; control only changes current session unless saved by explicit action. Logs/test requirements: real browser autoplay restrictions and iOS/mobile, audio sync, lifecycle/TTL, race on skips, background vs reveal SFX. Owners Maya player/UI, Tomer session state/commands. Status pending.

### Linked subtasks
- 1219846804642486 — Maya — תיקון באג preview: new Audio קיים ממשיך להתנגן
- 1219846882823260 — Maya + Tomer — סנכרון מוזיקה עם וידאו/טיימר/Reveal/Interlude
- 1219846882834884 — QA — אמת נכסי ברירת מחדל וניהול Autoplay/Error
- 1219846911629004 — Maya — AudioManager משותף שממחזר AudioCuePlayer
- 1219846911638741 — Maya — שליטה חיה למנחה: Mute, Pause, Track, One-shot Music

### Comments
(No comments returned)

## D.2 — בדיקות אינטגרציה ל־Media Library, אודיו, רקעים, זכויות ומצבי משחק
**Asana ID:** `1219846703416682`  
**URL:** https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1219846703416682  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-10-25T00:57:38.832Z

### Exact Asana task description (verbatim)

Gate begins after module changes are merged into current integration branch and current acceptance gates are closed (existing 'השלמת חיבור פיצ'רים...' 1219846276689346). E2E real Razzia server/manager, web players, mock DTMF; questions/surveys, open->question->answers->results->leaderboard->interlude->next->podium; verify selected soundtrack & image backdrop only on intended presenter screen, 0 missing asset references, response-time and device load. Browser test actual HTMLAudioElement events (autoplay restriction, muted, loop, onended, crossfade, ducking), interlude auto after song, manager Next/Skip, End Timer and preceding answer-reveal animation, player immediate results unchanged. 8 locales, projector + mobile + keyboard, reduced motion/audio accessible.
Data tests: QuizExtras perQuestion UUID and schema migration/old quiz unchanged; preferences inherit and reapply after reorder/add/remove; upload stable path and licensing provenance; no unlicensed bundled content; CDN/network outage still plays local assets. Unit/integration/playwright pnpm lint/format/typecheck/build and full regression. Audio metrics load latency/asset footprint (16GB Windows resource), tests with long files/large images, missing/invalid/corrupt formats. QA handoff & screenshots. Owners Tomer integration/automated QA, Maya visual/user experience, Noam only if telephony fixture conflict; no new fourth agent by default. Planned.

### Linked subtasks
- 1219846829138562 — בדיקות Live Browser: מוזיקה/תמונות, מסכי שאלה, סקר, מעבר ודירוג
- 1219846804642294 — בדיקות סגנון, נגישות ותאימות: 8 שפות, כל המכשירים, legacy
- 1219846703492190 — בדיקות מירוץ וסנכרון: End Timer, Next/Skip, Reconnect
- 1219846911626522 — בדיקות בחירת קטלוג ורישוי: כל פריט כולל evidence

### Comments
(No comments returned)

## D.3 — Tada Media Library — בחירת מוזיקות, אפקטים ורקעים מובנים עם רישיונות מאומתים
**Asana ID:** `1219846804616266`  
**URL:** https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1219846804616266  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-10-25T22:02:49.655Z

### Exact Asana task description (verbatim)

מטרת המשימה: ספריית מדיה מובנית ל-Tada עם מוזיקה, אפקטים, רקעים, רישיונות ויכולת בחירה. פתוחה.

מצב אצירה: במאגר Tada-media-curation נמצאו 8 קטעים שנבחרו בעבר; אומתו קבצים, גודל ו-SHA256. לא נבחרה מוזיקת פתיחה סופית ולא הסתיימה בדיקת רישוי מסחרי. קבצי MP3 קיימים בפרויקט Razzia, וכבר הוכנו/הועלו שישה WAV (000–005) לפיילוט ימות המשיח.

עדכון 26.10.2026: המשתמש אישר בשיחת טלפון ישראלית אמיתית את השמעת מוזיקת הפתיחה הזמנית ואת הקליקים הניטרליים בלי תפריט. לכן שלב ההשמעה הטלפונית כבר מאומת, בניגוד לדיווח הקודם. מה שטרם הושלם: חיבור קליק נכון/שגוי לפסיקה אמיתית של מנוע המשחק; בחירת SFX/מוזיקה סופית ורישיונות. קיים פער ברירת מחדל בנתיבי דפדפן /sfx מול /sounds. עיקרי ההשלמה הטלפונית נמצאים במשימת P0 הראשית: 1219846294963052. קבצים מקומיים: Tada-media-curation, Tada-phone-pilot.

### Linked subtasks
- 1219846829138818 — אצירת 10–15 רקעים גרפיים מותאמים ומקוריים ל-Tada (Maya)
- 1219846829128574 — אצירת אפקטי SFX וג'ינגלים מתוך Kenney CC0 (Maya)
- 1219846882824208 — Manifest נכסים, רישוי והתקנה מקומית עצמאית (Tomer)
- 1219846829138626 — אצירת מוזיקה: 15–25 קטעים לפי אווירה, האזנה ולופ (Maya)

### Comments
(No comments returned)

## D.4 — Media Picker מאוחד — מוזיקה, אפקטים, רקעים וקבצים אישיים עם האזנה ובחירה
**Asana ID:** `1219846804616364`  
**URL:** https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1219846804616364  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-11-03T18:57:36.147Z

### Exact Asana task description (verbatim)

לבנות בוחר מדיה משותף אחד הנפתח מעורך שאלה, שאלת סקר, פתיחה, טיימר/תשובות, לוח ניקוד, סיום, interlude/מסך בין שאלות: טאבים Music, SFX, Backgrounds ו-'My Uploads'; mood filters, text search, duration/loop badges, list/grid, thumbnails, preview playback Play/Pause, Stop, volume slider, Apply, Remove/Reset, disabled/missing states. קבצים מתוך אוצר פנימי לצד קבצים שהמשתמש העלה; לא לתת להאזנות להמשיך אחרי סגירת המודאל או מעבר פריט. התאמה למקלדת/navigability, מסכים קטנים, 8 שפות.
Reuse packages/web/src/features/quizz/components/QuestionEditor/MediaLibrary/*, hooks/useUploadMedia.ts, packages/socket/src/api/routes/media.ts (GET/POST/DELETE behind requireManager), EditorEnhancementPanel.tsx Audio tab. הספרייה הקיימת מציגה uploaded files בלבד, לא catalog built-in. יש handleTestPlay(new Audio(url)) שמשנה testingCue אך אינו מחזיק ref/pauses old audio או cleanup בעת החלפה/סגירה — bug fix נחוץ.
חיבור לתצוגה מקדימה ולמשחק אמת; בלי קוד העלאה/נגן כפול, בלי backend נוסף בלתי נחוץ. Maya owns UI; Tomer owns APIs/contracts. Depends on curated manifest and media-identity scheme. סטטוס פתוח.

=== 03.11.2026 LOCAL VERIFIED @ ea8342e ===
Existing studio-scene-editor.tsx MediaLibrary acceptType=all, handleMediaSelect maps any non-video type to image; audio selected as foreground media would be misclassified. Fix picker media-type filter/preview on existing shared MediaLibrary, no duplicate service/player, correct audio scene type and opening video. Lottie brand assets user-supplied later, build secure supported filter/player/asset reuse. Existing crash-safe delete journal awaiting independent QA must not regress. Task 1220182043166287 and 1220181816988257.

### Linked subtasks
- 1219846882835217 — Tomer — חוזה מזהי נכס ותמיכה בנתיבים מאובטחים
- 1219846882835153 — Maya — האזנה אמיתית Play/Pause/Stop ו-preview רקע
- 1219846804642358 — Maya — בוחר מדיה אחד עם קטגוריות, Mood, חיפוש וסינון
- 1219846911627698 — Maya — חיבור בוחר משותף לכל נקודות העריכה

### Comments
(No comments returned)

## D.5 — הגדרות פסקול לפי שאלה, סקר ושלבי המשחק — Defaults, Overrides ו־Mood Presets
**Asana ID:** `1219846703441400`  
**URL:** https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1219846703441400  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-10-25T22:01:11.973Z

### Exact Asana task description (verbatim)

כיום QuizExtrasV1 (extensions/src/core/quiz-extras.ts) מגדיר audio.cues ל-9 cue IDs ברמת חידון: start, showQuestion, answersMusic, answerPressed, revealResults, leaderboard, podium1/2/3; AudioCueSetting {source:'default'|'media',url?,volume,enabled,loop}. אין ב-perQuestionItemSchema הגדרת soundtrack/background. יש perQuestion interlude {kind,title,url,durationMs,advance,audioCue?} אבל audioCue חופשי לא מספיק לנגן שיר ייחודי בין שאלות.
לבנות חוזים backward-compatible: Quiz global default track/theme; optional perQuestion soundtrack for quiz OR survey; override per-stage (show question, answer countdown, reveal, responses, leaderboard, interlude, opening, outro/podium); per interlude track custom; preset mood sets thematic sound+background with individual overrides; inherit/global/none/explicit (media/custom catalog) resolution; volume, loop, fadeSeconds, startOffset optional, stop on end vs play through, ducking; UI shows inheritance and reset. Need schemaVersion migration if strictObject rejects new keys, migration, round-trip, stable IDs, save/reload, import/export; never break legacy or 8 locales.
Functionality: upload song for interlude, choose auto advance after audio ends (distinct from configured duration/manual Next), cap runaway duration/fallback when track unavailable, preserve manager Next/Skip and natural end. Question-answer background track for calm/dramatic/tension; surveys separately configurable. Preserve original per-player SHOW_RESULT immediate behavior; no change to scoring.
Owners Tomer: schema/migrations/persistence/authoritative stage cues; Maya: audio configuration, mood selector and previews. Depends on media catalog/picker and stable per-question UUID task 1219846828216071. Status pending.

### Linked subtasks
- 1219846911648446 — Maya — מצבי אווירה מתוכננים מראש + override פרטני בכל שאלה
- 1219846882834820 — Tomer + Maya — מסכי מעבר עם שיר אישי וסיום לפי אירוע onended
- 1219846829138754 — Tomer — schema backward-compatible לרקע ופסקול ברמת Quiz/Question/Stage
- 1219846882834948 — Tomer — סדר ירושה deterministic וניהול שלבי משחק

### Comments
(No comments returned)

## D.6 — Maya + Tomer — סנכרון מוזיקה עם וידאו/טיימר/Reveal/Interlude
**Asana ID:** `1219846882823260`  
**URL:** https://app.asana.com/1/1219597879016953/task/1219846882823260  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-10-25T00:17:01.421Z

### Exact Asana task description (verbatim)

Duck/pause under active question audio/video; restore with fade; cancel on Next/Skip/End Timer/new question/reconnect/exit; preserve immediate per-player SHOW_RESULT (do not delay for reveal/track). Prevent competing use-sound/upstream SFX and stale event restarts.

### Linked subtasks
None

### Comments
(No comments returned)

## D.7 — Maya — AudioManager משותף שממחזר AudioCuePlayer
**Asana ID:** `1219846911629004`  
**URL:** https://app.asana.com/1/1219597879016953/task/1219846911629004  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-10-25T00:17:01.343Z

### Exact Asana task description (verbatim)

הרחבת existing extensions/src/presentation/audio-cue-player.tsx למנהל ברמת presenter בלבד עם background music and one-shot SFX channels, no overlapping background songs, fade-in/out, crossfade safe, volume, loop, pause/resume, onended, ended->transition with stage epoch; no duplicate playback library.

### Linked subtasks
None

### Comments
(No comments returned)

## D.8 — Maya — שליטה חיה למנחה: Mute, Pause, Track, One-shot Music
**Asana ID:** `1219846911638741`  
**URL:** https://app.asana.com/1/1219597879016953/task/1219846911638741  
**Status:** OPEN / NOT COMPLETED  
**Last modified:** 2026-10-25T00:17:01.314Z

### Exact Asana task description (verbatim)

Presenter toolbar volume/mute/pause/change/select curated track/start optional uploaded interlude song from media picker, reset to saved setting; live override scoped session no persistent quiz change unless Save. Only manager can control, player phones do not receive background music.

### Linked subtasks
None

### Comments
(No comments returned)

# APPENDIX E — IMPORTANT RELATED ASANA REFERENCES
- Tzila existing show: https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1220231031395856 (already studied; preserve current production settings)
- Full reveal contract: https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1219846702589614
- Host QA: https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1219851365181749
- Production QA: https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1220193632309266
- Source production site: https://tadazz.com/manager

**Final gate: implement locally, test and document. NO production release unless the user later authorizes it separately.**
