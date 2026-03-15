import { useState, useEffect, useMemo } from "react";
import { C } from "../../constants";
import { flatProducts, dataEntries } from "../../utils/helpers";
import { load } from "../../utils/storage";
import type { Category, HistoryEntry, Order } from "../../types";

interface HistoryTabProps {
  cats: Category[];
}

export function HistoryTab({ cats }: HistoryTabProps) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [monthOrders, setMonthOrders] = useState<Record<string, Record<string, Order>>>({});
  const fp = useMemo(() => flatProducts(cats), [cats]);
  useEffect(() => { load("history").then(h => setHistory(h || [])); }, []);

  const expand = async (month: string) => {
    if (expanded === month) { setExpanded(null); return; }
    setExpanded(month);
    const orders = (await load(`orders_${month}`)) || {};
    setMonthOrders(prev => ({ ...prev, [month]: orders }));
  };

  if (!history) return <div style={{ color: C.muted, padding: 20 }}>載入中…</div>;
  if (history.length === 0) return <div style={{ color: C.muted, textAlign: "center", padding: 32 }}>尚無歷史結單紀錄</div>;

  return (
    <div>
      <div className="serif" style={{ fontSize: "0.97rem", fontWeight: 700, marginBottom: 14 }}>📚 歷史訂單</div>
      {history.sort((a, b) => b.closedAt.localeCompare(a.closedAt)).map(h => (
        <div key={h.key} style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
          <div onClick={() => expand(h.key)} style={{ padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: C.cream }}>
            <span className="serif" style={{ fontWeight: 600 }}>{h.year}年{h.month}月｜{h.orderCount}筆訂單｜NT${h.totalAmt.toLocaleString()}</span>
            <span style={{ color: C.muted, fontSize: "0.85rem" }}>{expanded === h.key ? "▲" : "▼"}</span>
          </div>
          {expanded === h.key && monthOrders[h.key] && (
            <div style={{ padding: "10px 16px" }}>
              {Object.values(dataEntries(monthOrders[h.key])).map((o: any) => (
                <div key={o.email} style={{ borderBottom: `1px solid ${C.border}`, padding: "8px 0", fontSize: "0.82rem" }}>
                  <span style={{ fontWeight: 600 }}>{o.ordererName}</span>
                  <span style={{ color: C.muted, marginLeft: 8 }}>{o.email}</span>
                  <span style={{ color: C.green, fontWeight: 600, marginLeft: 8 }}>NT${o.total.toLocaleString()}</span>
                  <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {Object.entries(o.cart).filter(([, q]: any) => q > 0).map(([id, q]: any) => { const p = fp[id]; return p && <span key={id} style={{ background: C.gp, color: C.green, borderRadius: 5, padding: "1px 6px", fontSize: "0.73rem" }}>{p.name}×{q}</span>; })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
