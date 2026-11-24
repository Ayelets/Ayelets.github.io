// Cloudflare Worker: connects the shop's cart to SUMIT.
//
// The SUMIT API key must stay secret, so the website cannot call SUMIT
// directly. The shop sends the cart here; this worker looks up the real
// prices, asks SUMIT for a payment page, and returns its address.
//
// Secrets to set in Cloudflare (Settings → Variables and Secrets):
//   SUMIT_COMPANY_ID  — the company number from SUMIT
//   SUMIT_API_KEY     — the private API key from SUMIT (type: Secret)
//
// Routes:
//   POST /checkout  { items: [{ id, qty }], shipping: 'delivery' | 'pickup',
//                     customer: { name, phone, email, city, address } }  (city/address only for delivery)
//                   → { redirectUrl }
//   GET  /verify?id=<OG-PaymentID>
//                   → { valid, amount, id }

const SITE = 'https://ayeletsapirshtein.com';
const ALLOWED_ORIGINS = [SITE, 'https://www.ayeletsapirshtein.com', 'https://ayelets.github.io'];

// Prices are taken from here only — never from the browser. Keep in sync with shop/shop.js.
const PRODUCTS = {
  book:     { name: 'הספר "באגים בהייטק" — מכירה מוקדמת', price: 98 },
  tote:     { name: 'תיק טוקן',                           price: 75 },
  stickers: { name: 'דף מדבקות "באגים בהייטק"',           price: 25 },
  card:     { name: 'כרטיס ברכה לפטופ מנצנץ',             price: 25 },
  // Hidden 1 ש״ח item for testing payments (/shop/?test) — remove after testing
  test:     { name: 'בדיקת תשלום',                         price: 1 },
};

// Site-wide sale: 20% off every product until the end of November 2026 (Israel time).
// After that date the full prices come back by themselves. Keep in sync with shop/shop.js.
const SALE = { pct: 20, end: Date.parse('2026-12-01T00:00:00+02:00') };

// Home delivery fee in shekels. Self pickup is free.
const SHIPPING_PRICE = 35;

const SUMIT_API = 'https://api.sumit.co.il';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : SITE,
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const reply = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    try {
      if (url.pathname === '/checkout' && request.method === 'POST') {
        if (origin && !ALLOWED_ORIGINS.includes(origin)) return reply({ error: 'forbidden' }, 403);
        return reply(await checkout(await request.json(), env));
      }
      if (url.pathname === '/verify' && request.method === 'GET') {
        return reply(await verify(url.searchParams.get('id'), env));
      }
      return reply({ error: 'not found' }, 404);
    } catch (err) {
      if (err instanceof UserError) return reply({ error: err.message }, 400);
      console.error(err);
      return reply({ error: 'לא ניתן לפתוח את דף התשלום כרגע. נסו שוב מאוחר יותר או צרו קשר.' }, 502);
    }
  },
};

class UserError extends Error {}

async function checkout(body, env) {
  const c = body && body.customer || {};
  const customer = {
    name: clean(c.name), phone: clean(c.phone), email: clean(c.email),
    city: clean(c.city), address: clean(c.address),
  };
  const delivery = body.shipping !== 'pickup';
  if (!customer.name || !customer.phone || !customer.email) throw new UserError('יש למלא שם, טלפון ואימייל.');
  if (delivery && (!customer.city || !customer.address)) throw new UserError('למשלוח יש למלא עיר וכתובת.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw new UserError('כתובת האימייל לא תקינה.');

  const lines = Array.isArray(body.items) ? body.items : [];
  const items = [];
  for (const line of lines) {
    const p = PRODUCTS[line && line.id];
    const qty = Math.floor(Number(line && line.qty));
    if (!p) continue;
    if (!(qty >= 1 && qty <= 20)) throw new UserError('כמות לא תקינה בעגלה.');
    const sale = Date.now() < SALE.end && line.id !== 'test';
    const price = sale ? Math.round(p.price * (100 - SALE.pct)) / 100 : p.price;
    const name = sale ? p.name + ' (' + SALE.pct + '% הנחה, מחיר מקורי ' + p.price + ' ש״ח)' : p.name;
    items.push({ Item: { Name: name, ExternalIdentifier: line.id }, Quantity: qty, UnitPrice: price, Currency: 'ILS' });
  }
  if (!items.length) throw new UserError('העגלה ריקה.');
  if (delivery && SHIPPING_PRICE > 0) {
    items.push({ Item: { Name: 'משלוח', ExternalIdentifier: 'shipping' }, Quantity: 1, UnitPrice: SHIPPING_PRICE, Currency: 'ILS' });
  }

  const orderId = 'AS-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const data = await sumit('/billing/payments/beginredirect/', {
    Customer: {
      Name: customer.name,
      Phone: customer.phone,
      EmailAddress: customer.email,
      City: delivery ? customer.city : null,
      Address: delivery ? customer.address : null,
    },
    Items: items,
    ExternalIdentifier: orderId,
    DocumentDescription: delivery ? 'משלוח לכתובת: ' + customer.address + ', ' + customer.city : 'איסוף עצמי',
    RedirectURL: SITE + '/shop/thanks/',
    CancelRedirectURL: SITE + '/shop/',
    SendUpdateByEmailAddress: customer.email,
    DraftDocument: false,
  }, env);

  if (!data || !data.RedirectURL) throw new Error('SUMIT did not return RedirectURL');
  return { redirectUrl: data.RedirectURL, orderId };
}

async function verify(id, env) {
  const paymentId = Number(id);
  if (!paymentId) throw new UserError('missing payment id');
  const data = await sumit('/billing/payments/get/', { PaymentID: paymentId }, env);
  const p = data && data.Payment;
  return { valid: Boolean(p && p.ValidPayment), amount: p ? p.Amount : null, id: p ? p.ID : paymentId };
}

async function sumit(path, body, env) {
  const companyId = Number(env.SUMIT_COMPANY_ID);
  if (!companyId || !env.SUMIT_API_KEY) throw new Error('SUMIT_COMPANY_ID / SUMIT_API_KEY are not set');
  const res = await fetch(SUMIT_API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Credentials: { CompanyID: companyId, APIKey: env.SUMIT_API_KEY }, ...body }),
  });
  const json = await res.json().catch(() => null);
  // Status: 0 / "Success" = OK, 1 = business error, 2 = technical error
  const ok = json && (json.Status === 0 || json.Status === 'Success');
  if (!res.ok || !ok) {
    const msg = json && (json.UserErrorMessage || json.TechnicalErrorDetails);
    if (json && (json.Status === 1 || json.Status === 'BusinessError') && msg) throw new UserError(msg);
    throw new Error('SUMIT error: ' + (msg || 'HTTP ' + res.status));
  }
  return json.Data;
}

function clean(v) { return String(v == null ? '' : v).trim().slice(0, 200); }
