import { useState, useEffect, lazy, Suspense } from "react";
import { VERSION, C, T, S, R, TAP, globalCSS, DEFAULT_BULLETIN, DEFAULT_BANK, GAS_URL, INIT_CATS } from "./constants";
import { load, save } from "./utils/storage";
import { isValidEmail, orderKey, nowStr, dataEntries, flatProducts } from "./utils/helpers";
import { emailWrap, itemsTableHtml, genConfirmEmail, genPaymentEmail, genNoticeEmail } from "./utils/email";
import { _saveVersions, _pendingVerify, loadFromGAS, verifySaved } from "./utils/storage";
import { Btn } from "./components/ui";
import { Icon, type IconName } from "./components/Icon";
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
        <div role="dialog" aria-modal="true" aria-labelledby="success-title"
          onClick={e => { if (e.target === e.currentTarget) setSuccessModal(null); }}
          onKeyDown={e => { if (e.key === "Escape") setSuccessModal(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(26,26,26,.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: S[4] }}>
          <div className="pop" style={{ background: C.white, borderRadius: R.lg, padding: S[6], maxWidth: 420, width: "100%", textAlign: "center", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ width: 52, height: 52, borderRadius: R.full, background: "#e6f1ea", display: "flex", alignItems: "center", justifyContent: "center", margin: `0 auto ${S[4]}px` }}>
              <Icon name="check" size={26} color={C.green} strokeWidth={2.6} />
            </div>
            <h2 id="success-title" className="serif" style={{ margin: 0, fontSize: T.lg, fontWeight: 700, color: C.text }}>訂單已送出</h2>
            <p style={{ fontSize: T.base, color: C.sub, lineHeight: 1.7, margin: `${S[2]}px 0 ${S[5]}px` }}>
              {successModal.ordererName}，感謝訂購
            </p>

            <div style={{ background: C.surface, borderRadius: R.md, padding: `${S[4]}px`, marginBottom: S[4], display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: T.sm, color: C.text, fontWeight: 600 }}>合計</span>
              <span className="serif" style={{ fontSize: T.lg, fontWeight: 700, color: C.green }}>NT${successModal.total.toLocaleString()}</span>
            </div>

            <div style={{ display: "flex", gap: S[3], alignItems: "flex-start", background: "#fdf8e9", borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`, marginBottom: S[5], textAlign: "left" }}>
              <Icon name="alert" size={17} color="#8a6914" strokeWidth={2} style={{ marginTop: 2 }} />
              <div style={{ fontSize: T.sm, color: "#6b5310", lineHeight: 1.65 }}>
                確認信已寄至 <strong style={{ color: "#4a3908", wordBreak: "break-all" }}>{successModal.email}</strong>。<br />
                <strong style={{ color: "#4a3908" }}>收到確認信才算訂購成功</strong>，若未收到請查看垃圾信件匣或與我聯繫。
              </div>
            </div>

            <Btn onClick={() => setSuccessModal(null)} color={C.green} full style={{ minHeight: 48, fontSize: T.md }}>完成</Btn>
          </div>
        </div>
      )}

      <div style={{ minHeight: "100vh", background: C.cream }}>
        <div style={{ background: C.green, color: C.white, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(0,0,0,.18)" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: `${S[3]}px ${S[4]}px`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: S[3], flexWrap: "wrap" }}>
            <button onClick={() => setView("shop")} aria-label="回到訂購頁"
              style={{ display: "flex", alignItems: "center", gap: S[2], background: "none", border: "none", padding: 0, cursor: "pointer", color: C.white, textAlign: "left", fontFamily: "inherit" }}>
              <Icon name="leaf" size={20} color="#a8d5ba" strokeWidth={1.6} />
              <span>
                <span className="serif" style={{ display: "block", fontSize: T.md, fontWeight: 700, letterSpacing: ".03em", lineHeight: 1.25 }}>大研生醫 × 團購專區</span>
                <span style={{ display: "block", fontSize: T.xs, color: "#c7e3d2", letterSpacing: ".06em", marginTop: 3 }}>台大 EMBA · 師長 · 好友專屬 <span style={{ opacity: .7, marginLeft: S[1] }}>{VERSION}</span></span>
              </span>
            </button>
            <nav style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
              {([["shop", "訂購", "cart"], ["myorder", "查訂單", "search"], ["admin", "後台", "settings"]] as [string, string, IconName][]).map(([v, l, ic]) => {
                const disabled = v === "myorder" && !isOpen;
                const active = view === v;
                const iconOnly = v === "admin";
                return (
                <button key={v} onClick={() => { if (!disabled) setView(v); }} disabled={disabled}
                  aria-label={iconOnly ? l : undefined} aria-current={active ? "page" : undefined}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: S[2],
                    height: TAP, minWidth: iconOnly ? TAP : undefined, padding: iconOnly ? 0 : `0 ${S[4]}px`,
                    background: active ? C.white : "rgba(255,255,255,.14)",
                    color: active ? C.green : C.white,
                    border: "none", borderRadius: R.md,
                    fontSize: T.base, fontWeight: active ? 600 : 400,
                    fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? .4 : 1, transition: "background .15s",
                  }}>
                  <Icon name={ic} size={17} />
                  {!iconOnly && l}
                </button>
              ); })}
            </nav>
          </div>
        </div>

        {view === "shop" && (
          <div style={{
            background: isOpen ? "#f0f7f3" : "#fdf2ec",
            borderBottom: `1px solid ${isOpen ? "#dfe9e3" : "#f2ddd0"}`,
            padding: `${S[4]}px ${S[4]}px`,
          }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "flex-start", gap: S[3] }}>
              <span style={{
                width: 8, height: 8, borderRadius: R.full, flexShrink: 0, marginTop: 7,
                background: isOpen ? "#2d8a5a" : "#c05621",
                boxShadow: `0 0 0 3px ${isOpen ? "rgba(45,138,90,.18)" : "rgba(192,86,33,.18)"}`,
              }} />
              <div>
                <div className="serif" style={{ fontSize: T.md, fontWeight: 700, color: isOpen ? "#1f5c40" : "#8a3d12", letterSpacing: ".02em" }}>
                  {monthLabel}{isOpen ? "團購進行中" : "的團購已結單"}
                </div>
                <div style={{ fontSize: T.sm, color: isOpen ? "#5a6b62" : "#8a6a55", marginTop: 3, lineHeight: 1.65 }}>
                  {isOpen ? (settings.bulletin || DEFAULT_BULLETIN) : "歡迎期待下一期！"}
                </div>
              </div>
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
export { save, load, loadFromGAS, verifySaved, _saveVersions, _pendingVerify };
