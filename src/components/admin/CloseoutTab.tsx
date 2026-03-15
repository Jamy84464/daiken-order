import { useState, useEffect, useMemo } from "react";
import { C, GAS_URL, WRITE_TOKEN } from "../../constants";
import { flatProducts, orderKey, nowStr, dataEntries } from "../../utils/helpers";
import { load, save, createBackup } from "../../utils/storage";
import { Btn } from "../ui";
import { ConfirmModal } from "../ConfirmModal";
import type { Settings, Category, Order } from "../../types";

interface CloseoutTabProps {
  settings: Settings;
  setSettings: (s: Settings) => void;
  cats: Category[];
}

export function CloseoutTab({ settings, setSettings, cats }: CloseoutTabProps) {
  const [orders, setOrders] = useState<Record<string, Order> | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const fp = useMemo(() => flatProducts(cats), [cats]);

  useEffect(() => {
    const key = orderKey(settings.year, settings.month);
    load(key).then(o => setOrders(o || {}));
  }, [settings]);

  const doCloseout = async () => {
    const s = { ...settings, isOpen: false };
    await save("settings", s); setSettings(s);
    const h = (await load("history")) || [];
    const monthKey = `${settings.year}_${String(settings.month).padStart(2, "0")}`;
    if (!h.find((x: any) => x.key === monthKey)) {
      const list = Object.values(dataEntries(orders || {})) as Order[];
      h.push({ key: monthKey, year: settings.year, month: settings.month, closedAt: nowStr(), orderCount: list.length, totalAmt: list.reduce((s: number, o) => s + o.total, 0) });
      await save("history", h);
    }
    try { await createBackup(`結單自動備份 ${settings.year}年${settings.month}月`); } catch (e) { console.warn("auto backup on closeout:", e); }
    setConfirm(false); setDone(true);
  };

  const genCloseoutRows = () => {
    const rows: any[][] = [];
    Object.values(dataEntries(orders || {})).forEach((o: any) => {
      const entries = Object.entries(o.cart).filter(([, q]: any) => q > 0);
      entries.forEach(([id, q]: any, i: number) => {
        const p = fp[id];
        if (p) rows.push([
          p.name, q, p.price * q, "",
          i === 0 ? o.recipientName : "",
          i === 0 ? o.recipientPhone : "",
          i === 0 ? o.recipientAddress : "",
          "",
          i === 0 ? o.ordererName : ""
        ]);
      });
    });
    return rows;
  };

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");

  const exportToSheet = async () => {
    setExporting(true); setExportMsg("");
    try {
      const rows = genCloseoutRows();
      const sheetName = `結單表_${settings.year}_${String(settings.month).padStart(2, "0")}`;
      const params = new URLSearchParams();
      params.append("action", "syncCloseout");
      params.append("sheetName", sheetName);
      params.append("value", JSON.stringify(rows));
      params.append("token", WRITE_TOKEN || "");
      await fetch(GAS_URL || "", { method: "POST", mode: "no-cors", body: params });
      setExportMsg(`✅ 已匯出到「${sheetName}」工作表！請到 Google Sheets 確認。`);
    } catch (e) {
      setExportMsg("❌ 匯出失敗，請確認 Apps Script 已部署");
    }
    setExporting(false);
  };

  if (!orders) return <div style={{ color: C.muted, padding: 20 }}>載入中…</div>;
  const list = Object.values(dataEntries(orders)) as Order[];

  return (
    <div style={{ maxWidth: 700 }}>
      {confirm && <ConfirmModal msg={`確定結單 ${settings.year}年${settings.month}月 的團購？結單後訂購者無法修改訂單。`} onOk={doCloseout} onCancel={() => setConfirm(false)} />}
      <div className="serif" style={{ fontSize: "0.97rem", fontWeight: 700, marginBottom: 14 }}>🚚 結單送貨</div>
      {done && <div style={{ background: C.gp, border: `1px solid ${C.gl}`, borderRadius: 9, padding: "10px 15px", fontSize: "0.83rem", color: C.green, marginBottom: 14 }}>✅ 已結單！首頁將顯示「{settings.year}年{settings.month}月的團購已結單」</div>}
      {exportMsg && <div style={{ background: exportMsg.startsWith("✅") ? C.gp : "#fff5f5", border: `1px solid ${exportMsg.startsWith("✅") ? C.gl : "#feb2b2"}`, borderRadius: 9, padding: "10px 15px", fontSize: "0.83rem", color: exportMsg.startsWith("✅") ? C.green : C.red, marginBottom: 14 }}>{exportMsg}</div>}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        {settings.isOpen && <Btn onClick={() => setConfirm(true)} color={C.red}>🔒 執行結單</Btn>}
        {!settings.isOpen && <div style={{ background: "#fff5f5", border: `1px solid #feb2b2`, borderRadius: 8, padding: "9px 14px", fontSize: "0.82rem", color: C.red }}>本月已結單</div>}
        <Btn onClick={exportToSheet} disabled={exporting} color={C.gold} outline>{exporting ? "匯出中…" : "📊 結單表轉檔（匯出到 Google Sheets）"}</Btn>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: "0.78rem", width: "100%", background: C.white, borderRadius: 10, overflow: "hidden" }}>
          <thead>
            <tr style={{ background: C.green, color: C.white }}>
              {["商品名稱", "數量(盒)", "總金額(含運)", "", "收件人姓名", "收件人電話", "收件人住址", "備註", "訂購人姓名"].map((h, i) => (
                <th key={i} style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? <tr><td colSpan={9} style={{ textAlign: "center", padding: 20, color: C.muted }}>尚無訂單</td></tr>
            : (() => { let gi = 0; return list.map((o, oi) => {
              const items = Object.entries(o.cart).filter(([, q]) => q > 0);
              const bgColor = gi % 2 === 0 ? "#dce6f1" : "#ffffff";
              const isLast = oi === list.length - 1;
              gi++;
              return items.map(([id, q], i) => { const p = fp[id]; return p && (
                <tr key={o.email + id} style={{ background: bgColor, ...(i === items.length - 1 && !isLast ? { borderBottom: "2.5px solid #333" } : { borderBottom: `1px solid ${C.border}` }) }}>
                  <td style={{ padding: "7px 10px" }}>{p.name}</td>
                  <td style={{ padding: "7px 10px", textAlign: "center" }}>{q}</td>
                  <td style={{ padding: "7px 10px", fontWeight: 600, color: C.green }}>NT${(p.price * q).toLocaleString()}</td>
                  <td style={{ padding: "7px 10px" }}></td>
                  <td style={{ padding: "7px 10px" }}>{i === 0 ? o.recipientName : ""}</td>
                  <td style={{ padding: "7px 10px" }}>{i === 0 ? o.recipientPhone : ""}</td>
                  <td style={{ padding: "7px 10px", maxWidth: 180, wordBreak: "break-all" }}>{i === 0 ? o.recipientAddress : ""}</td>
                  <td style={{ padding: "7px 10px", color: C.muted }}></td>
                  <td style={{ padding: "7px 10px" }}>{i === 0 ? o.ordererName : ""}</td>
                </tr>
              ); });
            }); })()
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
