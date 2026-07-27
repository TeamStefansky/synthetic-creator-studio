# NewsRadar — אפיון עיצוב ויזואלי
### לבנייה ב-Figma Make · גרסה 2026-07-27

---

> **מקור:** חולץ מתוך `News_Agency_Dashboard_Design.make` (Figma Make), נוצר 2026-07-27.
> זהו מסמך הייחוס הוויזואלי המלא. `tokens.css` הוא הביטוי המכונתי שלו וגובר עליו
> בכל מקרה של סתירה בערכים. סעיף 7 (פרומפטים ל-Figma Make) הוא היסטורי — הוא שימש
> לבניית העיצוב וכבר מומש; הוא נשמר לתיעוד בלבד ואינו הוראה למפתחים.

---

## 0. הקונספט

> **דיוק של סוכנות ידיעות, קול של עיתון.**

המערכת מרגישה כמו טרמינל של סוכנות ידיעות שמדפיס ברודשיט. שני מסכים, מערכת אחת, שתי צפיפויות:

| | **Monitoring** (דשבורד) | **Reader** (אתר) |
|---|---|---|
| שפה / כיוון | עברית · RTL | אנגלית · LTR |
| אופי | מכשיר מדידה | עיתון |
| צפיפות | גבוהה — 16/24px | נמוכה — 48/96px |
| רוחב תוכן | fluid עד 1600 | 1280, טקסט 68ch |
| טיפוגרפיה מובילה | Sans + Mono | Serif display |
| מה מודגש | מספרים ומגמות | כותרות וסיפור |

**מה שמאחד:** אותה דיו, אותו רשת, אותו radius, ואותה שורת dateline במונוספייס.

### שלוש החלטות "לא" שמחזיקות את המערכת

1. **אין כרטיסים עם צל.** הממשק בנוי מקווי שיער (hairlines) ומרווח, כמו עמוד עיתון. `shadow` קיים אך ורק ל-overlays (dropdown, modal, popover). זה השינוי היחיד שהכי מרחיק את התוצר מ"עוד דשבורד".
2. **פינות כמעט ישרות.** `radius` מקסימלי 8px, רוב הממשק על 2–4px. עיתון הוא חד.
3. **צבע מבודד לתפקידו.** צבע מותג אחד (Signal Blue) לפעולות ולינקים בלבד. רמפות הנתונים (heat, stance) חיות **רק בתוך נתונים** ואף פעם לא בכרומיום.

### החתימה

**שורת ה-dateline.** כל סיפור, אירוע וכרטיס נושא שורת מטא־דאטה במונוספייס, אותיות רישיות, מרווח אותיות `0.12em`, מעל קו שיער:

```
REUTERS · GB · 14:32 UTC · 9 SOURCES · 4 LANGUAGES
```

זה המכשיר שמדבר בתוך העיתון. זה מופיע בשני המסכים וזה מה שהופך אותם למוצר אחד. **אל תוותר עליו ואל תרכך אותו** — הוא כל הזהות.

**המומנט הגדול:** בעמוד הבית, הסיפור המוביל מקבל כותרת Newsreader ב-72–96px, עם dateline מעליה וקו שיער אחד. סביבו — שקט מוחלט.

---

## 1. טיפוגרפיה

כל הפונטים ב-Google Fonts, כלומר זמינים ב-Figma Make ישירות.

| תפקיד | פונט | משקלים | איפה |
|---|---|---|---|
| Display | **Newsreader** (variable, opsz 6–72) | 500, 600 | כותרות ה-Reader |
| UI Sans | **IBM Plex Sans** | 400, 500, 600 | ממשק, שני המסכים |
| UI עברית | **IBM Plex Sans Hebrew** | 400, 500, 600 | כל הדשבורד |
| Data / Mono | **IBM Plex Mono** | 400, 500 | dateline, מספרים, טבלאות |
| עברית עריכתית | **Frank Ruhl Libre** | 500, 700 | כותרות דוחות בעברית |

**למה IBM Plex ולא Inter:** Inter הוא ברירת המחדל של כל מוצר AI ב-2026. Plex הוא utilitarian ומהונדס — בדיוק על הקונספט — ויש לו משפחה עברית אמיתית עם אותו שלד. משפחה אחת, שתי שפות.

### סקאלה מודולרית — ratio 1.25, base 16

```
caption   12 / 1.4   Mono, tracking 0.12em, uppercase
small     13 / 1.5
body      16 / 1.6   measure 65ch
lede      20 / 1.35
h3        25 / 1.25
h2        31 / 1.15  tracking -0.01em
h1        39 / 1.08  tracking -0.015em
display   52 / 1.02  tracking -0.02em
hero      72–96 / 1.0  tracking -0.025em   ← רק הסיפור המוביל
```

**כללי מלאכה:**
- טיפוגרפיה גדולה צריכה **פחות** line-height, לא אותו דבר. מעל 40px → 1.0–1.05.
- tracking שלילי קל על display; לעולם לא letter-spacing על גוף טקסט.
- **ניגודיות משקל אמיתית:** כותרת 600 מול גוף 400. משקל אחיד בכל המסך = תבניתי.
- מקסימום **שלוש רמות היררכיה** במסך. אם הכל מודגש — כלום לא.
- הדשבורד: מספרים תמיד ב-IBM Plex Mono עם `font-variant-numeric: tabular-nums`. עמודות מספרים חייבות להתיישר.

---

## 2. צבע

```
/* Ink & paper */
--ink-900: #0E1116   /* טקסט ראשי, קווי חיתוך */
--ink-700: #232A33
--ink-500: #3A4048   /* טקסט משני */
--ink-300: #6B7280   /* טקסט מושתק, מטא־דאטה */
--ink-200: #C9CDD4   /* border-strong */
--ink-100: #E3E6EA   /* border */
--paper-reader: #FAF9F5   /* רקע האתר — נייר חמים */
--paper-app:    #F6F7F9   /* רקע הדשבורד — נייר קר */
--surface:      #FFFFFF

/* Signal — הצבע היחיד של המותג */
--signal-600: #1F4FE0   /* פעולות, לינקים, focus */
--signal-700: #1A3FB8   /* hover */
--signal-050: #EEF2FE   /* רקע נבחר */

/* Data ramps — רק בתוך נתונים */
--heat-0:  #E3E6EA   --heat-1: #FCD9A8   --heat-2: #F0A23C
--heat-3:  #C2410C   --heat-4: #8C1D06
--stance-neg2: #8C1D06  --stance-neg1: #C2410C
--stance-0:    #6B7280
--stance-pos1: #3F8A4E  --stance-pos2: #166534

/* Semantic */
--danger: #B42318   --warning: #B54708   --success: #166534
```

**דיסציפלינה 60/30/10:** 60% נייר, 30% דיו, 10% Signal. Signal מופיע בפחות מ-5% משטח המסך — שם כוחו.

**ניגודיות (חובה):** גוף ≥ 4.5:1, טקסט גדול ו-UI ≥ 3:1. `--ink-300` על `--paper-reader` נותן 4.6:1 — זה הרצפה, אל תלך מתחת.

**רמפת ה-heat לעולם לא לבד.** כל צ'יפ heat נושא גם מספר. כל צ'יפ stance נושא גם טקסט או אייקון. צבע לעולם לא הנשא היחיד של משמעות.

---

## 3. רשת, מרווח, פינות

### מרווח — בסיס 4
```
4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128
```
ערכים אד־הוק (13, 17, 22) אסורים. אם משהו לא נראה נכון — לך למדרגה הבאה, אל תמציא ערך.

### רשת
- **Reader:** 12 עמודות, max 1280, gutter 24, margin 48. סיפור מוביל 8 עמודות, sidebar 4.
- **Monitoring:** 12 עמודות, fluid עד 1600, gutter 16, margin 24.
- **Baseline:** 8px. כל טקסט ומרווח נצמדים.
- **קצב אנכי משתנה:** 96 בין סקציות ראשיות ב-Reader, 32 בתוך סקציה. מרווח אחיד = מונוטוני.

### פינות וקווים
```
--radius-sm: 2px    צ'יפים, badges, inputs
--radius-md: 4px    כפתורים, כרטיסים
--radius-lg: 8px    modals, popovers    ← המקסימום
--border:        0.5px solid var(--ink-100)
--border-strong: 1px solid var(--ink-200)
--rule-heavy:    1px solid var(--ink-900)   ← מעל dateline בלבד
```

### צללים — שלושה, לשכבות צפות בלבד
```
--shadow-popover: 0 8px 24px rgba(14,17,22,.10), 0 2px 6px rgba(14,17,22,.06)
--shadow-modal:   0 24px 64px rgba(14,17,22,.16)
```
כרטיס בתוך העמוד **אף פעם** לא מקבל צל. הוא מקבל קו שיער.

---

## 4. תנועה

```
--dur-fast: 120ms   hover, צ'יפים
--dur-base: 200ms   כפתורים, פתיחת accordion
--dur-slow: 320ms   מעבר בין עמודים, modal
--ease:     cubic-bezier(0.2, 0, 0, 1)
```
`prefers-reduced-motion: reduce` מבטל כל תנועה לא־חיונית. תנועה לעולם לא מעכבת קריאה או משימה.

---

## 5. רכיבים — וריאנטים ומצבים

כל רכיב צורך **טוקנים בלבד**. אין hex ואין px בתוך רכיב.

### Button
| וריאנט | default | hover | active | focus | disabled | loading |
|---|---|---|---|---|---|---|
| primary | ink-900 bg / white | ink-700 | ink-900 | ring signal 2px offset 2 | 50% | ✓ |
| secondary | surface / border-strong | paper | — | ✓ | ✓ | — |
| ghost | שקוף / signal-600 | signal-050 | — | ✓ | ✓ | — |
| danger | danger bg / white | darken 8% | — | ✓ | ✓ | — |

גובה 36px · padding 12/20 · radius-md · Plex Sans 500 · **אין uppercase**.

### Field
גובה 36 · border 1px ink-200 · radius-sm · focus: ring 2px signal + border signal.
Label 13/500 מעל · help 12 ink-300 מתחת · error 12 danger + border danger.
**אותו focus ring בכל שדה במוצר.** שוני ב-focus הוא חוסר עקביות שקט וקבוע.

### DatelineStrip ← החתימה
Mono 11–12 · uppercase · tracking 0.12em · ink-300 · מעל `--rule-heavy` · מפריד ` · `.
מספרים מודגשים ב-ink-900 500. מונה מקורות ב-signal-600.

### Brand — לוגו STEM ← נוסף 2026-07-27

**המקור שסופק:** `STEM_LOGO_W.png` — 3213×1648 (יחס 1.95:1), לבן טהור `#FFFFFF`
עם שקיפות אלפא, כיסוי דיו 26%, ללא padding. זהו **knockout** — נוסחה לרקע כהה בלבד.
על `--paper-reader` ועל עמוד PDF לבן הוא בלתי נראה.

מכיוון שהקובץ הוא מסכת אלפא בצבע אחד, הפקת הווריאנטים היא צביעה מחדש ללא אובדן:

| וריאנט | צבע | על איזה משטח |
|---|---|---|
| `stem-logo-white` | `#FFFFFF` | רקע כהה, `--ink-900`, תצלום |
| `stem-logo-ink` | `--ink-900` `#0E1116` | `--paper-reader`, `--paper-app`, עמוד PDF |
| `stem-logo-signal` | `--signal-600` `#1F4FE0` | שימוש מוגבל — מסך כניסה, מסמכי שיווק |

**כללי שימוש:**
- שטח נשימה מינימלי סביב הלוגו: `--sp-4` (16px) מכל צד. הקובץ נטול padding, אז
  המרווח הוא באחריות ה-layout.
- גובה מינימלי 24px. מתחת לזה — השתמש בסימן `NR` בלבד, לא בלוקאפ המלא.
- לעולם לא מותחים, לא מסובבים, לא מוסיפים צל, ולא מניחים על תצלום עמוס בלי שכבת
  כהות מתחתיו.
- **PNG הוא פתרון ביניים.** לוגו שמופיע ב-24px בכותרת וב-200px בשער PDF חייב
  להיות SVG. בקש קובץ וקטורי מהמעצב — זו הבקשה היחידה שנשארה פתוחה בנכסי המותג.

### שני לוגואים — לא לבלבל

זו הבחנה מוצרית, לא עיצובית:

| | לוגו המוצר (STEM) | לוגו הארגון הלקוח |
|---|---|---|
| מאיפה | נכס קבוע ב-repo | העלאה בהגדרות הארגון |
| איפה מופיע | כותרת האפליקציה, מסך כניסה | **כותרת כל עמוד ב-PDF** |
| מי שולט | אנחנו | ADMIN של הארגון |

בשער הדוח ובכותרת העליונה של כל עמוד מופיע **לוגו הלקוח**. לוגו STEM מופיע לכל
היותר כשורת `powered by` קטנה בכותרת התחתונה, ורק אם הוחלט על כך במפורש — דוח
שיוצא מגוף ממשלתי עם מיתוג ספק בולט הוא בעיה מסחרית ולא פיצ'ר.

### SentimentTriangle ← עודכן 2026-07-27

משולש ישר-זווית שממלא את הפינה השמאלית-עליונה של תמונת הכרטיס. זהו הסימון הסורק
המהיר של סנטימנט — קריא בעין אחת ברשת של 20 כרטיסים.

```
<svg width="36" height="36" viewBox="0 0 36 36"
     style="position:absolute; top:0; left:0; display:block">
  <polygon points="0,0 36,0 0,36" fill="{color}" opacity="0.92"/>
</svg>
```

| סנטימנט | טוקן | ערך |
|---|---|---|
| חיובי | `--sentiment-positive` | `#22C55E` |
| ניטרלי | `--sentiment-neutral` | `#3B82F6` |
| שלילי | `--sentiment-negative` | `#EF4444` |

**למה רמפה שנייה ולא `--stance-*`:** הרמפה העריכתית מכוילת לצ'יפים על נייר בהיר
ונעלמת על גבי תצלום. שלושת הטוקנים האלה משמשים **אך ורק** למשולש — לא לצ'יפים,
לא לטקסט, לא לגרפים.

**מסמך ללא דירוג לא מקבל משולש כלל.** לא משולש אפור ולא סימן שאלה — היעדר הסימון
הוא הסימון.

**צבע אינו נשא יחיד:** התווית הטקסטואלית (`חיובי` / `ניטרלי` / `שלילי`) מופיעה
תמיד בשורת המטא של הכרטיס. המשולש הוא שכבת הסריקה, הטקסט הוא שכבת הנגישות.
אדום וירוק הם הצמד הגרוע ביותר לעיוורון צבעים, ובהדפסה שלושתם יוצאים אותו אפור —
לכן ב-`@media print` המשולש מקבל מילוי מובחן: מלא לשלילי, מקווקו לניטרלי,
מתאר בלבד לחיובי.

### StoryCard (Reader)
בלי מסגרת, בלי צל. dateline → כותרת Newsreader → extract → קו שיער תחתון.
תמונה יחס 3:2, radius-sm, `object-fit: cover`. `reason` בתחתית ב-Mono 11 ink-300.
נקרא (read) → אטימות 0.62 על הכותרת בלבד.

### HeatBadge (Monitoring)
Mono 12/500 · המספר תמיד גלוי · רקע מרמפת heat · טקסט ink-900 על 0–2, לבן על 3–4 · radius-sm · padding 2/6.

### StanceChip
טקסט + נקודה צבעונית. `−2 Hostile` / `−1 Critical` / `0 Neutral` / `+1 Favorable` / `+2 Laudatory`.
לעולם לא נקודה לבדה.

### SourceStrip
favicon 16px → שם מקור 13/500 → דגל מדינה → זמן יחסי ink-300 → `↗` חיצוני.
**בכל כרטיס, תמיד, בלי קיצור.** זו דרישת מוצר ולא קישוט.

### Table (Monitoring)
שורות בגובה 40 · מפריד קו שיער בלבד (אין zebra) · כותרת Mono 11 uppercase ink-300 · מספרים tabular ומיושרים לימין (LTR) / לשמאל (RTL) · hover: רקע paper.

### שאר הרכיבים
Tabs (underline 2px signal, לא pills) · Badge · Toast · Modal (radius-lg, shadow-modal, overlay ink-900 45%) · Dropdown · Slider · Skeleton (paper-app, פעימה 1.4s) · EmptyState · ErrorState.

---

## 6. מסכים — מפרט פריסה

### R1 · Reader — עמוד בית `/site`
```
Header 64px    [NewsRadar]  News | Monitoring        Edition 14:30  ⟳
────────────────────────────────────────────  hairline
Filter bar     Interests ▾  Countries ▾  Published in|About  6h/24h/3d
────────────────────────────────────────────  rule-heavy
LEAD           dateline
(8 col)        Hero headline 72–96 Newsreader 600
               lede 20 · extract · SourceStrip
               [image 3:2, bleeds to grid edge]
────────────────────────────────────────────
3-UP           3 × StoryCard, gutter 24
────────────────────────────────────────────  96px air
SECTION        ── Interest name ──  Mono 12 uppercase
               lead item (h2 31) + 5 headlines ברשימה עם קווי שיער
```
פערים: 48 בתוך סקציה, 96 בין סקציות. הכותרת המובילה היא הדבר הכי גדול במסך בפער עצום — זו כל התחושה.

### R2 · Reader — עמוד סיפור
כותרת מתורגמת → `headline_original` ב-ink-300 עם `dir="auto"` → byline → SourceStrip → תמונה → blurb → extract → **CTA גדול "Read on {Source}"**.
**Full Coverage:** stat strip במונוספייס → מתג קיבוץ (Angle / Country / Language / Tier) → בלוקים מתקפלים → **coverage spread** — ציר זמן אופקי, נקודה לכל פרסום, צבועה לפי זווית, הפרסום הראשון מסומן.
מסגרת המקור: כותרת `Original article — {Source}` ב-Mono, `<iframe>` בגובה 720, נפילה אלגנטית.

### R3 · Reader — Sources
טאב **My feeds**: textarea 8 שורות ל-500 URL → כפתור → פס התקדמות → טבלת תוצאות עם צ'יפ סטטוס לכל שורה.
טבלת מנויים: כותרת · דומיין · מדינה · תגיות · פולינג אחרון · כשלים · **תג זכויות** · פעיל.
תג זכויות: `Headline + link` (אפור) · `Short extract` (אפור) · `Full text (licensed)` (מסגרת warning). שינוי → דיאלוג שדורש הנמקה.
טאב **Global sources**: GDELT / Perigon עם בורר מדינות.

### R4 · Reader — Interests
טופס משמאל, **תצוגה מקדימה חיה מימין** — 5 תוצאות אחרונות, מתעדכנת תוך כדי הקלדה. הסליידר מתויג `Broad ← → Precise` ולא במספר. זה המסך שבו המשתמש מבין את המוצר.

### M1 · Monitoring — לוח מצב `/w/[id]`
```
Header 56  ·  Sidebar 220 (watchlists)
Time window: 1h / 6h / 24h / 7d
────────────────────────────────
Heat board (8 col)          │ Geo map (4 col)
כרטיס לאירוע:               │ MapLibre, heat layer
  HeatBadge · sparkline     │ קליק → סינון
  כותרת 20/500              │
  dateline · חץ מגמה        ├───────────────
  צ'יפ שליליות              │ Trends strip
  קו שיער                   │ term · lift · bar
```
צפוף. 16px בין כרטיסים. בלי צללים. מפריד קו שיער.

### M2 · Monitoring — עמוד אירוע
תקציר → timeline chart (doc_count / velocity / acceleration) → פילוח מקורות לפי tier → טבלת מסמכים עם StanceChip ו-prominence.

### M3 · Monitoring — סיקור שלילי
מקובץ לפי ישות. מד negativity → גרף לאורך זמן → רשימת מסמכים שליליים עם **evidence_span מצוטט מילולית** בתוך blockquote עם קו שמאלי (RTL: ימני) ב-danger. מאמרי דעה בסקציה נפרדת, לעולם לא מעורבבים.

---

## 7. פרומפטים ל-Figma Make

**שיטת עבודה:** בונים מסך אחד בכל פעם. את בלוק הטוקנים מדביקים **בכל פרומפט מחדש** — Figma Make לא זוכר בין frames.

### בלוק הטוקנים (להדביק בכל פרומפט)

```
DESIGN TOKENS — use these exactly, never invent values.

Fonts (Google Fonts): Newsreader (display serif), IBM Plex Sans (UI),
IBM Plex Sans Hebrew (Hebrew UI), IBM Plex Mono (data/metadata).

Type scale: caption 12/1.4 · small 13/1.5 · body 16/1.6 · lede 20/1.35 ·
h3 25/1.25 · h2 31/1.15 · h1 39/1.08 · display 52/1.02 · hero 80/1.0.
Negative tracking on display sizes (-0.02em). Body measure 65ch.

Colors: ink-900 #0E1116 · ink-500 #3A4048 · ink-300 #6B7280 ·
ink-200 #C9CDD4 · ink-100 #E3E6EA · paper-reader #FAF9F5 ·
paper-app #F6F7F9 · surface #FFFFFF · signal-600 #1F4FE0 ·
signal-050 #EEF2FE · heat ramp #E3E6EA→#FCD9A8→#F0A23C→#C2410C→#8C1D06.

Spacing base 4: 4/8/12/16/24/32/48/64/96/128. No other values.
Radius: 2px chips+inputs, 4px buttons+cards, 8px modals. Never larger.
Borders: 0.5px solid #E3E6EA default; 1px solid #0E1116 only above a dateline.
Shadows: NONE on in-page cards. Cards are separated by hairlines and space.
Shadows only on dropdowns and modals.

SIGNATURE ELEMENT — the dateline strip, on every story and event:
IBM Plex Mono, 11px, UPPERCASE, letter-spacing 0.12em, color ink-300,
sitting directly under a 1px ink-900 rule, separators " · ".
Example: REUTERS · GB · 14:32 UTC · 9 SOURCES · 4 LANGUAGES
```

### פרומפט 1 — Design system frame
```
[TOKENS]

Create a design system sheet frame, 1440x2400, background #FAF9F5.
Sections, each separated by 96px:
1. Color — swatch rows for ink ramp, paper, signal, heat ramp. Each swatch
   96x72, radius 2px, hex label below in IBM Plex Mono 11 uppercase.
2. Type scale — every step rendered as a live sample with its name and
   size in Plex Mono to the left, in a two-column layout.
3. The dateline strip, shown at three widths.
4. Components — buttons (4 variants x 5 states), fields (4 states),
   HeatBadge (5 heat levels), StanceChip (5 levels), SourceStrip, tabs,
   badge, toast, modal, empty state, skeleton.
Layout on a 12-column grid, 24px gutters, 48px margins.
No drop shadows anywhere except the modal and the dropdown.
```

### פרומפט 2 — Reader front page
```
[TOKENS]

Design an English LTR news website front page, 1440 wide, background
paper-reader #FAF9F5. This is an editorial newspaper layout, not a card grid.

Header 64px: wordmark left, "News | Monitoring" switcher, right side shows
"Edition 14:30" in Plex Mono 12 uppercase plus a refresh icon.
Below it a hairline, then a filter bar: Interests dropdown, Countries
dropdown, a segmented "Published in / About" toggle, and a 6h/24h/3d
segmented control. Then a 1px ink-900 rule.

LEAD STORY spanning 8 of 12 columns: dateline strip, then a Newsreader 600
headline at 80px with tight leading and negative tracking, then a 20px lede,
then a source strip (favicon, source name, country flag, relative time,
external-link arrow). A 3:2 image sits in the remaining 4 columns, bleeding
to the grid edge.

Then 96px of air, then a row of three story cards, gutter 24. Each: dateline,
Newsreader 25px headline, two-line extract, source strip, a Plex Mono 11
"reason" line, closed by a hairline.

Then 96px, then an interest section: a Plex Mono 12 uppercase section label
between two hairlines, a 31px lead item, and a list of five headlines
separated by hairlines.

Generous whitespace. No shadows. No rounded cards. Type carries the design.
```

### פרומפט 3 — Reader story page + Full Coverage
```
[TOKENS]

Design an English LTR article page, 1440 wide, paper-reader background.
Content column 8 of 12 columns, text measure capped at 68 characters.

Top: dateline strip, Newsreader 600 headline at 52px, then the original
non-English headline below it in ink-300 20px, then byline and source strip,
then a 3:2 image, then a 20px blurb and a 16px extract, then a large primary
button "Read on Haaretz" with an external-link icon.

Below, a FULL COVERAGE section:
- A stat strip in Plex Mono: "12 SOURCES · 6 COUNTRIES · 4 LANGUAGES ·
  FIRST REPORTED BY AFP 09:14 UTC"
- A segmented control: Angle / Country / Language / Tier
- Three collapsible angle blocks. Each has a Plex Mono uppercase label, a
  one-line description, a thin share bar, and a list of source rows
  (favicon, source name, country flag, time, translated headline, arrow).
- A coverage spread timeline: a horizontal axis with one dot per publication,
  dots colored by angle from a 3-color categorical set, the first publication
  marked with a vertical tick and a label.
- A "How coverage differs" block: a short paragraph plus three observations,
  each with small source chips beneath it.

Hairlines between blocks, no shadows, no filled cards.
```

### פרומפט 4 — Sources page
```
[TOKENS]

Design an English LTR settings page "Sources", 1440 wide, paper-reader.
Two tabs with a 2px signal underline on the active one: "My feeds",
"Global sources".

My feeds tab:
- A bulk-add panel: a label "Paste up to 500 news site URLs, one per line",
  a monospace textarea 8 rows, and a primary button "Discover feeds".
- Below it, an in-progress state: a thin progress bar, "84 of 150 processed"
  in Plex Mono, and a results table with columns Input / Resolved feed /
  Status. Status is a small radius-2 chip: added (green), duplicate (grey),
  no feed found (amber), invalid (red). Each chip carries text, never
  color alone.
- Below, the subscriptions table: Title, Domain, Country, Tags (editable
  chips), Last poll, Failures, Rights, Active toggle. Row height 40,
  hairline separators, no zebra striping, Plex Mono for all numbers and
  times, tabular figures.
- The Rights column is a badge: "Headline + link" and "Short extract" in
  grey outline, "Full text (licensed)" with an amber outline.

Show one row in an amber warning state (3 failures) and one in a red
deactivated state with a "Reactivate" ghost button.
```

### פרומפט 5 — Monitoring dashboard (עברית RTL)
```
[TOKENS]

Design a Hebrew RIGHT-TO-LEFT monitoring dashboard, 1600 wide, background
paper-app #F6F7F9. Use IBM Plex Sans Hebrew for all Hebrew text and IBM Plex
Mono for all numbers, times and metadata. Mirror the entire layout for RTL:
sidebar on the RIGHT, text right-aligned, numeric columns aligned left.

Sidebar 220px: watchlist list with counts.
Header 56px: watchlist title, a 1h/6h/24h/7d segmented control, an alerts
bell with a red count badge.

Main area, 12-column grid, 16px gutters — this surface is DENSE, unlike the
reader site:
- Left 8 columns: a heat board. Each event card has a HeatBadge (Plex Mono
  number on a heat-ramp background), a 60x20 sparkline, a 20px/500 Hebrew
  title, a dateline strip in Hebrew-compatible metadata, a trajectory arrow,
  country flags, and a negativity chip when relevant. Cards separated by
  hairlines and 16px, no shadows, no rounded corners beyond 4px.
- Right 4 columns, stacked: a geographic heat map with a muted basemap and
  warm heat blobs; below it a trends strip with term, lift multiplier, and
  a mini bar comparing 7-day share to current share.
- A bottom volume bar: documents ingested vs previous period, with the
  duplicate-collapsed portion shown as a muted segment.

Everything sits on an 8px baseline. Numbers use tabular figures and line up
in columns. No drop shadows.
```

### פרומפט 6 — Negative coverage (עברית RTL)
```
[TOKENS]

Design a Hebrew RTL "סיקור שלילי" page, 1600 wide, paper-app background.
Grouped by monitored entity. For each entity:
- Entity name at 25px/600, a negativity gauge (a horizontal bar 0-1 using
  the heat ramp with the number in Plex Mono beside it), and counts.
- A small area chart of negative document count over the last 14 days.
- A list of negative documents. Each row: StanceChip (a colored dot plus the
  text "−2 עוין" or "−1 ביקורתי"), source strip, publish time, headline, and
  beneath it the quoted evidence span inside a blockquote with a 2px
  right-side border in #B42318 and a framing label in Plex Mono uppercase.
- Opinion pieces appear in a visually separate section below, under a
  Plex Mono uppercase label "מאמרי דעה", never mixed into the main count.

Hairlines, no shadows, dense spacing (16/24).
```

---

## 8. QA — מסך נחשב גמור רק כשכל אלה נכונים

- [ ] אין ערך צבע שאינו טוקן
- [ ] אין מרווח מחוץ לסולם 4
- [ ] כל טקסט על טוקן טיפוגרפי — אין font-size תועה
- [ ] `radius` לא עולה על 8px בשום מקום
- [ ] **אין צל על אף כרטיס בתוך העמוד**
- [ ] כל סיפור ואירוע נושאים dateline
- [ ] כל כרטיס נושא SourceStrip עם שם מקור ולינק חיצוני
- [ ] צבע לעולם לא נשא יחיד של משמעות — heat נושא מספר, סנטימנט נושא תווית טקסט
- [ ] משולש הסנטימנט מובחן גם ב-`@media print` (מלא / מקווקו / מתאר)
- [ ] מסמך שלא דורג אינו מקבל משולש כלל
- [ ] focus ring זהה בכל שדה וכפתור
- [ ] ניגודיות: גוף ≥ 4.5:1, UI ≥ 3:1
- [ ] מצבי ריק, טעינה ושגיאה מעוצבים ולא ברירת מחדל
- [ ] RTL: מספרים, שמות מותג לטיניים וסימני פיסוק מתרנדרים נכון בטקסט מעורב
- [ ] `prefers-reduced-motion` מבטל תנועה
- [ ] measure של גוף טקסט ≤ 68 תווים

---

## 9. איך להעביר את זה למפתחים

הטוקנים בחלק 3–4 הם החוזה. אחרי שאתה מרוצה מהמסכים ב-Figma Make:

1. ייצא את הטוקנים לקובץ `web/src/styles/tokens.css` כ-CSS custom properties.
2. הוסף אותו כדרישה ב-P4 וב-P7 (הפרומפטים של הפרונט) — "consume these tokens, never literals".
3. הוסף ל-QA של אותם פרומפטים: בדיקה שמחפשת `#` ו-`px` מחוץ לקובץ הטוקנים ונכשלת אם מצאה.

בלי שלב 3, המערכת מתפרקת בפיצ'ר השלישי.
