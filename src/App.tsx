import { useState, useEffect, lazy, Suspense } from "react";
import { VERSION, C, globalCSS, DEFAULT_BULLETIN, DEFAULT_BANK, GAS_URL, INIT_CATS } from "./constants";
import { load, save } from "./utils/storage";
import { isValidEmail, orderKey, nowStr, dataEntries, flatProducts } from "./utils/helpers";
import { emailWrap, itemsTableHtml, genConfirmEmail, genPaymentEmail, genNoticeEmail } from "./utils/email";
import { _saveVersions, _pendingVerify } from "./utils/storage";
import { Btn } from "./components/ui";
import { EmailModal } from "./components/EmailModal";
import { SyncStatus } from "./components/SyncStatus";
import { Toast } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ShopView } from "./components/ShopView";
import { MyOrderView } from "./components/MyOrderView";
import type { Settings, Category, Order } from "./types";

const AdminView = lazy(() => import("./components/AdminView").then(m => ({ default: m.AdminView })));

function App() {
  const [view, setView] = useState("shop");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [cats, setCats] = useState<Category[] | null>(null);
  const [successModal, setSuccessModal] = useState<Order | null>(null);
  const [emailModal, setEmailModal] = useState<{ title: string; content: string } | null>(null);

  useEffect(() => {
    document.title = "大研生醫團購";
    try {
      const cachedSettings = localStorage.getItem("settings");
      if (cachedSettings) setSettings(JSON.parse(cachedSettings));
    } catch {}
    try {
      const cachedCats = localStorage.getItem("cats");
      if (cachedCats) setCats(JSON.parse(cachedCats));
    } catch {}

    (async () => {
      // 平行載入 settings 和 cats，減少等待時間
      const [s, loadedCats] = await Promise.all([
        (async () => {
          let s = await load("settings");
          if (!s) {
            const now = new Date();
            s = { year: now.getFullYear(), month: now.getMonth() + 1, isOpen: true, bulletin: DEFAULT_BULLETIN, bank: DEFAULT_BANK };
            await save("settings", s);
          }
          return s;
        })(),
        (async () => {
          try {
            const res = await fetch(`${GAS_URL}?action=getCats`);
            const json = await res.json();
            if (json.success && json.value) return JSON.parse(json.value);
          } catch (e) { console.warn("getCats from sheet failed, using cache"); }
          const savedCats = await load("cats");
          return savedCats || INIT_CATS;
        })(),
      ]);

      setSettings(s);
      try { localStorage.setItem("settings", JSON.stringify(s)); } catch {}
      setCats(loadedCats);
      try { localStorage.setItem("cats", JSON.stringify(loadedCats)); } catch {}
    })();
  }, []);

  const handleOrderSuccess = (order: Order) => {
    setSuccessModal(order);
  };

  if (!settings || !cats) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: C.muted }}>載入中…</div>;

  const isOpen = settings.isOpen;
  const monthLabel = `${settings.year}年${settings.month}月`;

  return (
    <>
      <style>{globalCSS}</style>
      {emailModal && <EmailModal title={emailModal.title} content={emailModal.content} onClose={() => setEmailModal(null)} />}
      {successModal && !emailModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="pop" style={{ background: C.white, borderRadius: 18, padding: 30, maxWidth: 420, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: "2.8rem", marginBottom: 10 }}>🎉</div>
            <div className="serif" style={{ fontSize: "1.2rem", fontWeight: 700, color: C.green, marginBottom: 10 }}>訂單已送出！</div>
            <div style={{ fontSize: "0.85rem", color: C.muted, lineHeight: 2, marginBottom: 18 }}>
              <strong style={{ color: C.text }}>{successModal.ordererName}</strong> 感謝訂購！<br />
              合計 <strong style={{ color: C.green }}>NT${successModal.total.toLocaleString()}</strong><br />
              確認信將寄至 <strong>{successModal.email}</strong>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <Btn onClick={() => setSuccessModal(null)} color={C.green}>關閉</Btn>
            </div>
          </div>
        </div>
      )}

      <div style={{ minHeight: "100vh", background: C.cream }}>
        <div style={{ background: C.green, color: C.white, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(0,0,0,.18)" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div onClick={() => setView("shop")} style={{ cursor: "pointer" }}>
              <div className="serif" style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: ".04em" }}>🌿 大研生醫 × 團購專區</div>
              <div style={{ fontSize: "0.7rem", opacity: .75, letterSpacing: ".08em", marginTop: 2 }}>台大EMBA · 師長 · 好友 專屬 <span style={{ opacity: .6, marginLeft: 6 }}>{VERSION}</span></div>
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {([["shop", "🛒 訂購"], ["myorder", "🔍 查詢/修改訂單"], ["admin", "⚙️ 後台"]] as [string, string][]).map(([v, l]) => {
                const disabled = v === "myorder" && !isOpen;
                return (
                <button key={v} onClick={() => { if (!disabled) setView(v); }} style={{
                  background: view === v ? "rgba(255,255,255,.25)" : "rgba(255,255,255,.12)",
                  color: C.white, border: `1px solid rgba(255,255,255,${view === v ? .4 : .2})`,
                  borderRadius: 8, padding: "7px 13px", fontSize: "0.8rem", cursor: disabled ? "not-allowed" : "pointer",
                  fontFamily: "'Noto Sans TC',sans-serif", fontWeight: view === v ? 600 : 400,
                  opacity: disabled ? .4 : 1,
                }}>{l}</button>
              ); })}
            </div>
          </div>
        </div>

        {view === "shop" && (
          <div style={{ background: isOpen ? "linear-gradient(135deg,#1b4332,#2d6a4f)" : "linear-gradient(135deg,#7b341e,#c05621)", color: C.white, padding: "12px 20px", textAlign: "center" }}>
            <div className="serif" style={{ fontSize: "1.05rem", fontWeight: 700, letterSpacing: ".05em" }}>{isOpen ? "🟢" : "🔴"} {monthLabel}的團購{isOpen ? "" : "已結單"}</div>
            <div style={{ fontSize: "0.8rem", opacity: .85, marginTop: 6, lineHeight: 1.7 }}>
              {isOpen ? (settings.bulletin || DEFAULT_BULLETIN)
              : `歡迎期待下一期！`}
            </div>
          </div>
        )}

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "22px 16px" }}>
          {view === "shop" && (
            isOpen
              ? <ShopView settings={settings} cats={cats} onOrderSuccess={handleOrderSuccess} />
              : <div style={{ textAlign: "center", padding: "60px 20px" }}>
                  <div style={{ fontSize: "3rem", marginBottom: 12 }}>📦</div>
                  <div className="serif" style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 8 }}>{monthLabel}的團購已結單</div>
                  <div style={{ color: C.muted, fontSize: "0.88rem" }}>歡迎期待下一期，如有問題請聯絡 <a href="mailto:jamy844.bot@gmail.com" style={{ color: C.gl }}>jamy844.bot@gmail.com</a></div>
                </div>
          )}
          {view === "myorder" && <MyOrderView settings={settings} cats={cats} />}
          {view === "admin" && <Suspense fallback={<div style={{ textAlign: "center", padding: 40, color: C.muted }}>載入中…</div>}><AdminView settings={settings} setSettings={setSettings} cats={cats} setCats={setCats} /></Suspense>}
        </div>
      </div>
      <SyncStatus />
      <Toast />
    </>
  );
}

function AppWithBoundary() {
  return <ErrorBoundary><App /></ErrorBoundary>;
}

export { AppWithBoundary as default };

// ── TEST EXPORTS（僅供單元測試使用）────────────────────────────────────────────
export { isValidEmail, orderKey, nowStr, dataEntries, flatProducts };
export { emailWrap, itemsTableHtml, genConfirmEmail, genPaymentEmail, genNoticeEmail };
export { save, load, _saveVersions, _pendingVerify };
