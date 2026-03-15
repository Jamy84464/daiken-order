import { useState } from "react";
import { C, GAS_URL } from "../constants";
import { showToast } from "../utils/toast";
import { Btn, Field, TextInput } from "./ui";
import { BulletinTab } from "./admin/BulletinTab";
import { ProductsTab } from "./admin/ProductsTab";
import { OrdersTab } from "./admin/OrdersTab";
import { HistoryTab } from "./admin/HistoryTab";
import { CustomersTab } from "./admin/CustomersTab";
import { CloseoutTab } from "./admin/CloseoutTab";
import { EmailsTab } from "./admin/EmailsTab";
import { NewMonthTab } from "./admin/NewMonthTab";
import { SystemTab } from "./admin/SystemTab";
import type { Settings, Category } from "../types";

interface AdminViewProps {
  settings: Settings;
  setSettings: (s: Settings) => void;
  cats: Category[];
  setCats: (cats: Category[]) => void;
}

export function AdminView({ settings, setSettings, cats, setCats }: AdminViewProps) {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [tab, setTab] = useState("orders");

  const login = async () => {
    if (!pw.trim()) return;
    setLoggingIn(true);
    try {
      const res = await fetch(`${GAS_URL}?action=verifyAdmin&pw=${encodeURIComponent(pw)}`);
      const json = await res.json();
      if (json.success && json.authed) { setAuthed(true); }
      else { showToast("密碼錯誤"); }
    } catch (e) {
      showToast("驗證失敗，請確認網路連線");
    }
    setLoggingIn(false);
  };

  if (!authed) return (
    <div style={{ maxWidth: 340, margin: "40px auto" }}>
      <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 16, padding: 28, boxShadow: "0 4px 20px rgba(0,0,0,.07)" }}>
        <div className="serif" style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 20, textAlign: "center" }}>🔐 管理員登入</div>
        <Field label="密碼" required><TextInput value={pw} onChange={setPw} type="password" placeholder="請輸入密碼" /></Field>
        <Btn onClick={login} disabled={loggingIn} full>{loggingIn ? "驗證中…" : "登入"}</Btn>
      </div>
    </div>
  );

  const tabs = [
    { k: "orders", l: "📋 本月訂單" },
    { k: "closeout", l: "🚚 結單送貨" },
    { k: "emails", l: "✉️ 寄送信件" },
    { k: "history", l: "📚 歷史訂單" },
    { k: "customers", l: "👥 訂購人資訊" },
    { k: "bulletin", l: "📢 公布欄" },
    { k: "products", l: "📦 產品管理" },
    { k: "newmonth", l: "🗓 新月份" },
    { k: "system", l: "⚙️ 系統設定" },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <span className="serif" style={{ fontSize: "1.1rem", fontWeight: 700 }}>⚙️ 管理後台</span>
        <span style={{ fontSize: "0.8rem", color: C.muted, background: C.gp, padding: "3px 10px", borderRadius: 8 }}>
          {settings.year}年{settings.month}月｜{settings.isOpen ? "🟢 訂購中" : "🔴 已結單"}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18, borderBottom: `2px solid ${C.border}`, paddingBottom: 12 }}>
        {tabs.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            background: tab === t.k ? C.green : C.white, color: tab === t.k ? C.white : C.muted,
            border: `1.5px solid ${tab === t.k ? C.green : C.border}`, borderRadius: 9,
            padding: "6px 13px", fontSize: "0.8rem", cursor: "pointer", transition: "all .15s",
          }}>{t.l}</button>
        ))}
      </div>

      {tab === "bulletin" && <BulletinTab settings={settings} setSettings={setSettings} />}
      {tab === "products" && <ProductsTab cats={cats} setCats={setCats} />}
      {tab === "orders" && <OrdersTab settings={settings} cats={cats} />}
      {tab === "history" && <HistoryTab cats={cats} />}
      {tab === "customers" && <CustomersTab />}
      {tab === "closeout" && <CloseoutTab settings={settings} setSettings={setSettings} cats={cats} />}
      {tab === "emails" && <EmailsTab settings={settings} cats={cats} />}
      {tab === "newmonth" && <NewMonthTab settings={settings} setSettings={setSettings} />}
      {tab === "system" && <SystemTab settings={settings} />}
    </div>
  );
}
