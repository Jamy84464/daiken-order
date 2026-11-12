import { gasPost, type PostResult } from "./http";
import type { AdminConfig, Feedback, FeedbackPatch } from "../types";

/**
 * 管理員專用的讀寫
 *
 * 密碼只存在記憶體裡（重新整理就清除），每個請求都帶密碼由伺服器驗證；
 * 全部走 POST，密碼不會出現在網址。改單一則回饋在伺服器鎖內完成，
 * 以 rev 做樂觀鎖定，兩位管理員同時編輯同一則時不會互相覆蓋。
 */
let _adminPw = "";
export function setAdminCredential(pw: string): void { _adminPw = pw; }
export function clearAdminCredential(): void { _adminPw = ""; }

export function adminErrorMessage(code: string): string {
  const map: Record<string, string> = {
    unauthorized: "管理員驗證失敗，請重新登入",
    locked: "密碼錯誤次數過多，請 15 分鐘後再試",
    busy: "伺服器忙碌中，請稍後再試",
    version_conflict: "這則回饋剛被其他管理員更新過，已載入最新內容，請確認後再存一次",
    not_found: "找不到這則回饋，可能已被刪除",
    invalid_email: "通知信箱格式不正確",
    server_error: "伺服器發生錯誤",
  };
  return map[code] || code;
}

function failMsg(r: PostResult): string {
  return r.status === "fail" ? adminErrorMessage(r.error) : "無法連線至伺服器";
}

export async function verifyAdmin(pw: string): Promise<{ ok: boolean; message?: string }> {
  const r = await gasPost({ action: "verifyAdmin", pw });
  if (r.status === "ok") return r.data.authed ? { ok: true } : { ok: false, message: "密碼錯誤" };
  return { ok: false, message: failMsg(r) };
}

export type Loaded<T> = { ok: true; value: T } | { ok: false; message: string };

export async function adminList(): Promise<Loaded<Feedback[]>> {
  const r = await gasPost({ action: "adminList", pw: _adminPw });
  if (r.status === "ok") return { ok: true, value: Array.isArray(r.data.value) ? r.data.value : [] };
  return { ok: false, message: failMsg(r) };
}

export type UpdateResult =
  | { ok: true; value: Feedback; emailSent: boolean | null }
  | { ok: false; message: string; latest?: Feedback };

export async function adminUpdate(fb: Feedback, patch: FeedbackPatch, notify: boolean): Promise<UpdateResult> {
  const r = await gasPost({
    action: "adminUpdate", pw: _adminPw, id: fb.id, baseRev: String(fb.rev || 0),
    patch: JSON.stringify(patch), notify: notify ? "true" : "false",
  });
  if (r.status === "ok") return { ok: true, value: r.data.value, emailSent: r.data.emailSent ?? null };
  if (r.status === "fail") return { ok: false, message: adminErrorMessage(r.error), latest: r.data?.value };
  return { ok: false, message: "無法確認是否儲存成功，請重新整理後確認" };
}

export async function adminDelete(id: string): Promise<{ ok: boolean; message?: string }> {
  const r = await gasPost({ action: "adminDelete", pw: _adminPw, id });
  return r.status === "ok" ? { ok: true } : { ok: false, message: failMsg(r) };
}

export async function adminGetConfig(): Promise<Loaded<AdminConfig>> {
  const r = await gasPost({ action: "adminGetConfig", pw: _adminPw });
  if (r.status === "ok") return { ok: true, value: r.data.value };
  return { ok: false, message: failMsg(r) };
}

export async function adminSetConfig(cfg: AdminConfig): Promise<Loaded<AdminConfig>> {
  const r = await gasPost({ action: "adminSetConfig", pw: _adminPw, value: JSON.stringify(cfg) });
  if (r.status === "ok") return { ok: true, value: r.data.value };
  return { ok: false, message: failMsg(r) };
}
