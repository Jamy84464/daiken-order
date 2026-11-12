import { useState, useEffect, useMemo } from "react";
import { C, T, S, R, E, CATEGORIES, CAT, RESPONDS, RESP, STATUSES, STAT } from "../../constants";
import { Btn, Card, Chip, Pill, TextArea, TextInput, Modal } from "../ui";
import { ConfirmModal } from "../ConfirmModal";
import { adminUpdate, adminDelete } from "../../utils/storage";
import { showToast } from "../../utils/toast";
import { isEmail, shortDate } from "../../utils/helpers";
import { useIsMobile } from "../../hooks/useIsMobile";
import type { Feedback, FeedbackPatch, CategoryKey, StatusKey, RespondKey } from "../../types";

export interface InboxFilter {
  q?: string;
  category?: CategoryKey | "";
  status?: StatusKey | "";
  respond?: RespondKey | "";
  tag?: string;
  subject?: string;
  showArchived?: boolean;
  untagged?: boolean;
}

interface Props {
  list: Feedback[];
  onSaved: (fb: Feedback) => void;
  onDeleted: (id: string) => void;
  /** 從彙整洞察點進來時帶的篩選 */
  filter: InboxFilter | null;
  onFilterUsed: () => void;
}

const EMPTY: InboxFilter = { q: "", category: "", status: "", respond: "", tag: "", subject: "", showArchived: false, untagged: false };

const selStyle: React.CSSProperties = {
  minHeight: 38, border: `1.5px solid ${C.border}`, borderRadius: R.full, padding: `0 ${S[3]}px`,
  fontSize: T.sm, background: C.paper, color: C.ink, cursor: "pointer",
};

export function InboxTab({ list, onSaved, onDeleted, filter, onFilterUsed }: Props) {
  const isMobile = useIsMobile(980);
  const [f, setF] = useState<InboxFilter>(EMPTY);
  const [selId, setSelId] = useState<string | null>(null);

  useEffect(() => {
    if (filter) { setF({ ...EMPTY, ...filter, showArchived: true }); onFilterUsed(); }
  }, [filter, onFilterUsed]);

  const allTags = useMemo(() => Array.from(new Set(list.flatMap(x => x.tags || []))).sort(), [list]);
  const allSubjects = useMemo(() => Array.from(new Set(list.flatMap(x => x.subjects || []))).sort(), [list]);

  const shown = useMemo(() => {
    const q = (f.q || "").trim().toLowerCase();
    return list.filter(x =>
      (f.showArchived || !x.archived) &&
      (!f.category || x.category === f.category) &&
      (!f.status || x.status === f.status) &&
      (!f.respond || x.respond === f.respond) &&
      (!f.tag || (x.tags || []).includes(f.tag)) &&
      (!f.subject || (x.subjects || []).includes(f.subject)) &&
      (!f.untagged || !(x.tags || []).length) &&
      (!q || [x.content, x.name, x.contact, x.note, x.reply, x.id, x.meetWith, ...(x.tags || []), ...(x.subjects || [])]
        .some(s => (s || "").toLowerCase().includes(q)))
    );
  }, [list, f]);

  const sel = list.find(x => x.id === selId) || null;
  const set = (patch: Partial<InboxFilter>) => setF(prev => ({ ...prev, ...patch }));
  const active = JSON.stringify({ ...f }) !== JSON.stringify(EMPTY);

  const editor = sel && (
    <FeedbackEditor key={`${sel.id}-${sel.rev}`} fb={sel} onSaved={onSaved}
      onDeleted={id => { onDeleted(id); setSelId(null); }} onClose={() => setSelId(null)} />
  );

  return (
    <div>
      {/* ── 篩選列 ─────────────────────────────────────────── */}
      <Card style={{ padding: S[4], marginBottom: S[4] }}>
        <div style={{ display: "flex", gap: S[2], flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 220px" }}>
            <TextInput value={f.q || ""} onChange={v => set({ q: v })} placeholder="🔎 搜尋內容、標籤、對象、編號…" inputMode="search"
              style={{ minHeight: 38, borderRadius: R.full }} />
          </div>
          <select aria-label="處理狀態" value={f.status} onChange={e => set({ status: e.target.value as StatusKey | "" })} style={selStyle}>
            <option value="">全部狀態</option>
            {STATUSES.map(s => <option key={s.key} value={s.key}>{s.emoji} {s.short}</option>)}
          </select>
          <select aria-label="希望回應" value={f.respond} onChange={e => set({ respond: e.target.value as RespondKey | "" })} style={selStyle}>
            <option value="">全部回應期待</option>
            {RESPONDS.map(r => <option key={r.key} value={r.key}>{r.emoji} {r.label}</option>)}
          </select>
          {allTags.length > 0 && (
            <select aria-label="標籤" value={f.tag} onChange={e => set({ tag: e.target.value })} style={selStyle}>
              <option value="">全部標籤</option>
              {allTags.map(t => <option key={t} value={t}>#{t}</option>)}
            </select>
          )}
          {allSubjects.length > 0 && (
            <select aria-label="涉及對象" value={f.subject} onChange={e => set({ subject: e.target.value })} style={selStyle}>
              <option value="">全部對象</option>
              {allSubjects.map(t => <option key={t} value={t}>👤 {t}</option>)}
            </select>
          )}
        </div>
        <div style={{ display: "flex", gap: S[2], flexWrap: "wrap", marginTop: S[3], alignItems: "center" }}>
          <Chip small active={!f.category} onClick={() => set({ category: "" })}>全部類別</Chip>
          {CATEGORIES.map(c => (
            <Chip key={c.key} small active={f.category === c.key} color={c.color} tint={c.tint}
              onClick={() => set({ category: f.category === c.key ? "" : c.key })}>{c.emoji} {c.title.replace(/^我/, "").replace(/！$/, "")}</Chip>
          ))}
          <span style={{ flex: 1 }} />
          <Chip small active={!!f.untagged} onClick={() => set({ untagged: !f.untagged })}>🏷️ 未標籤</Chip>
          <Chip small active={!!f.showArchived} onClick={() => set({ showArchived: !f.showArchived })}>🗄️ 含已結案</Chip>
          {active && <button type="button" onClick={() => setF(EMPTY)} style={{ background: "none", border: "none", color: C.primary, fontWeight: 700, fontSize: T.xs, cursor: "pointer", textDecoration: "underline" }}>清除篩選</button>}
        </div>
      </Card>

      <div style={{ fontSize: T.xs, color: C.muted, marginBottom: S[2], paddingLeft: S[1] }}>共 {shown.length} 則{shown.length !== list.length && `（全部 ${list.length} 則）`}</div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile || !sel ? "1fr" : "minmax(0, 5fr) minmax(0, 7fr)", gap: S[4], alignItems: "start" }}>
        {/* ── 列表 ─────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          {shown.length === 0 && (
            <Card style={{ textAlign: "center", color: C.muted, padding: S[7] }}>
              <div aria-hidden="true" style={{ fontSize: "2rem" }}>🍃</div>
              <div style={{ marginTop: S[2] }}>{list.length ? "沒有符合條件的回饋" : "目前還沒有回饋"}</div>
            </Card>
          )}
          {shown.map(x => <ListItem key={x.id} fb={x} active={x.id === selId} onClick={() => setSelId(x.id === selId ? null : x.id)} />)}
        </div>

        {/* ── 編輯：桌機在右側黏住，手機用彈窗 ──────────────── */}
        {sel && !isMobile && <div style={{ position: "sticky", top: 96 }}>{editor}</div>}
      </div>
      {sel && isMobile && <Modal onClose={() => setSelId(null)} labelledBy="fb-editor-title" maxWidth={640} bare>{editor}</Modal>}
    </div>
  );
}

function ListItem({ fb, active, onClick }: { fb: Feedback; active: boolean; onClick: () => void }) {
  const cat = CAT[fb.category];
  const st = STAT[fb.status];
  const urgent = fb.respond === "meet" || fb.category === "vent";
  return (
    <button type="button" onClick={onClick} aria-expanded={active} className="lift" style={{
      display: "flex", textAlign: "left", width: "100%", cursor: "pointer", padding: 0, overflow: "hidden",
      background: active ? cat.tint : C.paper, borderRadius: R.lg, color: C.ink,
      border: `2px solid ${active ? cat.color : "transparent"}`, boxShadow: active ? "none" : E[1],
      opacity: fb.archived ? .6 : 1,
    }}>
      <span aria-hidden="true" style={{ width: 6, flexShrink: 0, background: cat.color }} />
      <span style={{ flex: 1, minWidth: 0, padding: `${S[3]}px ${S[4]}px` }}>
        <span style={{ display: "flex", alignItems: "center", gap: S[2], flexWrap: "wrap", marginBottom: 6 }}>
          <span aria-hidden="true">{cat.emoji}</span>
          <Pill color={st.color} tint={st.tint}>{st.emoji} {st.short}</Pill>
          {fb.respond !== "ack" && <Pill color={urgent ? C.coralDark : C.sub} tint={urgent ? "#fbeae4" : C.surface}>{RESP[fb.respond].emoji} {fb.respond === "meet" ? "想面談" : fb.respond === "reply" ? "想要回覆" : "請關注"}</Pill>}
          {fb.archived && <Pill color={C.muted} tint={C.surface}>已結案</Pill>}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: T.xs, color: C.muted, whiteSpace: "nowrap" }}>{shortDate(fb.createdAt)}</span>
        </span>
        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: T.sm, lineHeight: 1.65, color: C.ink }}>{fb.content}</span>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, fontSize: T.xs, color: C.muted }}>
          <span>{fb.name ? `🙋 ${fb.name}` : "🫥 匿名"}</span>
          {(fb.tags || []).slice(0, 4).map(t => <span key={t} style={{ color: cat.color, fontWeight: 600 }}>#{t}</span>)}
          {(fb.tags || []).length > 4 && <span>+{fb.tags.length - 4}</span>}
          {(fb.subjects || []).map(t => <span key={t}>👤{t}</span>)}
        </span>
      </span>
    </button>
  );
}

// ── 單則編輯 ─────────────────────────────────────────────────────────────────
function FeedbackEditor({ fb, onSaved, onDeleted, onClose }: {
  fb: Feedback; onSaved: (fb: Feedback) => void; onDeleted: (id: string) => void; onClose: () => void;
}) {
  const cat = CAT[fb.category];
  const narrow = useIsMobile(560);
  const [status, setStatus] = useState<StatusKey>(fb.status);
  const [tags, setTags] = useState<string[]>(fb.tags || []);
  const [subjects, setSubjects] = useState<string[]>(fb.subjects || []);
  const [reply, setReply] = useState(fb.reply || "");
  const [note, setNote] = useState(fb.note || "");
  const [archived, setArchived] = useState(!!fb.archived);
  const [notify, setNotify] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);

  const canEmail = isEmail(fb.contact || "");
  const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
  const patch: FeedbackPatch = {};
  if (status !== fb.status) patch.status = status;
  if (!same(tags, fb.tags || [])) patch.tags = tags;
  if (!same(subjects, fb.subjects || [])) patch.subjects = subjects;
  if (reply !== (fb.reply || "")) patch.reply = reply;
  if (note !== (fb.note || "")) patch.note = note;
  if (archived !== !!fb.archived) patch.archived = archived;
  const dirty = Object.keys(patch).length > 0;
  const userVisibleChange = patch.status !== undefined || patch.reply !== undefined;

  const toggleTag = (t: string) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const otherPresets = CATEGORIES.filter(c => c.key !== fb.category).flatMap(c => c.tags).filter(t => !cat.tags.includes(t));
  const customTags = tags.filter(t => !cat.tags.includes(t) && !otherPresets.includes(t));

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    const r = await adminUpdate(fb, patch, notify && canEmail && userVisibleChange);
    setSaving(false);
    if (r.ok) {
      onSaved(r.value);
      showToast(r.emailSent === true ? "已儲存，並寄信通知對方" : r.emailSent === false ? "已儲存，但通知信沒有寄出" : "已儲存", r.emailSent === false ? "error" : "success");
    } else {
      showToast(r.message);
      if (r.latest) onSaved(r.latest);
    }
  };

  const del = async () => {
    setConfirmDel(false);
    const r = await adminDelete(fb.id);
    if (r.ok) { onDeleted(fb.id); showToast("已刪除", "success"); } else showToast(r.message || "刪除失敗");
  };

  const label = (t: string, sub?: string) => (
    <div style={{ fontSize: T.xs, fontWeight: 700, color: C.sub, letterSpacing: ".04em", marginBottom: S[2] }}>
      {t}{sub && <span style={{ fontWeight: 400, color: C.muted, marginLeft: 6 }}>{sub}</span>}
    </div>
  );
  const block: React.CSSProperties = { marginTop: S[5] };

  return (
    <Card style={{ padding: S[5], borderTop: `5px solid ${cat.color}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: S[3] }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: T.xs, color: C.muted, fontFamily: "ui-monospace, Menlo, monospace" }}>{fb.id}</div>
          <h3 id="fb-editor-title" className="display" style={{ fontSize: T.md, fontWeight: 400, color: cat.color, marginTop: 2 }}>{cat.emoji} {cat.title}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="關閉" style={{ background: C.surface, border: "none", width: 34, height: 34, borderRadius: R.full, cursor: "pointer", color: C.sub, flexShrink: 0 }}>✕</button>
      </div>

      <div style={{ fontSize: T.base, lineHeight: 1.85, whiteSpace: "pre-wrap", background: C.surface, borderRadius: R.md, padding: S[4], marginTop: S[3], maxHeight: 320, overflowY: "auto" }}>{fb.content}</div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: `6px ${S[3]}px`, fontSize: T.sm, marginTop: S[3], color: C.sub }}>
        <span style={{ color: C.muted }}>希望回應</span>
        <span style={{ fontWeight: 700, color: fb.respond === "meet" ? C.coralDark : C.ink }}>{RESP[fb.respond].emoji} {RESP[fb.respond].label}{fb.meetWith && `（對象：${fb.meetWith}）`}</span>
        <span style={{ color: C.muted }}>送出者</span>
        <span>{fb.name ? <>{fb.name}{fb.contact && <span style={{ color: C.muted }}>・{fb.contact}</span>}</> : "🫥 匿名"}</span>
        <span style={{ color: C.muted }}>時間</span>
        <span>{fb.createdAt}{fb.updatedAt && <span style={{ color: C.muted }}>（更新 {fb.updatedAt}）</span>}</span>
      </div>

      {/* 狀態 */}
      <div style={block}>
        {label("處理狀態", "同仁用查詢碼會看到")}
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: S[2] }}>
          {STATUSES.map(s => {
            const on = status === s.key;
            return (
              <button key={s.key} type="button" aria-pressed={on} onClick={() => setStatus(s.key)} className="chip-btn" style={{
                display: "flex", alignItems: "center", gap: S[2], textAlign: "left", minHeight: 44, padding: `${S[2]}px ${S[3]}px`,
                borderRadius: R.md, cursor: "pointer", fontSize: T.sm, fontWeight: on ? 700 : 500,
                border: `1.5px solid ${on ? s.color : C.border}`, background: on ? s.tint : C.paper, color: on ? s.color : C.sub,
              }}><span aria-hidden="true" style={{ fontSize: "1.1rem" }}>{s.emoji}</span>{s.label}</button>
            );
          })}
        </div>
      </div>

      {/* 標籤 */}
      <div style={block}>
        {label("標籤", "內部整理用，同仁看不到")}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {cat.tags.map(t => <Chip key={t} small active={tags.includes(t)} color={cat.color} tint={cat.tint} onClick={() => toggleTag(t)}>#{t}</Chip>)}
          {customTags.map(t => <Chip key={t} small active color={C.primary} tint={C.primarySoft} onClick={() => toggleTag(t)} title="點一下移除">#{t} ✕</Chip>)}
          {!showAllTags && otherPresets.some(t => tags.includes(t)) && otherPresets.filter(t => tags.includes(t)).map(t => (
            <Chip key={t} small active color={C.primary} tint={C.primarySoft} onClick={() => toggleTag(t)}>#{t}</Chip>
          ))}
        </div>
        <button type="button" onClick={() => setShowAllTags(v => !v)} style={{ background: "none", border: "none", color: C.primary, fontSize: T.xs, fontWeight: 700, cursor: "pointer", marginTop: S[2], padding: 0 }}>
          {showAllTags ? "▾ 收起其他類別標籤" : "▸ 其他類別的標籤"}
        </button>
        {showAllTags && (
          <div className="fu" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: S[2] }}>
            {CATEGORIES.filter(c => c.key !== fb.category).map(c => c.tags.filter(t => !cat.tags.includes(t)).map(t => (
              <Chip key={t} small active={tags.includes(t)} color={c.color} tint={c.tint} onClick={() => toggleTag(t)}>#{t}</Chip>
            )))}
          </div>
        )}
        <AddInput placeholder="＋ 自訂標籤，按 Enter 加入" onAdd={t => setTags(prev => prev.includes(t) ? prev : [...prev, t])} maxLength={20} />
      </div>

      {/* 涉及對象 */}
      <div style={block}>
        {label("涉及對象／部門／流程", "用來看出重複出現的合作反饋")}
        {subjects.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: S[2] }}>
            {subjects.map(t => <Chip key={t} small active color={C.sub} tint={C.surface} onClick={() => setSubjects(p => p.filter(x => x !== t))} title="點一下移除">👤 {t} ✕</Chip>)}
          </div>
        )}
        <AddInput placeholder="例如：業務部、請款流程、倉儲…（Enter 加入）" onAdd={t => setSubjects(prev => prev.includes(t) ? prev : [...prev, t])} maxLength={30} />
      </div>

      {/* 對外回覆 */}
      <div style={block}>
        {label("💌 給同仁的回覆", "同仁用查詢碼會看到")}
        <TextArea value={reply} onChange={setReply} rows={3} maxLength={1000} placeholder="用溫暖的語氣說明我們的想法或後續安排…" />
        {fb.contact && (
          <label style={{ display: "flex", alignItems: "center", gap: S[2], fontSize: T.sm, color: canEmail ? C.sub : C.muted, marginTop: S[2], cursor: canEmail ? "pointer" : "not-allowed" }}>
            <input type="checkbox" checked={notify && canEmail} disabled={!canEmail} onChange={e => setNotify(e.target.checked)} style={{ width: 17, height: 17, accentColor: C.primary }} />
            {canEmail ? "儲存時寄信通知對方（狀態或回覆有變更時）" : "對方留的不是 Email，請用其他方式聯絡"}
          </label>
        )}
      </div>

      {/* 內部備註 */}
      <div style={block}>
        {label("🔒 內部備註", "只有後台看得到")}
        <TextArea value={note} onChange={setNote} rows={2} maxLength={2000} placeholder="處理紀錄、負責人、追蹤日期…" style={{ background: "#fffbea", borderColor: "#f3e2b8" }} />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: S[2], fontSize: T.sm, color: C.sub, marginTop: S[4], cursor: "pointer" }}>
        <input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} style={{ width: 17, height: 17, accentColor: C.primary }} />
        🗄️ 已結案（從收件匣預設清單隱藏，同仁端不受影響）
      </label>

      <div style={{ display: "flex", gap: S[2], marginTop: S[5], alignItems: "center" }}>
        <Btn variant="danger" small onClick={() => setConfirmDel(true)}>刪除</Btn>
        <span style={{ flex: 1 }} />
        {dirty && <span style={{ fontSize: T.xs, color: C.coralDark, fontWeight: 700 }}>● 尚未儲存</span>}
        <Btn onClick={save} disabled={!dirty || saving}>{saving ? "儲存中…" : "儲存"}</Btn>
      </div>

      {confirmDel && (
        <ConfirmModal title="確定刪除這則回饋？" msg={"刪除後無法復原，持有查詢碼的同仁也會查不到。\n如果只是處理完畢，建議改用「已結案」。"}
          okLabel="刪除" onOk={del} onCancel={() => setConfirmDel(false)} />
      )}
    </Card>
  );
}

function AddInput({ placeholder, onAdd, maxLength }: { placeholder: string; onAdd: (v: string) => void; maxLength: number }) {
  const [v, setV] = useState("");
  const commit = () => { const t = v.trim().replace(/^#/, ""); if (t) onAdd(t); setV(""); };
  return (
    <div style={{ marginTop: S[2] }}>
      <TextInput value={v} onChange={setV} placeholder={placeholder} maxLength={maxLength}
        onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); } }}
        style={{ minHeight: 38, fontSize: T.sm }} />
    </div>
  );
}
