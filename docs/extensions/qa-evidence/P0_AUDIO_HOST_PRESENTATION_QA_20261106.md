# דוח QA — P0 אודיו מלא + Host Presentation Mode

**תאריך:** 2026-11-06  
**ענף:** `agent/tadazz-next-20261105`  
**HEAD בסיס:** `66626d2a713eb7e43e36831802f67ce9b5dc21cf`  
**מצב שחרור:** לא נפרס. אין שינוי בפרודקשן או במופע Tzila החי.

## סיכום

מומשו מקומית שני מסלולי P0 על גבי ה־shell, ה־socket והבמה הקיימים, ללא חלון `/display` נוסף לצורך מצב ההקרנה וללא מופע משחק/אודיו כפול:

- Host Presentation באותו חלון עם Fullscreen native, הסרה אמיתית של UI ניהולי, Escape וחזרה לאותו משחק, בקר מקלדת עצמאי מה־toolbar, אישור chord כפול לפעולות הרסניות ו־ACK לפקודות.
- Pause/Resume authoritative בשרת עבור countdown, הכנה, הצבעה, auto advance, interlude וסצנות authored. תשובות חדשות בזמן Pause נדחות; תשובות קיימות וניקוד נשמרים; חידוש משתמש בזמן המדויק שנותר.
- Audio owner יחיד ברמת presenter עם שני ערוצי background ל־crossfade מבוקר, ערוץ SFX אחד, ducking, mute, pause/resume, preload, fallback, generation cancellation, continuity groups וניתוב כל cue קיים ל־`/sounds/*`.
- פתיח MP4 נשאר מושתק תמיד; גבול ויזואלי 7.933 שניות נפרד מגבול מוזיקה 12 שניות. מקור המוזיקה החיצוני לא הוכנס למוצר בגלל חסימת זכויות מפורשת.
- תשובת web player משתמשת כעת ב־ACK שרת ואינה ננעלת מקומית אם Pause דחה את ההצבעה. מסלול הטלפון מחזיר `game_paused`.
- `/display` בלובי מחזיר כעת את קוד החדר וה־QR הציבוריים גם לצופה, בהתאם לתוכן הציבורי של מצב ההקרנה.

## קבצים ששונו עבור P0

### חוזים ו־schema

- `extensions/src/core/constants.ts` — soundtrack slots ופקודות `PAUSE_GAME`/`RESUME_GAME`.
- `extensions/src/core/commands.ts` — סכמות Zod לפקודות Pause/Resume.
- `extensions/src/core/state.ts` — snapshot אופציונלי authoritative של pause.
- `extensions/src/core/quiz-extras.ts` — soundtrack slots אופציונליים, backward-compatible, עם URL, gain, loop, fade, offset ומשך מרבי.
- `packages/common/src/validators/socket.ts` — allowlist לפקודות החדשות.
- `packages/common/src/types/game/socket.ts` — ACK להצבעה ולפקודות extension.

### שרת, טיימרים וטלפון

- `packages/socket/src/services/game/cooldown-timer.ts` — pause/resume מדויק במילישניות תוך שמירת contract ה־abort הישן.
- `packages/socket/src/services/game/round-manager.ts` — pause של sleeps, voting, auto advance ו־interlude; דחיית הצבעות; תיקון זמן ניקוד אחרי Pause.
- `extensions/src/server/game/studio-show-coordinator.ts` — pause/resume של scene deadlines והגנת stale advance.
- `extensions/src/server/game/session.ts` — authorization, epoch, dedupe, pause snapshot וניתוב פקודות.
- `packages/socket/src/services/game/index.ts` — delegate ל־pause, סיבת `game_paused` לטלפון, ACK להצבעה, ולובי ציבורי עם code/QR.
- `packages/socket/src/handlers/game.ts` — ACK אמיתי להצבעת web ולפקודות host.

### Host Presentation

- `packages/web/src/features/game/components/host-presentation-controller.ts` — lifecycle של fullscreen ובקר מקלדת mounted מחוץ ל־toolbar.
- `packages/web/src/features/game/components/GameWrapper.tsx` — owner יחיד למצב presentation; stage/socket/audio אינם remount.
- `packages/web/src/features/game/components/ManagerControlToolbar.tsx` — כפתורי Present ו־Pause/Resume; תיקון dependency של `isScene`.
- `packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx` — הסרת toolbar/footer/modal/PII במצב הקרנה; pause למדיה/אנימציה; player ACK guard; audio/cue integration.
- `packages/web/src/pages/display/$gameId.tsx` — לובי ציבורי עקבי לצופה.
- `extensions/src/presentation/cinematic-layer-stack.tsx` — pause למדיה והסתרת autoplay control בהקרנה.
- שמונה קובצי `extensions/src/locales/*/extensions.json` — en/fr/de/es/it/ja/tr/vi.

### אודיו ופתיח

- `extensions/src/presentation/audio-cue-player.tsx` — AudioManager ארוך־חיים, background/SFX channels, crossfade, ducking, pause, cleanup ו־cue idempotency.
- `extensions/src/presentation/tadazz-audio-policy.ts` — מיפוי phase/scene ל־soundtrack slot ו־continuity group.
- `extensions/src/presentation/tadazz-show/TadazzOpening.tsx` — source video מושתק תמיד, visual clock של 7.933 שניות ו־sound unlock נפרד.
- `extensions/src/editor/components/AudioCuesSection.tsx` — הגדרת soundtrack slots מורשית ושמירת preview cleanup קיים.
- `extensions/src/presentation/index.ts` — export למדיניות החדשה.

### בדיקות וראיות

- `packages/socket/src/services/game/cooldown-timer.pause.test.ts`
- `packages/web/src/features/game/components/host-presentation-controller.test.ts`
- `extensions/src/presentation/tadazz-audio-policy.test.ts`
- `extensions/src/presentation/tadazz-show/opening-and-engine.test.ts`
- `extensions/src/server/game/studio-show-coordinator.test.ts`
- `extensions/src/server/gameplay-phase-a.test.ts`
- `packages/e2e/tests/host-presentation.spec.ts`
- `packages/e2e/playwright.host-presentation.config.ts`
- `packages/e2e/playwright.next.config.ts`
- `docs/extensions/orchestration/P0_AUDIO_HOST_PRESENTATION_IMPLEMENTATION_NOTES_20261106.md`

קובצי Codex הקיימים, כולל `creating-worlds-show.ts`, `source-layout.css`, 40 הנציגים, 70 timeline steps, 16 presets וכל evidence קיים, נשמרו. לא הופעלו סקריפטי deploy ולא שונו sidecars חיים.

## שלמות מוזיקת Tzila

שני fixtures המקומיים מכילים הגדרה זהה:

```json
{
  "source": "media",
  "url": "/media/tzila-determined-pursuit-20261105.mp3",
  "volume": 0.38,
  "enabled": true,
  "loop": true
}
```

- `work/goldy-tzila-extras.json` SHA256: `f5efdeb64b65cdab859795d5f68f4513a1509bda4735328c1a44fa1fc6734fb5`
- `work/goldy-tzila-completed.json` SHA256: `81eb87a26b8600081f9bd34553c135da99981cb268a7d80f74e3d1a8db42b2e7`
- `git diff` עבור שני הקבצים: ריק.
- בדיקת runtime `resolveAudioCue` מאמתת URL, volume, enabled, loop ו־`isDefault=false` מתוך fixture האמיתי, לא מול literal עצמאי.
- בקוד AudioManager, `answersMusic` גובר תמיד על slot voting, ללא fallback לשיר אחר וללא background duplicate.

לא התחברנו ל־Asana או ל־tenant החי, ולכן זו הוכחת candidate/fixture ולא הוכחת קריאה מפרודקשן.

## אימות נכסי מקור וזכויות

כל שמונת קובצי `C:\Users\DAVID\Code\Tada-media-curation\approved` קיימים. גודל ו־SHA256 של כולם זהים ל־`manifest.json`. משכי manifest: 12.0, 123, 220.29, 108, 123.43, 191.69, 91.21 ו־134.4 שניות.

כל שמונת הרשומות עדיין מסומנות `readyForProductBundling=false`. בפרט, Determination כולל הערת Apple Loops הדורשת בדיקת תנאי צד שלישי. לכן לא הועתק ולא הומר אף track לתיקיית public/build ולא פורסם asset חדש. ה־schema וה־runtime מוכנים ל־URL מורשה תחת `/media/...` לאחר clearance.

`ffprobe` עבור MP4 הפתיח:

- duration: `7.933333`
- video: H.264
- audio: AAC

הקומפוננטה כופה `defaultMuted=true`, `muted=true`, `volume=0`, מאזינה לשינוי volume ולעולם אינה מציבה `muted=false`.

## בדיקות שבוצעו

| פקודה                                                                     | תוצאה                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --version`                                                          | PASS, `11.24.0`                                                                                                                                                                             |
| `node --version`                                                          | PASS, `v22.17.0`                                                                                                                                                                            |
| `pnpm test`                                                               | PASS, 26 files / 326 tests                                                                                                                                                                  |
| `pnpm --filter @razzia/extensions test`                                   | PASS, 47 files / 483 tests                                                                                                                                                                  |
| סה״כ Vitest                                                               | PASS, 73 files / 809 tests                                                                                                                                                                  |
| `pnpm build`                                                              | PASS, socket + web; Vite 3070 modules                                                                                                                                                       |
| `pnpm --filter @razzia/socket build`                                      | PASS                                                                                                                                                                                        |
| `pnpm --filter @razzia/web build`                                         | PASS                                                                                                                                                                                        |
| focused pause/telephony                                                   | PASS, 26/26 + 40/40 בהרצות ממוקדות                                                                                                                                                          |
| `playwright ... host-presentation.spec.ts` Chromium                       | PASS, 1/1, 45.2s                                                                                                                                                                            |
| `playwright ... playwright.host-presentation.config.ts` WebKit            | PASS, 1/1, 42.4s (denial/fallback path)                                                                                                                                                     |
| `playwright ... tadazz-next-live.spec.ts tadazz-native-directory.spec.ts` | PASS, 2/2, 4.8m; 10 שאלות/2 סבבים + 40 נציגים                                                                                                                                               |
| `git diff --check`                                                        | PASS                                                                                                                                                                                        |
| Prettier על כל קובצי P0                                                   | PASS לאחר תיקון שני קבצים                                                                                                                                                                   |
| `pnpm lint`                                                               | BLOCKED: oxlint דורש Node >=22.18 ל־`oxlint.config.ts`; מותקן 22.17.0                                                                                                                       |
| `tsc -b packages/web/tsconfig.json`                                       | FAIL: 126 שגיאות בעץ ה־dirty הכולל; 12 מהן נמצאות בקבצים משותפים שגם P0 נגע בהם, בקוד קיים שאינו חלק מהשינוי החדש. ללא baseline נקי אי אפשר לייחס אותן אוטומטית. Vite production build עבר. |

בדיקת Chromium כוללת HTTP 200 עבור תשעת קובצי `/sounds/*`, MP4 הפתיח ו־Lottie; אותו URL נשמר בכניסה/יציאה; ללא toolbar, host footer או audio controls; QR/PIN ציבוריים; 1920×1080, 1366×768, 1280×720, 1024×768 ללא overflow; mixed destructive chords אינם מאשרים skip; P pause/resume; T end timer; player result מיידי.

## ראיות דפדפן

- `work/p0-audio-host-presentation-20261106/lobby-display-1920x1080.png`
- `work/p0-audio-host-presentation-20261106/lobby-host-present-1920x1080.png`
- `work/p0-audio-host-presentation-20261106/lobby-host-present-1366x768.png`
- `work/p0-audio-host-presentation-20261106/lobby-host-present-1280x720.png`
- `work/p0-audio-host-presentation-20261106/lobby-host-present-1024x768.png`
- `work/p0-audio-host-presentation-20261106/voting-paused-host.png`
- `work/p0-audio-host-presentation-20261106/results-host-present.png`
- Playwright videos/traces: `work/next-acceptance-results/`
- 10-question evidence retained under `work/next-live-evidence/` and Codex evidence directories.

בדיקה חזותית של התמונות מאשרת stage ציבורי ללא פקדי host וללא גלילה. נכס הפתיח הקיים מכיל watermark גרפי קיים; בהתאם לדרישה לא שונו גרפיקת הווידאו או האנימציה.

## חסימות ושערי שחרור שנותרו

1. אין clearance מסחרי/אריזה לשמונת ה־tracks. לכן הפסקול המאושר אינו bundled ואי אפשר לטעון שהאזנה מלאה לכל שמונת השירים עברה.
2. לא בוצעה האזנה אנושית ל־crossfade/ducking/עוצמות, ולא בוצע QA פיזי עם מחשב Windows ומקרן במצב Duplicate/Mirror או iPad Safari אמיתי.
3. WebKit אוטומטי עבר את מסלול סירוב fullscreen והחזרה הבטוחה; הוא אינו תחליף ל־Safari/iPad חומרתי או להוכחת autoplay audible.
4. lint מלא חסום בגרסת Node המקומית; typecheck מלא מחזיר 126 שגיאות בעץ ה־dirty, כולל 12 בקבצים משותפים שכבר נשאו עבודת Codex. לא קיים baseline נקי שמאפשר לטעון שכל 126 קדמו למשימה. ה־production builds והבדיקות עוברים.
5. לא בוצע peer review עצמאי.

לכן הקוד משולב ונבדק מקומית, אך שער השחרור נשאר חסום עד clearance, האזנה/חומרה, lint בסביבת Node נתמכת, טיפול/אישור ב־typecheck baseline ואישור בעלים מפורש.

## Rollback

העבודה נמצאת בעץ dirty שבו היו שינויי Codex לפני תחילת המשימה. אסור לבצע rollback גורף, reset או clean. Rollback בטוח חייב להיות patch ממוקד של קבצי P0 ברשימה לעיל, תוך השארת שינויי Codex ו־evidence קיימים. קבצי runtime החדשים שניתן להסיר בנפרד לאחר review הם:

- `extensions/src/presentation/tadazz-audio-policy.ts`
- `packages/web/src/features/game/components/host-presentation-controller.ts`
- בדיקות/configs P0 החדשים
- תיקיית `work/p0-audio-host-presentation-20261106/`

לא נוצר commit, לא בוצע push/merge/deploy, ולא שונה מופע Tzila החי.
