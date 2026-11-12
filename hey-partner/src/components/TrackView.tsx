import { useState, useEffect, useCallback } from "react";
import { C, T, S, R, E, CAT, RESP, STATUSES, STAT } from "../constants";
import { Btn, Card, TextInput, Pill } from "./ui";
import { lookupFeedback, loadSavedCodes, forgetCode, type SavedCode } from "../utils/api";
import { formatCode, isCompleteCode } from "../utils/helpers";
import { useIsMobile } from "../hooks/useIsMobile";
import type { PublicFeedback } from "../types";

export function TrackView({ initialCode }: { initialCode?: string }) {
  const isMobile = useIsMobile();
  const [code, setCode] = useState(initialCode ? formatCode(initialCode) : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PublicFeedback | null>(null);
  const [saved, setSaved] = useState<SavedCode[]>(loadSavedCodes);

  const search = useCallback(async (c: string) => {
    const v = formatCode(c);
    setCode(v);
    if (!isCompleteCode(v)) { setError("查詢碼是 12 碼英數字（例如 ABCD-2345-WXYZ）"); return; }
    setLoading(true); setError(""); setResult(null);
    const r = await lookupFeedback(v);
    setLoading(false);
    if (r.ok) setResult(r.value); else setError(r.message);
  }, []);

  useEffect(() => { if (initialCode) search(initialCode); }, [initialCode, search]);

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: `0 ${S[4]}px ${S[8]}px` }}>
      <Card className="fu" style={{ padding: isMobile ? S[4] : S[5] }}>
        <h2 className="display" style={{ fontSize: T.lg, fontWeight: 400 }}>🔍 查看處理進度</h2>
        <p style={{ fontSize: T.sm, color: C.muted, marginTop: S[1], marginBottom: S[4] }}>輸入送出時拿到的查詢碼</p>
        <form onSubmit={e => { e.preventDefault(); search(code); }} style={{ display: "flex", gap: S[2], flexDirection: isMobile ? "column" : "row" }}>
          <label htmlFor="track-code" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>查詢碼</label>
          <TextInput id="track-code" value={code} onChange={v => { setCode(formatCode(v)); setError(""); }}
            placeholder="XXXX-XXXX-XXXX" autoComplete="off" maxLength={14} invalid={!!error}
            style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: T.md, letterSpacing: ".1em", textAlign: "center", flex: 1 }} />
          <Btn type="submit" disabled={loading} style={{ minHeight: 48 }}>{loading ? "查詢中…" : "查詢"}</Btn>
        </form>
        {error && <div role="alert" style={{ color: C.redDark, fontSize: T.sm, marginTop: S[3], fontWeight: 600 }}>⚠ {error}</div>}

        {saved.length > 0 && (
          <div style={{ marginTop: S[5], paddingTop: S[4], borderTop: `1px dashed ${C.border}` }}>
            <div style={{ fontSize: T.xs, color: C.muted, fontWeight: 700, marginBottom: S[2] }}>這台裝置記住的查詢碼</div>
            <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
              {saved.map(s => {
                const cat = CAT[s.category as keyof typeof CAT];
                return (
                  <div key={s.code} style={{ display: "flex", alignItems: "center", gap: S[2], background: C.surface, borderRadius: R.md, padding: `${S[2]}px ${S[3]}px` }}>
                    <button type="button" onClick={() => search(s.code)} style={{ flex: 1, display: "flex", alignItems: "center", gap: S[2], background: "none", border: "none", cursor: "pointer", textAlign: "left", minHeight: 36, color: C.ink }}>
                      <span aria-hidden="true">{cat?.emoji || "📝"}</span>
                      <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 700, fontSize: T.sm }}>{s.code}</span>
                      <span style={{ fontSize: T.xs, color: C.muted }}>{s.at}</span>
                    </button>
                    <button type="button" aria-label={`忘記查詢碼 ${s.code}`} onClick={() => { forgetCode(s.code); setSaved(loadSavedCodes()); }}
                      style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", width: 32, height: 32, borderRadius: R.full }}>✕</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {result && <ResultCard fb={result} />}
    </div>
  );
}

function ResultCard({ fb }: { fb: PublicFeedback }) {
  const isMobile = useIsMobile();
  const cat = CAT[fb.category];
  const st = STAT[fb.status] || STATUSES[0];
  const idx = STATUSES.findIndex(s => s.key === fb.status);
  return (
    <div className="fu" style={{ marginTop: S[5] }}>
      {/* 目前狀態：大卡片 */}
      <div style={{
        borderRadius: R.xl, padding: isMobile ? S[5] : S[6], textAlign: "center",
        background: `linear-gradient(160deg, ${st.tint}, ${C.paper})`, boxShadow: E[2], border: `1px solid ${C.hairline}`,
      }}>
        <div className="pop" aria-hidden="true" style={{ fontSize: "3rem", lineHeight: 1 }}>{st.emoji}</div>
        <div className="display" style={{ fontSize: isMobile ? T.lg : T.xl, color: st.color, marginTop: S[3], lineHeight: 1.45 }}>{st.label}</div>
        <div style={{ fontSize: T.xs, color: C.muted, marginTop: S[2] }}>最後更新：{fb.updatedAt || fb.createdAt}</div>

        {/* 進度條 */}
        <ol aria-label="處理進度" style={{ listStyle: "none", display: "flex", justifyContent: "space-between", position: "relative", marginTop: S[5], padding: 0 }}>
          <span aria-hidden="true" style={{ position: "absolute", top: 17, left: "12%", right: "12%", height: 3, background: C.border, borderRadius: 2 }} />
          <span aria-hidden="true" style={{ position: "absolute", top: 17, left: "12%", width: `${(Math.max(idx, 0) / (STATUSES.length - 1)) * 76}%`, height: 3, background: st.color, borderRadius: 2, transition: "width .5s" }} />
          {STATUSES.map((s, i) => {
            const reached = i <= idx;
            const current = i === idx;
            return (
              <li key={s.key} aria-current={current ? "step" : undefined} style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 36, height: 36, borderRadius: R.full, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1.1rem", background: reached ? C.paper : C.surface,
                  border: `3px solid ${reached ? s.color : C.border}`, filter: reached ? "none" : "grayscale(1)", opacity: reached ? 1 : .6,
                  boxShadow: current ? `0 0 0 5px ${s.color}22` : "none",
                }}>{s.emoji}</span>
                <span style={{ fontSize: T.xs, fontWeight: current ? 700 : 500, color: reached ? C.ink : C.muted }}>{s.short}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {fb.reply && (
        <Card style={{ marginTop: S[4], borderLeft: `5px solid ${C.coral}` }}>
          <div style={{ fontSize: T.xs, fontWeight: 700, color: C.coralDark, letterSpacing: ".06em", marginBottom: S[2] }}>💌 我們的回覆</div>
          <div style={{ fontSize: T.base, lineHeight: 1.85, whiteSpace: "pre-wrap", color: C.ink }}>{fb.reply}</div>
        </Card>
      )}

      <Card style={{ marginTop: S[4] }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: S[2], marginBottom: S[3] }}>
          <Pill color={cat.color} tint={cat.tint}>{cat.emoji} {cat.title}</Pill>
          <Pill color={C.sub} tint={C.surface}>{RESP[fb.respond]?.emoji} {RESP[fb.respond]?.label}{fb.meetWith ? `（${fb.meetWith}）` : ""}</Pill>
        </div>
        <div style={{ fontSize: T.xs, color: C.muted, marginBottom: S[2] }}>你在 {fb.createdAt} 說：</div>
        <div style={{ fontSize: T.base, lineHeight: 1.85, whiteSpace: "pre-wrap", background: C.surface, borderRadius: R.md, padding: S[4] }}>{fb.content}</div>

        {fb.history?.length > 1 && (
          <div style={{ marginTop: S[4] }}>
            <div style={{ fontSize: T.xs, color: C.muted, fontWeight: 700, marginBottom: S[2] }}>狀態紀錄</div>
            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {[...fb.history].reverse().map((h, i) => (
                <li key={i} style={{ display: "flex", gap: S[2], fontSize: T.sm, color: C.sub }}>
                  <span aria-hidden="true">{STAT[h.status]?.emoji}</span>
                  <span style={{ flex: 1 }}>{STAT[h.status]?.label}</span>
                  <span style={{ fontSize: T.xs, color: C.muted, whiteSpace: "nowrap" }}>{h.at}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
