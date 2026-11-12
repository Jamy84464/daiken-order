import { useState, useEffect, lazy, Suspense } from "react";
import { C, T, S, R, E, TAP, VERSION, APP_NAME, globalCSS } from "./constants";
import { fetchPublicConfig } from "./utils/api";
import { Toast } from "./components/Toast";
import { SubmitView } from "./components/SubmitView";
import { TrackView } from "./components/TrackView";
import { useIsMobile } from "./hooks/useIsMobile";
import type { PublicConfig } from "./types";

const AdminView = lazy(() => import("./components/AdminView").then(m => ({ default: m.AdminView })));

type View = "submit" | "track" | "admin";
const CONFIG_CACHE = "hp_config";

function App() {
  const isMobile = useIsMobile();
  const [view, setView] = useState<View>(() => (window.location.hash === "#admin" ? "admin" : "submit"));
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [trackCode, setTrackCode] = useState<string | undefined>();

  useEffect(() => {
    document.title = APP_NAME;
    try {
      const cached = localStorage.getItem(CONFIG_CACHE);
      if (cached) setConfig(JSON.parse(cached));
    } catch {}
    (async () => {
      let c: PublicConfig | null = null;
      try { c = await fetchPublicConfig(); } catch { console.warn("getPublicConfig failed, using cache"); }
      if (c) {
        setConfig(c);
        try { localStorage.setItem(CONFIG_CACHE, JSON.stringify(c)); } catch {}
      } else {
        // 讀不到設定也讓同仁可以填寫；是否收件由伺服器在送出時判斷
        setConfig(prev => prev || { isOpen: true, bulletin: "" });
      }
    })();
  }, []);

  const go = (v: View, code?: string) => {
    setView(v);
    setTrackCode(code);
    window.scrollTo({ top: 0 });
  };

  const nav: [View, string, string][] = [["submit", "說說看", "💬"], ["track", "查進度", "🔍"]];

  return (
    <>
      <style>{globalCSS}</style>
      <Toast />
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: `radial-gradient(1200px 500px at 85% -10%, #f9e3d3 0%, transparent 60%), radial-gradient(900px 500px at -10% 10%, #dcece7 0%, transparent 55%), ${C.cream}` }}>
        {/* ── 頂部導覽 ─────────────────────────────────────── */}
        <header style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(251,247,241,.82)", backdropFilter: "saturate(1.4) blur(10px)", borderBottom: `1px solid ${C.hairline}` }}>
          <div style={{ maxWidth: 1240, margin: "0 auto", padding: `${S[2]}px ${S[4]}px`, display: "flex", alignItems: "center", gap: S[3] }}>
            <button onClick={() => go("submit")} aria-label="回到首頁" style={{ display: "flex", alignItems: "center", gap: S[2], background: "none", border: "none", cursor: "pointer", padding: 0, color: C.ink }}>
              <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 12, background: C.primary, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", boxShadow: "0 4px 10px rgba(47,93,98,.25)" }}>👋</span>
              {!isMobile && <span className="display" style={{ fontSize: T.md, whiteSpace: "nowrap" }}>Hey 夥伴</span>}
            </button>
            <span style={{ flex: 1 }} />
            <nav aria-label="主選單" style={{ display: "flex", gap: 4, background: C.paper, padding: 4, borderRadius: R.full, boxShadow: E[1] }}>
              {nav.map(([v, l, ic]) => {
                const active = view === v;
                return (
                  <button key={v} onClick={() => go(v)} aria-current={active ? "page" : undefined} style={{
                    display: "flex", alignItems: "center", gap: 6, height: 38, padding: `0 ${isMobile ? S[3] : S[4]}px`,
                    border: "none", borderRadius: R.full, cursor: "pointer", fontSize: T.sm, fontWeight: 700, whiteSpace: "nowrap",
                    background: active ? C.primary : "transparent", color: active ? C.white : C.sub, transition: "background .15s",
                  }}><span aria-hidden="true">{ic}</span>{l}</button>
                );
              })}
            </nav>
            <button onClick={() => go("admin")} aria-label="後台" aria-current={view === "admin" ? "page" : undefined} title="後台" style={{
              width: TAP, height: TAP, borderRadius: R.full, border: "none", cursor: "pointer", fontSize: "1.05rem",
              background: view === "admin" ? C.primarySoft : "transparent", color: C.sub,
            }}>⚙️</button>
          </div>
        </header>

        {/* ── 主視覺（只在填寫頁）─────────────────────────────── */}
        {view === "submit" && <Hero isMobile={isMobile} />}
        {view !== "submit" && <div style={{ height: S[6] }} />}

        <main style={{ flex: 1 }}>
          {view === "submit" && (config
            ? <SubmitView config={config} onTrack={code => go("track", code)} />
            : <div style={{ textAlign: "center", color: C.muted, padding: S[7] }}>載入中…</div>)}
          {view === "track" && <TrackView key={trackCode || "blank"} initialCode={trackCode} />}
          {view === "admin" && (
            <Suspense fallback={<div style={{ textAlign: "center", color: C.muted, padding: S[7] }}>載入中…</div>}>
              <AdminView />
            </Suspense>
          )}
        </main>

        <footer style={{ textAlign: "center", padding: `${S[5]}px ${S[4]}px ${S[6]}px`, fontSize: T.xs, color: C.muted, lineHeight: 1.8 }}>
          🔒 不記錄帳號與 IP・查詢碼只存加密雜湊・匿名就是真的匿名<br />
          <span style={{ opacity: .7 }}>{APP_NAME} {VERSION}</span>
        </footer>
      </div>
    </>
  );
}

function Hero({ isMobile }: { isMobile: boolean }) {
  return (
    <section style={{ maxWidth: 820, margin: "0 auto", padding: `${isMobile ? S[5] : S[6]}px ${S[4]}px ${S[6]}px`, width: "100%" }}>
      <div className="fu" style={{
        position: "relative", overflow: "hidden", borderRadius: R.xl,
        padding: isMobile ? `${S[6]}px ${S[5]}px` : `${S[7]}px ${S[7]}px`,
        background: `linear-gradient(135deg, ${C.primary} 0%, #3f7a73 55%, #5e8b7e 100%)`,
        color: C.white, boxShadow: "0 20px 50px rgba(47,93,98,.28)",
      }}>
        {/* 裝飾：柔和光暈與漂浮的對話泡泡 */}
        <span aria-hidden="true" style={{ position: "absolute", width: 260, height: 260, borderRadius: R.full, background: "rgba(242,204,143,.28)", top: -90, right: -60, filter: "blur(2px)" }} />
        <span aria-hidden="true" style={{ position: "absolute", width: 180, height: 180, borderRadius: R.full, background: "rgba(224,122,95,.25)", bottom: -80, right: 120 }} />
        <span aria-hidden="true" className="float" style={{ position: "absolute", top: isMobile ? 18 : 34, right: isMobile ? 18 : 48, fontSize: isMobile ? "2.25rem" : "3.25rem" }}>💬</span>
        <span aria-hidden="true" className="float" style={{ position: "absolute", bottom: isMobile ? 16 : 30, right: isMobile ? 60 : 130, fontSize: isMobile ? "1.5rem" : "2rem", animationDelay: "1.2s" }}>🌱</span>

        <div style={{ position: "relative", maxWidth: 520 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.16)", padding: "4px 12px", borderRadius: R.full, fontSize: T.xs, fontWeight: 700, letterSpacing: ".08em" }}>
            <span aria-hidden="true">✨</span>即時反饋小系統
          </div>
          <h1 className="display" style={{ fontSize: isMobile ? "1.75rem" : "2.5rem", fontWeight: 400, lineHeight: 1.3, marginTop: S[3] }}>
            Hey 夥伴！<br />請聽我說～～
          </h1>
          <p style={{ fontSize: isMobile ? T.base : T.md, lineHeight: 1.85, marginTop: S[4], color: "rgba(255,255,255,.92)" }}>
            工作上的大小事，都值得被聽見。<br />
            有想法、有建議、有點卡，{isMobile && <br />}還是真的有點受不了——<br />
            <span style={{ background: "linear-gradient(transparent 60%, rgba(242,204,143,.55) 60%)", fontWeight: 700 }}>都來說說看。</span>
          </p>
        </div>
      </div>
    </section>
  );
}

export default App;
