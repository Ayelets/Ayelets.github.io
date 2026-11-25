// שנה דינמית בכותרת תחתונה
document.getElementById('year').textContent = new Date().getFullYear();

// צל לכותרת העליונה בזמן גלילה
const header = document.querySelector('.site-header');
const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// הופעה הדרגתית של אלמנטים בגלילה
const works = [...document.querySelectorAll('.gallery .work')];
works.forEach((el, i) => el.style.setProperty('--delay', `${(i % 3) * 90}ms`));
const revealEls = [...document.querySelectorAll('.reveal'), ...works];
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('in'));
}

// גלריה: חלוקה מאוזנת לשורות כך שכל שורה, גם האחרונה, מגיעה בדיוק עד הקצוות
const gallery = document.querySelector('.gallery');
if (gallery && works.length) {
  const ratios = works.map((w) => parseFloat(w.style.getPropertyValue('--r')) || 1);
  const phone = window.matchMedia('(max-width: 600px)');
  let lastWidth = 0;

  const layout = () => {
    if (phone.matches) {
      works.forEach((w) => w.style.removeProperty('flex'));
      lastWidth = 0;
      return;
    }
    const width = gallery.clientWidth;
    if (!width || width === lastWidth) return;
    lastWidth = width;
    const cs = getComputedStyle(gallery);
    const gap = parseFloat(cs.columnGap) || 0;
    const target = parseFloat(cs.getPropertyValue('--row')) || 300;

    // תכנון דינמי: בוחרים את נקודות השבירה שגובה השורות בהן הכי קרוב לגובה המטרה
    const n = ratios.length;
    const cost = new Array(n + 1).fill(Infinity);
    const from = new Array(n + 1).fill(0);
    cost[0] = 0;
    for (let j = 1; j <= n; j++) {
      let sum = 0;
      for (let i = j - 1; i >= 0; i--) {
        sum += ratios[i];
        const h = (width - gap * (j - i - 1)) / sum;
        if (h <= 0) break;
        const c = cost[i] + Math.log(h / target) ** 2;
        if (c < cost[j]) { cost[j] = c; from[j] = i; }
        if (h < target / 2) break;
      }
    }

    for (let j = n; j > 0; j = from[j]) {
      const i = from[j];
      let sum = 0;
      for (let k = i; k < j; k++) sum += ratios[k];
      const h = (width - gap * (j - i - 1)) / sum;
      // רוחב מעוגל כלפי מטה, פחות פיקסל ביטחון: עיגול של הדפדפן (זום, מסכי רטינה)
      // לא יכול לדחוף ציור לשורה חדשה. שארית הפיקסלים מתחלקת בעזרת flex-grow
      for (let k = i; k < j; k++) {
        works[k].style.flex = `${ratios[k]} 1 ${Math.max(0, Math.floor(ratios[k] * h * 10) / 10 - 1)}px`;
      }
    }
  };

  layout();
  if ('ResizeObserver' in window) new ResizeObserver(layout).observe(gallery);
  else window.addEventListener('resize', layout);
  phone.addEventListener?.('change', layout);
}

// לייטבוקס: תצוגה גדולה עם מעבר בין עבודות (חיצים, מקלדת והחלקה)
const links = works.map((w) => w.querySelector('a'));
const dialog = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
const lbTitle = document.getElementById('lb-title');
const lbCount = document.getElementById('lb-count');
let current = 0;

function show(index) {
  current = (index + links.length) % links.length;
  const link = links[current];
  const thumb = link.querySelector('img');
  lbImg.classList.remove('loaded');
  lbImg.style.setProperty('--w', thumb.getAttribute('width'));
  lbImg.style.setProperty('--h', thumb.getAttribute('height'));
  lbImg.src = link.href;
  lbImg.alt = link.dataset.title;
  if (lbImg.complete) lbImg.classList.add('loaded');
  lbTitle.textContent = link.dataset.title;
  lbCount.textContent = `${current + 1} / ${links.length}`;
  // אנליטיקה: איזו עבודה נצפתה בתצוגה הגדולה
  try { if (window.gtag) gtag('event', 'view_artwork', { artwork: link.dataset.title }); } catch (e) {}
  // טעינה מוקדמת של השכנות
  [current + 1, current - 1].forEach((j) => {
    new Image().src = links[(j + links.length) % links.length].href;
  });
}
lbImg.addEventListener('load', () => lbImg.classList.add('loaded'));

if (dialog && typeof dialog.showModal === 'function') {
  links.forEach((link, i) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      show(i);
      dialog.showModal();
    });
  });

  dialog.querySelector('.lb-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('.lb-next').addEventListener('click', () => show(current + 1));
  dialog.querySelector('.lb-prev').addEventListener('click', () => show(current - 1));

  // סגירה בלחיצה על הרקע
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.classList.contains('lb-stage')) dialog.close();
  });

  // באתר מימין לשמאל: חץ שמאלה = הבאה
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(current + 1);
    if (e.key === 'ArrowRight') show(current - 1);
  });

  // החלקה במובייל
  let startX = null;
  dialog.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  dialog.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) show(current + (dx > 0 ? 1 : -1));
    startX = null;
  });

  dialog.addEventListener('close', () => {
    links[current].focus({ preventScroll: true });
    links[current].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}
