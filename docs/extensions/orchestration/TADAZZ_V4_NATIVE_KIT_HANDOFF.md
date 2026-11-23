# TADAZZ v4 — Native React Presentation Kit

**Source of truth:** `docs/extensions/references/tadazz-v4/animation-library-set-v4.html`, SHA-256 `6ae154d4d208a72dbf052f76abce8d59c2b56ecddf4e514d7f28b2a01bdf3cda`.

## מה נמצא בחבילה

- `src/components.tsx`: רכיבי React עצמאיים לרקע, כותרת, חמשת הכרטיסים, סטטוס הצבעה, טיימר, Spotlight, שאלת תמונה, לוח מובילים, מונטאז׳, Interlude ו־Z Wipe.
- `src/motion.ts`: מנוע אנימציות WAAPI עם תנועות, מקדמי easing, תזמונים, חלקיקים, הבזק ו־cue events בדיוק לפי ה־HTML המקורי.
- `src/tadazz-v4.css`: סגנונות הבמה המקוריים, מבודדים תחת `.tzv4-stage` — ללא שינוי לעורך המשחק או ל־Razzia הישן.
- `src/TadazzV4Stage.tsx`: קומפוזיציית במה React בגודל 1920×1080 עם `ResizeObserver`, ללא גלילה/הטיה.
- `src/types.ts`: חוזי נתונים חיצוניים חזותיים, נטולי תלות בשרת/טלפוניה, ו־13 מזהי סצנות.
- `assets/`: שמונת קובצי המדיה המקוריים, שנחלצו byte-for-byte מתוך ה־data URIs בקובץ, כולל לוגו, שני רקעים וחמש תמונות בדיקה.
- `assets-manifest.json` + `design-tokens.json`: hash, מימדים, ערכי CSS וטיפוגרפיה.
- `qa/`: תמונות ההתייחסות מהדמו ונתוני הדגמה *מבודדים*, שאסור לייבא למשחק הפעיל.
- `reference/`: HTML/JS/CSS המקוריים **לבדיקה בלבד** — לא נטענים בייצור.

## שילוב בפרויקט

לאחר פריסה במיקומים המצוינים ב־`INTEGRATION.md`, אפשר להשתמש ישירות:

```tsx
import { useRef } from "react"
import { TadazzV4Stage, type TadazzV4StageHandle } from "@razzia/extensions/presentation"

function Example({ question, answers, counts }: {
  question: string; answers: Array<{ title:string; imageUrl?:string }>;
  counts: number[];
}) {
  const stage = useRef<TadazzV4StageHandle>(null)
  return <TadazzV4Stage ref={stage} initialScene="picture-answers"
    initialData={{ question, answers, round:1, number:1 }} />
}
```

הקריאה `stage.current?.play("survey-results", { question, answers, counts })` מפעילה תוצאות.

הערכת העיצוב **לא כוללת לוגיקת משחק, ניקוד או תקשורת**, בכוונה; זהו בדיוק הגבול שביקשת — רכיבים ואנימציות מוכנים להטמעה. יש לחבר את המסכים דרך ה־`show-director.ts` הקיים, באמצעות נתוני האמת של השרת. ה־MP4 וה־Lottie נשארים במימוש הנוכחי ואינם נדרסים.

Note: using the import path above requires adding `export * from "./tadazz-v4"` to `extensions/src/presentation/index.ts` during the approved integration stage. This kit does not change the active game.

## בדיקת קבלה

השווה לכל 13 הסצנות צילום 1920×1080 מפרויקט React כנגד `qa/` ו־HTML המקורי, בדגש על נקודות זמן 0, 250, 500, 1000, 1500 ו־3000ms. ודא מספר/כרטיס זזים יחד, תמונות ממלאות ריבוע, טיימר 2.55× במרכז ומתכווץ לפינה, תוצאות ב־1.4s, זכייה ב־2.65s, עמעום/פיצוץ, רקע נכון ומעבר Z. בצע גם בדיקות 16:9/4:3/3:2/portrait, Safari, reduced motion, reset ו־replay.

**Verified so far:** All 8 original media assets match SHA-256, and 8/8 isolated unit tests pass. React-vs-HTML visual equivalence and live game E2E remain to be proven during integration.

**מצב ההפצה:** ספרייה מבודדת ומוכנה לשילוב; אין הפעלה בפרודקשן ללא אישור המשתמש ומבחני קבלה בפרויקט המשחק.
