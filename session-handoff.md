# Zwift AI Dashboard — Session Handoff

פרויקט: `C:\Users\barak\Zwift Project`
פרודקשן: https://zwift-fawn.vercel.app

---

## כללים קריטיים (קרא לפני כל שינוי)

- **אסור לערוך קבצים דרך bash** — תמיד `Edit` או `Write` tool בלבד (OneDrive mount)
- **git push נכשל מ-bash** (HTTP 403). פריסה רק דרך PowerShell של Windows: `.\deploy.bat`
- אם יש lock file: `Remove-Item "C:\Users\barak\Zwift Project\.git\index.lock" -Force`
- קבצים ב-`lib/` עשויים להיות cloud-only — השתמש ב-`Read` tool, לא bash

---

## מה נעשה בשיחה האחרונה (ממתין לפריסה)

### 1. כותרת ההדר שונתה
`app/dashboard/hero-banner.tsx` — SLIDES[0] עודכן:
- שורה 1: "Every Ride" (לבן)
- שורה 2: "Sharpens the Next." (cyan gradient)
- תת-כותרת: "AI coaching that learns from every Zwift ride and adapts what comes next."

### 2. ERG הוסר לחלוטין
הוסר מ-`app/dashboard/phase-card.tsx` (טיפ UI) ומ-`lib/ai.ts` (הוראות בפרומפט).
ERG הוא כפתור בתוך Zwift — לא עניין של הדשבורד.

### 3. מיזוג כרטיס המאמן
`app/dashboard/weekly-plan.tsx` — שני מנגנוני הדיווח מוזגו לכרטיס אחד:
1. "How did today's ride feel?" — אמוג'י × 5 לדירוג יום
2. Textarea + "Send to coach" — שליחה חופשית
3. "Rate this week's sessions" — דירוג אימונים שהושלמו השבוע (מתחת לטופס)

### 4. תיקון אימונים גנריים (עיקרי — טרם נבדק בייצור)
שלושה קבצים עודכנו:
- `lib/ai.ts` — HARD-SESSION MATRIX עם min/target/max לפי רמה × פאזה. Intermediate/Build: target=2, DEFAULT=2. FINAL QUALITY CHECK מאכף.
- `lib/coaching-knowledge.ts` — הוסרה המגבלה "Max 1 quality session/week" בפאזת Base
- `lib/workout-selector.ts` — Recovery week: Easy Flush + Foundation Ride במקום כל Rest Days

---

## פריסה נדרשת

```powershell
cd "C:\Users\barak\Zwift Project"
.\deploy.bat
```

---

## עניינים פתוחים

### א. בדיקת תיקון האימונים הגנריים
אחרי פריסה — ייצר תכנית שבועית לרוכב Intermediate בפאזת Build.
חייב לקבל 2 אימונים קשים (Sweet Spot / Threshold / VO2max).
אם מקבל רק 1 — הבעיה עדיין קיימת.

### ב. ECG בהדר
המשתמש ביקש שהגל יזוז חלק מימין לשמאל ולא יקפוץ בחזרה להתחלה.
נסיון תיקון ב-CSS animation קילקל את ה-UI ובוטל.
הקוד הנוכחי חוזר למצב המקורי (phase-based React state, 150ms).
צריך גישה אחרת — אולי `useRef` + `requestAnimationFrame`.

### ג. Parts 6–14 מהדירקטיבה של האימונים (לא יושמו)
- Part 6: Weekly stimulus objective
- Part 7: Persistent coaching state schema
- Part 8: Separate progression tracks per stimulus family
- Part 9: Remove intervals-only overcorrection
- Part 10: TSB contextual engine
- Part 11: Complex interval structure canonical schema
- Part 12: Final validation with repair
- Part 13: Acceptance tests
- Part 14: Full diagnostic trace

---

## מבנה הפרויקט

- **Framework**: Next.js 14 App Router
- **CSS**: `app/globals.css` — CSS custom properties בלבד (`var(--accent)`, `var(--bg)`, `var(--text)`, `var(--muted)`)
- **AI**: `lib/ai.ts` → Anthropic Claude API (`claude-sonnet-4-6`)
- **Data**: `lib/zwift.ts` → Zwift unofficial API
- **Deploy**: GitHub → Vercel (auto on push to `main`)
- **Git**: `C:\Users\barak\Zwift Project`
