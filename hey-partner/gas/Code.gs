/**
 * Hey 夥伴！請聽我說～～ — 內部回饋系統後端（Google Apps Script）
 * 部署設定：執行身分「我」、存取權「任何人」
 *
 * ── 機密設定（不寫在程式碼裡）──────────────────────────────────────────────
 * 到 Apps Script 左側「專案設定 ⚙️ → 指令碼屬性」新增：
 *   WRITE_TOKEN   前端用的 token，必須與 GitHub Secret REACT_APP_WRITE_TOKEN 相同
 *   TEAM_CODE     同仁通關密語（口頭或內部群組告知同事；擋掉拿到網址的外人）
 *   ADMIN_PW      後台管理員密碼（建議 12 字元以上）
 * 任何一項沒設定時一律拒絕，不會退回不安全的預設值。
 *
 * ── 權限設計 ──────────────────────────────────────────────────────────────
 * 公開（任何人）：
 *   GET  getPublicConfig   讀「是否開放」與前台公告（不含通知信箱）
 * 同仁（WRITE_TOKEN + TEAM_CODE）：
 *   POST submitFeedback    新增一則回饋；伺服器產生查詢碼，只回傳給送出的人一次
 * 持有查詢碼的人（WRITE_TOKEN + 查詢碼）：
 *   POST lookupFeedback    看自己那則回饋的處理狀態與回覆（不含標籤、內部備註）
 *   POST checkSubmission   送出後收不到回應時，用 submissionId 取回查詢碼（10 分鐘內有效）
 * 管理員（ADMIN_PW，錯 10 次鎖 15 分鐘）：
 *   POST verifyAdmin / adminList / adminUpdate / adminDelete / adminGetConfig / adminSetConfig
 *
 * ── 匿名性 ────────────────────────────────────────────────────────────────
 * Apps Script 以「我」的身分執行、存取權「任何人」，伺服器拿不到送出者的
 * Google 帳號或 IP；除非同仁自己留下稱呼與聯絡方式，否則無法得知是誰。
 * 查詢碼只存雜湊值（SHA-256），試算表裡看不到原碼，有權限看試算表的人也無法冒用。
 *
 * 所有需要密碼／查詢碼的動作都走 POST，避免機密出現在網址與瀏覽紀錄裡。
 */
const SPREADSHEET_ID = "請填入你的試算表 ID";
const SITE_URL = "https://jamy84464.github.io/hey-partner/";

const DATA_SHEET = "feedback_data";   // 機器用：每列一則回饋（id / 查詢碼雜湊 / 建立時間 / JSON）
const VIEW_SHEET = "回饋總表";         // 人看的鏡像表，每次寫入後重建
const CONFIG_SHEET = "app_config";    // Key-Value 設定

const PW_FAIL_KEY = "admin_pw_fail";
const PW_MAX_FAIL = 10;
const PW_LOCK_SEC = 900;
const TEAM_FAIL_KEY = "team_code_fail";
const TEAM_MAX_FAIL = 50;             // 通關密語是全體共用，門檻放寬，避免一個人打錯鎖住全公司
const LOOKUP_FAIL_KEY = "lookup_fail";
const LOOKUP_MAX_FAIL = 100;          // 查詢碼猜測防護
const SUBMIT_COUNT_KEY = "submit_count";
const SUBMIT_MAX_PER_WINDOW = 40;     // 10 分鐘內全站最多幾則（防灌爆）
const WINDOW_SEC = 600;

// ── 選項定義（與前端 constants.ts 保持一致）────────────────────────────────
const CATEGORIES = {
  env:   { label: "我希望工作環境更舒適！", emoji: "🪴", tags: ["空間", "設備", "福利", "工具", "辦公環境"] },
  flow:  { label: "我希望工作流程更順暢！", emoji: "🔄", tags: ["SOP", "權責", "跨部門", "系統", "資訊落差", "效率"] },
  team:  { label: "我希望團隊夥伴更給力！", emoji: "🤝", tags: ["同事合作", "溝通", "交付", "態度", "主管管理"] },
  up:    { label: "我希望我們更上一層樓！", emoji: "🚀", tags: ["產品", "營運", "服務", "品牌", "創新提案", "公司發展"] },
  vent:  { label: "我受不了了～～～！",     emoji: "🌋", tags: ["高情緒", "反覆發生", "嚴重影響工作", "需要介入"] }
};
const RESPONDS = {
  ack:       "讓我知道你有收到就好了",
  attention: "請認真關注這件事！",
  reply:     "如果可以，我期待專人訊息回覆",
  meet:      "我需要面對面聊聊！"
};
const STATUSES = {
  received: "訊息已經反映成功",
  seeded:   "種子已種下，我們等待發芽",
  thinking: "有難度！燒腦中，請給我們多一些時間努力",
  action:   "即刻啟動處理"
};

// ─── 工具 ──────────────────────────────────────────────────────────────────
var _ss = null;
function ss() { return _ss || (_ss = SpreadsheetApp.openById(SPREADSHEET_ID)); }
function getOrCreate(name) {
  var s = ss().getSheetByName(name);
  if (!s) s = ss().insertSheet(name);
  return s;
}
function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function prop(name) { return PropertiesService.getScriptProperties().getProperty(name) || ""; }
function fail(code, extra) {
  var o = { success: false, error: code };
  if (extra) for (var k in extra) o[k] = extra[k];
  return o;
}
// 去頭尾空白、限制長度、移除控制字元（保留換行與 tab，回饋內容需要分段）
function clean(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, max);
}
function cleanLine(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}
function cleanList(arr, maxItems, maxLen) {
  if (!Array.isArray(arr)) return [];
  var seen = {}, out = [];
  for (var i = 0; i < arr.length && out.length < maxItems; i++) {
    var t = cleanLine(arr[i], maxLen).replace(/^#/, "");
    if (t && !seen[t]) { seen[t] = true; out.push(t); }
  }
  return out;
}
function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function isEmail(v) { return /^[^\s@]{1,}@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 120; }
function nowTw() {
  var d = new Date();
  var h = parseInt(Utilities.formatDate(d, "Asia/Taipei", "H"), 10);
  return Utilities.formatDate(d, "Asia/Taipei", "yyyy/M/d") + " " +
    (h < 12 ? "上午" : "下午") + Utilities.formatDate(d, "Asia/Taipei", "h:mm:ss");
}
function withLock(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return fail("busy"); }
  try { return fn(); } finally { lock.releaseLock(); }
}
function sha256(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}
// 計數器（CacheService）：回傳加一後的值
function bump(key, ttl) {
  var cache = CacheService.getScriptCache();
  var n = parseInt(cache.get(key) || "0", 10) + 1;
  cache.put(key, String(n), ttl);
  return n;
}
function counter(key) { return parseInt(CacheService.getScriptCache().get(key) || "0", 10); }

// 查詢碼：12 碼、去掉容易混淆的 0/O/1/I/L，用 UUID（伺服器端安全亂數）當來源
var CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function newCode() {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid());
  var out = "";
  for (var i = 0; i < 12; i++) out += CODE_ALPHABET.charAt((bytes[i] & 0xff) % CODE_ALPHABET.length);
  return out.slice(0, 4) + "-" + out.slice(4, 8) + "-" + out.slice(8, 12);
}
function normCode(v) {
  var s = String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.length !== 12) return "";
  return s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12);
}
function newId() {
  return "FB" + Utilities.formatDate(new Date(), "Asia/Taipei", "yyMMdd") + "-" +
    Utilities.getUuid().replace(/-/g, "").slice(0, 5).toUpperCase();
}

// ─── 權限 ──────────────────────────────────────────────────────────────────
function tokenOk(token) {
  var real = prop("WRITE_TOKEN");
  return !!real && token === real;
}
function checkAdmin(pw) {
  if (counter(PW_FAIL_KEY) >= PW_MAX_FAIL) return "locked";
  var real = prop("ADMIN_PW");
  if (real && pw && pw === real) return "ok";
  bump(PW_FAIL_KEY, PW_LOCK_SEC);
  return "bad";
}
function checkTeam(code) {
  if (counter(TEAM_FAIL_KEY) >= TEAM_MAX_FAIL) return "locked";
  var real = prop("TEAM_CODE");
  if (real && code && String(code).trim() === real) return "ok";
  bump(TEAM_FAIL_KEY, WINDOW_SEC);
  return "bad";
}

// ─── 設定 ──────────────────────────────────────────────────────────────────
var DEFAULT_CONFIG = { isOpen: true, bulletin: "", notifyEmail: "" };
function getConfig() {
  var sheet = getOrCreate(CONFIG_SHEET);
  var data = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === "config" && data[i][1]) {
      try { return Object.assign({}, DEFAULT_CONFIG, JSON.parse(data[i][1])); }
      catch (e) { throw new Error("設定資料格式錯誤"); }
    }
  }
  return Object.assign({}, DEFAULT_CONFIG);
}
function setConfig(cfg) {
  var sheet = getOrCreate(CONFIG_SHEET);
  var data = sheet.getDataRange().getValues();
  var json = JSON.stringify(cfg);
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === "config") {
      sheet.getRange(i + 1, 2, 1, 2).setValues([[json, nowTw()]]);
      return;
    }
  }
  sheet.appendRow(["config", json, nowTw()]);
}

// ─── 回饋資料存取（每列一則：A id / B 查詢碼雜湊 / C 建立時間 / D JSON）──────
function dataSheet() {
  var s = getOrCreate(DATA_SHEET);
  if (s.getLastRow() === 0) { s.appendRow(["id", "codeHash", "createdAt", "json"]); s.setFrozenRows(1); }
  return s;
}
function allRows() {
  var s = dataSheet();
  var n = s.getLastRow() - 1;
  if (n <= 0) return [];
  return s.getRange(2, 1, n, 4).getValues();
}
function parseRow(r) {
  try { return JSON.parse(r[3]); } catch (e) { return null; }
}
// 找到該則回饋所在的試算表列號（從 1 起算）與內容，找不到回傳 null
function findRowById(id) {
  var rows = allRows();
  for (var i = 0; i < rows.length; i++) if (rows[i][0] === id) return { row: i + 2, fb: parseRow(rows[i]) };
  return null;
}

// 給管理員看的版本：拿掉內部欄位
function adminView(fb) {
  var o = Object.assign({}, fb);
  delete o.sid;
  return o;
}
// 給送出者看的版本：只有自己寫的內容、狀態、對外回覆；不含標籤、對象、內部備註
function publicView(fb) {
  return {
    id: fb.id, category: fb.category, content: fb.content, respond: fb.respond,
    meetWith: fb.meetWith || "", status: fb.status, reply: fb.reply || "",
    createdAt: fb.createdAt, updatedAt: fb.updatedAt || null,
    history: (fb.history || []).map(function (h) { return { at: h.at, status: h.status }; })
  };
}

// ─── GET ───────────────────────────────────────────────────────────────────
function doGet(e) {
  var r;
  try {
    var p = (e && e.parameter) || {};
    if (p.action === "getPublicConfig") {
      var c = getConfig();
      r = { success: true, value: { isOpen: !!c.isOpen, bulletin: c.bulletin || "" } };
    } else {
      r = fail("unknown_action");
    }
  } catch (err) { Logger.log("doGet error: " + err); r = fail("server_error"); }
  return jsonOut(r);
}

// ─── POST ──────────────────────────────────────────────────────────────────
function doPost(e) {
  var r;
  try { r = handlePost((e && e.parameter) || {}); }
  catch (err) { Logger.log("doPost error: " + err); r = fail("server_error"); }
  return jsonOut(r);
}

function handlePost(p) {
  var action = p.action;
  if (action === "submitFeedback")  return submitFeedback(p);
  if (action === "lookupFeedback")  return lookupFeedback(p);
  if (action === "checkSubmission") return checkSubmission(p);

  if (action === "verifyAdmin") {
    var a = checkAdmin(p.pw);
    if (a === "locked") return fail("locked");
    return { success: true, authed: a === "ok" };
  }

  // 以下全部需要管理員密碼
  var auth = checkAdmin(p.pw);
  if (auth !== "ok") return fail(auth === "locked" ? "locked" : "unauthorized");

  if (action === "adminList")      return adminList();
  if (action === "adminUpdate")    return adminUpdate(p);
  if (action === "adminDelete")    return adminDelete(p);
  if (action === "adminGetConfig") return { success: true, value: getConfig() };
  if (action === "adminSetConfig") return adminSetConfig(p);
  return fail("unknown_action");
}

// ─── 送出回饋（同仁）──────────────────────────────────────────────────────
function submitFeedback(p) {
  if (!tokenOk(p.token)) return fail("unauthorized");
  var team = checkTeam(p.teamCode);
  if (team === "locked") return fail("team_locked");
  if (team !== "ok") return fail("bad_team_code");

  // 同一次送出重送（前端沒收到回應而重試）：直接回傳同一組查詢碼，不重複寫入
  var sid = cleanLine(p.submissionId, 64);
  var cache = CacheService.getScriptCache();
  if (sid) {
    var prev = cache.get("sid_" + sid);
    if (prev) return { success: true, code: prev, duplicate: true };
  }

  var input;
  try { input = JSON.parse(p.data || "{}"); } catch (e) { return fail("invalid_data"); }
  var f = {
    category: String(input.category || ""),
    content:  clean(input.content, 2000),
    respond:  String(input.respond || ""),
    meetWith: cleanLine(input.meetWith, 50),
    name:     cleanLine(input.name, 30),
    contact:  cleanLine(input.contact, 100)
  };
  if (!CATEGORIES[f.category]) return fail("invalid_category");
  if (!RESPONDS[f.respond]) return fail("invalid_respond");
  if (f.content.length < 5) return fail("too_short");
  // 希望專人回覆或面談：一定要留下怎麼聯絡
  if ((f.respond === "reply" || f.respond === "meet") && (!f.name || !f.contact)) return fail("need_contact");
  if (f.respond !== "meet") f.meetWith = "";

  if (counter(SUBMIT_COUNT_KEY) >= SUBMIT_MAX_PER_WINDOW) return fail("too_many");

  var cfg = getConfig();
  if (!cfg.isOpen) return fail("closed");

  var code = newCode();
  var r = withLock(function () {
    var now = nowTw();
    var fb = {
      id: newId(), category: f.category, content: f.content, respond: f.respond,
      meetWith: f.meetWith, name: f.name, contact: f.contact,
      status: "received", tags: [], subjects: [], note: "", reply: "", archived: false,
      createdAt: now, updatedAt: null, ts: Date.now(), rev: 1, sid: sid,
      history: [{ at: now, status: "received" }]
    };
    dataSheet().appendRow([fb.id, sha256(code), now, JSON.stringify(fb)]);
    rebuildView();
    return { success: true, fb: fb };
  });
  if (!r.success) return r;

  bump(SUBMIT_COUNT_KEY, WINDOW_SEC);
  if (sid) cache.put("sid_" + sid, code, WINDOW_SEC);

  // 寄信放在鎖外面（Gmail 較慢，不要擋住其他人送出）
  try { notifyAdmin(r.fb, cfg); } catch (err) { Logger.log("notifyAdmin error: " + err); }
  return { success: true, code: code };
}

function checkSubmission(p) {
  if (!tokenOk(p.token)) return fail("unauthorized");
  var sid = cleanLine(p.submissionId, 64);
  if (!sid) return fail("not_found");
  var code = CacheService.getScriptCache().get("sid_" + sid);
  return code ? { success: true, code: code } : fail("not_found");
}

function lookupFeedback(p) {
  if (!tokenOk(p.token)) return fail("unauthorized");
  if (counter(LOOKUP_FAIL_KEY) >= LOOKUP_MAX_FAIL) return fail("lookup_locked");
  var code = normCode(p.code);
  if (!code) return fail("invalid_code");
  var h = sha256(code);
  var rows = allRows();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][1] === h) {
      var fb = parseRow(rows[i]);
      if (fb) return { success: true, value: publicView(fb) };
    }
  }
  bump(LOOKUP_FAIL_KEY, WINDOW_SEC);
  return fail("not_found");
}

// ─── 管理員 ────────────────────────────────────────────────────────────────
function adminList() {
  var list = allRows().map(parseRow).filter(Boolean).map(adminView);
  list.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  return { success: true, value: list };
}

// 修改單一則回饋：狀態、標籤、涉及對象、對外回覆、內部備註、結案。
// 以 rev 做樂觀鎖定，兩位管理員同時編輯時後送出的會被擋下，不會互相覆蓋。
function adminUpdate(p) {
  var id = cleanLine(p.id, 40);
  var patch;
  try { patch = JSON.parse(p.patch || "{}"); } catch (e) { return fail("invalid_data"); }
  var baseRev = parseInt(p.baseRev || "0", 10);

  var r = withLock(function () {
    var found = findRowById(id);
    if (!found || !found.fb) return fail("not_found");
    var fb = found.fb;
    if (baseRev && fb.rev && fb.rev !== baseRev) return fail("version_conflict", { value: adminView(fb) });

    var now = nowTw();
    var prevStatus = fb.status, prevReply = fb.reply || "";
    if (patch.status !== undefined) {
      if (!STATUSES[patch.status]) return fail("invalid_status");
      fb.status = patch.status;
    }
    if (patch.tags !== undefined)     fb.tags = cleanList(patch.tags, 20, 20);
    if (patch.subjects !== undefined) fb.subjects = cleanList(patch.subjects, 10, 30);
    if (patch.note !== undefined)     fb.note = clean(patch.note, 2000);
    if (patch.reply !== undefined)    fb.reply = clean(patch.reply, 1000);
    if (patch.archived !== undefined) fb.archived = !!patch.archived;
    if (fb.status !== prevStatus) {
      fb.history = (fb.history || []).concat([{ at: now, status: fb.status }]).slice(-20);
    }
    fb.updatedAt = now;
    fb.rev = (fb.rev || 1) + 1;
    dataSheet().getRange(found.row, 4).setValue(JSON.stringify(fb));
    rebuildView();
    return {
      success: true, fb: fb,
      changedForUser: fb.status !== prevStatus || (fb.reply || "") !== prevReply
    };
  });
  if (!r.success) return r;

  // 通知回饋者（只能寄到該則回饋自己留的 Email，內容是固定範本 + 對外回覆）
  var emailSent = null;
  if (p.notify === "true" && r.changedForUser) {
    if (isEmail(String(r.fb.contact || "").toLowerCase())) {
      try { sendUpdateEmail(r.fb); emailSent = true; }
      catch (err) { Logger.log("sendUpdateEmail error: " + err); emailSent = false; }
    } else {
      emailSent = false;
    }
  }
  return { success: true, value: adminView(r.fb), emailSent: emailSent };
}

function adminDelete(p) {
  var id = cleanLine(p.id, 40);
  return withLock(function () {
    var found = findRowById(id);
    if (!found) return fail("not_found");
    dataSheet().deleteRow(found.row);
    rebuildView();
    return { success: true };
  });
}

function adminSetConfig(p) {
  var input;
  try { input = JSON.parse(p.value || "{}"); } catch (e) { return fail("invalid_data"); }
  var emails = String(input.notifyEmail || "").split(/[,;\s]+/)
    .map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  for (var i = 0; i < emails.length; i++) if (!isEmail(emails[i])) return fail("invalid_email");
  var cfg = {
    isOpen: !!input.isOpen,
    bulletin: clean(input.bulletin, 500),
    notifyEmail: emails.slice(0, 10).join(",")
  };
  return withLock(function () { setConfig(cfg); return { success: true, value: cfg }; });
}

// ─── Email ─────────────────────────────────────────────────────────────────
function emailWrap(title, content) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;padding:0;background:#f6f3ee;font-family:\'Helvetica Neue\',Arial,\'Noto Sans TC\',sans-serif;color:#1f2933">' +
    '<div style="max-width:560px;margin:0 auto;padding:24px 16px">' +
    '<div style="background:#2f5d62;color:#fff;padding:18px 24px;border-radius:14px 14px 0 0;text-align:center">' +
    '<div style="font-size:18px;font-weight:700;letter-spacing:1px">Hey 夥伴！請聽我說～～</div>' +
    '<div style="font-size:12px;opacity:.75;margin-top:4px">' + esc(title) + '</div></div>' +
    '<div style="background:#fff;padding:24px;border-radius:0 0 14px 14px;border:1px solid #e7e1d7;border-top:none">' + content + '</div>' +
    '<div style="text-align:center;padding:16px 0;font-size:11px;color:#9aa1a9">本信件由系統自動寄出</div>' +
    '</div></body></html>';
}

// 新回饋通知管理員；面談需求或「受不了」類別在主旨標記
function notifyAdmin(fb, cfg) {
  var to = String(cfg.notifyEmail || "").trim();
  if (!to) return;
  var cat = CATEGORIES[fb.category];
  var urgent = fb.category === "vent" || fb.respond === "meet";
  var row = function (k, v) {
    return '<tr><td style="padding:6px 0;color:#6b7280;width:90px;vertical-align:top">' + k + '</td>' +
      '<td style="padding:6px 0">' + v + '</td></tr>';
  };
  var who = fb.name ? esc(fb.name) + (fb.contact ? "（" + esc(fb.contact) + "）" : "") : "匿名";
  var content =
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:12px">' +
    row("編號", esc(fb.id)) +
    row("類別", cat.emoji + " " + esc(cat.label)) +
    row("希望回應", esc(RESPONDS[fb.respond]) + (fb.meetWith ? "（對象：" + esc(fb.meetWith) + "）" : "")) +
    row("送出者", who) +
    row("時間", esc(fb.createdAt)) +
    '</table>' +
    '<div style="background:#f6f3ee;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.8;white-space:pre-wrap">' +
    esc(fb.content) + '</div>' +
    '<div style="margin-top:16px;font-size:13px"><a href="' + SITE_URL + '" style="color:#2f5d62;font-weight:600">前往後台整理 →</a></div>';
  var subject = (urgent ? "【需要關注】" : "") + "【Hey 夥伴】新回饋：" + cat.label;
  GmailApp.sendEmail(to, subject, "（請以支援 HTML 的信箱閱讀此信）", {
    name: "Hey 夥伴回饋系統",
    htmlBody: emailWrap("有一則新的回饋", content)
  });
}

function sendUpdateEmail(fb) {
  var content =
    '<div style="font-size:15px;line-height:1.8;margin-bottom:12px">' +
      (fb.name ? '<strong>' + esc(fb.name) + '</strong>，' : '') + '你好！你在 ' + esc(fb.createdAt) + ' 留下的回饋有新進度：</div>' +
    '<div style="background:#eef5f3;border-radius:10px;padding:14px 18px;margin:12px 0;font-size:16px;font-weight:700;color:#2f5d62">' +
      esc(STATUSES[fb.status]) + '</div>' +
    (fb.reply ? '<div style="font-size:13px;color:#6b7280;margin-top:16px">我們的回覆</div>' +
      '<div style="background:#f6f3ee;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.8;white-space:pre-wrap;margin-top:6px">' +
      esc(fb.reply) + '</div>' : '') +
    '<div style="font-size:13px;color:#6b7280;line-height:1.8;margin-top:16px">' +
      '也可以隨時到 <a href="' + SITE_URL + '" style="color:#2f5d62;font-weight:600">Hey 夥伴</a> 用你的查詢碼查看進度。<br>謝謝你願意說出來 🙏</div>';
  GmailApp.sendEmail(fb.contact, "【Hey 夥伴】你的回饋有新進度", "（請以支援 HTML 的信箱閱讀此信）", {
    name: "Hey 夥伴回饋系統",
    htmlBody: emailWrap("回饋進度更新", content)
  });
}

// ─── 鏡像表（人看的）──────────────────────────────────────────────────────
var VIEW_HEADERS = ["編號", "建立時間", "類別", "內容", "希望回應", "面談對象", "稱呼", "聯絡方式",
  "處理狀態", "標籤", "涉及對象", "給同仁的回覆", "內部備註", "已結案", "最後更新"];

function rebuildView() {
  try {
    var list = allRows().map(parseRow).filter(Boolean);
    list.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    var rows = list.map(function (fb) {
      var cat = CATEGORIES[fb.category] || { label: fb.category };
      return [fb.id, fb.createdAt, cat.label, fb.content, RESPONDS[fb.respond] || fb.respond, fb.meetWith || "",
        fb.name || "（匿名）", fb.contact || "", STATUSES[fb.status] || fb.status,
        (fb.tags || []).map(function (t) { return "#" + t; }).join(" "),
        (fb.subjects || []).join("、"), fb.reply || "", fb.note || "", fb.archived ? "是" : "", fb.updatedAt || ""];
    });
    var sheet = getOrCreate(VIEW_SHEET);
    sheet.clearContents();
    sheet.getRange(1, 1, 1, VIEW_HEADERS.length).setValues([VIEW_HEADERS])
      .setBackground("#2f5d62").setFontColor("white").setFontWeight("bold");
    sheet.setFrozenRows(1);
    if (rows.length > 0) {
      sheet.getRange(2, 8, rows.length, 1).setNumberFormat("@");
      sheet.getRange(2, 1, rows.length, VIEW_HEADERS.length).setValues(rows);
    }
  } catch (err) {
    Logger.log("rebuildView error: " + err);
  }
}

// ─── 手動執行用 ────────────────────────────────────────────────────────────
// 部署前檢查：指令碼屬性與試算表是否設定好
function checkSetup() {
  ["WRITE_TOKEN", "TEAM_CODE", "ADMIN_PW"].forEach(function (k) {
    var v = prop(k);
    Logger.log(k + "：" + (v ? "已設定（" + v.length + " 字元）" : "❌ 未設定") +
      (k === "ADMIN_PW" && v && v.length < 12 ? " ⚠️ 建議 12 字元以上" : ""));
  });
  try {
    var c = getConfig();
    Logger.log("試算表：" + ss().getName() + "　開放中：" + (c.isOpen ? "是" : "否") +
      "　通知信箱：" + (c.notifyEmail || "（未設定，不會寄新回饋通知）"));
    Logger.log("目前回饋數：" + allRows().length);
  } catch (e) { Logger.log("讀取失敗：" + e); }
}

// 解除密碼／通關密語／查詢鎖定（自己打錯太多次時，在編輯器執行這個）
function resetLocks() {
  CacheService.getScriptCache().removeAll([PW_FAIL_KEY, TEAM_FAIL_KEY, LOOKUP_FAIL_KEY, SUBMIT_COUNT_KEY]);
  Logger.log("已解除所有鎖定");
}

// 試算表手動改過或壞掉時，從 feedback_data 重建「回饋總表」
function rebuildViewSheet() {
  rebuildView();
  Logger.log("已重建「" + VIEW_SHEET + "」");
}
