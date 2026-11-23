# P0 — TADAZZ v4 Full Native Integration (Coding Agent)

**הוראת ביצוע מחייבת לסוכן קוד יחיד.** לבצע את המשימה, לא להחזיר רק תכנון. להתקדם עד עבודה עובדת, בדיקות ותיעוד, עם rollback בטוח. לא למזג או לפרוס לאתר ללא אישור המשתמש.

## 1. מקום העבודה ומקורות האמת

- Worktree: C:\Users\DAVID\Code\Razzia-worktrees\tadazz-v4-design-kit
- Branch: agent/tadazz-v4-design-kit-20261105
- Starting HEAD: 49cf23f — מבוסס על 158c589 של Goldy Motion Show הקודם.
- ZIP מלא שכבר נמצא במחשב: docs/extensions/references/TADAZZ_V4_NATIVE_REACT_INTEGRATION_PACKAGE_20261105.zip
- **ה־ZIP כבר חולץ לקובצי המקור בפרויקט! אל תחלץ שוב מעל קבצים שהתעדכנו.**
- מקור אמת ויזואלי: docs/extensions/references/tadazz-v4/animation-library-set-v4.html
- SHA256 של המקור: 6ae154d4d208a72dbf052f76abce8d59c2b56ecddf4e514d7f28b2a01bdf3cda
- מסמכי reference: docs/extensions/references/tadazz-v4/INTEGRATION.md, original-style.css, motion-runtime-reference.js, demo-controller-reference.js, design-tokens.json, assets-manifest.json.
- צילומי השוואה: docs/extensions/qa-evidence/tadazz-v4/.
- הפעל: node scripts/tadazz/check-v4-assets.mjs; שמונת הנכסים צריכים לעבור hash verification. בדיקות יחידה מבודדות של הערכה עברו 8/8 — אינן מספיקות להוכיח שילוב משחק מלא.

**הוראה מוחלטת:** הקובץ HTML נועד רק כדי לחלוץ ולהשוות רכיבים, טיפוגרפיה, CSS, פרופורציות, טרנזישנים, keyframes, easing, טיימינג ואפקטים. אסור להטמיע את קובץ ה־HTML עצמו; אסור iframe, WebView, dangerouslySetInnerHTML או צילום מסך כתחליף לקוד. חייבים React, TypeScript/TSX, CSS מבודד ו־Web Animations API בקוד המשחק הקיים.

## 2. ספריית v4 שכבר קיימת (לא לשכתב מאפס)

מיקום: extensions/src/presentation/tadazz-v4/
- TadazzV4Stage.tsx — במה 1920×1080, ResizeObserver, API: play/replay/pause/resume/skipToEnd/stop/setPercentagesVisible.
- components.tsx — StageSceneV4, StageIdentityV4, StageAmbientV4, StageBackdropV4, QuestionFrameV4, FivePictureAnswersV4, AnswerSlotV4, VoteStatusV4, CountdownFloaterV4, TopPickV4, QuestionImageV4, LeaderboardV4, RoundRecapV4, InterludeV4, ZWipeV4.
- motion.ts — מנוע WAAPI, easing, clock, impact, particles, flash, cues, transition choreography.
- tadazz-v4.css — צבעים, טיפוגרפיה, תאורת במה, נורות, זוהר, כרטיסים, מספרים, תוצאות, spotlight, recap, z-wipe; מבודד תחת tzv4.
- types.ts, index.ts, motion-spec-v4.json, scenes.test.ts, types.test.ts.

נכסים מקוריים שמוכנים באתר: packages/web/public/tadazz-show/v4/ — tadazz-brand-logo.png, question-bg.webp, show-stage.webp וחמש תמונות SVG לדוגמה בלבד. תמונות הדוגמה נמצאות ב־qa ואין להשתמש בהן כשאלות/תשובות אמיתיות.

**הספרייה כבר נמצאת בענף, אבל אינה מחוברת כרגע למסך הפעיל!** צריך לשלב אותה בפועל, לא רק לכתוב עוד קובצי library.

## 3. נקודות החיבור המדויקות — להשתמש בלוגיקה הקיימת

- extensions/src/presentation/index.ts: חשיפת API של v4 באופן תקין וללא import cycles.
- packages/web/src/features/game/components/GameWrapper.tsx: TadazzShowView חייב להמשיך להיות בעלים בלעדי על כל הבמה; אין mount של GameBackground הישן ולו פריים אחד.
- packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx: מסך המנחה/שחקן/מקרן הקיים, כולל sockets, status, מדיה, opening, תגובת שחקנים, AudioCuePlayer, ניהול ונוכחות; **להחליף את רינדור הבמה המתאים ל־v4 מבלי למחוק את המעטפת והלוגיקה**.
- extensions/src/presentation/tadazz-show/presentation-scene.ts: computeShowScene, buildStageQuestion, buildReveal, leaderboardEntries, resolveStageBackdrop — מקור נתונים סמכותי; להשתמש בו.
- extensions/src/presentation/tadazz-show/show-director.ts: planTransition/runSteps, דילוגים, scene state ו־resume; ליצור adapter v4 ולא מנוע state מתחרה.
- packages/web/src/features/game/components/tadazz-show/TadazzScreens.tsx: מסכי לובי, waiting, count, recap, interlude, player-result, finale וכו' — להחליף חזותית רק היכן שנדרש, תוך שמירת ההתנהגות.
- packages/web/src/features/game/components/tadazz-show/TadazzAnswerPad.tsx: בחירה בודדת, מרובה, estimation, touch, keyboard, submit ומצבי disabled.
- packages/web/src/pages/display/$gameId.tsx ו־packages/web/src/features/game/components/PlayerGameView.tsx: מקרן ושחקן משתמשים בנתונים זהים וממופים לפי role.
- extensions/src/core/studio-timeline-schema.ts: motionKit כרגע goldy-20261105/legacy; להוסיף/למפות v4 עם backward compatibility לנתוני העורך וה־JSON/XLSX. אין לשנות עיצוב העורך.
- packages/socket/src/services/game/index.ts: recap וסיכומי הצבעות מן השרת — לא להמציא נתונים; לבדוק התאמת badgeType מול badge ב־PublicAnswerRecapQuestionItem.
- packages/e2e/tests/tadazz-full-show-parity.spec.ts + packages/e2e/playwright.tadazz-show.config.ts: להרחיב E2E ולא להסתפק בבדיקות יחידה.

**שימור:** MP4 הפתיחה ו־TADAZZ-Opening-4-5s.json Lottie מעליו ב־TadazzOpening.tsx; שמור גם Scene-1.json, CinematicLayerStack, background override, custom media, SFX, audio per screen, telephony, host controls, players, roster, team scoring, leaderboard, registration, QR/PIN, reconnect, /display, player footer, auth, i18n, import/export. אין שינוי לא נחוץ ב־Razzia המקורי ואין מחיקת הקוד הקודם (rollback).

## 4. כל 13 המצבים — לכל אחד חייב להיות חיבור מלא

1. **question** — SHOW_QUESTION: מסגרת, eyebrow, טקסט, פס תאורה וכניסת השאלה; אין לייצר תשובות מוקדם.
2. **picture-answers** — SELECT_ANSWER: כל כרטיס, תמונה, כותרת ומספר תחתון נכנסים כיחידה יחד ב־stagger; 2–5 אפשרויות אמת בלבד, לא להשלים בכרטיסי דמו.
3. **voting-open** — הצבעה שנפתחה באמת: status/motion ומחוון בזמן שכל הכרטיסים נשארים גלויים.
4. **countdown** — טיימר עגול ענק במרכז, scale 2.55, מתכווץ ועובר לפינה כשהכרטיסים נשארים; time/deadline סמכותיים מן השרת, לא שני טיימרים.
5. **vote-locked** — השרת נעל הצבעה: dim/flash/blast/rings/particles לפי המקור; skip לא ממציא הצבעה.
6. **chosen** — animation של הכרטיס שבחר שחקן בפועל ועמעום אחרים; על מסך השחקן בלבד בזמן הצבעה חשאית, לא לשדר בחירה פרטית למסך הקהל.
7. **survey-results** — SHOW_RESPONSES/InterimResults סקר: מספרים/אחוזים/פסים מדורגים, winner/tie/no votes, ללא סימוני נכון/לא נכון של חידון.
8. **top-pick** — spotlight מוגדל עם תמונת המנצח, טבעות אור, impact וחלקיקים; רק עם winner יחיד אמיתי וחשיפה שאושרה. תיקו/אפס — אין זוכה פיקטיבי.
9. **question-image** — תמונת שאלה משמאל, טקסט שאלה מימין וארבע תשובות במטריצת 2×2 כשהסוג מתאים; כל אינטראקציות המשתמש נשמרות.
10. **leaderboard** — שמות/ניקוד אמיתיים והנפשת סדר; תמוך ב־5+ שחקנים/צוותים ללא חיתוך מידע, paging במידת הצורך.
11. **round-recap** — answerRecap timeline: מונטאז' של עד 5 תוצאות אמת מחמש שאלות לפי הסדר, קו אור מחבר וכיתוב LET THE STORY BEGIN…, עם טיפול ב־skipped/tie/no votes/ללא תמונה.
12. **interlude** — מעבר מתוזמן, כותרת/תת־כותרת, קרני אור, חלקיקים, glow bar.
13. **z-wipe** — שתי תנועות Z + impact; cue כשהמסך מכוסה להחלפת התוכן **בדיוק תחת הכיסוי**; אין שכבת חסימה תקועה.

חובה לוודא שזו תצוגת משחק רציפה ולא 13 דפי דמו שנפתחים בנפרד. אין לבצע re-entry מיותר של כרטיסים בכל tick או status update. לשמור על העיתוי של השרת, supersession token, epoch/questionId ומצבי reconnect.

## 5. נאמנות חזותית 1:1

אין להסתפק ב"נראה דומה". להשוות CSS/DOM/timing של v4 המקורי מול הקוד שנחלץ, ולתקן כל הבדל:
- במה 1920×1080; resize proportionate contain, ללא גלילה/מתיחה, בלי לכווץ תמונות באייפד או מקרן.
- רקע question-bg.webp לשאלה ו־show-stage.webp לסצנות show, אלא אם מוגדר background/video ספציפי בכרטיס או בסצנה. הרקע הישן לעולם לא מוצג בין סצנות.
- טיפוגרפיה, font-weight, line-height, letter-spacing, gradients, radius, borders, shimmers, shadows, beams (4) bulbs (15), cards/numbers, images 1:1 לפי המקור.
- entrance cards 1180ms עם 105ms stagger; countdown entrance סביב 1120ms; אחוזים מתחילים סביב 1400ms; winner סביב 2650ms; particles 55/22; z-wipe 1490/1570ms.
- חובה להשוות snapshots גם במהלכי תנועה: 0, 250, 500, 1000, 1500, 3000ms, עם אותם fixtures רק בסביבת QA. לא לשפר/לעגל ערכי תזמון על דעת עצמך.
- התאמת שמונה שפות דרך מערכת i18n בלי לשנות את העורך. אין טקסטי דמו קשיחים בהפקה.

## 6. סיכוני ביצוע שהתגלו מראש — לתקן כחלק מההטמעה

- TadazzV4Stage.tsx ו־types.ts הם presentation-only; כרגע TadazzShowView עדיין משתמש ב־TadazzStage הקודם. עשה adapter/hook מסודר, אל תשתמש ב־HTML renderer.
- CSS של .tzv4-stage מכיל pointer-events:none; שחקנים חייבים להמשיך לענות דרך כרטיסים אינטראקטיביים או TadazzAnswerPad, כולל keyboard/aria/focus.
- types.ts normalizeData מגביל answers ל־5 ו־teams ל־4. אין לחתוך **נתונים** של משחק, ניקוד, שחקנים או תשובות; הגבלה ויזואלית רק אם נבנה מנגנון page/slide להמשך.
- שמור על correct/incorrect ב־quiz scored, ועל multi-select/estimation והסבר התוצאה, בלי להחיל winner style של סקר על חידון.
- לוודא שהשרת נותן percentages בזמן multi-select; לא לחשב לפי סך הלחיצות אם המכנה הוא כלל נענים.
- לתקן רק אם מוכח: פער badgeType לעומת badge ב־answerRecap API.
- stop/pause/resume/skipToEnd חייבים לנהל גם RAF ticker, cues, timers, particle DOM וקוד async. שינוי props לא אמור להפעיל reveal מחדש; דילוגים חוזרים לא יפעילו callbacks stale.
- בזמן צילום מקרן/public stage אסור לחשוף selectedIndex אישי, hidden percentages או נתוני טלפוניה פרטיים.
- TADAZZ Motion Kit הקודם, logo/media/MP4/Lottie והעורך חייבים להישאר כ־rollback. שדרוג v4 עם feature gate ושמירת legacy/goldy-20261105.

## 7. ביצוע לפי שלבים

A. בדוק git status/log, source hash, ownership, snapshots, נתיבי assets, branch base ו־contracts.
B. תקן את ערכת ה־v4 מול reference (לא להניח ש־CSS שנחלץ מושלם), הוסף בדיקות יחידה לאנימציות, תוצאות, טיימר וניקוי.
C. בנה adapter אמיתי מ־computeShowScene/show-director ל־TadazzV4Stage.play/cue, עם server authoritative data בלבד.
D. חבר בפועל את v4 ל־TadazzShowView/GameWrapper ולמסכי המשחק הנדרשים, תוך שמירת כל יכולות המנחה והשחקנים.
E. תקן את כל הפערים החזותיים לפי השוואת פריימים מול ה־HTML. אל תחליף קוד בתמונה או ב־iframe.
F. הרץ QA מלא ותיקן עד שעובר; תעד ומסור commit+report. אל תפרוס/תמזג ללא אישור.

## 8. שערי קבלה שאסור לדלג עליהם

- כל 13 הסצנות עובדות ב־React, מחוברות לנתוני אמת לפי תפקיד, לא רק מיוצרות בדמו.
- unit tests + TS + web build + lint + Playwright E2E — תיעוד פקודות ותוצאות אמת. בדיקות typecheck עלולות להראות שגיאות baseline בפרויקט: השווה HEAD 158c589 מול HEAD הנוכחי, ואפס **רגרסיות חדשות**. אל להכריז passed על בדיקה שלא הורצה.
- Playwright משחק אמיתי: מנחה, 3+ שחקנים, מקרן /display, טלפון, הצבעות טלפוניה/דפדפן, 2/3/4/5 אפשרויות, single/multi, quiz/survey, estimation, media image/video, question image, percentages hidden, tie, zero, recap, leaderboard >4, win, skip twice, reconnect, late join, refresh, pause and resume, audio/sfx/MP4+Lottie.
- Screenshots/video diff של v4 מול HTML במצבי כניסה וסיום בכל 13 scenes. 1920x1080, 1366x768, 1024x768, 800x600, iPad Safari 1194x834, phone 390x844 portrait, fullscreen, reduced motion, no scroll/stretch/old background.
- כל ה־components של העורך ומימוש Razzia המקורי נשארים; אין deleted files, no accidental changes to auth, no credentials committed.
- docs/extensions/qa-evidence/tadazz-v4-integration/ עם קבצי ראיות, דו"ח parity, דו"ח tests, רשימת שינויים ב־upstream, תוכנית rollback.
- בעיות שנמצאו = מתקנים ורצים שוב. אין מסירה שמצהירה "1:1" ללא בדיקה חזותית אמיתית.

## 9. דוח סיום מחייב

החזר: branch+SHA, מה שונה בכל קובץ, כל 13 הסצנות ומצב בדיקותיהן, מספר בדיקות שעברו בפועל, דוח diff מול baseline, נתיבי צילומי המסך, הפעלת וידאו ולוטי, מה עוד חסר/לא אומת, והאם **מוכן** למיזוג/פריסה. אל תציג פריסה שלא קרתה או מסך חי שלא נבדק.

**דרישת הבעלים:** לא להטמיע HTML. לחלץ בדיוק את כל שפת העיצוב והאנימציה, ולהפוך אותה לשכבת React/TSX/CSS אמיתית, עובדת ונאמנה למקור **בתוך המשחק הקיים**. לא לגעת בעיצוב העורך. אל תסתפק בפרומפט נוסף או דמו — בצע את האינטגרציה במלואה בענף הייעודי ותספק הוכחות.
