import { GAS_URL, WRITE_TOKEN, VERSION } from "../constants";
import { nowStr, orderKey, dataEntries } from "./helpers";
import type { BackupMeta, HistoryEntry } from "../types";

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
    let url = `${GAS_URL}?action=get&key=${encodeURIComponent(key)}`;
    if (sheet) url += `&sheet=${encodeURIComponent(sheet)}`;
    const res = await fetch(url);
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

export async function save(key: string, val: any, sheet?: string): Promise<void> {
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
  // 寫入 Google Sheets（no-cors 避免 redirect 把 POST 變 GET）
  try {
    const params = new URLSearchParams();
    params.append("action", "set");
    params.append("key", key);
    params.append("value", jsonStr);
    params.append("token", WRITE_TOKEN || "");
    if (sheet) params.append("sheet", sheet);
    if (needsVersion) {
      params.append("baseV", String(_loadedVersions[key] || "0"));
    }
    await fetch(GAS_URL || "", { method: "POST", mode: "no-cors", body: params });
  } catch (e) { console.error("save to Sheets error:", key, e); }

  // 更新本地版本記錄
  if (needsVersion && val && val._v) {
    _loadedVersions[key] = val._v;
  }

  // Read-back 驗證（取消前次同 key 的驗證，避免 race condition）
  if (_skipVerify) return;
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
}

// ── BACKUP（備份與回復）──────────────────────────────────────────────────
const BK_SHEET = "backup_app_data";
const bkLoad = (key: string) => load(key, BK_SHEET);
const bkSave = (key: string, val: any) => save(key, val, BK_SHEET);

export async function createBackup(label: string): Promise<BackupMeta> {
  _skipVerify = true;
  _cancelAllPendingVerify();
  try {
    const settingsData = await load("settings");
    const catsData = await load("cats");
    const customersData = await load("customers");
    const historyData: HistoryEntry[] = (await load("history")) || [];
    const oKeys: string[] = [];
    if (settingsData) oKeys.push(orderKey(settingsData.year, settingsData.month));
    historyData.forEach((h: HistoryEntry) => { if (h.key) oKeys.push(`orders_${h.key}`); });
    const uniqueKeys = Array.from(new Set(oKeys));
    const savedOrderKeys: string[] = [];
    for (const k of uniqueKeys) {
      const d = await load(k);
      if (d && Object.keys(dataEntries(d)).length > 0) {
        await bkSave(k, d);
        savedOrderKeys.push(k);
      }
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
