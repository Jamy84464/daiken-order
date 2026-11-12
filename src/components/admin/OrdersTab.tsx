import { useState, useEffect, useCallback, useMemo } from "react";
import { C } from "../../constants";
import { flatProducts, orderKey, dataEntries } from "../../utils/helpers";
import { loadStrict, adminUpdateOrder, adminErrorMessage } from "../../utils/storage";
import { showToast } from "../../utils/toast";
import { ConfirmModal } from "../ConfirmModal";
import { LoadError } from "./LoadState";
import type { Settings, Category, Order } from "../../types";

interface OrdersTabProps {
  settings: Settings;
  cats: Category[];
}

export function OrdersTab({ settings, cats }: OrdersTabProps) {
  const [orders, setOrders] = useState<Record<string, Order> | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busyOp, setBusyOp] = useState<string | null>(null);
  const fp = useMemo(() => flatProducts(cats), [cats]);

  const fetchOrders = useCallback(async () => {
    setReloading(true);
    const r = await loadStrict(orderKey(settings.year, settings.month));
    if (r.ok) { setOrders(r.data || {}); setLoadErr(null); }
    else { setLoadErr(r.error); setOrders(null); }
    setReloading(false);
  }, [settings]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  /**
   * 改狀態與刪除都交給伺服器在鎖內完成，只動目標那一筆，回傳最新的整月訂單。
   *
   * 早期的寫法是拿掛載當下的 orders state 整份覆蓋 —— 早上開後台、中午客人下單、
   * 下午按「已處理」，中午那筆就被抹掉。後來改成「先讀再寫」，但兩個請求之間
   * 仍有空窗；現在讀改寫在同一把伺服器鎖裡，空窗不存在了。
   */
  const applyOrderOp = async (email: string, op: "status" | "delete", status?: "pending" | "handled") => {
    const key = orderKey(settings.year, settings.month);
    const known = orders ? Object.keys(dataEntries(orders)).length : 0;
    const r = await adminUpdateOrder(key, email, op, status);
    if (r.status === "unknown") {
      showToast("無法確認是否完成，已重新讀取最新資料。");
      await fetchOrders();
      return;
    }
    const value = r.data?.value;
    const fresh = value ? (JSON.parse(value) as Record<string, Order>) : null;
    if (r.status === "fail") {
      showToast(adminErrorMessage(r.error));
      if (fresh) setOrders(fresh);
      return;
    }
    if (fresh) {
      setOrders(fresh);
      // 讓保護被看見：期間有新訂單進來時明說
      const after = Object.keys(dataEntries(fresh)).length + (op === "delete" ? 1 : 0);
      if (after > known) showToast(`期間新增了 ${after - known} 筆訂單，已一併保留。`, "success");
    }
  };

  const toggleStatus = async (email: string) => {
    if (busyOp || !orders?.[email]) return;
    setBusyOp(email);
    // 送出明確的目標狀態，而不是讓伺服器「切換」—— 按的是哪顆鈕就是哪個結果
    await applyOrderOp(email, "status", orders[email].status === "handled" ? "pending" : "handled");
    setBusyOp(null);
  };

  const deleteOrder = async (email: string) => {
    if (busyOp) return;
    setBusyOp(email);
    // 伺服器刪除時會一併更新該月歷史紀錄的筆數與金額
    await applyOrderOp(email, "delete");
    setBusyOp(null);
    setConfirmDelete(null);
  };

  if (loadErr) return <LoadError message={loadErr} onRetry={fetchOrders} busy={reloading} />;
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
                  style={{ background: busyOp === o.email ? "#8a8f99" : o.status === "handled" ? C.green : C.goldOn, color: C.white, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: "0.75rem", cursor: busyOp ? "not-allowed" : "pointer", opacity: busyOp && busyOp !== o.email ? .5 : 1 }}>
                  {busyOp === o.email ? "處理中…" : o.status === "handled" ? "↩ 恢復" : "✅ 已處理"}
                </button>
                <button onClick={() => setConfirmDelete(o.email)} disabled={!!busyOp}
                  style={{ background: "none", color: busyOp ? C.muted : C.redOn, border: `1px solid ${busyOp ? C.muted : C.redOn}`, borderRadius: 7, padding: "6px 11px", fontSize: "0.75rem", cursor: busyOp ? "not-allowed" : "pointer", opacity: busyOp ? .5 : 1 }}>
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
