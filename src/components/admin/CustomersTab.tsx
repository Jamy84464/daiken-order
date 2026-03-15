import { useState, useEffect } from "react";
import { C } from "../../constants";
import { dataEntries } from "../../utils/helpers";
import { load, save } from "../../utils/storage";
import { showToast } from "../../utils/toast";
import { Btn, TextInput } from "../ui";
import { ConfirmModal } from "../ConfirmModal";
import type { Customer } from "../../types";

export function CustomersTab() {
  const [customers, setCustomers] = useState<Record<string, Customer> | null>(null);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  useEffect(() => { load("customers").then(c => setCustomers(c || {})); }, []);

  const deleteCustomer = async (email: string) => {
    if (!customers) return;
    setBusyDelete(true);
    const updated = { ...customers };
    delete updated[email];
    await save("customers", updated);
    setCustomers(updated);
    setConfirmDelete(null);
    setBusyDelete(false);
    showToast("已刪除", "success");
  };

  if (!customers) return <div style={{ color: C.muted, padding: 20 }}>載入中…</div>;
  const list = Object.values(dataEntries(customers)).filter((c: any) => !search || (c.name + c.email + c.phone).includes(search)) as Customer[];

  return (
    <div>
      {confirmDelete && <ConfirmModal msg={`確定刪除「${customers[confirmDelete]?.name || confirmDelete}」的訂購人資料？此操作無法復原。`} onOk={() => deleteCustomer(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="serif" style={{ fontSize: "0.97rem", fontWeight: 700 }}>👥 訂購人資料庫</div>
        <span style={{ fontSize: "0.8rem", color: C.muted }}>共 {Object.keys(dataEntries(customers)).length} 人</span>
      </div>
      <div style={{ marginBottom: 14 }}><TextInput value={search} onChange={setSearch} placeholder="搜尋姓名、email、手機…" /></div>
      {list.length === 0 ? <div style={{ color: C.muted, textAlign: "center", padding: 24 }}>查無資料</div>
      : list.sort((a, b) => a.name.localeCompare(b.name)).map(c => (
        <div key={c.email} style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "11px 15px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <span className="serif" style={{ fontWeight: 600, fontSize: "0.93rem" }}>{c.name}</span>
            <span style={{ fontSize: "0.8rem", color: C.muted, marginLeft: 8 }}>{c.email}</span>
            <span style={{ fontSize: "0.78rem", color: C.muted, marginLeft: 8 }}>{c.phone}</span>
            {c.lineId && <span style={{ fontSize: "0.78rem", color: C.muted, marginLeft: 8 }}>LINE: {c.lineId}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: "0.78rem", color: C.muted, textAlign: "right" }}>
              <div>{c.relation}｜最近訂購：{c.lastOrder}</div>
              <div>累計訂購 {c.orderCount} 次</div>
            </div>
            <button onClick={() => setConfirmDelete(c.email)} disabled={busyDelete}
              style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: "1rem", padding: "4px 6px", borderRadius: 6, opacity: busyDelete ? 0.4 : 0.6, transition: "opacity .15s" }}
              onMouseEnter={e => { if (!busyDelete) e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = busyDelete ? "0.4" : "0.6"; }}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
