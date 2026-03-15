import { useState, useEffect, useRef } from "react";
import { C } from "../../constants";
import { orderKey } from "../../utils/helpers";
import { save, createBackup, restoreBackup, loadBackupMeta, exportFullBackup, importBackupFile } from "../../utils/storage";
import { Btn } from "../ui";
import { ConfirmModal } from "../ConfirmModal";
import type { Settings, BackupMeta } from "../../types";

interface SystemTabProps {
  settings: Settings;
}

export function SystemTab({ settings }: SystemTabProps) {
  const [meta, setMeta] = useState<BackupMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<string | null>(null);

  useEffect(() => {
    loadBackupMeta().then(m => { setMeta(m); setLoading(false); });
  }, []);

  const doBackup = async () => {
    setBusy(true); setMsg("");
    try {
      const m = await createBackup("手動備份");
      setMeta(m);
      setMsg("✅ 備份完成");
    } catch (e: any) { setMsg("❌ 備份失敗：" + e.message); }
    setBusy(false);
  };

  const doRestore = async () => {
    setBusy(true); setMsg(""); setConfirmRestore(false);
    try {
      await restoreBackup(meta);
      setMsg("✅ 已從備份回復，頁面即將重新整理…");
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) { setMsg("❌ 回復失敗：" + e.message); setBusy(false); }
  };

  const doExport = async () => {
    setBusy(true); setMsg("");
    try {
      const full = await exportFullBackup();
      if (!full) { setMsg("❌ 尚無備份可匯出"); setBusy(false); return; }
      const blob = new Blob([JSON.stringify(full, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `daiken-backup-${full.timestamp || Date.now()}.json`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e: any) { setMsg("❌ 匯出失敗：" + e.message); }
    setBusy(false);
  };

  const doImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        setBusy(true); setMsg("");
        const m = await importBackupFile(data);
        setMeta(m);
        setMsg("✅ 已匯入備份檔，如需套用請點「從備份回復」");
      } catch (err: any) { setMsg("❌ 匯入失敗：" + err.message); }
      setBusy(false);
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const clearOrders = async () => {
    setBusy(true); setResetResult(null);
    const key = orderKey(settings.year, settings.month);
    await save(key, {}); localStorage.removeItem(key);
    setResetResult(`已清除 ${settings.year}年${settings.month}月 的訂單`);
    setBusy(false); setConfirmTarget(null);
  };
  const clearCustomers = async () => {
    setBusy(true); setResetResult(null);
    await save("customers", {}); localStorage.removeItem("customers");
    setResetResult("已清除所有訂購人資訊");
    setBusy(false); setConfirmTarget(null);
  };
  const clearHistory = async () => {
    setBusy(true); setResetResult(null);
    await save("history", {}); localStorage.removeItem("history");
    setResetResult("已清除歷史訂單");
    setBusy(false); setConfirmTarget(null);
  };
  const clearAll = async () => {
    setBusy(true); setResetResult(null);
    const key = orderKey(settings.year, settings.month);
    await Promise.all([save(key, {}), save("customers", {}), save("history", {})]);
    localStorage.removeItem(key); localStorage.removeItem("customers"); localStorage.removeItem("history");
    setResetResult("已清除本月訂單、訂購人資訊、歷史訂單（產品目錄與設定保留）");
    setBusy(false); setConfirmTarget(null);
  };
  const clearLocalOnly = () => { localStorage.clear(); window.location.reload(); };

  const resetTargets: Record<string, { msg: string; action: () => void }> = {
    orders: { msg: `確定清除 ${settings.year}年${settings.month}月 的所有訂單？（同時清除本機與 Google Sheets）`, action: clearOrders },
    customers: { msg: "確定清除所有訂購人資訊？（同時清除本機與 Google Sheets）", action: clearCustomers },
    history: { msg: "確定清除所有歷史訂單？（同時清除本機與 Google Sheets）", action: clearHistory },
    all: { msg: "確定清除所有測試資料（本月訂單＋訂購人＋歷史）？產品目錄與系統設定會保留。", action: clearAll },
    local: { msg: "確定清除本機快取？頁面將重新整理，資料會從 Google Sheets 重新載入。", action: clearLocalOnly },
  };
  const btnStyle = { fontSize: "0.82rem", padding: "7px 14px" };

  if (loading) return <div style={{ color: C.muted, padding: 20 }}>載入中…</div>;

  return (
    <div style={{ maxWidth: 600 }}>
      {confirmRestore && <ConfirmModal msg="確定從備份回復？目前的資料將被備份中的資料覆蓋，此操作無法復原。" onOk={doRestore} onCancel={() => setConfirmRestore(false)} />}
      {confirmTarget && <ConfirmModal msg={resetTargets[confirmTarget].msg} onOk={resetTargets[confirmTarget].action} onCancel={() => setConfirmTarget(null)} />}

      <div className="serif" style={{ fontSize: "0.97rem", fontWeight: 700, marginBottom: 14 }}>💾 資料備份</div>
      <p style={{ fontSize: "0.82rem", color: C.muted, marginBottom: 16, lineHeight: 1.7 }}>
        系統會在每次結單時自動備份（僅保留最新一份）。您也可以手動備份或匯出備份檔至本機。
      </p>
      {msg && <div style={{ background: msg.startsWith("✅") ? C.gp : "#fff5f5", border: `1px solid ${msg.startsWith("✅") ? C.gl : "#feb2b2"}`, borderRadius: 9, padding: "10px 15px", fontSize: "0.83rem", color: msg.startsWith("✅") ? C.green : C.red, marginBottom: 14 }}>{msg}</div>}
      {meta && (
        <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "14px 18px", marginBottom: 18 }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>📋 最新備份</div>
          <div style={{ fontSize: "0.8rem", color: C.muted, lineHeight: 1.8 }}>
            <div>備份時間：{meta.createdAt}</div>
            <div>備份標籤：{meta.label}</div>
            <div>版本：{meta.version || "未知"}</div>
          </div>
        </div>
      )}
      {!meta && <div style={{ background: C.cream, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "14px 18px", marginBottom: 18, fontSize: "0.83rem", color: C.muted, textAlign: "center" }}>尚無備份紀錄</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <Btn onClick={doBackup} disabled={busy} color={C.green}>{busy ? "備份中…" : "📥 手動備份"}</Btn>
        {meta && <Btn onClick={doExport} disabled={busy} color={C.gold} outline>📤 匯出備份檔</Btn>}
        {meta && <Btn onClick={() => setConfirmRestore(true)} disabled={busy} color={C.red} outline>♻️ 從備份回復</Btn>}
      </div>
      <div>
        <input ref={fileRef} type="file" accept=".json" onChange={doImport} style={{ display: "none" }} />
        <Btn onClick={() => fileRef.current?.click()} disabled={busy} color={C.muted} outline>📂 從檔案匯入備份</Btn>
      </div>

      <div style={{ marginTop: 28, paddingTop: 20, borderTop: `2px solid ${C.border}` }}>
        <div className="serif" style={{ fontSize: "0.97rem", fontWeight: 700, marginBottom: 8, color: C.red }}>🧹 清除測試資料</div>
        <p style={{ fontSize: "0.82rem", color: C.muted, marginBottom: 14, lineHeight: 1.7 }}>
          選擇要清除的資料範圍。「本機＋雲端」會同時清除 localStorage 和 Google Sheets。
        </p>
        {resetResult && <div style={{ background: C.gp, border: `1px solid ${C.gl}`, borderRadius: 9, padding: "10px 15px", fontSize: "0.83rem", color: C.green, marginBottom: 14 }}>✅ {resetResult}</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <Btn color={C.red} outline disabled={busy} style={btnStyle} onClick={() => setConfirmTarget("orders")}>🗑 清除本月訂單</Btn>
          <Btn color={C.red} outline disabled={busy} style={btnStyle} onClick={() => setConfirmTarget("customers")}>🗑 清除訂購人</Btn>
          <Btn color={C.red} outline disabled={busy} style={btnStyle} onClick={() => setConfirmTarget("history")}>🗑 清除歷史訂單</Btn>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Btn color={C.red} disabled={busy} onClick={() => setConfirmTarget("all")}>{busy ? "清除中…" : "⚠️ 一鍵清除所有測試資料"}</Btn>
          <Btn color={C.muted} outline disabled={busy} style={btnStyle} onClick={() => setConfirmTarget("local")}>🔄 僅清除本機快取</Btn>
        </div>
      </div>
    </div>
  );
}
