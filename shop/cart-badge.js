// Item count on the cart icon for pages outside the shop (the cart itself lives on the shop page).
(function () {
  var badge = document.querySelector('.cart-count');
  if (!badge) return;
  function update() {
    var n = 0;
    try {
      var cart = JSON.parse(localStorage.getItem('shop-cart')) || {};
      Object.keys(cart).forEach(function (id) { if (cart[id] > 0) n += cart[id]; });
    } catch (e) {}
    badge.textContent = n;
    badge.hidden = n === 0;
  }
  update();
  window.addEventListener('storage', update);
  window.addEventListener('pageshow', update);
})();
