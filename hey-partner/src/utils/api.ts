import { GAS_URL, WRITE_TOKEN } from "../constants";
import { gasPost } from "./http";
import type { FeedbackInput, PublicConfig, PublicFeedback } from "../types";

/**
 * 同仁端的公開動作
 *
 * - 送出需要「同仁通關密語」，擋掉拿到網址的外人。
 * - 查詢碼由伺服器產生，只在送出成功時回傳一次；伺服器只存雜湊值。
 * - 用查詢碼查進度時只拿得到自己寫的內容、狀態與對外回覆，看不到標籤與內部備註。
 * - 密語與查詢碼都走 POST，不會出現在網址或瀏覽紀錄。
 */

export async function fetchPublicConfig(): Promise<PublicConfig | null> {
  const res = await fetch(`${GAS_URL}?action=getPublicConfig`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "getPublicConfig failed");
  return json.value || null;
}

const MESSAGES: Record<string, string> = {
  bad_team_code: "通關密語不對喔，請再確認一次（可以問問主管或 HR）。",
  team_locked: "通關密語錯誤太多次，暫時鎖住了，請 10 分鐘後再試。",
  closed: "目前暫停收件中，請稍後再來。",
  too_short: "多寫幾個字吧，讓我們更了解你的想法 🙂",
  need_contact: "希望專人回覆或面對面聊聊的話，請留下稱呼與聯絡方式。",
  invalid_category: "請先選一個類別。",
  invalid_respond: "請選擇你希望我們怎麼回應。",
  too_many: "現在送出的人有點多，請過幾分鐘再試一次。",
  busy: "伺服器忙碌中，請稍後再按一次送出。",
  unauthorized: "系統設定有誤，暫時無法送出，請告訴管理員。",
  invalid_code: "查詢碼是 12 碼英數字，請再確認一次。",
  not_found: "找不到這個查詢碼，請確認有沒有打錯。",
  lookup_locked: "查詢錯誤次數過多，請 10 分鐘後再試。",
  unknown: "網路不太穩，無法確認是否送出成功。內容已幫你保留，請稍後再試一次。",
};

export function apiMessage(code: string): string {
  return MESSAGES[code] || "發生了一點問題，內容已幫你保留，請稍後再試。";
}

export type SubmitResult =
  | { status: "ok"; code: string }
  | { status: "fail"; code: string; message: string };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function submitFeedback(
  input: FeedbackInput, teamCode: string, sid: string, verifyDelayMs = 2000,
): Promise<SubmitResult> {
  // 注意：參數名稱不能用 "sid" 或 "c"（Apps Script 保留字，會被 Google 直接回 400）
  const r = await gasPost({
    action: "submitFeedback", submissionId: sid, teamCode,
    data: JSON.stringify(input), token: WRITE_TOKEN || "",
  });
  if (r.status === "ok") return { status: "ok", code: r.data.code };
  if (r.status === "fail") return { status: "fail", code: r.error, message: apiMessage(r.error) };

  // 收不到回應：可能已經寫入。用 submissionId 取回查詢碼確認，絕不自動重送
  for (let i = 0; i < 3; i++) {
    await sleep(verifyDelayMs);
    const c = await gasPost({ action: "checkSubmission", submissionId: sid, token: WRITE_TOKEN || "" });
    if (c.status === "ok" && c.data.code) return { status: "ok", code: c.data.code };
  }
  return { status: "fail", code: "unknown", message: apiMessage("unknown") };
}

export type LookupResult = { ok: true; value: PublicFeedback } | { ok: false; message: string };

export async function lookupFeedback(code: string): Promise<LookupResult> {
  const r = await gasPost({ action: "lookupFeedback", code, token: WRITE_TOKEN || "" });
  if (r.status === "ok") return { ok: true, value: r.data.value };
  if (r.status === "fail") return { ok: false, message: apiMessage(r.error) };
  return { ok: false, message: "無法連線至伺服器，請稍後再試。" };
}

// ── 這台裝置記住的查詢碼（只存碼與日期，不存內容；同仁自己勾選才會記）──────────
const SAVED_KEY = "hp_saved_codes";
export interface SavedCode { code: string; at: string; category: string }

export function loadSavedCodes(): SavedCode[] {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    return Array.isArray(v) ? v.filter(x => x && typeof x.code === "string") : [];
  } catch { return []; }
}
export function saveCode(item: SavedCode): void {
  try {
    const list = [item, ...loadSavedCodes().filter(x => x.code !== item.code)].slice(0, 20);
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {}
}
export function forgetCode(code: string): void {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(loadSavedCodes().filter(x => x.code !== code))); } catch {}
}

const TEAM_KEY = "hp_team_code";
export function loadTeamCode(): string { try { return localStorage.getItem(TEAM_KEY) || ""; } catch { return ""; } }
export function rememberTeamCode(v: string): void { try { localStorage.setItem(TEAM_KEY, v); } catch {} }
export function forgetTeamCode(): void { try { localStorage.removeItem(TEAM_KEY); } catch {} }
