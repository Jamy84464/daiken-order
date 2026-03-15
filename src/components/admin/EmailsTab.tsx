import { useState, useEffect } from "react";
import { C, DEFAULT_BANK } from "../../constants";
import { orderKey, dataEntries } from "../../utils/helpers";
import { load } from "../../utils/storage";
import { requestSendEmail, genPaymentEmail, genNoticeEmail } from "../../utils/email";
import { showToast } from "../../utils/toast";
import { Btn, TextArea } from "../ui";
import type { Settings, Category, Order, Customer, BankInfo } from "../../types";

interface EmailsTabProps {
  settings: Settings;
  cats: Category[];
}

export function EmailsTab({ settings, cats }: EmailsTabProps) {
  const [orders, setOrders] = useState<Record<string, Order> | null>(null);
  const [allCustomers, setAllCustomers] = useState<Record<string, Customer> | null>(null);
  const [noticeText, setNoticeText] = useState("");
  const [sending, setSending] = useState<Record<string, string>>({});
  const [sendingAll, setSendingAll] = useState(false);
  const bank: BankInfo = { ...DEFAULT_BANK, ...(settings.bank || {}) };

  useEffect(() => {
    const key = orderKey(settings.year, settings.month);
    load(key).then(o => setOrders(o || {}));
    load("customers").then(c => setAllCustomers(c || {}));
  }, [settings]);

  const markSending = (email: string, state: string) => setSending(p => ({ ...p, [email]: state }));

  const sendPayment = async (o: Order) => {
    markSending(o.email + "_pay", "sending");
    const result = await requestSendEmail({ to: o.email, subject: `【大研生醫團購】${settings.year}年${settings.month}月 匯款通知`, body: genPaymentEmail(o, bank, cats), isHtml: true });
    markSending(o.email + "_pay", result);
  };

  const sendAllPayment = async () => {
    if (!list.length) return;
    setSendingAll(true);
    for (const o of list) {
      markSending(o.email + "_pay", "sending");
      const result = await requestSendEmail({ to: o.email, subject: `【大研生醫團購】${settings.year}年${settings.month}月 匯款通知`, body: genPaymentEmail(o, bank, cats), isHtml: true });
      markSending(o.email + "_pay", result);
    }
    setSendingAll(false);
  };

  const sendNotice = async (target: { email: string; name: string }) => {
    if (!noticeText.trim()) { showToast("請先輸入通知內容"); return; }
    const key = target.email + "_notice";
    markSending(key, "sending");
    const body = genNoticeEmail(target.name, noticeText);
    const result = await requestSendEmail({ to: target.email, subject: `【大研生醫團購】特別通知`, body, isHtml: true });
    markSending(key, result);
  };

  const sendAllNotice = async (targets: { email: string; name: string }[]) => {
    if (!noticeText.trim()) { showToast("請先輸入通知內容"); return; }
    if (!targets.length) return;
    setSendingAll(true);
    for (const t of targets) {
      const key = t.email + "_notice";
      markSending(key, "sending");
      const body = genNoticeEmail(t.name, noticeText);
      const result = await requestSendEmail({ to: t.email, subject: `【大研生醫團購】特別通知`, body, isHtml: true });
      markSending(key, result);
    }
    setSendingAll(false);
  };

  const statusIcon = (key: string) => { const s = sending[key]; return s === "sending" ? " ⏳" : s === "sent" ? " ✅" : s === "error" ? " ❌" : ""; };

  if (!orders || !allCustomers) return <div style={{ color: C.muted, padding: 20 }}>載入中…</div>;
  const list = Object.values(dataEntries(orders)) as Order[];
  const allCustList = Object.values(dataEntries(allCustomers)) as Customer[];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div className="serif" style={{ fontSize: "0.97rem", fontWeight: 700 }}>💳 寄送匯款信件</div>
        {list.length > 0 && <Btn onClick={sendAllPayment} disabled={sendingAll} small color={C.gold}>
          {sendingAll ? "寄送中…" : "📨 一鍵寄給全部 (" + list.length + "人)"}
        </Btn>}
      </div>
      <p style={{ fontSize: "0.82rem", color: C.muted, marginBottom: 12, lineHeight: 1.7 }}>信件將從你的 Gmail 自動寄出，訂購者即時收到匯款資訊。</p>
      {list.length === 0
        ? <div style={{ color: C.muted, marginBottom: 20 }}>本月尚無訂單</div>
        : list.map(o => (
          <div key={o.email} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.white, border: `1.5px solid ${sending[o.email + "_pay"] === "sent" ? C.gl : C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 8, gap: 10, flexWrap: "wrap", transition: "border-color .3s" }}>
            <div>
              <span className="serif" style={{ fontWeight: 600 }}>{o.ordererName}</span>
              <span style={{ fontSize: "0.78rem", color: C.muted, marginLeft: 8 }}>{o.email}</span>
              <span style={{ fontSize: "0.78rem", color: C.green, fontWeight: 600, marginLeft: 8 }}>NT${o.total.toLocaleString()}</span>
            </div>
            <Btn onClick={() => sendPayment(o)} small color={sending[o.email + "_pay"] === "sent" ? C.gl : C.gold} disabled={sending[o.email + "_pay"] === "sending"}>
              {sending[o.email + "_pay"] === "sending" ? "寄送中…" : sending[o.email + "_pay"] === "sent" ? "✅ 已寄出" : sending[o.email + "_pay"] === "error" ? "❌ 重試" : "📧 寄匯款信"}
            </Btn>
          </div>
        ))
      }

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: `2px solid ${C.border}` }}>
        <div className="serif" style={{ fontSize: "0.97rem", fontWeight: 700, marginBottom: 12 }}>📣 寄送特別通知</div>
        <TextArea value={noticeText} onChange={setNoticeText} rows={4} placeholder="輸入通知內容，將自動套用每位訂購者的姓名…" />

        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: "0.83rem", fontWeight: 600, color: C.text }}>本月訂購者（{list.length} 人）</span>
            {list.length > 0 && <Btn onClick={() => sendAllNotice(list.map(o => ({ email: o.email, name: o.ordererName })))} disabled={sendingAll || !noticeText.trim()} small color={C.green}>
              {sendingAll ? "寄送中…" : "📨 寄給全部本月訂購者"}
            </Btn>}
          </div>
          {list.length === 0
            ? <div style={{ color: C.muted, fontSize: "0.82rem" }}>本月尚無訂購者</div>
            : <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {list.map(o => (
                  <Btn key={o.email} onClick={() => sendNotice({ email: o.email, name: o.ordererName })} small
                    color={sending[o.email + "_notice"] === "sent" ? C.gl : C.green}
                    disabled={sending[o.email + "_notice"] === "sending" || !noticeText.trim()}
                    outline={sending[o.email + "_notice"] !== "sent"}>
                    {o.ordererName}{statusIcon(o.email + "_notice")}
                  </Btn>
                ))}
              </div>
          }
        </div>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px dashed ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: "0.83rem", fontWeight: 600, color: C.text }}>全部歷史訂購人（{allCustList.length} 人）</span>
            {allCustList.length > 0 && <Btn onClick={() => sendAllNotice(allCustList.map(c => ({ email: c.email, name: c.name })))} disabled={sendingAll || !noticeText.trim()} small color={C.green}>
              {sendingAll ? "寄送中…" : "📨 寄給全部歷史訂購人"}
            </Btn>}
          </div>
          {allCustList.length === 0
            ? <div style={{ color: C.muted, fontSize: "0.82rem" }}>尚無歷史訂購人資料</div>
            : <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {allCustList.map(c => (
                  <Btn key={c.email} onClick={() => sendNotice({ email: c.email, name: c.name })} small
                    color={sending[c.email + "_notice"] === "sent" ? C.gl : C.green}
                    disabled={sending[c.email + "_notice"] === "sending" || !noticeText.trim()}
                    outline={sending[c.email + "_notice"] !== "sent"}>
                    {c.name}{statusIcon(c.email + "_notice")}
                  </Btn>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  );
}
