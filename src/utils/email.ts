import { flatProducts } from "./helpers";
import { gasPost, getAdminCredential } from "./storage";
import type { Order, Category, BankInfo, Product } from "../types";

// ── EMAIL（後台寄信，需管理員密碼；客人的確認信改由伺服器在下單時寄出）────
// 回傳 "sent" / "error"；讀不到伺服器回應時視為已送出，避免重按造成重複寄信
export async function requestSendEmail({ to, subject, body, isHtml = false }: { to: string; subject: string; body: string; isHtml?: boolean }): Promise<string> {
  const params: Record<string, string> = { action: "adminSendEmail", to, subject, body, pw: getAdminCredential() };
  if (isHtml) params.isHtml = "true";
  const r = await gasPost(params);
  if (r.status === "fail") {
    console.error("requestSendEmail rejected:", r.error);
    return "error";
  }
  return "sent";
}

// 訂單內容來自客人輸入，放進 HTML 前一律跳脫
export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// 共用 email 外框
export function emailWrap(title: string, content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f1ec;font-family:'Helvetica Neue',Arial,'Noto Sans TC',sans-serif;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#2d6a4f;color:#fff;padding:18px 24px;border-radius:14px 14px 0 0;text-align:center">
    <div style="font-size:18px;font-weight:700;letter-spacing:1px">大研生醫 × 團購專區</div>
    <div style="font-size:12px;opacity:.7;margin-top:4px">${title}</div>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 14px 14px;border:1px solid #e5e0d8;border-top:none">
    ${content}
  </div>
  <div style="text-align:center;padding:16px 0;font-size:11px;color:#9ca3af">
    本信件由系統自動寄出，如有疑問請直接回覆此信
  </div>
</div>
</body></html>`;
}

// 商品列表 HTML
export function itemsTableHtml(items: [string, number][], fp: Record<string, Product & { category: string }>, showOOS: boolean = false): { table: string; oosItems: string[] } {
  const oosItems: string[] = [];
  const rows = items.map(([id, q]) => {
    const p = fp[id]; if (!p) return "";
    if (showOOS && p.outOfStock) {
      oosItems.push(p.name);
      return `<tr style="color:#9ca3af"><td style="padding:8px 12px;border-bottom:1px solid #f0ede8">${esc(p.name)}</td><td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:center">${q}</td><td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:right;text-decoration:line-through">NT$${(p.price * q).toLocaleString()}</td></tr>`;
    }
    return `<tr><td style="padding:8px 12px;border-bottom:1px solid #f0ede8">${esc(p.name)}</td><td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:center">${q}</td><td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:right;font-weight:600;color:#2d6a4f">NT$${(p.price * q).toLocaleString()}</td></tr>`;
  }).filter(Boolean).join("");

  const table = `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
    <thead><tr style="background:#f0faf4"><th style="padding:8px 12px;text-align:left;font-weight:600;color:#2d6a4f;border-bottom:2px solid #d8f3dc">品項</th><th style="padding:8px 12px;text-align:center;font-weight:600;color:#2d6a4f;border-bottom:2px solid #d8f3dc">數量</th><th style="padding:8px 12px;text-align:right;font-weight:600;color:#2d6a4f;border-bottom:2px solid #d8f3dc">金額</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  return { table, oosItems };
}

export function genConfirmEmail(order: Order, cats: Category[]): string {
  const fp = flatProducts(cats);
  const items = Object.entries(order.cart).filter(([, q]) => q > 0) as [string, number][];
  const { table } = itemsTableHtml(items, fp);

  const content = `
    <div style="font-size:15px;line-height:1.8;margin-bottom:16px">
      <strong>${esc(order.ordererName)}</strong> 您好，感謝您的訂購！
    </div>
    ${table}
    <div style="background:#f0faf4;border-radius:10px;padding:14px 18px;margin:16px 0;text-align:right">
      <span style="font-size:13px;color:#6b7280">訂單總金額</span>
      <span style="font-size:22px;font-weight:700;color:#2d6a4f;margin-left:10px">NT$${order.total.toLocaleString()}</span>
    </div>
    <div style="background:#faf7f2;border-radius:10px;padding:14px 18px;margin:16px 0;font-size:13px;line-height:2;color:#4a5568">
      <div style="font-weight:600;margin-bottom:4px;color:#1a1a1a">▸ 收件資訊</div>
      收件人：${esc(order.recipientName)}<br>
      電　話：${esc(order.recipientPhone)}<br>
      地　址：${esc(order.recipientAddress)}
    </div>
    <div style="font-size:13px;color:#6b7280;line-height:1.8;margin-top:16px">
      我們將於月底結單後與您聯繫確認付款。<br>如需修改訂單，請至 <a href="https://jamy84464.github.io/daiken-order/" style="color:#2d6a4f;font-weight:600">訂購頁面</a> 以此 Email 登入修改。<br><br>
      感謝您對大研生醫的支持，祝福您與家人身體健康！
    </div>`;
  return emailWrap("訂購確認", content);
}

export function genPaymentEmail(order: Order, bank: BankInfo, cats: Category[]): string {
  const fp = flatProducts(cats);
  const items = Object.entries(order.cart).filter(([, q]) => q > 0) as [string, number][];
  const { table, oosItems } = itemsTableHtml(items, fp, true);
  const actualTotal = items.reduce((s, [id, q]) => {
    const p = fp[id]; return (!p || p.outOfStock) ? s : s + (p.price * q);
  }, 0);

  const oosNote = oosItems.length > 0
    ? `<div style="background:#fff5f5;border:1px solid #feb2b2;border-radius:8px;padding:10px 14px;margin:10px 0;font-size:12px;color:#c0392b;line-height:1.7">
        ※ 以下品項目前缺貨，已從金額中扣除：<br>${oosItems.map(n => "・" + n).join("<br>")}
       </div>` : "";

  const content = `
    <div style="font-size:15px;line-height:1.8;margin-bottom:16px">
      <strong>${esc(order.ordererName)}</strong> 您好，以下是您的訂單與匯款資訊：
    </div>
    ${table}
    ${oosNote}
    <div style="background:#f0faf4;border-radius:10px;padding:14px 18px;margin:16px 0;text-align:right">
      <span style="font-size:13px;color:#6b7280">實際應付總金額</span>
      <span style="font-size:22px;font-weight:700;color:#2d6a4f;margin-left:10px">NT$${actualTotal.toLocaleString()}</span>
    </div>
    <div style="background:#faf7f2;border-radius:10px;padding:14px 18px;margin:16px 0;font-size:13px;line-height:2;color:#4a5568">
      <div style="font-weight:600;margin-bottom:4px;color:#1a1a1a">▸ 收件資訊</div>
      收件人：${esc(order.recipientName)}<br>
      電　話：${esc(order.recipientPhone)}<br>
      地　址：${esc(order.recipientAddress)}
    </div>
    <div style="background:#fffbeb;border:1.5px solid #f6ad55;border-radius:10px;padding:16px 18px;margin:16px 0">
      <div style="font-weight:700;font-size:14px;color:#b7791f;margin-bottom:8px">▸ 匯款資訊</div>
      <div style="font-size:14px;line-height:2;color:#1a1a1a">
        銀行：${bank.bankName}（${bank.bankCode}）<br>
        戶名：${bank.accountName || ""}<br>
        帳號：<strong style="font-size:16px;letter-spacing:1px">${bank.account}</strong>
      </div>
      <div style="font-size:12px;color:#b7791f;margin-top:8px;line-height:1.6">
        再麻煩匯款後回覆您的匯款帳號後五碼，方便我們核對，謝謝！
      </div>
    </div>
    <div style="font-size:13px;color:#6b7280;line-height:1.8;margin-top:16px">
      感謝您對大研生醫的支持，祝福您與家人身體健康！
    </div>`;
  return emailWrap("匯款通知", content);
}

export function genNoticeEmail(name: string, noticeText: string): string {
  const content = `
    <div style="font-size:15px;line-height:1.8;margin-bottom:16px">
      <strong>${esc(name)}</strong> 您好，
    </div>
    <div style="font-size:14px;line-height:2;color:#1a1a1a;padding:16px 0;white-space:pre-wrap">${esc(noticeText)}</div>
    <div style="font-size:13px;color:#6b7280;line-height:1.8;margin-top:16px">
      如有疑問請與我聯繫，感謝您的支持！
    </div>`;
  return emailWrap("特別通知", content);
}
