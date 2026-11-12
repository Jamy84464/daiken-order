import { GAS_URL } from "../constants";

/**
 * POST 共用：以一般模式送出並讀取回應。
 * 表單格式的 POST 屬於 simple request，不會觸發 preflight，可以讀到 GAS 的回應。
 * 讀不到回應（網路中斷等）時回報 unknown —— 請求可能已經執行，呼叫端不能自動重送。
 */
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
    return { status: "fail", error: (json && json.error) || "server_error", data: json };
  } catch {
    return { status: "unknown", error: "伺服器回應無法解析" };
  }
}
