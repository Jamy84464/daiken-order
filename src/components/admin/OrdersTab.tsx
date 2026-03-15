import { useState, useEffect, useMemo } from "react";
import { C } from "../../constants";
import { flatProducts, orderKey, dataEntries } from "../../utils/helpers";
import { load, save } from "../../utils/storage";
import { ConfirmModal } from "../ConfirmModal";
import type { Settings, Category, Order } from "../../types";

interface OrdersTabProps {
  settings: Settings;
  cats: Category[];
}

export function OrdersTab({ settings, cats }: OrdersTabProps) {
  const [orders, setOrders] = useState<Record<string, Order> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busyOp, setBusyOp] = useState<string | null>(null);
  const fp = useMemo(() => flatProducts(cats), [cats]);
  useEffect(() => {
    const key = orderKey(settings.year, settings.month);
    load(key).then(o => setOrders(o || {}));
  }, [settings]);

  const toggleStatus = async (email: string) => {
    if (busyOp || !orders) return;
    setBusyOp(email);
    const key = orderKey(settings.year, settings.month);
    const upd = { ...orders, [email]: { ...orders[email], status: orders[email].status === "handled" ? "pending" : "handled" } };
    setOrders(upd); await save(key, upd);
    setBusyOp(null);
  };

  const deleteOrder = async (email: string) => {
    if (busyOp || !orders) return;
    setBusyOp(email);
    const key = orderKey(settings.year, settings.month);
    const upd = { ...orders };
    delete upd[email];
    setOrders(upd); await save(key, upd);
    try {
      const h = (await load("history")) || [];
      const monthKey = `${settings.year}_${String(settings.month).padStart(2, "0")}`;
      const idx = h.findIndex((x: any) => x.key === monthKey);
      if (idx >= 0) {
        const list = Object.values(dataEntries(upd));
        h[idx].orderCount = list.length;
        h[idx].totalAmt = list.reduce((s: number, o: any) => s + o.total, 0);
        await save("history", h);
      }
    } catch (e) { console.warn("update history after delete:", e); }
    setBusyOp(null);
    setConfirmDelete(null);
  };

  if (!orders) return <div style={{ color: C.muted, padding: 20 }}>載入中…</div>;
  const list = Object.values(dataEntries(orders)).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) as Order[];
  const totalAmt = list.filter(o => o.status !== "handled").reduce((s, o) => s + o.total, 0);

  return (
    <div>
      {confirmDelete && <ConfirmModal msg={`確定刪除 ${confirmDelete} 的訂單？此操作無法復原。`} onOk={() => deleteOrder(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {([["📦 訂單數", list.length, C.green], ["⏳ 待處理", list.filter(o => o.status !== "handled").length, C.gold], ["✅ 已處理", list.filter(o => o.status === "handled").length, C.gl], ["💰 待收", `NT$${totalAmt.toLocaleString()}`, C.red]] as [string, string | number, string][]).map(([l, v, c]) => (
          <div key={l} style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", minWidth: 110 }}>
            <div style={{ fontSize: "0.75rem", color: C.muted, marginBottom: 3 }}>{l}</div>
            <div className="serif" style={{ fontSize: "1.2rem", fontWeight: 700, color: c }}>{v}</div>
          </div>
        ))}
      </div>
      {list.length === 0 ? <div style={{ color: C.muted, textAlign: "center", padding: 32 }}>本月尚無訂單</div>
      : list.map(o => {
        const items = Object.entries(o.cart).filter(([, q]) => q > 0);
        return (
          <div key={o.email} style={{ background: C.white, border: `1.5px solid ${o.status === "handled" ? C.border : C.green}`, borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
            <div style={{ background: o.status === "handled" ? C.cream : C.gp, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 7 }}>
              <div>
                <span className="serif" style={{ fontWeight: 700 }}>{o.ordererName}</span>
                <span style={{ fontSize: "0.78rem", color: C.muted, marginLeft: 8 }}>{o.email}</span>
                <span style={{ fontSize: "0.75rem", color: C.muted, marginLeft: 8 }}>{o.relation}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="serif" style={{ fontWeight: 700, color: C.green }}>NT${o.total.toLocaleString()}</span>
                <button onClick={() => toggleStatus(o.email)} disabled={!!busyOp}
                  style={{ background: busyOp === o.email ? "#aaa" : o.status === "handled" ? C.gl : C.gold, color: C.white, border: "none", borderRadius: 7, padding: "4px 10px", fontSize: "0.75rem", cursor: busyOp ? "not-allowed" : "pointer", opacity: busyOp && busyOp !== o.email ? .5 : 1 }}>
                  {busyOp === o.email ? "處理中…" : o.status === "handled" ? "↩ 恢復" : "✅ 已處理"}
                </button>
                <button onClick={() => setConfirmDelete(o.email)} disabled={!!busyOp}
                  style={{ background: "none", color: busyOp ? C.muted : C.red, border: `1px solid ${busyOp ? C.muted : C.red}`, borderRadius: 7, padding: "4px 10px", fontSize: "0.75rem", cursor: busyOp ? "not-allowed" : "pointer", opacity: busyOp ? .5 : 1 }}>
                  🗑 刪除
                </button>
              </div>
            </div>
            <div style={{ padding: "9px 14px", display: "flex", flexWrap: "wrap", gap: 5 }}>
              {items.map(([id, q]) => { const p = fp[id]; return p && <span key={id} style={{ background: C.gp, color: C.green, borderRadius: 5, padding: "2px 7px", fontSize: "0.76rem" }}>{p.name}×{q}</span>; })}
            </div>
            <div style={{ padding: "4px 14px 9px", fontSize: "0.77rem", color: C.muted }}>
              📍 {o.recipientName}｜{o.recipientPhone}｜{o.recipientAddress}
            </div>
          </div>
        );
      })}
    </div>
  );
}
