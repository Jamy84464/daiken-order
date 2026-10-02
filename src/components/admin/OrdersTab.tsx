import { useState, useEffect, useCallback, useMemo } from "react";
import { C } from "../../constants";
import { flatProducts, orderKey, dataEntries } from "../../utils/helpers";
import { save, loadStrict } from "../../utils/storage";
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
   * 寫入前重新讀取遠端，只改動目標那一筆，再整份寫回。
   *
   * 原本的寫法是拿掛載當下的 orders state 整份覆蓋 —— 你早上開後台、
   * 中午客人下單、下午按「已處理」，中午那筆就會被抹掉，
   * 而且完全不需要網路故障就會發生。
   *
   * mutate 回傳 null 代表放棄寫入。
   */
  const mutateOrders = async (
    email: string,
    mutate: (fresh: Record<string, Order>) => Record<string, Order> | null,
  ): Promise<Record<string, Order> | null> => {
    const key = orderKey(settings.year, settings.month);
    const r = await loadStrict(key);
    if (!r.ok) {
      showToast(`讀取失敗（${r.error}），未更動任何資料，請稍後再試。`);
      return null;
    }
    const fresh = (r.data || {}) as Record<string, Order>;
    if (!fresh[email]) {
      showToast("這筆訂單在雲端已不存在，畫面已更新。");
      setOrders(fresh);
      return null;
    }
    const before = Object.keys(dataEntries(fresh)).length;
    const known = orders ? Object.keys(dataEntries(orders)).length : before;
    const upd = mutate(fresh);
    if (!upd) return null;
    await save(key, upd);
    setOrders(upd);
    // 讓保護機制被看見：期間有新訂單進來時明說，否則使用者不會知道差點覆蓋掉
    if (before > known) showToast(`期間新增了 ${before - known} 筆訂單，已一併保留。`, "success");
    return upd;
  };

  const toggleStatus = async (email: string) => {
    if (busyOp) return;
    setBusyOp(email);
    await mutateOrders(email, fresh => ({
      ...fresh,
      [email]: { ...fresh[email], status: fresh[email].status === "handled" ? "pending" : "handled" },
    }));
    setBusyOp(null);
  };

  const deleteOrder = async (email: string) => {
    if (busyOp) return;
    setBusyOp(email);
    const upd = await mutateOrders(email, fresh => {
      const next = { ...fresh };
      delete next[email];
      return next;
    });
    if (upd) {
      // 歷史紀錄的筆數／金額要跟著更新；這裡同樣先讀再改，讀不到就跳過不寫
      const r = await loadStrict("history");
      if (r.ok && Array.isArray(r.data)) {
        const h = r.data;
        const monthKey = `${settings.year}_${String(settings.month).padStart(2, "0")}`;
        const idx = h.findIndex((x: any) => x.key === monthKey);
        if (idx >= 0) {
          const list = Object.values(dataEntries(upd)) as Order[];
          h[idx].orderCount = list.length;
          h[idx].totalAmt = list.reduce((s: number, o) => s + o.total, 0);
          await save("history", h);
        }
      } else if (!r.ok) {
        console.warn("update history after delete skipped:", r.error);
      }
    }
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
