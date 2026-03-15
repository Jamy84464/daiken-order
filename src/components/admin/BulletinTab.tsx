import { useState } from "react";
import { C, DEFAULT_BULLETIN, DEFAULT_BANK } from "../../constants";
import { save } from "../../utils/storage";
import { Btn, Field, TextInput, TextArea } from "../ui";
import type { Settings, BankInfo } from "../../types";

interface BulletinTabProps {
  settings: Settings;
  setSettings: (s: Settings) => void;
}

export function BulletinTab({ settings, setSettings }: BulletinTabProps) {
  const [text, setText] = useState(settings.bulletin || DEFAULT_BULLETIN);
  const [saved, setSaved] = useState(false);
  const save_ = async () => {
    const s = { ...settings, bulletin: text };
    await save("settings", s); setSettings(s); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div style={{ maxWidth: 560 }}>
      <div className="serif" style={{ fontSize: "0.97rem", fontWeight: 700, marginBottom: 14 }}>📢 公布欄內容</div>
      <p style={{ fontSize: "0.83rem", color: C.muted, marginBottom: 12, lineHeight: 1.7 }}>此文字會顯示在訂購頁面頂部。</p>
      <TextArea value={text} onChange={setText} rows={4} />
      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <Btn onClick={save_}>儲存</Btn>
        {saved && <span style={{ color: C.gl, fontSize: "0.82rem" }}>✅ 已儲存</span>}
      </div>
      <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
        <div className="serif" style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 12 }}>🏦 匯款帳戶資訊</div>
        {(["bankName", "bankCode", "accountName", "account"] as (keyof BankInfo)[]).map(k => (
          <Field key={k} label={k === "bankName" ? "銀行名稱" : k === "bankCode" ? "銀行代碼" : k === "accountName" ? "戶名" : "帳號"}>
            <TextInput value={{ ...DEFAULT_BANK, ...(settings.bank || {}) }[k]} onChange={v => {
              const s = { ...settings, bank: { ...DEFAULT_BANK, ...(settings.bank || {}), [k]: v } };
              save("settings", s); setSettings(s);
            }} />
          </Field>
        ))}
      </div>
    </div>
  );
}
