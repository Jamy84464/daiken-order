import { GAS_URL, WRITE_TOKEN } from "../constants";
import { gasPost } from "./storage";
import type { Order, Cart } from "../types";

/**
 * 客人端的公開動作（GAS v2）
 *
 * 客人只能讀公開設定、查「自己 Email」的資料、新增或修改「自己」的訂單。
 * 計價、寫入、寄確認信都在伺服器端完成：前端送來的金額不被採用，
 * 確認信的內容與收件人也由伺服器決定，無法被拿來寄任意信件。
 */

export interface PublicSettings {
  year: number;
  month: number;
  isOpen: boolean;
  bulletin: string;
}

export interface CustomerHint {
  name: string;
  phone: string;
  relation: string;
  lastRecipientName: string;
  lastRecipientAddress: string;
  lastRecipientPhone: string;
}

async function gasGet(params: Record<string, string>): Promise<any> {
  const res = await fetch(`${GAS_URL}?${new URLSearchParams(params).toString()}`);
  return res.json();
}

/** 讀取公開設定；讀取失敗會丟錯，讓呼叫端決定是否改用快取 */
export async function fetchPublicSettings(): Promise<PublicSettings | null> {
  const json = await gasGet({ action: "getPublicSettings" });
  if (!json.success) throw new Error(json.error || "getPublicSettings failed");
  return json.value || null;
}

/** 查這個 Email 上次的訂購資料（自動帶入用）；查不到或失敗都回傳 null */
export async function lookupCustomer(email: string): Promise<CustomerHint | null> {
  try {
    const json = await gasGet({ action: "lookupCustomer", email });
    return json.success ? (json.value || null) : null;
  } catch {
    return null;
  }
}

export type MyOrderResult = { ok: true; order: Order | null } | { ok: false; error: string };

export async function getMyOrder(email: string): Promise<MyOrderResult> {
  try {
    const json = await gasGet({ action: "getMyOrder", email });
    if (!json.success) return { ok: false, error: json.error || "查詢失敗" };
    return { ok: true, order: json.value || null };
  } catch {
    return { ok: false, error: "無法連線至伺服器" };
  }
}

// ── 下單 ─────────────────────────────────────────────────────────────────────
export interface OrderInput {
  ordererName?: string;
  phone?: string;
  relation?: string;
  recipientName: string;
  recipientAddress: string;
  recipientPhone: string;
  cart: Cart;
}

export type SubmitResult =
  | { status: "ok"; order: Order; emailSent: boolean | null }
  | { status: "fail"; code: string; message: string };

const SUBMIT_MESSAGES: Record<string, string> = {
  closed: "本月團購已結單，無法送出訂單。",
  exists: "這個 Email 本月已經有一筆訂單了。如需更改，請到「查訂單」修改原本的訂單。",
  handled: "這筆訂單已經處理，無法再修改。如需更改請直接與我聯繫。",
  not_found: "查無這筆訂單，可能已被取消，請重新查詢。",
  out_of_stock: "部分商品已經缺貨，請重新整理頁面後再試。",
  invalid_product: "購物車裡有已下架的商品，請重新整理頁面後再試。",
  invalid_qty: "商品數量有誤，請重新確認。",
  empty_cart: "請至少選擇一項商品。",
  missing_fields: "請把必填欄位都填寫完整。",
  invalid_email: "Email 格式不正確。",
  busy: "目前同時送出的訂單較多，請稍後再按一次送出。",
  catalog_unavailable: "暫時無法讀取產品資料，請稍後再試。",
  unauthorized: "系統設定有誤，暫時無法送出，請與我聯繫。",
  unknown: "無法確認訂單是否送出成功。請到「查訂單」確認，若查不到再重新送出。",
};

export function submitMessage(code: string): string {
  return SUBMIT_MESSAGES[code] || "送出時發生錯誤，您的資料已保留，請稍後再試。";
}

/** 每次送出產生一個識別碼：伺服器用它辨識重送，也讓前端在收不到回應時回讀確認 */
export function makeSid(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}`;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function submitOrder(
  mode: "create" | "update", email: string, sid: string, order: OrderInput,
  verifyDelayMs = 2000,
): Promise<SubmitResult> {
  const r = await gasPost({
    action: "submitOrder", mode, email, sid,
    order: JSON.stringify(order),
    token: WRITE_TOKEN || "",
  });

  if (r.status === "ok") {
    const emailSent = r.data.emailSent === undefined ? null : r.data.emailSent;
    return { status: "ok", order: r.data.order, emailSent };
  }
  if (r.status === "fail") {
    const code = r.error || "error";
    let message = submitMessage(code);
    if (code === "out_of_stock" && r.data?.product) message = `「${r.data.product}」已經缺貨，請調整數量後再送出。`;
    return { status: "fail", code, message };
  }

  // 收不到回應：請求可能已經執行。用 sid 回讀確認，絕不自動重送（會重複寄信）
  for (let i = 0; i < 3; i++) {
    await sleep(verifyDelayMs);
    const check = await getMyOrder(email);
    if (check.ok && check.order && (check.order as any).sid === sid) {
      return { status: "ok", order: check.order, emailSent: null };
    }
  }
  return { status: "fail", code: "unknown", message: submitMessage("unknown") };
}
