// Shop cart: kept in the visitor's browser. Checkout is disabled until payment is connected.
(function () {
  var PRODUCTS = {
    book:     { name: 'הספר ״באגים בהייטק״ — מכירה מוקדמת', price: 88, img: '../images/shop/book.webp' },
    tote:     { name: 'תיק טוקן',                           price: 75, img: '../images/shop/tote.webp' },
    stickers: { name: 'דף מדבקות ״באגים בהייטק״',           price: 25, img: '../images/shop/stickers.webp' },
    card:     { name: 'כרטיס ברכה לפטופ מנצנץ',             price: 25, img: '../images/shop/card.webp' }
  };
  var KEY = 'shop-cart';
  var cart = load();

  var dialog = document.getElementById('cart');
  var list = dialog.querySelector('.cart-items');
  var empty = dialog.querySelector('.cart-empty');
  var total = dialog.querySelector('.cart-total strong');
  var count = document.querySelector('.cart-count');
  var toast = document.querySelector('.toast');
  var toastTimer;

  function load() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY)) || {};
      Object.keys(c).forEach(function (id) { if (!PRODUCTS[id] || !(c[id] > 0)) delete c[id]; });
      return c;
    } catch (e) { return {}; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {} }
  function shekel(n) { return n + ' ש״ח'; }

  function render() {
    var ids = Object.keys(cart);
    var items = 0, sum = 0;
    list.innerHTML = '';
    ids.forEach(function (id) {
      var p = PRODUCTS[id], q = cart[id];
      items += q; sum += q * p.price;
      var li = document.createElement('li');
      li.className = 'cart-item';
      li.innerHTML =
        '<img src="' + p.img + '" alt="">' +
        '<div><div class="name"></div><div class="sub">' + shekel(p.price) + '</div>' +
        '<div class="qty"><button type="button" data-inc="' + id + '" aria-label="עוד אחד">+</button>' +
        '<span>' + q + '</span>' +
        '<button type="button" data-dec="' + id + '" aria-label="אחד פחות">−</button></div></div>' +
        '<button type="button" class="remove" data-remove="' + id + '">הסרה</button>';
      li.querySelector('.name').textContent = p.name;
      list.appendChild(li);
    });
    empty.hidden = ids.length > 0;
    total.textContent = shekel(sum);
    count.textContent = items;
    count.hidden = items === 0;
  }

  function add(id) {
    cart[id] = (cart[id] || 0) + 1;
    save(); render();
  }
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2200);
  }
  function openCart() { if (!dialog.open) dialog.showModal(); }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.add) {
      add(t.dataset.add);
      if (t.hasAttribute('data-open')) openCart();
      else showToast('נוסף לעגלה: ' + PRODUCTS[t.dataset.add].name);
    } else if (t.dataset.inc) { cart[t.dataset.inc]++; save(); render(); }
    else if (t.dataset.dec) {
      if (--cart[t.dataset.dec] <= 0) delete cart[t.dataset.dec];
      save(); render();
    } else if (t.dataset.remove) { delete cart[t.dataset.remove]; save(); render(); }
    else if (t.classList.contains('cart-btn')) openCart();
    else if (t.classList.contains('cart-close')) dialog.close();
  });
  // Click on the backdrop closes the cart
  dialog.addEventListener('click', function (e) {
    if (e.target !== dialog) return;
    var r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });

  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  render();
})();
