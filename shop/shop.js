// Shop cart: kept in the visitor's browser. Checkout goes through a small
// Cloudflare Worker (see checkout-worker/README.md) that opens a SUMIT payment page.
(function () {
  var CHECKOUT_API = (window.SHOP_CHECKOUT_API || '').replace(/\/+$/, '');

  var PRODUCTS = {
    book:     { name: 'הספר ״באגים בהייטק״ — מכירה מוקדמת', price: 98, img: '/images/shop/book.webp',
                desc: 'ספר קומיקס סאטירי על החיים בהייטק הישראלי. 168 עמודים מאוירים ידנית בכריכה קשה. זוכה מענק מפעל הפיס לשנת 2026.' },
    tote:     { name: 'תיק טוקן',                           price: 75, img: '/images/shop/tote.webp',
                desc: 'תיק בד עם איור של טוקן מתוך עולם ״באגים בהייטק״.' },
    stickers: { name: 'דף מדבקות ״באגים בהייטק״',           price: 25, img: '/images/shop/stickers.webp',
                desc: 'דף מדבקות עם דמויות ואיורים מתוך הקומיקס ״באגים בהייטק״.' },
    card:     { name: 'כרטיס ברכה לפטופ מנצנץ',             price: 25, img: '/images/shop/card.webp',
                desc: 'כרטיס ברכה מאויר של לפטופ, מתוך עולם ״באגים בהייטק״.' },
    // Hidden 1 ש״ח item for testing payments: open /?test — remove after testing
    test:     { name: 'בדיקת תשלום',                         price: 1,  img: '/images/shop/card.webp' }
  };
  // Site-wide sale: 20% off every product until the end of November 2026 (Israel time).
  // After that date the full prices come back by themselves. Keep in sync with checkout-worker/worker.js.
  var SALE = { pct: 20, end: Date.parse('2026-12-01T00:00:00+02:00') };
  var saleOn = Date.now() < SALE.end;
  function onSale(id) { return saleOn && id !== 'test'; }
  function priceOf(id) {
    var full = PRODUCTS[id].price;
    return onSale(id) ? Math.round(full * (100 - SALE.pct)) / 100 : full;
  }
  // Struck-through original price next to the sale price, plus a "20% הנחה" tag
  function priceHTML(id) {
    if (!onSale(id)) return '<span>' + shekel(PRODUCTS[id].price) + '</span>';
    return '<s><span class="visually-hidden">מחיר מקורי: </span>' + shekel(PRODUCTS[id].price) + '</s> ' +
      '<span class="sale-price"><span class="visually-hidden">מחיר במבצע: </span>' + shekel(priceOf(id)) + '</span> ' +
      '<span class="sale-tag">' + SALE.pct + '% הנחה</span>';
  }
  document.querySelectorAll('.price[data-price]').forEach(function (el) { el.innerHTML = priceHTML(el.dataset.price); });
  document.querySelectorAll('.sale-banner').forEach(function (el) { el.hidden = !saleOn; });

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
  var savingsEls = dialog.querySelectorAll('.cart-savings');
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
  function shekel(n) { return (n % 1 ? n.toFixed(2) : n) + ' ש״ח'; }

  function render() {
    var ids = Object.keys(cart);
    var items = 0, sum = 0, full = 0;
    list.innerHTML = '';
    ids.forEach(function (id) {
      var p = PRODUCTS[id], q = cart[id];
      items += q; sum += q * priceOf(id); full += q * p.price;
      var li = document.createElement('li');
      li.className = 'cart-item';
      li.innerHTML =
        '<img src="' + p.img + '" alt="">' +
        '<div><div class="name"></div><div class="sub">' + priceHTML(id) + '</div>' +
        '<div class="qty"><button type="button" data-inc="' + id + '" aria-label="עוד אחד">+</button>' +
        '<span>' + q + '</span>' +
        '<button type="button" data-dec="' + id + '" aria-label="אחד פחות">−</button></div></div>' +
        '<button type="button" class="remove" data-remove="' + id + '">הסרה</button>';
      li.querySelector('.name').textContent = p.name;
      list.appendChild(li);
    });
    empty.hidden = ids.length > 0;
    sum = Math.round(sum * 100) / 100;
    totals.forEach(function (t) { t.textContent = shekel(sum); });
    cartSum = sum;
    // Sale: show what the cart would have cost and how much is saved
    var saved = Math.round((full - sum) * 100) / 100;
    savingsEls.forEach(function (el) {
      el.hidden = !(saved > 0);
      el.innerHTML = 'מחיר מקורי: <s>' + shekel(full) + '</s><br>' +
        '<strong>' + SALE.pct + '% הנחה עד סוף החודש:</strong> חוסכים ' + shekel(saved);
    });
    updateShipping();
    checkoutBtn.disabled = !CHECKOUT_API || items === 0;
    if (items === 0) showStep('cart');
    count.textContent = items;
    count.hidden = items === 0;
    // A collected product's button says so: "בעגלה ✓" (clicking still adds another)
    document.querySelectorAll('.products .add-btn').forEach(function (b) {
      if (!b._label) {
        b._label = document.createElement('span');
        b._label.textContent = b.textContent;
        b.textContent = '';
        b.appendChild(b._label);
      }
      var inCart = !!cart[b.dataset.add];
      b.classList.toggle('in-cart', inCart);
      b._label.textContent = inCart ? 'בעגלה ✓' : 'הוספה לעגלה';
      if (inCart) b.setAttribute('aria-label', 'בעגלה. לחיצה מוסיפה עוד אחד');
      else b.removeAttribute('aria-label');
    });
  }

  function add(id, n) {
    cart[id] = (cart[id] || 0) + (n || 1);
    save(); render();
  }
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2200);
  }
  // Like collecting a coin in a game: the button vanishes, "+price" appears
  // in its place, drifts up a little and fades, then the button comes back.
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  function score(btn, price) {
    if (calm.matches) return;
    var old = btn.querySelector('.score');
    if (old) old.remove();
    var s = document.createElement('span');
    s.className = 'score';
    s.dir = 'ltr';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = '+' + price;
    btn.classList.remove('back');
    btn.classList.add('scored');
    btn.appendChild(s);
    s.addEventListener('animationend', function () {
      s.remove();
      btn.classList.remove('scored');
      btn.classList.add('back');
    });
  }
  document.addEventListener('animationend', function (e) {
    if (e.animationName === 'btn-back') e.target.classList.remove('back');
  });
  function openCart() { if (qv.open) qv.close(); if (!dialog.open) dialog.showModal(); }

  // Product quick view: click a product's picture or name to see it bigger with details.
  var qv = document.getElementById('quickview');
  var qvId = null, qvQty = 1;
  var qvCount = qv.querySelector('.qv-count');
  function openView(id) {
    var p = PRODUCTS[id];
    qvId = id; qvQty = 1; qvCount.textContent = 1;
    qv.querySelector('.qv-name').textContent = p.name;
    qv.querySelector('.qv-desc').textContent = p.desc || '';
    qv.querySelector('.qv-price').innerHTML = priceHTML(id);
    var img = qv.querySelector('.qv-img img');
    img.src = p.img; img.alt = p.name;
    qv.showModal();
  }
  qv.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (e.target === qv) return qv.close(); // backdrop
    if (!t) return;
    if (t.classList.contains('qv-close')) qv.close();
    else if (t.classList.contains('qv-plus')) qvCount.textContent = ++qvQty;
    else if (t.classList.contains('qv-minus')) { if (qvQty > 1) qvCount.textContent = --qvQty; }
    else if (t.classList.contains('qv-add')) {
      add(qvId, qvQty);
      qv.close();
      showToast('נוסף לעגלה: ' + PRODUCTS[qvId].name);
    }
  });

  function shippingMethod() { return form.elements.shipping.value === 'pickup' ? 'pickup' : 'delivery'; }
  function updateShipping() {
    var delivery = shippingMethod() === 'delivery';
    var fee = delivery ? SHIPPING_PRICE : 0;
    shipFields.hidden = !delivery;
    pickupNote.hidden = delivery;
    shipPrice.textContent = fee ? shekel(fee) : 'חינם';
    grandTotal.textContent = shekel(Math.round((cartSum + fee) * 100) / 100);
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
    if (t.dataset.view) openView(t.dataset.view);
    else if (t.dataset.add) {
      add(t.dataset.add);
      if (t.hasAttribute('data-open')) openCart();
      else {
        score(t, priceOf(t.dataset.add));
        showToast('נוסף לעגלה: ' + PRODUCTS[t.dataset.add].name);
      }
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
  // Cart icon on other pages links to /#cart
  if (location.hash === '#cart') {
    history.replaceState(null, '', location.pathname + location.search);
    openCart();
  }
  // "אני רוצה לקנות" on the chapter page links to /#buy: the book goes in the cart and the cart opens
  if (location.hash === '#buy') {
    history.replaceState(null, '', location.pathname + location.search);
    if (!cart.book) add('book');
    openCart();
  }
})();
