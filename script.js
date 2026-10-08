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
