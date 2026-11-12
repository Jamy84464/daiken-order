import { useMemo } from "react";
import { C, T, S, R, CATEGORIES, CAT, RESPONDS, RESP, STATUSES } from "../../constants";
import { Card, Pill } from "../ui";
import { buildInsights, shortDate, type TagInsight } from "../../utils/helpers";
import { useIsMobile } from "../../hooks/useIsMobile";
import type { Feedback } from "../../types";
import type { InboxFilter } from "./InboxTab";

interface Props {
  list: Feedback[];
  onDrill: (f: InboxFilter) => void;
}

export function InsightsTab({ list, onDrill }: Props) {
  const isMobile = useIsMobile();
  const ins = useMemo(() => buildInsights(list), [list]);

  if (!list.length) {
    return (
      <Card style={{ textAlign: "center", padding: S[7], color: C.muted }}>
        <div aria-hidden="true" style={{ fontSize: "2.25rem" }}>🌱</div>
        <div style={{ marginTop: S[2] }}>還沒有回饋，等第一顆種子落下吧</div>
      </Card>
    );
  }

  const maxCat = Math.max(1, ...Object.values(ins.byCategory));
  const maxMonth = Math.max(1, ...ins.months.map(m => m.count));
  const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: S[4] };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {/* ── KPI ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: S[3] }}>
        <Kpi emoji="📬" label="全部回饋" value={ins.total} />
        <Kpi emoji="📂" label="未結案" value={ins.open} />
        <Kpi emoji="☕" label="需要關心" value={ins.needsCare.length} tone={ins.needsCare.length ? C.coralDark : undefined}
          onClick={() => onDrill({ respond: "meet", showArchived: false })} />
        <Kpi emoji="🏷️" label="尚未標籤" value={ins.untagged} tone={ins.untagged ? "#a86a12" : undefined}
          onClick={() => onDrill({ untagged: true })} />
      </div>

      <div style={grid2}>
        {/* ── 類別分佈 ─────────────────────────────────── */}
        <Card>
          <H title="類別分佈" sub="點一下看該類別的回饋" />
          <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
            {CATEGORIES.map(c => {
              const n = ins.byCategory[c.key];
              return (
                <button key={c.key} type="button" onClick={() => onDrill({ category: c.key })} style={rowBtn}>
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: T.sm, marginBottom: 4 }}>
                    <span>{c.emoji} {c.title}</span>
                    <strong style={{ color: c.color }}>{n}</strong>
                  </span>
                  <Bar pct={n / maxCat} color={c.color} tint={c.tint} />
                </button>
              );
            })}
          </div>
        </Card>

        {/* ── 狀態與回應期待 ─────────────────────────────── */}
        <Card>
          <H title="處理狀態" />
          <Stacked parts={STATUSES.map(s => ({ key: s.key, label: `${s.emoji} ${s.short}`, n: ins.byStatus[s.key], color: s.color }))} total={ins.total}
            onClick={k => onDrill({ status: k as any })} />
          <div style={{ height: S[5] }} />
          <H title="同仁期待的回應" sub="看出有多少只是想被聽見" />
          <Stacked parts={RESPONDS.map((r, i) => ({ key: r.key, label: `${r.emoji} ${["收到就好", "請關注", "想要回覆", "想面談"][i]}`, n: ins.byRespond[r.key], color: ["#9aa8a3", "#5e8b7e", "#2f5d62", "#b85a42"][i] }))} total={ins.total}
            onClick={k => onDrill({ respond: k as any })} />
        </Card>
      </div>

      <div style={grid2}>
        <Card>
          <H title="🔁 標籤熱度" sub="跨月份重複出現的，通常不是單一事件" />
          <RankList items={ins.tags} empty="還沒有標籤，到收件匣幫回饋貼上標籤吧" prefix="#"
            onClick={t => onDrill({ tag: t })} badge={t => t.months >= 2 ? "反覆出現" : t.count >= 3 ? "熱門" : ""} />
        </Card>
        <Card>
          <H title="👥 涉及對象／流程" sub="多則回饋都提到的，就是共同的合作反饋" />
          <RankList items={ins.subjects} empty="在回饋中填上「涉及對象」後，這裡會出現彙整" prefix=""
            onClick={t => onDrill({ subject: t })} badge={t => t.count >= 2 ? "共同反饋" : ""} />
        </Card>
      </div>

      <div style={grid2}>
        {/* ── 月趨勢 ─────────────────────────────────── */}
        <Card>
          <H title="近 6 個月" />
          <div style={{ display: "flex", alignItems: "flex-end", gap: S[3], height: 150, paddingTop: S[4] }}>
            {ins.months.map(m => (
              <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
                <span style={{ fontSize: T.xs, fontWeight: 700, color: C.primary }}>{m.count}</span>
                <span style={{ width: "100%", maxWidth: 44, height: `${(m.count / maxMonth) * 100}%`, minHeight: 4, background: `linear-gradient(180deg, ${C.primary}, #5e8b7e)`, borderRadius: "8px 8px 3px 3px" }} />
                <span style={{ fontSize: T.xs, color: C.muted }}>{m.key.slice(2).replace("-", "/")}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* ── 需要關心 ─────────────────────────────────── */}
        <Card>
          <H title="☕ 需要關心" sub="想面對面聊聊，或被標記 #需要介入，且尚未結案" />
          {ins.needsCare.length === 0 ? (
            <div style={{ fontSize: T.sm, color: C.muted, padding: `${S[4]}px 0` }}>目前沒有，太好了 🌤️</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
              {ins.needsCare.slice(0, 8).map(f => (
                <button key={f.id} type="button" onClick={() => onDrill({ q: f.id })} style={{ ...rowBtn, display: "flex", gap: S[2], alignItems: "center", background: C.surface, borderRadius: R.md, padding: `${S[2]}px ${S[3]}px` }}>
                  <span aria-hidden="true">{CAT[f.category].emoji}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: T.sm }}>{f.content}</span>
                  {f.respond === "meet" && <Pill color={C.coralDark} tint="#fbeae4">{RESP.meet.emoji}{f.meetWith ? ` ${f.meetWith}` : ""}</Pill>}
                  <span style={{ fontSize: T.xs, color: C.muted }}>{shortDate(f.createdAt)}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const rowBtn: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, color: C.ink };

function H({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: S[4] }}>
      <h3 className="display" style={{ fontSize: T.md, fontWeight: 400 }}>{title}</h3>
      {sub && <p style={{ fontSize: T.xs, color: C.muted, marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

function Kpi({ emoji, label, value, tone, onClick }: { emoji: string; label: string; value: number; tone?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span aria-hidden="true" style={{ fontSize: "1.375rem" }}>{emoji}</span>
      <span className="display" style={{ display: "block", fontSize: T.xxl, lineHeight: 1.1, color: tone || C.ink, marginTop: S[2] }}>{value}</span>
      <span style={{ display: "block", fontSize: T.xs, color: C.muted, marginTop: 2, fontWeight: 600 }}>{label}</span>
    </>
  );
  const style: React.CSSProperties = { background: C.paper, borderRadius: R.lg, padding: S[4], border: `1px solid ${C.hairline}`, textAlign: "left", color: C.ink };
  return onClick
    ? <button type="button" onClick={onClick} className="lift" style={{ ...style, cursor: "pointer" }}>{inner}</button>
    : <div style={style}>{inner}</div>;
}

function Bar({ pct, color, tint }: { pct: number; color: string; tint: string }) {
  return (
    <span style={{ display: "block", height: 10, background: tint, borderRadius: R.full, overflow: "hidden" }}>
      <span style={{ display: "block", height: "100%", width: `${Math.max(pct * 100, pct ? 4 : 0)}%`, background: color, borderRadius: R.full, transition: "width .5s" }} />
    </span>
  );
}

function Stacked({ parts, total, onClick }: { parts: { key: string; label: string; n: number; color: string }[]; total: number; onClick: (k: string) => void }) {
  return (
    <div>
      <div style={{ display: "flex", height: 14, borderRadius: R.full, overflow: "hidden", background: C.surface, gap: 2 }}>
        {parts.filter(p => p.n).map(p => <span key={p.key} title={`${p.label}：${p.n}`} style={{ width: `${(p.n / Math.max(total, 1)) * 100}%`, background: p.color }} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: `${S[2]}px ${S[4]}px`, marginTop: S[3] }}>
        {parts.map(p => (
          <button key={p.key} type="button" onClick={() => onClick(p.key)} style={{ ...rowBtn, width: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: T.sm, minHeight: 28 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: p.color }} />
            {p.label}<strong>{p.n}</strong>
            <span style={{ color: C.muted, fontSize: T.xs }}>{total ? Math.round((p.n / total) * 100) : 0}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RankList({ items, empty, prefix, onClick, badge }: {
  items: TagInsight[]; empty: string; prefix: string; onClick: (k: string) => void; badge: (t: TagInsight) => string;
}) {
  if (!items.length) return <div style={{ fontSize: T.sm, color: C.muted, padding: `${S[4]}px 0`, lineHeight: 1.7 }}>{empty}</div>;
  const max = items[0].count;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {items.slice(0, 10).map(t => {
        const b = badge(t);
        return (
          <button key={t.key} type="button" onClick={() => onClick(t.key)} style={rowBtn}>
            <span style={{ display: "flex", alignItems: "center", gap: S[2], fontSize: T.sm, marginBottom: 4 }}>
              <span style={{ fontWeight: 700 }}>{prefix}{t.key}</span>
              <span style={{ display: "flex", gap: 2 }}>{t.categories.map(c => <span key={c} aria-label={CAT[c].title} style={{ fontSize: T.xs }}>{CAT[c].emoji}</span>)}</span>
              {b && <Pill color={C.coralDark} tint="#fbeae4">{b}</Pill>}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: T.xs, color: C.muted }}>{t.months} 個月</span>
              <strong style={{ color: C.primary, minWidth: 18, textAlign: "right" }}>{t.count}</strong>
            </span>
            <Bar pct={t.count / max} color={C.primary} tint={C.primarySoft} />
          </button>
        );
      })}
    </div>
  );
}
