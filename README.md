# פורטפוליו — איילת ספירשטיין

אתר סטטי (HTML/CSS/JS) בעברית, מימין לשמאל, שמתפרסם דרך GitHub Pages בכתובת
[ayeletsapirshtein.com](https://ayeletsapirshtein.com).

## מבנה
- `index.html` — עמוד הבית: החנות.
- `portfolio/index.html` — הפורטפוליו (פתיח, גלריה, אודות, יצירת קשר).
- `shop/` — הקוד של החנות (`shop.js`, `shop.css`, `config.js`) ועמוד התודה. הכתובת הישנה `/shop/` מפנה לעמוד הבית.
- `styles.css` — העיצוב. הצבעים והגופנים מוגדרים כמשתנים בראש הקובץ.
- `script.js` — לייטבוקס עם מעבר בין עבודות (חיצים, מקלדת והחלקה), ואנימציות גלילה.
- `images/` — קובצי המקור של העבודות (PNG).
- `images/web/` — גרסאות WebP מוקטנות שהאתר משתמש בהן בפועל.
- `assets/` — פאביקון ותמונת שיתוף לרשתות חברתיות (`og.jpg`).

## הוספת עבודה חדשה
1. שימי את קובץ ה-PNG בתיקיית `images` (שם הקובץ הוא גם הכותרת).
2. הוסיפי שורה לרשימה `WORKS` בקובץ `tools/optimize_images.py` — שם הקובץ ושם קצר באנגלית.
3. הריצי מתיקיית השורש:
   ```
   python3 tools/optimize_images.py
   ```
   הסקריפט יוצר את קובצי ה-WebP ומדפיס את קוד ה-HTML של כל העבודות — העתיקי את הבלוק לתוך `<div class="gallery">` ב-`portfolio/index.html`.

## פרסום
כל דחיפה לענף `main` מתפרסמת אוטומטית ב-GitHub Pages (Settings → Pages → Source: `main` / root).
הדומיין המותאם מוגדר בקובץ `CNAME`.
