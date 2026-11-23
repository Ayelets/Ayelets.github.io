// Shop cart: kept in the visitor's browser. Checkout goes through a small
// Cloudflare Worker (see checkout-worker/README.md) that opens a SUMIT payment page.
(function () {
  var CHECKOUT_API = (window.SHOP_CHECKOUT_API || '').replace(/\/+$/, '');

  var PRODUCTS = {
    book:     { name: 'הספר ״באגים בהייטק״ — מכירה מוקדמת', price: 88, img: '/images/shop/book.webp' },
    tote:     { name: 'תיק טוקן',                           price: 75, img: '/images/shop/tote.webp' },
    stickers: { name: 'דף מדבקות ״באגים בהייטק״',           price: 25, img: '/images/shop/stickers.webp' },
    card:     { name: 'כרטיס ברכה לפטופ מנצנץ',             price: 25, img: '/images/shop/card.webp' },
    // Hidden 1 ש״ח item for testing payments: open /?test — remove after testing
    test:     { name: 'בדיקת תשלום',                         price: 1,  img: '/images/shop/card.webp' }
  };
  var KEY = 'shop-cart';
  var cart = load();

  var dialog = document.getElementById('cart');
  var list = dialog.querySelector('.cart-items');
  var empty = dialog.querySelector('.cart-empty');
  var SHIPPING_PRICE = 35; // keep in sync with checkout-worker/worker.js
  var totals = dialog.querySelectorAll('.cart-foot .cart-total strong');
  var grandTotal = dialog.querySelector('.grand-total');
  var shipPrice = dialog.querySelector('.ship-price');
  var shipFields = dialog.querySelector('.ship-fields');
  var pickupNote = dialog.querySelector('.pickup-note');
  var cartSum = 0;
  var foot = dialog.querySelector('.cart-foot');
  var checkoutBtn = foot.querySelector('.checkout-btn');
  var form = dialog.querySelector('.checkout-form');
  var formError = form.querySelector('.form-error');
  var payBtn = form.querySelector('.pay-btn');
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
    totals.forEach(function (t) { t.textContent = shekel(sum); });
    cartSum = sum;
    updateShipping();
    checkoutBtn.disabled = !CHECKOUT_API || items === 0;
    if (items === 0) showStep('cart');
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

  function shippingMethod() { return form.elements.shipping.value === 'pickup' ? 'pickup' : 'delivery'; }
  function updateShipping() {
    var delivery = shippingMethod() === 'delivery';
    var fee = delivery ? SHIPPING_PRICE : 0;
    shipFields.hidden = !delivery;
    pickupNote.hidden = delivery;
    shipPrice.textContent = fee ? shekel(fee) : 'חינם';
    grandTotal.textContent = shekel(cartSum + fee);
  }
  form.addEventListener('change', function (e) { if (e.target.name === 'shipping') updateShipping(); });

  function showStep(step) {
    var checkout = step === 'checkout';
    form.hidden = !checkout;
    foot.hidden = checkout;
    list.hidden = checkout;
    if (checkout) { formError.hidden = true; form.elements.name.focus(); }
  }

  // Remember the buyer's details in this browser so a retry doesn't mean retyping.
  var DETAILS_KEY = 'shop-details';
  try {
    var saved = JSON.parse(localStorage.getItem(DETAILS_KEY)) || {};
    Object.keys(saved).forEach(function (k) { if (form.elements[k]) form.elements[k].value = saved[k]; });
  } catch (e) {}

  form.addEventListener('input', function () { formError.hidden = true; });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var customer = {};
    var method = shippingMethod();
    var fields = method === 'delivery' ? ['name', 'phone', 'email', 'city', 'address'] : ['name', 'phone', 'email'];
    fields.forEach(function (k) { customer[k] = form.elements[k].value.trim(); });
    var missing = fields.filter(function (k) { return !customer[k]; });
    if (missing.length) return fail('יש למלא את כל השדות.', form.elements[missing[0]]);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return fail('כתובת האימייל לא תקינה.', form.elements.email);
    try {
      var keep = {};
      ['name', 'phone', 'email', 'city', 'address'].forEach(function (k) { keep[k] = form.elements[k].value.trim(); });
      localStorage.setItem(DETAILS_KEY, JSON.stringify(keep));
    } catch (e2) {}

    var items = Object.keys(cart).map(function (id) { return { id: id, qty: cart[id] }; });
    payBtn.disabled = true;
    payBtn.textContent = 'פותח את דף התשלום…';
    formError.hidden = true;
    fetch(CHECKOUT_API + '/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items, customer: customer, shipping: method })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (res) {
        if (res && res.redirectUrl) { window.location.href = res.redirectUrl; return; }
        throw new Error(res && res.error);
      })
      .catch(function (err) {
        fail((err && err.message) || 'לא ניתן לפתוח את דף התשלום כרגע. נסו שוב מאוחר יותר.');
        payBtn.disabled = false;
        payBtn.textContent = 'מעבר לתשלום מאובטח';
      });
  });
  function fail(msg, field) {
    formError.textContent = msg;
    formError.hidden = false;
    if (field) field.focus();
  }

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
    else if (t === checkoutBtn) showStep('checkout');
    else if (t.classList.contains('back-btn')) showStep('cart');
  });
  // Click on the backdrop closes the cart
  dialog.addEventListener('click', function (e) {
    if (e.target !== dialog) return;
    var r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });

  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  if (!CHECKOUT_API) dialog.querySelector('.cart-foot .cart-note').hidden = false;
  // /?test puts the hidden 1 ש״ח test item in the cart.
  if (/[?&]test\b/.test(location.search)) {
    cart = { test: 1 };
    save();
    render();
    openCart();
    return;
  }
  render();
})();
