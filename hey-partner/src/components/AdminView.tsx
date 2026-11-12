import { useState, useEffect, useCallback } from "react";
import { C, T, S, R, E } from "../constants";
import { Btn, Card, Field, TextInput } from "./ui";
import { verifyAdmin, setAdminCredential, clearAdminCredential, adminList } from "../utils/storage";
import { InboxTab, type InboxFilter } from "./admin/InboxTab";
import { InsightsTab } from "./admin/InsightsTab";
import { SettingsTab } from "./admin/SettingsTab";
import type { Feedback } from "../types";

type Tab = "inbox" | "insights" | "settings";

export function AdminView() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [tab, setTab] = useState<Tab>("inbox");
  const [list, setList] = useState<Feedback[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [filter, setFilter] = useState<InboxFilter | null>(null);

  const reload = useCallback(async () => {
    setLoadErr("");
    const r = await adminList();
    if (r.ok) setList(r.value); else setLoadErr(r.message);
  }, []);

  useEffect(() => { if (authed) reload(); }, [authed, reload]);
  // 離開後台時清掉記憶體裡的密碼
  useEffect(() => () => clearAdminCredential(), []);

  const login = async () => {
    if (!pw || checking) return;
    setChecking(true); setLoginErr("");
    const r = await verifyAdmin(pw);
    setChecking(false);
    if (r.ok) { setAdminCredential(pw); setPw(""); setAuthed(true); }
    else setLoginErr(r.message || "密碼錯誤");
  };

  const logout = () => { clearAdminCredential(); setAuthed(false); setList(null); };

  const onSaved = (fb: Feedback) => setList(prev => prev ? prev.map(x => x.id === fb.id ? fb : x) : prev);
  const onDeleted = (id: string) => setList(prev => prev ? prev.filter(x => x.id !== id) : prev);

  if (!authed) {
    return (
      <div style={{ maxWidth: 400, margin: "0 auto", padding: `${S[6]}px ${S[4]}px` }}>
        <Card className="fu" style={{ padding: S[6] }}>
          <div style={{ textAlign: "center", marginBottom: S[5] }}>
            <div aria-hidden="true" style={{ fontSize: "2.5rem" }}>🗂️</div>
            <h2 className="display" style={{ fontSize: T.lg, fontWeight: 400, marginTop: S[2] }}>後台登入</h2>
            <p style={{ fontSize: T.sm, color: C.muted, marginTop: S[1] }}>僅限管理員，密碼只存在這個分頁的記憶體裡</p>
          </div>
          <form onSubmit={e => { e.preventDefault(); login(); }}>
            <Field label="管理員密碼" error={loginErr}>
              <TextInput type="password" value={pw} onChange={v => { setPw(v); setLoginErr(""); }} autoComplete="current-password" invalid={!!loginErr} />
            </Field>
            <Btn type="submit" full disabled={!pw || checking}>{checking ? "驗證中…" : "登入"}</Btn>
          </form>
        </Card>
      </div>
    );
  }

  const pending = list?.filter(f => !f.archived && f.status === "received").length || 0;
  const tabs: [Tab, string, number?][] = [["inbox", "📥 收件匣", pending], ["insights", "📊 彙整洞察"], ["settings", "⚙️ 設定"]];

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: `0 ${S[4]}px ${S[8]}px` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S[3], flexWrap: "wrap", marginBottom: S[5] }}>
        <div role="tablist" aria-label="後台分頁" style={{ display: "flex", gap: 4, background: C.paper, padding: 4, borderRadius: R.full, boxShadow: E[1], overflowX: "auto", maxWidth: "100%" }}>
          {tabs.map(([k, l, n]) => {
            const active = tab === k;
            return (
              <button key={k} role="tab" aria-selected={active} onClick={() => setTab(k)} style={{
                minHeight: 40, padding: `0 ${S[4]}px`, border: "none", borderRadius: R.full, cursor: "pointer",
                background: active ? C.primary : "transparent", color: active ? C.white : C.sub,
                fontWeight: 700, fontSize: T.sm, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6,
              }}>
                {l}
                {!!n && <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: R.full, background: active ? C.white : C.coralDark, color: active ? C.primary : C.white, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span>}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: S[2] }}>
          <Btn small variant="ghost" onClick={reload}>↻ 重新整理</Btn>
          <Btn small variant="ghost" onClick={logout}>登出</Btn>
        </div>
      </div>

      {loadErr && (
        <Card style={{ marginBottom: S[4], background: "#fff4ef", border: "1px solid #f1c9b8", color: C.redDark, fontSize: T.sm, fontWeight: 600 }}>
          ⚠ 讀取失敗：{loadErr}
        </Card>
      )}

      {tab === "settings" ? <SettingsTab /> : !list ? (
        !loadErr && <div style={{ textAlign: "center", color: C.muted, padding: S[7] }}>載入中…</div>
      ) : tab === "inbox" ? (
        <InboxTab list={list} onSaved={onSaved} onDeleted={onDeleted} filter={filter} onFilterUsed={() => setFilter(null)} />
      ) : (
        <InsightsTab list={list} onDrill={f => { setFilter(f); setTab("inbox"); }} />
      )}
    </div>
  );
}
