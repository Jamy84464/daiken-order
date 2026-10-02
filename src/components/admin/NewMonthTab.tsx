import { useState } from "react";
import { C } from "../../constants";
import { orderKey, dataEntries } from "../../utils/helpers";
import { save, loadStrict } from "../../utils/storage";
import { Btn, Field, TextInput, SelInput } from "../ui";
import { ConfirmModal } from "../ConfirmModal";
import type { Settings } from "../../types";

interface NewMonthTabProps {
  settings: Settings;
  setSettings: (s: Settings) => void;
}

export function NewMonthTab({ settings, setSettings }: NewMonthTabProps) {
  const [year, setYear] = useState(settings.year);
  const [month, setMonth] = useState(settings.month + 1 > 12 ? 1 : settings.month + 1);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [checking, setChecking] = useState(false);
  const [blockReason, setBlockReason] = useState("");

  const checkAndConfirm = async () => {
    setChecking(true);
    setBlockReason("");
    const curKey = orderKey(settings.year, settings.month);
    const r = await loadStrict(curKey);
    setChecking(false);
    // 讀不到就不能放行：原本 load() 失敗會回 {}，未處理訂單數變 0，
    // 這道「請先結單」的防線等於自動通過。
    if (!r.ok) {
      setBlockReason(`無法讀取目前月份的訂單（${r.error}），為避免誤判請稍後再試。`);
      return;
    }
    const pendingList = Object.values(dataEntries(r.data || {})).filter((o: any) => o.status !== "handled");
    if (settings.isOpen && pendingList.length > 0) {
      setBlockReason(`目前 ${settings.year}年${settings.month}月 還有 ${pendingList.length} 筆訂單未處理，請先結單後再開啟新月份。`);
      return;
    }
    setConfirm(true);
  };

  const start = async () => {
    const s = { ...settings, year: Number(year), month: Number(month), isOpen: true };
    await save("settings", s);
    setSettings(s);
    setConfirm(false);
    setDone(true);
    setBlockReason("");
  };

  return (
    <div style={{ maxWidth: 440 }}>
      {confirm && <ConfirmModal msg={`開始 ${year}年${month}月 的團購？`} onOk={start} onCancel={() => setConfirm(false)} />}
      <div className="serif" style={{ fontSize: "0.97rem", fontWeight: 700, marginBottom: 14 }}>🗓 開始新月份團購</div>
      {done && <div style={{ background: C.gp, border: `1px solid ${C.gl}`, borderRadius: 9, padding: "10px 15px", fontSize: "0.83rem", color: C.green, marginBottom: 14 }}>✅ 已開始 {year}年{month}月的團購！首頁已切換。</div>}
      {blockReason && <div style={{ background: "#fff5f5", border: `1px solid #feb2b2`, borderRadius: 9, padding: "10px 15px", fontSize: "0.83rem", color: C.red, marginBottom: 14 }}>⚠️ {blockReason}</div>}
      <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
        <p style={{ fontSize: "0.83rem", color: C.muted, marginBottom: 16, lineHeight: 1.8 }}>
          目前是 <strong>{settings.year}年{settings.month}月</strong>｜{settings.isOpen ? "🟢 訂購中" : "🔴 已結單"}<br />
          <span style={{ fontSize: "0.78rem" }}>⚠️ 若目前月份有未結單訂單，無法開啟新月份。<br />可開啟過去月份（作為測試用）。</span>
        </p>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <Field label="年份">
              <TextInput value={String(year)} onChange={v => setYear(parseInt(v) || year)} type="number" />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="月份">
              <SelInput value={String(month)} onChange={v => setMonth(parseInt(v))} options={Array.from({ length: 12 }, (_, i) => ({ v: String(i + 1), l: `${i + 1}月` }))} />
            </Field>
          </div>
        </div>
        <Btn onClick={checkAndConfirm} disabled={checking} full color={C.green}>
          {checking ? "檢查中…" : `🚀 開始 ${year}年${month}月的團購`}
        </Btn>
      </div>
    </div>
  );
}
