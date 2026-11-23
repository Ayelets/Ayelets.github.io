// Google Apps Script for the orders spreadsheet.
//
// The checkout worker (checkout-worker/worker.js) sends every order here:
//   action 'new'  — when a buyer opens the payment page: a row is added with status "ממתין לתשלום"
//   action 'paid' — when SUMIT confirms the payment: the row's status becomes "שולם"
// The "קיבלו את ההזמנה" checkbox and the notes column are for Ayelet to fill in;
// this script never touches them after the row is created.
// When a payment arrives, a message also goes to a Telegram group, once Telegram is connected
// (connectTelegram(), see the README).
//
// Setup is in orders-sheet/README.md. In short: paste this file into
// Extensions → Apps Script of a new Google Sheet, run setup() once, and deploy as a Web app.

const SHEET_NAME = 'הזמנות';

// Column order in the sheet (1 = the first column, on the right in a Hebrew sheet).
const COLUMNS = [
  ['date',     'תאריך',                 140],
  ['name',     'שם',                    150],
  ['items',    'מוצרים',                260],
  ['shipping', 'משלוח או איסוף',        110],
  ['city',     'עיר',                   110],
  ['address',  'כתובת',                 200],
  ['phone',    'טלפון',                 120],
  ['email',    'אימייל',                200],
  ['total',    'סכום (ש״ח)',             90],
  ['status',   'סטטוס תשלום',           150],
  ['received', 'קיבלו את ההזמנה',        120],
  ['notes',    'הערות',                 220],
  ['orderId',  'מספר הזמנה',            150],
  ['payment',  'מספר תשלום ב-SUMIT',    140],
];
const COL = {};
COLUMNS.forEach(function (c, i) { COL[c[0]] = i + 1; });

const STATUS = {
  pending: 'ממתין לתשלום',
  paid: 'שולם',
  wrongAmount: 'שולם — סכום לא תואם, לבדוק ב-SUMIT',
  duplicate: 'לבדוק ב-SUMIT: מספר תשלום כפול',
  noDetails: 'שולם — חסרים פרטים, לבדוק ב-SUMIT',
};

// The worker posts JSON: { token, action, ... }.
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'bad json' });
  }
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || !body || body.token !== token) return reply({ ok: false, error: 'unauthorized' });

  if (body.action !== 'new' && body.action !== 'paid') return reply({ ok: false, error: 'unknown action' });
  let notice = null;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet();
    if (body.action === 'new') addOrder(sheet, body);
    else notice = markPaid(sheet, body);
  } finally {
    lock.releaseLock();
  }
  if (notice) sendTelegram(notice);
  return reply({ ok: true });
}

// Opening the web app address in a browser shows this — handy to check the deployment.
function doGet() {
  return ContentService.createTextOutput('החיבור לגיליון ההזמנות פועל.');
}

function addOrder(sheet, o) {
  if (!o.orderId || findRow(sheet, COL.orderId, o.orderId)) return; // already recorded
  writeRow(sheet, {
    date: new Date(),
    name: o.name,
    items: o.items,
    shipping: o.shipping,
    city: o.city,
    address: o.address,
    phone: o.phone,
    email: o.email,
    total: Number(o.total) || 0,
    status: STATUS.pending,
    orderId: o.orderId,
  });
}

// Returns the Telegram message for a payment seen for the first time, or null.
function markPaid(sheet, p) {
  const paymentId = String(p.paymentId || '');
  if (!paymentId) return null;
  const amount = Number(p.amount);
  const row = p.orderId ? findRow(sheet, COL.orderId, p.orderId) : 0;
  const samePaymentRow = findRow(sheet, COL.payment, paymentId);

  if (!row) {
    // The buyer's browser did not tell us which order this was. Keep the payment so it isn't lost.
    if (samePaymentRow) return null; // the thanks page was reloaded
    writeRow(sheet, { date: new Date(), total: amount || 0, status: STATUS.noDetails, payment: paymentId });
    return '💰 התקבל תשלום של ' + amount + ' ש״ח, בלי פרטי ההזמנה.\n' +
      '⚠️ לבדוק ב-SUMIT לפי מספר התשלום ' + paymentId + '.\n\n📋 ' + sheetUrl();
  }

  const current = sheet.getRange(row, COL.payment).getDisplayValue();
  const ids = current ? current.split(/\s*,\s*/) : [];
  if (ids.indexOf(paymentId) !== -1) return null; // the thanks page was reloaded
  const usedElsewhere = samePaymentRow && samePaymentRow !== row;
  if (ids.length || usedElsewhere) {
    // One payment pays for one order, and one order is paid once. Flag instead of guessing.
    setStatus(sheet, row, STATUS.duplicate);
    if (usedElsewhere) setStatus(sheet, samePaymentRow, STATUS.duplicate);
    sheet.getRange(row, COL.payment).setValue(asText(ids.concat(paymentId).join(', ')));
    return orderMessage(sheet, row, 'לבדוק ב-SUMIT: מספר התשלום ' + paymentId + ' מופיע ביותר מהזמנה אחת, או שההזמנה שולמה פעמיים.');
  }

  const total = Number(sheet.getRange(row, COL.total).getValue());
  const ok = amount === total;
  setStatus(sheet, row, ok ? STATUS.paid : STATUS.wrongAmount);
  sheet.getRange(row, COL.payment).setValue(asText(paymentId));
  return orderMessage(sheet, row, ok ? '' : 'לבדוק ב-SUMIT: שולמו ' + amount + ' ש״ח, וסכום ההזמנה הוא ' + total + ' ש״ח.');
}

function orderMessage(sheet, row, warning) {
  const v = sheet.getRange(row, 1, 1, COLUMNS.length).getDisplayValues()[0];
  function get(key) { return v[COL[key] - 1]; }
  const lines = ['🛒 הזמנה חדשה באתר!', '', '👤 ' + get('name'), get('items')];
  lines.push(get('shipping') === 'איסוף עצמי' ? '🏠 איסוף עצמי' : '🚚 משלוח ל' + get('city'));
  lines.push('💳 ' + get('total') + ' ש״ח');
  if (warning) lines.push('', '⚠️ ' + warning);
  lines.push('', '📋 ' + sheetUrl());
  return lines.join('\n');
}

function sheetUrl() {
  return SpreadsheetApp.getActive().getUrl();
}

function writeRow(sheet, data) {
  const row = sheet.getLastRow() + 1;
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 500);
  const values = COLUMNS.map(function (c) {
    const v = data[c[0]];
    if (v == null) return '';
    return typeof v === 'string' ? asText(v) : v;
  });
  sheet.getRange(row, 1, 1, COLUMNS.length).setValues([values]);
  sheet.getRange(row, COL.date).setNumberFormat('dd/mm/yyyy hh:mm');
  sheet.getRange(row, COL.total).setNumberFormat('#,##0');
  sheet.getRange(row, COL.received).insertCheckboxes();
}

function setStatus(sheet, row, status) {
  sheet.getRange(row, COL.status).setValue(status);
}

// Row number of the first cell in the column that equals value exactly, or 0.
function findRow(sheet, col, value) {
  const last = sheet.getLastRow();
  if (last < 2 || !value) return 0;
  const cell = sheet.getRange(2, col, last - 1, 1)
    .createTextFinder(String(value))
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();
  return cell ? cell.getRow() : 0;
}

// The leading ' tells Sheets "this is text": phone numbers keep their leading 0,
// and text typed by buyers never becomes a formula. The ' itself is not shown.
function asText(v) {
  const s = String(v).slice(0, 500);
  return s ? "'" + s : '';
}

function getSheet() {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Run once from the Apps Script editor: choose "setup" in the toolbar and press Run.
// It prepares the sheet and prints the secret code for Cloudflare in the execution log.
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone('Asia/Jerusalem');
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    const first = ss.getSheets()[0];
    sheet = first.getLastRow() === 0 ? first.setName(SHEET_NAME) : ss.insertSheet(SHEET_NAME);
  }
  sheet.setRightToLeft(true);
  if (sheet.getMaxRows() < 5000) sheet.insertRowsAfter(sheet.getMaxRows(), 5000 - sheet.getMaxRows());

  const header = sheet.getRange(1, 1, 1, COLUMNS.length);
  header.setValues([COLUMNS.map(function (c) { return c[1]; })])
    .setFontWeight('bold')
    .setBackground('#dad8ff')
    .setFontColor('#261c63')
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 32);
  COLUMNS.forEach(function (c, i) { sheet.setColumnWidth(i + 1, c[2]); });

  const body = sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), COLUMNS.length);
  body.setVerticalAlignment('top');
  [COL.items, COL.address, COL.notes].forEach(function (col) {
    sheet.getRange(2, col, body.getNumRows(), 1).setWrap(true); // several products → one per line
  });

  // Colors: received → green, waiting for payment → gray, needs checking → orange.
  const received = colLetter(COL.received), status = colLetter(COL.status);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + received + '2=TRUE')
      .setBackground('#dff3e4').setRanges([body]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + status + '2="' + STATUS.pending + '"')
      .setFontColor('#9a9a9a').setRanges([body]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=ISNUMBER(SEARCH("לבדוק",$' + status + '2))')
      .setBackground('#fde7cf').setRanges([body]).build(),
  ]);

  if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), COLUMNS.length).createFilter();

  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TOKEN', token);
  }
  console.log('הגיליון מוכן. הקוד הסודי ל-Cloudflare (ORDERS_SHEET_TOKEN):\n' + token);
}

function colLetter(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

// ---------------------------------------------------------------------------
// Telegram. The bot's token is kept in Script Properties as TELEGRAM_TOKEN
// (Project Settings → Script Properties), and connectTelegram() saves the group as TELEGRAM_CHAT_ID.

// Run once from the editor, after adding the bot to the group (see the README).
// It finds the group, saves it, and sends a first message there.
function connectTelegram() {
  const props = PropertiesService.getScriptProperties();
  const token = (props.getProperty('TELEGRAM_TOKEN') || '').trim();
  if (!token) throw new Error('חסר TELEGRAM_TOKEN ב-Script Properties. ההוראות ב-README.');
  const res = telegram(token, 'getUpdates', {});
  if (!res.ok && res.error_code === 401) throw new Error('טלגרם לא מכיר את הטוקן הזה. בדקי את TELEGRAM_TOKEN.');
  if (!res.ok && res.error_code === 429) throw new Error('טלגרם מבקשת לחכות דקה. הריצי שוב בעוד דקה.');
  if (!res.ok) throw new Error('טלגרם החזירה שגיאה: ' + res.description);
  let chat = null;
  res.result.forEach(function (u) {
    const m = u.message || u.edited_message || u.my_chat_member || u.chat_member;
    if (m && m.chat && (m.chat.type === 'group' || m.chat.type === 'supergroup')) chat = m.chat;
  });
  if (!chat) {
    throw new Error('לא מצאתי קבוצה. ודאי שהבוט נוסף לקבוצה, כתבי בקבוצה /start והריצי שוב את connectTelegram.');
  }
  props.setProperty('TELEGRAM_TOKEN', token);
  props.setProperty('TELEGRAM_CHAT_ID', String(chat.id));
  if (!sendTelegram('✅ מחובר! מעכשיו אודיע כאן על כל הזמנה מהאתר.')) {
    throw new Error('לא הצלחתי לשלוח הודעה לקבוצה "' + chat.title + '". פרטים ב-Execution log.');
  }
  console.log('מחובר לקבוצה "' + chat.title + '". עכשיו: Deploy → Manage deployments → New version.');
}

// Never throws: a Telegram problem must not stop an order from being saved.
function sendTelegram(text) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_TOKEN');
  const chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return false;
  try {
    const message = { chat_id: chatId, text: text, disable_web_page_preview: true };
    let res = telegram(token, 'sendMessage', message);
    const moved = res.parameters && res.parameters.migrate_to_chat_id;
    if (!res.ok && moved) {
      // The group became a supergroup and got a new id.
      props.setProperty('TELEGRAM_CHAT_ID', String(moved));
      message.chat_id = moved;
      res = telegram(token, 'sendMessage', message);
    }
    if (!res.ok) console.error('telegram: ' + res.description);
    return Boolean(res.ok);
  } catch (err) {
    console.error('telegram: ' + err);
    return false;
  }
}

function telegram(token, method, payload) {
  const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  return JSON.parse(res.getContentText());
}
