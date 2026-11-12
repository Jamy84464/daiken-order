import { GAS_URL, VERSION } from "../constants";
import { nowStr, orderKey, dataEntries } from "./helpers";
import type { BackupMeta, HistoryEntry } from "../types";

/**
 * 儲存層（管理員專用）
 *
 * GAS v2 起，讀寫任意資料都需要管理員密碼；客人端改走 utils/api.ts 的公開動作
 * （查自己的訂單、下單），不再經過這裡。登入後台時用 setAdminCredential 設定密碼，
 * 只存在記憶體裡，重新整理頁面就會清除。
 */
let _adminPw = "";
export function setAdminCredential(pw: string): void { _adminPw = pw; }
export function getAdminCredential(): string { return _adminPw; }

// ── POST 共用 ────────────────────────────────────────────────────────────────
// 原本用 no-cors 送 POST，回應完全讀不到，寫入失敗也無從得知。
// GAS 的回應其實允許跨域讀取（表單格式的 POST 屬於 simple request，不會觸發 preflight），
// 所以改成正常模式讀回結果；萬一瀏覽器仍讀不到（網路中斷、跨域失敗），
// 回報 unknown —— 請求可能已經執行，由呼叫端決定要不要回讀確認，絕不能自動重送。
export type PostResult =
  | { status: "ok"; data: any }
  | { status: "fail"; error: string; data?: any }
  | { status: "unknown"; error: string };

export async function gasPost(params: Record<string, string>): Promise<PostResult> {
  let res: Response;
  try {
    res = await fetch(GAS_URL || "", { method: "POST", body: new URLSearchParams(params) });
  } catch {
    return { status: "unknown", error: "無法確認伺服器回應" };
  }
  try {
    const json = await res.json();
    if (json && json.success) return { status: "ok", data: json };
    return { status: "fail", error: (json && json.error) || "伺服器拒絕", data: json };
  } catch {
    return { status: "unknown", error: "伺服器回應無法解析" };
  }
}

// 把 GAS 的錯誤代碼轉成後台看得懂的訊息
export function adminErrorMessage(code: string): string {
  if (code === "unauthorized") return "管理員驗證失敗，請重新整理後再登入";
  if (code === "locked") return "密碼錯誤次數過多，請 15 分鐘後再試";
  if (code === "busy") return "伺服器忙碌中，請稍後再試";
  if (code === "version_conflict") return "資料已被其他操作更新，請重新整理後再試";
  if (code === "not_found") return "找不到這筆資料，畫面已更新";
  return code;
}

function adminGetUrl(key: string, sheet?: string): string {
  let url = `${GAS_URL}?action=adminGet&key=${encodeURIComponent(key)}&pw=${encodeURIComponent(_adminPw)}`;
  if (sheet) url += `&sheet=${encodeURIComponent(sheet)}`;
  return url;
}

// ── 同步狀態通知（供 SyncStatus 元件使用）──────────────────────────────────
type SyncCallback = (key: string) => void;
let _syncListeners: SyncCallback[] = [];
export const _saveVersions: Record<string, number> = {};

export function onSyncWarning(fn: SyncCallback): () => void {
  _syncListeners.push(fn);
  return () => { _syncListeners = _syncListeners.filter(f => f !== fn); };
}

function _notifySyncWarning(key: string): void {
  _syncListeners.forEach(fn => fn(key));
}

// Optimistic Locking：記錄每個 key 載入時的 _v 版本號
const _loadedVersions: Record<string, number> = {};
export const _pendingVerify: Record<string, ReturnType<typeof setTimeout>> = {};
let _skipVerify = false;

function _cancelAllPendingVerify(): void {
  for (const key of Object.keys(_pendingVerify)) {
    clearTimeout(_pendingVerify[key]);
    delete _pendingVerify[key];
  }
}

export async function load(key: string, sheet?: string): Promise<any> {
  try {
    const res = await fetch(adminGetUrl(key, sheet));
    const json = await res.json();
    if (json.success && json.value) {
      const parsed = JSON.parse(json.value);
      if (parsed && parsed._v) _loadedVersions[key] = parsed._v;
      return parsed;
    }
    return null;
  } catch (e) {
    console.warn("load fallback to localStorage:", key);
    try {
      const cacheKey = sheet ? `${sheet}::${key}` : key;
      const v = localStorage.getItem(cacheKey);
      if (!v) return null;
      const parsed = JSON.parse(v);
      if (parsed && parsed._v) _loadedVersions[key] = parsed._v;
      return parsed;
    } catch { return null; }
  }
}

/**
 * 給後台讀取用：把「真的沒資料」和「讀取失敗」分開回報。
 *
 * load() 會吞掉錯誤並回退 localStorage，失敗時回傳 null，所以後台分頁
 * 無法分辨「本月尚無訂單」和「讀不到」—— GAS 掛掉時會顯示成「尚無訂單」。
 */
export type LoadResult = { ok: true; data: any | null } | { ok: false; error: string };

export async function loadStrict(key: string, sheet?: string): Promise<LoadResult> {
  try {
    const res = await fetch(adminGetUrl(key, sheet));
    if (!res.ok) return { ok: false, error: `伺服器回應 ${res.status}` };
    const json = await res.json();
    if (!json.success) return { ok: false, error: adminErrorMessage(json.error || "伺服器回報讀取失敗") };
    // success 為 true 但沒有 value：GAS 明確告訴我們這個 key 沒有資料
    if (!json.value) return { ok: true, data: null };
    const parsed = JSON.parse(json.value);
    if (parsed && parsed._v) _loadedVersions[key] = parsed._v;
    return { ok: true, data: parsed };
  } catch (e: any) {
    return { ok: false, error: e?.name === "SyntaxError" ? "資料格式錯誤" : "無法連線至伺服器" };
  }
}

export type SaveStatus = "ok" | "fail" | "unknown";

export async function save(key: string, val: any, sheet?: string): Promise<SaveStatus> {
  // 對訂單和顧客資料加入版本號（Optimistic Locking）
  const needsVersion = !sheet && (key.startsWith("orders_") || key === "customers");
  if (needsVersion && val && typeof val === "object") {
    val._v = Date.now();
  }

  const jsonStr = JSON.stringify(val);
  const version = (_saveVersions[key] || 0) + 1;
  _saveVersions[key] = version;
  // 同步寫入 localStorage 當快取（讓 UI 立即反應）
  try { const cacheKey = sheet ? `${sheet}::${key}` : key; localStorage.setItem(cacheKey, jsonStr); } catch {}

  const params: Record<string, string> = { action: "adminSet", key, value: jsonStr, pw: _adminPw };
  if (sheet) params.sheet = sheet;
  if (needsVersion && !_skipVerify) params.baseV = String(_loadedVersions[key] || "0");
  const r = await gasPost(params);

  if (r.status === "ok") {
    if (needsVersion && val && val._v) _loadedVersions[key] = val._v;
    return "ok";
  }
  if (r.status === "fail") {
    // 伺服器明確拒絕（版本衝突、驗證失敗…）：立刻提示，不用等回讀
    console.warn(`save rejected for "${key}":`, r.error);
    _notifySyncWarning(key);
    return "fail";
  }

  // 讀不到回應：可能寫進去了也可能沒有，4 秒後回讀確認（取消前次同 key 的驗證，避免 race condition）
  if (needsVersion && val && val._v) _loadedVersions[key] = val._v;
  if (_skipVerify) return "unknown";
  if (_pendingVerify[key]) clearTimeout(_pendingVerify[key]);
  _pendingVerify[key] = setTimeout(async () => {
    delete _pendingVerify[key];
    if (_saveVersions[key] !== version) return;
    try {
      const remote = await load(key, sheet);
      if (needsVersion && remote && val && remote._v !== val._v) {
        console.warn(`sync verify failed for "${key}": version mismatch (local=${val._v}, remote=${remote._v})`);
        _notifySyncWarning(key);
      } else if (!needsVersion) {
        const remoteStr = JSON.stringify(remote);
        if (remoteStr !== jsonStr) {
          console.warn(`sync verify failed for "${key}": local/remote mismatch`);
          _notifySyncWarning(key);
        }
      }
    } catch (e) { /* 驗證本身失敗，不處理 */ }
  }, 4000);
  return "unknown";
}

// ── 管理員專用的單筆操作（伺服器端加鎖完成，不再由瀏覽器寫回整份）────────
export async function adminUpdateOrder(
  key: string, email: string, op: "status" | "delete", status?: "pending" | "handled",
): Promise<PostResult> {
  const params: Record<string, string> = { action: "adminUpdateOrder", key, email, op, pw: _adminPw };
  if (status) params.status = status;
  return gasPost(params);
}

export async function adminDeleteCustomer(email: string): Promise<PostResult> {
  return gasPost({ action: "adminDeleteCustomer", email, pw: _adminPw });
}

// ── BACKUP（備份與回復）──────────────────────────────────────────────────
const BK_SHEET = "backup_app_data";
const bkLoad = (key: string) => load(key, BK_SHEET);
const bkSave = (key: string, val: any) => save(key, val, BK_SHEET);

export async function createBackup(label: string): Promise<BackupMeta> {
  _skipVerify = true;
  _cancelAllPendingVerify();
  try {
    // 先把要備份的資料全部讀齊再開始寫。
    // 原本是邊讀邊寫、而且沒有 null 檢查：任何一項讀取失敗就會把 null
    // 寫進備份表，等於在備份的當下摧毀上一份還能用的備份。
    // 結單會自動呼叫這裡，風險特別高。
    const [settingsR, catsR, customersR, historyR] = await Promise.all([
      loadStrict("settings"), loadStrict("cats"), loadStrict("customers"), loadStrict("history"),
    ]);
    const failed = [
      !settingsR.ok && "settings", !catsR.ok && "cats",
      !customersR.ok && "customers", !historyR.ok && "history",
    ].filter(Boolean);
    if (failed.length) {
      throw new Error(`讀取失敗（${failed.join("、")}），為保護既有備份已中止`);
    }

    const settingsData = (settingsR as { ok: true; data: any }).data;
    const catsData = (catsR as { ok: true; data: any }).data;
    const customersData = (customersR as { ok: true; data: any }).data;
    const historyRaw = (historyR as { ok: true; data: any }).data;
    const historyData: HistoryEntry[] = Array.isArray(historyRaw) ? historyRaw : [];

    const oKeys: string[] = [];
    if (settingsData) oKeys.push(orderKey(settingsData.year, settingsData.month));
    historyData.forEach((h: HistoryEntry) => { if (h.key) oKeys.push(`orders_${h.key}`); });
    const uniqueKeys = Array.from(new Set(oKeys));

    // 訂單同樣先全部讀齊；任何一個月讀不到就中止，不要寫出殘缺的備份
    const orderData: Record<string, any> = {};
    for (const k of uniqueKeys) {
      const r = await loadStrict(k);
      if (!r.ok) throw new Error(`讀取 ${k} 失敗（${r.error}），為保護既有備份已中止`);
      if (r.data && Object.keys(dataEntries(r.data)).length > 0) orderData[k] = r.data;
    }

    const savedOrderKeys: string[] = [];
    for (const [k, d] of Object.entries(orderData)) {
      await bkSave(k, d);
      savedOrderKeys.push(k);
    }
    await bkSave("settings", settingsData);
    await bkSave("cats", catsData);
    await bkSave("customers", customersData);
    await bkSave("history", historyData);
    const meta: BackupMeta = {
      label: label || "手動備份",
      createdAt: nowStr(),
      timestamp: Date.now(),
      version: VERSION,
      orderKeys: savedOrderKeys
    };
    await bkSave("meta", meta);
    return meta;
  } finally {
    _skipVerify = false;
  }
}

export async function restoreBackup(backupOrMeta: any): Promise<void> {
  _skipVerify = true;
  _cancelAllPendingVerify();
  try {
    if (backupOrMeta && backupOrMeta.data) {
      const { settings, cats, customers, history, orders } = backupOrMeta.data;
      if (settings) await save("settings", settings);
      if (cats) await save("cats", cats);
      if (customers) await save("customers", customers);
      if (history) await save("history", history);
      if (orders) { for (const [k, v] of Object.entries(orders)) await save(k, v); }
      return;
    }
    const meta = backupOrMeta;
    if (!meta || !meta.createdAt) throw new Error("無效的備份資料");
    const [s, ca, cu, h] = await Promise.all([
      bkLoad("settings"), bkLoad("cats"), bkLoad("customers"), bkLoad("history")
    ]);
    if (s) await save("settings", s);
    if (ca) await save("cats", ca);
    if (cu) await save("customers", cu);
    if (h) await save("history", h);
    if (meta.orderKeys) {
      for (const k of meta.orderKeys) {
        const d = await bkLoad(k);
        if (d) await save(k, d);
      }
    }
  } finally {
    _skipVerify = false;
  }
}

export async function loadBackupMeta(): Promise<BackupMeta | null> {
  const meta = await bkLoad("meta");
  if (meta && meta.createdAt) return meta;
  const old = await load("backup_meta");
  if (old && old.createdAt) return old;
  const legacy = await load("backup");
  if (legacy && legacy.createdAt) return legacy;
  return null;
}

export async function exportFullBackup(): Promise<any> {
  const meta = await loadBackupMeta();
  if (!meta) return null;
  if (meta.data) return meta;
  const [s, ca, cu, h] = await Promise.all([
    bkLoad("settings"), bkLoad("cats"), bkLoad("customers"), bkLoad("history")
  ]);
  const orders: Record<string, any> = {};
  if (meta.orderKeys) {
    for (const k of meta.orderKeys) {
      const d = await bkLoad(k);
      if (d) orders[k] = d;
    }
  }
  return { ...meta, data: { settings: s, cats: ca, customers: cu, history: h, orders } };
}

export async function importBackupFile(fileData: any): Promise<BackupMeta> {
  if (!fileData || !fileData.createdAt) throw new Error("格式不正確");
  _skipVerify = true;
  _cancelAllPendingVerify();
  try {
    if (fileData.data) {
      const { settings, cats, customers, history, orders } = fileData.data;
      if (settings) await bkSave("settings", settings);
      if (cats) await bkSave("cats", cats);
      if (customers) await bkSave("customers", customers);
      if (history) await bkSave("history", history);
      const oKeys: string[] = [];
      if (orders) {
        for (const [k, v] of Object.entries(orders)) {
          await bkSave(k, v);
          oKeys.push(k);
        }
      }
      const meta: BackupMeta = { label: fileData.label, createdAt: fileData.createdAt, timestamp: fileData.timestamp, version: fileData.version, orderKeys: oKeys };
      await bkSave("meta", meta);
      return meta;
    }
    await bkSave("meta", fileData);
    return fileData;
  } finally {
    _skipVerify = false;
  }
}
