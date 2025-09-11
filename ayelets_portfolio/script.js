// שנה דינמית בכותרת תחתונה
document.getElementById('year').textContent = new Date().getFullYear();

// ניווט מובייל
const nav = document.querySelector('.nav');
const btn = document.querySelector('.menu-btn');
if (btn) {
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

// לייטבוקס פשוט
const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lightbox-img');
const lbCap = document.getElementById('lightbox-caption');
const closeBtn = document.querySelector('.lightbox__close');

document.querySelectorAll('.gallery .card').forEach(card => {
  card.addEventListener('click', (e) => {
    e.preventDefault();
    const href = card.getAttribute('href');
    const caption = card.getAttribute('data-caption') || '';
    lbImg.src = href;
    lbCap.textContent = caption;
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
  });
});

function closeLightbox() {
  lightbox.classList.remove('open');
  lbImg.src = '';
  lightbox.setAttribute('aria-hidden', 'true');
}
closeBtn.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => {
  // סגירה בלחיצה מחוץ לתמונה
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
});
