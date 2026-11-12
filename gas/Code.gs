/**
 * 大研生醫團購 — 雲端資料 + 寄信服務（v2：權限分離）
 * 部署設定：執行身分「我」、存取權「任何人」
 *
 * ── 機密設定（不寫在程式碼裡）──────────────────────────────────────────────
 * 到 Apps Script 左側「專案設定 ⚙️ → 指令碼屬性」新增：
 *   WRITE_TOKEN   前端下單用的 token，必須與 GitHub Secret REACT_APP_WRITE_TOKEN 相同
 *   ADMIN_PW      管理員密碼（建議 12 字元以上）
 * 沒設定時一律拒絕（下單失敗／無法登入），不會退回不安全的預設值。
 *
 * ── 權限設計 ──────────────────────────────────────────────────────────────
 * 公開（任何人，只需 WRITE_TOKEN）：
 *   getPublicSettings  讀年月、是否開團、公告（不含銀行帳號）
 *   getCats            讀產品目錄
 *   lookupCustomer     用 Email 查「這一個人」的上次訂購資料（自動帶入用）
 *   getMyOrder         用 Email 查「這一個人」本月的訂單
 *   submitOrder        新增或修改「這一個人」的訂單；伺服器計價、伺服器寄確認信
 * 管理員（需 ADMIN_PW，錯 10 次鎖 15 分鐘）：
 *   verifyAdmin / adminGet / adminSet / adminUpdateOrder /
 *   adminDeleteCustomer / adminSendEmail / syncCloseout
 */
const SPREADSHEET_ID = "12n0gv6Guo1Vtzm0tqGk7Vd6ftkIXc4XF2HAjgt0Ojvo";
const SITE_URL = "https://jamy84464.github.io/daiken-order/";
const DATA_SHEETS = ["app_data", "backup_app_data"];

const PW_FAIL_KEY = "admin_pw_fail";
const PW_MAX_FAIL = 10;
const PW_LOCK_SEC = 900;

// ─── 工具 ──────────────────────────────────────────────────────────────────
var _ss = null;
function ss() { return _ss || (_ss = SpreadsheetApp.openById(SPREADSHEET_ID)); }
function getOrCreate(name) {
  var s = ss().getSheetByName(name);
  if (!s) s = ss().insertSheet(name);
  return s;
}
function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function prop(name) {
  return PropertiesService.getScriptProperties().getProperty(name) || "";
}
function fail(code, extra) {
  var o = { success: false, error: code };
  if (extra) for (var k in extra) o[k] = extra[k];
  return o;
}
function normEmail(v) { return String(v || "").trim().toLowerCase(); }
function isEmail(v) { return /^[^\s@]{2,}@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 120; }
// 去頭尾空白、限制長度、移除控制字元
function clean(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}
function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
// 與前端相同格式：2026/11/12 下午3:04:05
function nowTw() {
  var d = new Date();
  var h = parseInt(Utilities.formatDate(d, "Asia/Taipei", "H"), 10);
  return Utilities.formatDate(d, "Asia/Taipei", "yyyy/M/d") + " " +
    (h < 12 ? "上午" : "下午") + Utilities.formatDate(d, "Asia/Taipei", "h:mm:ss");
}
// 同時有多個寫入時排隊處理；拿不到鎖就回報 busy，不寫入
function withLock(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return fail("busy"); }
  try { return fn(); } finally { lock.releaseLock(); }
}

// ─── 權限 ──────────────────────────────────────────────────────────────────
function tokenOk(token) {
  var real = prop("WRITE_TOKEN");
  return !!real && token === real;
}
// 回傳 "ok" / "bad" / "locked"；錯 PW_MAX_FAIL 次後鎖 PW_LOCK_SEC 秒（期間正確密碼也擋）
function checkAdmin(pw) {
  var cache = CacheService.getScriptCache();
  var fails = parseInt(cache.get(PW_FAIL_KEY) || "0", 10);
  if (fails >= PW_MAX_FAIL) return "locked";
  var real = prop("ADMIN_PW");
  if (real && pw && pw === real) return "ok";
  cache.put(PW_FAIL_KEY, String(fails + 1), PW_LOCK_SEC);
  return "bad";
}
function authFail(result) { return fail(result === "locked" ? "locked" : "unauthorized"); }

// ─── Key-Value 存取 ────────────────────────────────────────────────────────
function kvGet(key, sheetName) {
  var sheet = getOrCreate(sheetName || "app_data");
  var data  = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}
function kvSet(key, value, sheetName) {
  var sheet = getOrCreate(sheetName || "app_data");
  var data  = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      sheet.getRange(i + 1, 3).setValue(new Date().toLocaleString("zh-TW"));
      return;
    }
  }
  sheet.appendRow([key, value, new Date().toLocaleString("zh-TW")]);
}
// 讀 JSON：沒有這筆回傳 null；有資料但壞掉就丟錯 —— 絕不能當成空的再寫回去
function readJson(key) {
  var raw = kvGet(key, "app_data");
  if (raw === null || raw === "") return null;
  try { return JSON.parse(raw); }
  catch (e) { throw new Error("資料格式錯誤，已中止以免覆蓋：" + key); }
}
function writeJson(key, obj) { kvSet(key, JSON.stringify(obj), "app_data"); }

function getSettings() { return readJson("settings"); }
function ordersKeyOf(s) { return "orders_" + s.year + "_" + String(s.month).padStart(2, "0"); }

// ─── GET ───────────────────────────────────────────────────────────────────
function doGet(e) {
  var r;
  try { r = handleGet(e.parameter || {}); }
  catch (err) { Logger.log("doGet error: " + err); r = fail("server_error"); }
  return jsonOut(r);
}

function handleGet(p) {
  var action = p.action;

  if (action === "getPublicSettings") {
    var s = getSettings();
    if (!s) return { success: true, value: null };
    return { success: true, value: { year: s.year, month: s.month, isOpen: !!s.isOpen, bulletin: s.bulletin || "" } };
  }

  if (action === "getCats") return getCatsFromSheet();

  if (action === "lookupCustomer") {
    var email = normEmail(p.email);
    if (!isEmail(email)) return fail("invalid_email");
    var custs = readJson("customers") || {};
    var c = custs[email];
    if (!c) return { success: true, value: null };
    return { success: true, value: {
      name: c.name || "", phone: c.phone || "", relation: c.relation || "",
      lastRecipientName: c.lastRecipientName || "",
      lastRecipientAddress: c.lastRecipientAddress || "",
      lastRecipientPhone: c.lastRecipientPhone || ""
    } };
  }

  if (action === "getMyOrder") {
    var em = normEmail(p.email);
    if (!isEmail(em)) return fail("invalid_email");
    var st = getSettings();
    if (!st) return { success: true, value: null };
    var orders = readJson(ordersKeyOf(st)) || {};
    return { success: true, value: orders[em] || null };
  }

  if (action === "verifyAdmin") {
    var a = checkAdmin(p.pw);
    if (a === "locked") return fail("locked");
    return { success: true, authed: a === "ok" };
  }

  if (action === "adminGet") {
    var auth = checkAdmin(p.pw);
    if (auth !== "ok") return authFail(auth);
    var sheet = p.sheet || "app_data";
    if (DATA_SHEETS.indexOf(sheet) < 0) return fail("invalid_sheet");
    if (!p.key) return fail("missing_key");
    var v = kvGet(p.key, sheet);
    return { success: true, value: (v === null || v === "") ? null : v };
  }

  return fail("unknown_action");
}

// ─── POST ──────────────────────────────────────────────────────────────────
function doPost(e) {
  var r;
  try { r = handlePost(e.parameter || {}); }
  catch (err) { Logger.log("doPost error: " + err); r = fail("server_error"); }
  return jsonOut(r);
}

function handlePost(p) {
  var action = p.action;
  if (action === "submitOrder") return submitOrder(p);

  // 以下全部需要管理員密碼
  var auth = checkAdmin(p.pw);
  if (auth !== "ok") return authFail(auth);

  if (action === "adminSet")            return adminSet(p);
  if (action === "adminUpdateOrder")    return adminUpdateOrder(p);
  if (action === "adminDeleteCustomer") return adminDeleteCustomer(p);
  if (action === "adminSendEmail")      return adminSendEmail(p);
  if (action === "syncCloseout")        return syncCloseout(p);
  return fail("unknown_action");
}

// ─── 下單（公開）───────────────────────────────────────────────────────────
var RECIPIENT_FIELDS = ["recipientName", "recipientAddress", "recipientPhone"];

function submitOrder(p) {
  if (!tokenOk(p.token)) return fail("unauthorized");
  var mode = p.mode === "update" ? "update" : "create";
  var email = normEmail(p.email);
  if (!isEmail(email)) return fail("invalid_email");
  // 參數名稱不能用 sid / c（Apps Script 保留字，會被 Google 直接回 400）；
  // 存進訂單資料時仍叫 sid，那是 JSON 內容，不受影響
  var sid = clean(p.submissionId, 64);

  var input;
  try { input = JSON.parse(p.order || "{}"); } catch (e) { return fail("invalid_order"); }
  var f = {
    ordererName:      clean(input.ordererName, 50),
    phone:            clean(input.phone, 30),
    relation:         clean(input.relation, 30),
    recipientName:    clean(input.recipientName, 50),
    recipientAddress: clean(input.recipientAddress, 200),
    recipientPhone:   clean(input.recipientPhone, 30)
  };
  for (var i = 0; i < RECIPIENT_FIELDS.length; i++) {
    if (!f[RECIPIENT_FIELDS[i]]) return fail("missing_fields");
  }
  if (mode === "create" && (!f.ordererName || !f.phone || !f.relation)) return fail("missing_fields");

  var cats = catsForPricing();
  if (!cats) return fail("catalog_unavailable");

  var r = withLock(function () {
    var s = getSettings();
    if (!s || !s.isOpen) return fail("closed");
    var key = ordersKeyOf(s);
    var orders = readJson(key) || {};
    var existing = orders[email] || null;

    // 同一次送出重送（前端沒收到回應而重試）：不重複寫入、不重複寄信
    if (sid && existing && existing.sid === sid) return { success: true, order: existing, duplicate: true };

    if (mode === "create" && existing) return fail("exists");
    if (mode === "update") {
      if (!existing) return fail("not_found");
      if (existing.status === "handled") return fail("handled");
    }

    var priced = priceCart(input.cart, cats, existing ? existing.cart : {});
    if (priced.error) return fail(priced.error, priced.product ? { product: priced.product } : null);
    if (priced.count === 0) return fail("empty_cart");

    var now = nowTw();
    var order, changed;
    if (mode === "create") {
      order = {
        ordererName: f.ordererName, email: email, phone: f.phone, relation: f.relation,
        recipientName: f.recipientName, recipientAddress: f.recipientAddress, recipientPhone: f.recipientPhone,
        cart: priced.cart, total: priced.total, status: "pending",
        createdAt: now, updatedAt: null, sid: sid
      };
      changed = true;
    } else {
      changed = JSON.stringify(existing.cart || {}) !== JSON.stringify(priced.cart) ||
        RECIPIENT_FIELDS.some(function (k) { return existing[k] !== f[k]; });
      order = Object.assign({}, existing, {
        recipientName: f.recipientName, recipientAddress: f.recipientAddress, recipientPhone: f.recipientPhone,
        cart: priced.cart, total: priced.total, updatedAt: now, sid: sid
      });
    }
    orders[email] = order;
    orders._v = Date.now();
    writeJson(key, orders);

    var custs = readJson("customers") || {};
    var c = custs[email] || {};
    if (mode === "create") {
      custs[email] = Object.assign({}, c, {
        name: f.ordererName, email: email, phone: f.phone, relation: f.relation,
        lastRecipientName: f.recipientName, lastRecipientAddress: f.recipientAddress, lastRecipientPhone: f.recipientPhone,
        lastOrder: s.year + "/" + s.month,
        orderCount: (c.orderCount || 0) + 1,
        firstOrderAt: c.firstOrderAt || now
      });
    } else if (custs[email]) {
      custs[email] = Object.assign({}, c, {
        lastRecipientName: f.recipientName, lastRecipientAddress: f.recipientAddress, lastRecipientPhone: f.recipientPhone
      });
    }
    custs._v = Date.now();
    writeJson("customers", custs);

    syncOrders(key, JSON.stringify(orders));
    syncCustomers(JSON.stringify(custs));
    return { success: true, order: order, settings: s, changed: changed };
  });

  if (!r.success) return r;
  if (r.duplicate) return { success: true, order: r.order, emailSent: null, duplicate: true };

  // 寄信放在鎖外面（Gmail 較慢，不要擋住其他人下單）
  var emailSent = false;
  if (r.changed) {
    try { sendConfirmEmail(r.order, cats, r.settings, mode); emailSent = true; }
    catch (err) { Logger.log("sendConfirmEmail error: " + err); }
  }
  return { success: true, order: r.order, emailSent: emailSent };
}

// 伺服器端計價：價格以產品目錄為準，前端送來的金額一律不採用
function priceCart(rawCart, cats, prevCart) {
  var fp = {};
  cats.forEach(function (c) { (c.products || []).forEach(function (p) { fp[p.id] = p; }); });
  prevCart = prevCart || {};
  var out = {}, total = 0, count = 0;
  var cart = (rawCart && typeof rawCart === "object") ? rawCart : {};
  var ids = Object.keys(cart);
  if (ids.length > 200) return { error: "invalid_order" };
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var q = Number(cart[id]);
    if (!(q >= 0 && q <= 99 && Math.floor(q) === q)) return { error: "invalid_qty" };
    if (q === 0) continue;
    var p = fp[id];
    if (!p) return { error: "invalid_product" };
    var prev = Number(prevCart[id] || 0);
    // 已下架或缺貨的品項：原本訂單裡已有的數量可以保留，不能再增加
    if (p.hidden && q > prev) return { error: "invalid_product", product: p.name };
    if (p.outOfStock && q > prev) return { error: "out_of_stock", product: p.name };
    out[id] = q;
    total += (Number(p.price) || 0) * q;
    count++;
  }
  return { cart: out, total: total, count: count };
}

function catsForPricing() {
  var r = getCatsFromSheet();
  if (r && r.success && r.value) { try { return JSON.parse(r.value); } catch (e) {} }
  try { return readJson("cats"); } catch (e) { return null; }
}

// ─── 確認信（伺服器組信，內容固定範本，收件人只能是訂單本人）─────────────
function emailWrap(title, content) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;padding:0;background:#f4f1ec;font-family:\'Helvetica Neue\',Arial,\'Noto Sans TC\',sans-serif;color:#1a1a1a">' +
    '<div style="max-width:560px;margin:0 auto;padding:24px 16px">' +
    '<div style="background:#2d6a4f;color:#fff;padding:18px 24px;border-radius:14px 14px 0 0;text-align:center">' +
    '<div style="font-size:18px;font-weight:700;letter-spacing:1px">大研生醫 × 團購專區</div>' +
    '<div style="font-size:12px;opacity:.7;margin-top:4px">' + esc(title) + '</div></div>' +
    '<div style="background:#fff;padding:24px;border-radius:0 0 14px 14px;border:1px solid #e5e0d8;border-top:none">' + content + '</div>' +
    '<div style="text-align:center;padding:16px 0;font-size:11px;color:#9ca3af">本信件由系統自動寄出，如有疑問請直接回覆此信</div>' +
    '</div></body></html>';
}

function sendConfirmEmail(order, cats, s, mode) {
  var fp = {};
  cats.forEach(function (c) { (c.products || []).forEach(function (p) { fp[p.id] = p; }); });
  var cell = 'padding:8px 12px;border-bottom:1px solid #f0ede8';
  var rows = Object.keys(order.cart).map(function (id) {
    var p = fp[id], q = order.cart[id];
    if (!p) return "";
    return '<tr><td style="' + cell + '">' + esc(p.name) + '</td>' +
      '<td style="' + cell + ';text-align:center">' + q + '</td>' +
      '<td style="' + cell + ';text-align:right;font-weight:600;color:#2d6a4f">NT$' + (p.price * q).toLocaleString() + '</td></tr>';
  }).join("");
  var th = 'padding:8px 12px;font-weight:600;color:#2d6a4f;border-bottom:2px solid #d8f3dc';
  var table = '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">' +
    '<thead><tr style="background:#f0faf4"><th style="' + th + ';text-align:left">品項</th>' +
    '<th style="' + th + ';text-align:center">數量</th><th style="' + th + ';text-align:right">金額</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
  var content =
    '<div style="font-size:15px;line-height:1.8;margin-bottom:16px"><strong>' + esc(order.ordererName) + '</strong> 您好，' +
      (mode === "update" ? '您的訂單已更新，以下是最新內容：' : '感謝您的訂購！') + '</div>' +
    table +
    '<div style="background:#f0faf4;border-radius:10px;padding:14px 18px;margin:16px 0;text-align:right">' +
      '<span style="font-size:13px;color:#6b7280">訂單總金額</span>' +
      '<span style="font-size:22px;font-weight:700;color:#2d6a4f;margin-left:10px">NT$' + Number(order.total).toLocaleString() + '</span></div>' +
    '<div style="background:#faf7f2;border-radius:10px;padding:14px 18px;margin:16px 0;font-size:13px;line-height:2;color:#4a5568">' +
      '<div style="font-weight:600;margin-bottom:4px;color:#1a1a1a">▸ 收件資訊</div>' +
      '收件人：' + esc(order.recipientName) + '<br>電　話：' + esc(order.recipientPhone) + '<br>地　址：' + esc(order.recipientAddress) + '</div>' +
    '<div style="font-size:13px;color:#6b7280;line-height:1.8;margin-top:16px">' +
      '我們將於月底結單後與您聯繫確認付款。<br>如需修改訂單，請至 <a href="' + SITE_URL + '" style="color:#2d6a4f;font-weight:600">訂購頁面</a> 以此 Email 查詢修改。<br><br>' +
      '感謝您對大研生醫的支持，祝福您與家人身體健康！</div>';
  var subject = "【大研生醫團購】" + s.year + "年" + s.month + "月 " +
    (mode === "update" ? "訂單已更新" : "訂購確認") + " — " + order.ordererName;
  GmailApp.sendEmail(order.email, subject, "（請以支援 HTML 的信箱閱讀此信）", {
    name: "大研生醫團購",
    htmlBody: emailWrap(mode === "update" ? "訂單更新" : "訂購確認", content)
  });
}

// ─── 管理員動作 ────────────────────────────────────────────────────────────
function adminSet(p) {
  var key = String(p.key || "");
  var sheetName = p.sheet || "app_data";
  if (!key || key.length > 100) return fail("missing_key");
  if (DATA_SHEETS.indexOf(sheetName) < 0) return fail("invalid_sheet");
  if (typeof p.value !== "string") return fail("missing_value");
  return withLock(function () {
    // Optimistic Locking：只對主表的訂單和顧客資料做版本衝突檢查
    if (sheetName === "app_data" && (key.indexOf("orders_") === 0 || key === "customers")) {
      var baseV = p.baseV;
      if (baseV && baseV !== "0") {
        var existing = kvGet(key, sheetName);
        if (existing) {
          try {
            var ex = JSON.parse(existing);
            if (ex._v && String(ex._v) !== String(baseV)) {
              Logger.log("Version conflict for " + key + ": stored _v=" + ex._v + ", baseV=" + baseV);
              return fail("version_conflict");
            }
          } catch (e2) { /* parse error, skip check */ }
        }
      }
    }
    kvSet(key, p.value, sheetName);
    if (sheetName === "app_data") {
      if (key.indexOf("orders_") === 0) syncOrders(key, p.value);
      if (key === "customers")          syncCustomers(p.value);
      if (key === "cats")               syncCatsToSheet(p.value);
      if (key === "settings")           syncCurrentMonthSheet();
    }
    return { success: true };
  });
}

// 改單一訂單狀態或刪除，在伺服器端加鎖完成 —— 不再由瀏覽器寫回整份訂單
function adminUpdateOrder(p) {
  var key = String(p.key || "");
  if (!/^orders_\d{4}_\d{2}$/.test(key)) return fail("invalid_key");
  var email = normEmail(p.email);
  var op = p.op;
  return withLock(function () {
    var orders = readJson(key) || {};
    if (!orders[email]) return fail("not_found", { value: JSON.stringify(orders) });
    if (op === "status") {
      if (["pending", "handled"].indexOf(p.status) < 0) return fail("invalid_status");
      orders[email] = Object.assign({}, orders[email], { status: p.status });
    } else if (op === "delete") {
      delete orders[email];
    } else {
      return fail("invalid_op");
    }
    orders._v = Date.now();
    var json = JSON.stringify(orders);
    writeJson(key, orders);
    syncOrders(key, json);

    // 刪除後同步更新歷史紀錄的筆數與金額（若該月已結單）
    if (op === "delete") {
      var hist = readJson("history");
      if (Array.isArray(hist)) {
        var hk = key.replace("orders_", "");
        for (var i = 0; i < hist.length; i++) {
          if (hist[i].key === hk) {
            var list = Object.keys(orders).filter(function (k) { return k.charAt(0) !== "_"; })
              .map(function (k) { return orders[k]; });
            hist[i].orderCount = list.length;
            hist[i].totalAmt = list.reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0);
            writeJson("history", hist);
            break;
          }
        }
      }
    }
    return { success: true, value: json };
  });
}

function adminDeleteCustomer(p) {
  var email = normEmail(p.email);
  return withLock(function () {
    var custs = readJson("customers") || {};
    if (!custs[email]) return fail("not_found", { value: JSON.stringify(custs) });
    delete custs[email];
    custs._v = Date.now();
    var json = JSON.stringify(custs);
    writeJson("customers", custs);
    syncCustomers(json);
    return { success: true, value: json };
  });
}

function adminSendEmail(p) {
  var to = normEmail(p.to);
  if (!isEmail(to)) return fail("invalid_email");
  if (!p.subject || !p.body) return fail("missing_fields");
  var options = { name: "大研生醫團購" };
  var isHtml = p.isHtml === "true";
  if (isHtml) options.htmlBody = p.body;
  GmailApp.sendEmail(to, String(p.subject).slice(0, 200), isHtml ? "（請以支援 HTML 的信箱閱讀此信）" : p.body, options);
  return { success: true };
}

// ─── 結單表匯出（管理員）──────────────────────────────────────────────────
function syncCloseout(p) {
  var sheetName = String(p.sheetName || "");
  // 只能寫入「結單表_YYYY_MM」，不能指定 app_data 等其他工作表
  if (!/^結單表_\d{4}_\d{2}$/.test(sheetName)) return fail("invalid_sheet");
  if (!p.value) return fail("missing_value");
  var rows = JSON.parse(p.value);
  return withLock(function () {
    var sheet = getOrCreate(sheetName);
    sheet.clearContents();
    if (sheet.getLastRow() > 0 && sheet.getLastColumn() > 0) {
      sheet.getDataRange().setBackground(null).setBorder(false, false, false, false, false, false);
    }
    var headers = ["商品名稱","數量(盒)","總金額(含運)","","收件人姓名","收件人電話","收件人住址","備註","訂購人姓名"];
    var numCols = headers.length;
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, numCols).setBackground("#2d6a4f").setFontColor("white").setFontWeight("bold");
    if (rows.length > 0) {
      sheet.getRange(2, 6, rows.length, 1).setNumberFormat("@");
      sheet.getRange(2, 1, rows.length, numCols).setValues(rows);
    }
    var groups = [];
    var currentStart = 0;
    for (var r = 0; r < rows.length; r++) {
      if (rows[r][8] && r > 0) { groups.push({ start: currentStart, end: r - 1 }); currentStart = r; }
    }
    if (rows.length > 0) groups.push({ start: currentStart, end: rows.length - 1 });
    var thickBorder = SpreadsheetApp.BorderStyle.SOLID_MEDIUM;
    for (var g = 0; g < groups.length; g++) {
      var sheetRow = groups[g].start + 2;
      var numRows  = groups[g].end - groups[g].start + 1;
      sheet.getRange(sheetRow, 1, numRows, numCols).setBackground(g % 2 === 0 ? "#dce6f1" : "#ffffff");
      sheet.getRange(sheetRow + numRows - 1, 1, 1, numCols)
        .setBorder(null, null, true, null, null, null, "#000000", thickBorder);
    }
    sheet.getRange(1, 1, 1, numCols).setBorder(null, null, true, null, null, null, "#000000", thickBorder);
    for (var c = 1; c <= numCols; c++) sheet.autoResizeColumn(c);
    return { success: true };
  });
}

// ─── 產品目錄 ──────────────────────────────────────────────────────────────
function getCatsFromSheet() {
  try {
    var sheet = ss().getSheetByName("產品目錄");
    if (!sheet || sheet.getLastRow() <= 1) {
      return { success: false, error: "產品目錄工作表不存在或無資料" };
    }
    var rows = sheet.getDataRange().getValues();
    var catsMap = {};
    var catsOrder = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var catKey   = String(r[0]).trim();
      var catLabel = String(r[1]).trim();
      var pid      = String(r[2]).trim();
      var pname    = String(r[3]).trim();
      var price    = parseInt(r[4]) || 0;
      var url      = String(r[5]).trim();
      var outOfStock = (String(r[6]).trim().toUpperCase() === "TRUE" || r[6] === true);
      var hidden     = (String(r[7]).trim().toUpperCase() === "TRUE" || r[7] === true);
      if (!catKey || !pname) continue;
      if (!catsMap[catKey]) {
        catsMap[catKey] = { key: catKey, label: catLabel, products: [] };
        catsOrder.push(catKey);
      }
      catsMap[catKey].products.push({ id: pid, name: pname, price: price, url: url, outOfStock: outOfStock, hidden: hidden });
    }
    var cats = catsOrder.map(function (k) { return catsMap[k]; });
    return { success: true, value: JSON.stringify(cats) };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function syncCatsToSheet(jsonValue) {
  try {
    var cats  = JSON.parse(jsonValue);
    var sheet = getOrCreate("產品目錄");
    sheet.clearContents();
    var headers = ["分類key","分類名稱","產品ID","產品名稱","價格","網址","缺貨(TRUE/FALSE)","下架(TRUE/FALSE)"];
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 8).setBackground("#2d6a4f").setFontColor("white").setFontWeight("bold");
    var rows = [];
    cats.forEach(function (cat) {
      cat.products.forEach(function (p) {
        rows.push([cat.key, cat.label, p.id, p.name, p.price, p.url || "",
          p.outOfStock ? "TRUE" : "FALSE", p.hidden ? "TRUE" : "FALSE"]);
      });
    });
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  } catch (err) {
    Logger.log("syncCatsToSheet error: " + err);
  }
}

function initProductSheet() {
  var raw = kvGet("cats", "app_data");
  if (raw) { syncCatsToSheet(raw); Logger.log("產品目錄已初始化！"); return; }
  Logger.log("找不到 cats 資料，請先讓網頁載入一次產品資料。");
}

// ─── 訂單鏡像表（人類可讀）────────────────────────────────────────────────
// 「當月」以後台設定為準（不看伺服器日曆）；歷史表每次完整重寫；略過 _v。
var ORDER_HEADERS = ["月份","訂購人","Email","手機","關係",
  "收件人","收件電話","收件地址","商品明細","總金額","狀態","建立時間","更新時間"];

function currentOrdersKey() {
  try {
    var s = getSettings();
    return s ? ordersKeyOf(s) : null;
  } catch (e) {
    return null;
  }
}

function orderRows(key, jsonValue) {
  var parts = key.split("_");
  var label = parts[1] + "/" + parts[2];
  var orders = jsonValue ? JSON.parse(jsonValue) : {};
  return Object.keys(orders)
    .filter(function (k) { return k.charAt(0) !== "_"; })
    .map(function (k) {
      var o = orders[k] || {};
      var cartText = Object.entries(o.cart || {})
        .filter(function (x) { return x[1] > 0; })
        .map(function (x) { return x[0] + "×" + x[1]; })
        .join("、");
      return [label, o.ordererName, o.email, o.phone, o.relation,
        o.recipientName, o.recipientPhone, o.recipientAddress,
        cartText, o.total, o.status === "handled" ? "已處理" : "待處理",
        o.createdAt, o.updatedAt || ""];
    });
}

// 安全寫入：先寫暫存表 → 驗證列數 → 替換正式表
function writeOrderSheet(sheetName, rows) {
  var tempName = "_temp_" + sheetName;
  var oldTemp = ss().getSheetByName(tempName);
  if (oldTemp) ss().deleteSheet(oldTemp);
  var tempSheet = ss().insertSheet(tempName);
  tempSheet.appendRow(ORDER_HEADERS);
  tempSheet.setFrozenRows(1);
  if (rows.length > 0) {
    tempSheet.getRange(2, 4, rows.length, 1).setNumberFormat("@");
    tempSheet.getRange(2, 7, rows.length, 1).setNumberFormat("@");
    tempSheet.getRange(2, 1, rows.length, ORDER_HEADERS.length).setValues(rows);
  }
  if (tempSheet.getLastRow() !== rows.length + 1) {
    Logger.log("writeOrderSheet verify failed for " + sheetName);
    ss().deleteSheet(tempSheet);
    return;
  }
  var target = ss().getSheetByName(sheetName);
  if (target) ss().deleteSheet(target);
  tempSheet.setName(sheetName);
}

function syncOrders(key, jsonValue) {
  try {
    var parts = key.split("_");
    var rows = orderRows(key, jsonValue);
    writeOrderSheet("歷史訂單_" + parts[1] + parts[2], rows);
    if (key === currentOrdersKey()) writeOrderSheet("當月訂單", rows);
  } catch (err) {
    Logger.log("syncOrders error (" + key + "): " + err);
  }
}

function syncCurrentMonthSheet() {
  try {
    var key = currentOrdersKey();
    if (!key) return;
    writeOrderSheet("當月訂單", orderRows(key, kvGet(key, "app_data")));
  } catch (err) {
    Logger.log("syncCurrentMonthSheet error: " + err);
  }
}

function syncCustomers(jsonValue) {
  try {
    var customers = JSON.parse(jsonValue);
    var sheet = getOrCreate("訂購人資料庫");
    sheet.clearContents();
    var headers = ["Email","姓名","手機","關係","最近收件人","最近收件電話","最近收件地址",
      "最近訂購月份","累計訂購次數","首次訂購時間"];
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    var rows = Object.keys(customers)
      .filter(function (k) { return k.charAt(0) !== "_"; })
      .map(function (k) {
        var c = customers[k];
        return [c.email, c.name, c.phone, c.relation, c.lastRecipientName, c.lastRecipientPhone,
          c.lastRecipientAddress, c.lastOrder, c.orderCount, c.firstOrderAt || ""];
      });
    if (rows.length > 0) {
      sheet.getRange(2, 3, rows.length, 1).setNumberFormat("@");
      sheet.getRange(2, 6, rows.length, 1).setNumberFormat("@");
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
  } catch (err) {
    Logger.log("syncCustomers error: " + err);
  }
}

// ─── 手動執行用 ────────────────────────────────────────────────────────────
// 一次性修復：從 app_data 重建所有「歷史訂單_」「當月訂單」「訂購人資料庫」
function rebuildAllOrderSheets() {
  var data = getOrCreate("app_data").getDataRange().getValues();
  var n = 0;
  for (var i = 0; i < data.length; i++) {
    var k = String(data[i][0]);
    if (k.indexOf("orders_") === 0) { syncOrders(k, data[i][1]); n++; }
    if (k === "customers") syncCustomers(data[i][1]);
  }
  syncCurrentMonthSheet();
  Logger.log("已重建 " + n + " 個月份的訂單表、「當月訂單」與「訂購人資料庫」");
}

// 部署前檢查：指令碼屬性是否設定好
function checkSetup() {
  var t = prop("WRITE_TOKEN"), a = prop("ADMIN_PW");
  Logger.log("WRITE_TOKEN：" + (t ? "已設定（" + t.length + " 字元）" : "❌ 未設定"));
  Logger.log("ADMIN_PW：" + (a ? "已設定（" + a.length + " 字元）" + (a.length < 12 ? " ⚠️ 建議 12 字元以上" : "") : "❌ 未設定"));
  try { var s = getSettings(); Logger.log("目前月份：" + (s ? s.year + "/" + s.month + (s.isOpen ? "（開團中）" : "（已結單）") : "（尚無設定）")); }
  catch (e) { Logger.log("讀取設定失敗：" + e); }
}

// 解除密碼鎖定（自己打錯太多次時，在編輯器執行這個）
function resetAdminLock() {
  CacheService.getScriptCache().remove(PW_FAIL_KEY);
  Logger.log("已解除管理員密碼鎖定");
}
