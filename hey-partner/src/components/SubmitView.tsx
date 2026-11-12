import { useState, useRef } from "react";
import { C, T, S, R, E, CATEGORIES, CAT, RESPONDS, CONTENT_MAX, CONTENT_MIN } from "../constants";
import { Btn, Card, StepTitle, Field, TextInput, TextArea, Modal } from "./ui";
import { submitFeedback, loadTeamCode, rememberTeamCode, forgetTeamCode, saveCode } from "../utils/api";
import { makeSid } from "../utils/helpers";
import { showToast } from "../utils/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import type { CategoryKey, RespondKey, PublicConfig } from "../types";

interface Props {
  config: PublicConfig;
  onTrack: (code?: string) => void;
}

type Errors = Partial<Record<"category" | "content" | "respond" | "name" | "contact" | "team", string>>;

export function SubmitView({ config, onTrack }: Props) {
  const isMobile = useIsMobile();
  const [category, setCategory] = useState<CategoryKey | "">("");
  const [content, setContent] = useState("");
  const [respond, setRespond] = useState<RespondKey | "">("");
  const [meetWith, setMeetWith] = useState("");
  const [showName, setShowName] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [savedTeam] = useState(loadTeamCode);
  const [teamCode, setTeamCode] = useState(savedTeam);
  const [editTeam, setEditTeam] = useState(!savedTeam);
  const [rememberTeam, setRememberTeam] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ code: string; category: CategoryKey; at: string } | null>(null);
  const sidRef = useRef<string>("");
  const step2Ref = useRef<HTMLDivElement>(null);

  const needContact = respond === "reply" || respond === "meet";
  const identified = needContact || showName;
  const cat = category ? CAT[category] : null;
  const accent = cat?.color || C.primary;

  const pickCategory = (k: CategoryKey) => {
    const first = !category;
    setCategory(k);
    setErrors(e => ({ ...e, category: undefined }));
    // 第一次選類別時，捲到下一步（行動版特別有感）
    if (first) setTimeout(() => step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!category) e.category = "先選一個最接近的類別吧";
    if (content.trim().length < CONTENT_MIN) e.content = "多寫幾個字，讓我們更了解你的想法";
    if (!respond) e.respond = "選一個你希望的回應方式";
    if (identified && needContact && !name.trim()) e.name = "請留下我們可以怎麼稱呼你";
    if (identified && needContact && !contact.trim()) e.contact = "請留下 Email、分機或 LINE，方便我們聯絡你";
    if (!teamCode.trim()) e.team = "請輸入同仁通關密語";
    return e;
  };

  const submit = async () => {
    if (!config.isOpen || sending) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      showToast("還有幾個地方需要填一下喔");
      return;
    }
    // 同一份內容重按送出時沿用同一個 sid，伺服器才認得是重送
    if (!sidRef.current) sidRef.current = makeSid();
    setSending(true);
    const r = await submitFeedback({
      category: category as CategoryKey, content: content.trim(), respond: respond as RespondKey,
      meetWith: respond === "meet" ? meetWith.trim() : "",
      name: identified ? name.trim() : "", contact: identified ? contact.trim() : "",
    }, teamCode.trim(), sidRef.current);
    setSending(false);

    if (r.status === "ok") {
      if (rememberTeam) rememberTeamCode(teamCode.trim()); else forgetTeamCode();
      setDone({ code: r.code, category: category as CategoryKey, at: new Date().toLocaleDateString("zh-TW") });
      return;
    }
    if (r.code === "bad_team_code") { setErrors({ team: r.message }); setEditTeam(true); }
    showToast(r.message);
    // 伺服器明確拒絕：下一次送出是新的請求；收不到回應（unknown）時保留 sid 讓伺服器去重
    if (r.code !== "unknown") sidRef.current = "";
  };

  const reset = () => {
    setCategory(""); setContent(""); setRespond(""); setMeetWith("");
    setShowName(false); setName(""); setContact(""); setErrors({});
    sidRef.current = "";
    setDone(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closed = !config.isOpen;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: `0 ${S[4]}px ${S[8]}px` }}>
      {config.bulletin && (
        <div className="fu" style={{
          display: "flex", gap: S[3], alignItems: "flex-start", background: "#fff8e8",
          border: "1px solid #f3e2b8", borderRadius: R.lg, padding: `${S[3]}px ${S[4]}px`, marginBottom: S[5],
        }}>
          <span aria-hidden="true" style={{ fontSize: "1.25rem" }}>📣</span>
          <div style={{ fontSize: T.sm, color: "#6b5310", lineHeight: 1.75, whiteSpace: "pre-line" }}>{config.bulletin}</div>
        </div>
      )}

      {closed && (
        <Card style={{ textAlign: "center", marginBottom: S[5], background: C.surface }}>
          <div style={{ fontSize: "2rem" }}>🌙</div>
          <div className="display" style={{ fontSize: T.lg, marginTop: S[2] }}>信箱暫時休息中</div>
          <div style={{ fontSize: T.sm, color: C.muted, marginTop: S[1] }}>目前暫停收件，已送出的回饋仍可用查詢碼查看進度。</div>
        </Card>
      )}

      {/* ── Step 1：類別 ─────────────────────────────────────────── */}
      <section aria-labelledby="step1" style={{ marginBottom: S[6], opacity: closed ? .55 : 1 }}>
        <div id="step1"><StepTitle n={1} title="想聊聊哪一類的事？" sub="選一個最接近的就好，後面我們會幫忙整理" done={!!category} /></div>
        {errors.category && <div role="alert" style={{ color: C.redDark, fontSize: T.sm, marginBottom: S[3], fontWeight: 600 }}>⚠ {errors.category}</div>}
        <div role="radiogroup" aria-label="回饋類別" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: S[3] }}>
          {CATEGORIES.map((c, i) => {
            const active = category === c.key;
            const dim = !!category && !active;
            const wide = !isMobile && i === CATEGORIES.length - 1;
            return (
              <button key={c.key} type="button" role="radio" aria-checked={active} disabled={closed}
                onClick={() => pickCategory(c.key)} className="lift fu"
                style={{
                  gridColumn: wide ? "1 / -1" : undefined, animationDelay: `${i * 50}ms`,
                  position: "relative", display: "flex", gap: S[4], alignItems: "flex-start", textAlign: "left",
                  padding: `${S[4]}px ${S[5]}px`, borderRadius: R.lg, cursor: closed ? "not-allowed" : "pointer",
                  background: active ? c.tint : C.paper,
                  border: `2px solid ${active ? c.color : "transparent"}`,
                  boxShadow: active ? `0 8px 22px ${c.color}22` : E[1],
                  opacity: dim ? .72 : 1, color: C.ink,
                }}>
                <span aria-hidden="true" style={{
                  flexShrink: 0, width: 52, height: 52, borderRadius: R.md, fontSize: "1.75rem",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: active ? C.paper : c.tint,
                }}>{c.emoji}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="display" style={{ display: "block", fontSize: T.md, color: active ? c.color : C.ink, lineHeight: 1.4 }}>{c.title}</span>
                  <span style={{ display: "block", fontSize: T.sm, color: C.sub, marginTop: S[1], lineHeight: 1.65 }}>{c.desc}</span>
                </span>
                {active && (
                  <span aria-hidden="true" className="pop" style={{
                    position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: R.full,
                    background: c.color, color: C.white, fontSize: 13, fontWeight: 900,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Step 2 之後：選了類別才展開 ───────────────────────────── */}
      <div ref={step2Ref} style={{ scrollMarginTop: 90 }} />
      {category && cat && (
        <div className="fu">
          <section aria-labelledby="step2" style={{ marginBottom: S[6] }}>
            <div id="step2"><StepTitle n={2} title="說說看發生了什麼？" sub="不用修飾，想到什麼寫什麼就好" done={content.trim().length >= CONTENT_MIN} /></div>
            <Card style={{ padding: S[4], borderTop: `4px solid ${accent}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[3] }}>
                <span aria-hidden="true">{cat.emoji}</span>
                <span style={{ fontSize: T.sm, fontWeight: 700, color: accent }}>{cat.title}</span>
              </div>
              <label htmlFor="fb-content" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>回饋內容</label>
              <TextArea id="fb-content" value={content} onChange={v => { setContent(v); if (errors.content) setErrors(e => ({ ...e, content: undefined })); }}
                rows={isMobile ? 6 : 7} maxLength={CONTENT_MAX} placeholder={cat.placeholder} invalid={!!errors.content}
                style={{ border: "none", background: C.surface, borderRadius: R.md }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: S[2], fontSize: T.xs, color: C.muted }}>
                <span role={errors.content ? "alert" : undefined} style={{ color: errors.content ? C.redDark : C.muted, fontWeight: errors.content ? 600 : 400 }}>
                  {errors.content ? `⚠ ${errors.content}` : "💡 可以寫：發生了什麼、影響是什麼、你希望怎麼改變"}
                </span>
                <span>{content.length} / {CONTENT_MAX}</span>
              </div>
            </Card>
          </section>

          <section aria-labelledby="step3" style={{ marginBottom: S[6] }}>
            <div id="step3"><StepTitle n={3} title="你希望我們怎麼回應這件事？" sub="有些事只想被聽見，有些事需要有人來幫忙，都沒問題" done={!!respond} /></div>
            {errors.respond && <div role="alert" style={{ color: C.redDark, fontSize: T.sm, marginBottom: S[3], fontWeight: 600 }}>⚠ {errors.respond}</div>}
            <div role="radiogroup" aria-label="希望的回應方式" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: S[3] }}>
              {RESPONDS.map((r, i) => {
                const active = respond === r.key;
                return (
                  <button key={r.key} type="button" role="radio" aria-checked={active} className="lift"
                    onClick={() => { setRespond(r.key); setErrors(e => ({ ...e, respond: undefined, name: undefined, contact: undefined })); }}
                    style={{
                      display: "flex", alignItems: "center", gap: S[3], textAlign: "left",
                      padding: `${S[3]}px ${S[4]}px`, borderRadius: R.lg, cursor: "pointer", color: C.ink,
                      background: active ? C.primarySoft : C.paper,
                      border: `2px solid ${active ? C.primary : "transparent"}`, boxShadow: active ? "none" : E[1],
                    }}>
                    <span aria-hidden="true" style={{
                      flexShrink: 0, width: 22, height: 22, borderRadius: R.full,
                      border: `2px solid ${active ? C.primary : "#cfc8bc"}`, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{active && <span style={{ width: 10, height: 10, borderRadius: R.full, background: C.primary }} />}</span>
                    <span aria-hidden="true" style={{ fontSize: "1.375rem" }}>{r.emoji}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: T.base, fontWeight: 700 }}><span style={{ color: C.muted, fontWeight: 500 }}>{i + 1}. </span>{r.label}</span>
                      <span style={{ display: "block", fontSize: T.xs, color: C.muted, marginTop: 2 }}>{r.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {respond === "meet" && (
              <div className="fu" style={{ marginTop: S[4] }}>
                <Field label="想跟誰聊聊？" hint="可以寫職稱、部門或名字；留白的話我們會幫你安排合適的人">
                  <TextInput value={meetWith} onChange={setMeetWith} maxLength={50} placeholder="例如：HR、直屬主管、總經理…" />
                </Field>
              </div>
            )}
          </section>

          <section aria-labelledby="step4" style={{ marginBottom: S[6] }}>
            <div id="step4"><StepTitle n={4} title={needContact ? "怎麼聯絡你？" : "要留下名字嗎？"} sub={needContact ? "為了能回覆你，這個選項需要留下稱呼與聯絡方式" : "預設是匿名的，留不留名都完全沒關係"} /></div>
            <Card style={{ padding: S[4] }}>
              {!needContact && (
                <div role="radiogroup" aria-label="是否匿名" style={{ display: "flex", background: C.surface, borderRadius: R.full, padding: 4, marginBottom: identified ? S[4] : 0 }}>
                  {[[false, "🫥 匿名送出"], [true, "🙋 留下名字"]].map(([v, l]) => {
                    const active = showName === v;
                    return (
                      <button key={String(v)} type="button" role="radio" aria-checked={active} onClick={() => setShowName(v as boolean)}
                        style={{
                          flex: 1, minHeight: 40, border: "none", borderRadius: R.full, cursor: "pointer",
                          background: active ? C.paper : "transparent", color: active ? C.ink : C.muted,
                          fontWeight: 700, fontSize: T.sm, boxShadow: active ? E[1] : "none", transition: "background .15s",
                        }}>{l as string}</button>
                    );
                  })}
                </div>
              )}
              {identified && (
                <div className="fu" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.4fr", gap: `0 ${S[3]}px` }}>
                  <Field label="怎麼稱呼你" required={needContact} error={errors.name}>
                    <TextInput value={name} onChange={v => { setName(v); setErrors(e => ({ ...e, name: undefined })); }} maxLength={30} autoComplete="name" placeholder="例如：小美" invalid={!!errors.name} />
                  </Field>
                  <Field label="聯絡方式" required={needContact} error={errors.contact} hint="留 Email 的話，有新進度時我們可以寄信通知你">
                    <TextInput value={contact} onChange={v => { setContact(v); setErrors(e => ({ ...e, contact: undefined })); }} maxLength={100} autoComplete="email" placeholder="Email、分機或 LINE ID" invalid={!!errors.contact} />
                  </Field>
                </div>
              )}
              {!identified && (
                <p style={{ fontSize: T.sm, color: C.sub, lineHeight: 1.75, marginTop: S[3] }}>
                  🔒 匿名送出時，系統不會記錄你的帳號或 IP——連我們也不知道你是誰。送出後你會拿到一組<strong>查詢碼</strong>，可以隨時回來看處理進度。
                </p>
              )}
            </Card>
          </section>

          {/* ── 送出 ─────────────────────────────────────────────── */}
          <Card style={{ background: `linear-gradient(135deg, ${C.primarySoft}, #fdf3e7)`, border: "none" }}>
            {editTeam ? (
              <Field label="同仁通關密語" required error={errors.team} hint="確認你是自己人用的，不會跟你的回饋綁在一起">
                <TextInput type="password" value={teamCode} onChange={v => { setTeamCode(v); setErrors(e => ({ ...e, team: undefined })); }}
                  autoComplete="off" placeholder="問問主管或 HR" invalid={!!errors.team} />
              </Field>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S[3], marginBottom: S[4], fontSize: T.sm, color: C.sub }}>
                <span>🔑 已記住通關密語</span>
                <button type="button" onClick={() => setEditTeam(true)} style={{ background: "none", border: "none", color: C.primary, fontWeight: 700, cursor: "pointer", fontSize: T.sm, textDecoration: "underline" }}>更換</button>
              </div>
            )}
            {editTeam && (
              <label style={{ display: "flex", alignItems: "center", gap: S[2], fontSize: T.sm, color: C.sub, marginBottom: S[4], cursor: "pointer" }}>
                <input type="checkbox" checked={rememberTeam} onChange={e => setRememberTeam(e.target.checked)} style={{ width: 18, height: 18, accentColor: C.primary }} />
                在這台裝置記住通關密語（公用電腦請取消勾選）
              </label>
            )}
            <Btn variant="coral" large full onClick={submit} disabled={sending || closed}>
              {sending ? "傳送中…" : "說出來，送出 💌"}
            </Btn>
          </Card>
        </div>
      )}

      {done && <SuccessModal code={done.code} category={done.category} at={done.at} onAgain={reset} onTrack={() => { const c = done.code; reset(); onTrack(c); }} />}
    </div>
  );
}

// ── 送出成功：查詢碼像一張小票根 ─────────────────────────────────────────────
function SuccessModal({ code, category, at, onAgain, onTrack }: {
  code: string; category: CategoryKey; at: string; onAgain: () => void; onTrack: () => void;
}) {
  const [remember, setRemember] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { showToast("複製失敗，請手動記下查詢碼"); }
  };
  const finish = (next: () => void) => {
    if (remember) saveCode({ code, at, category });
    next();
  };
  return (
    <Modal onClose={() => finish(onAgain)} labelledBy="ok-title" maxWidth={440}>
      <div style={{ textAlign: "center" }}>
        <div className="float" aria-hidden="true" style={{ fontSize: "3.5rem", lineHeight: 1 }}>📮</div>
        <h2 id="ok-title" className="display" style={{ fontSize: T.xl, fontWeight: 400, marginTop: S[3], color: C.primary }}>訊息已經反映成功</h2>
        <p style={{ fontSize: T.base, color: C.sub, marginTop: S[2], lineHeight: 1.7 }}>謝謝你願意說出來，我們收到了 🙏</p>
      </div>

      <div style={{
        position: "relative", margin: `${S[5]}px 0`, padding: `${S[4]}px ${S[4]}px`,
        background: "#fff8e8", borderRadius: R.lg, border: "2px dashed #e8cf96", textAlign: "center",
      }}>
        <div style={{ fontSize: T.xs, color: "#8a6914", fontWeight: 700, letterSpacing: ".1em" }}>你的查詢碼</div>
        <div aria-label={`查詢碼 ${code.split("").join(" ")}`} style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: "clamp(1.1rem, 6vw, 1.6rem)", fontWeight: 700,
          letterSpacing: ".08em", whiteSpace: "nowrap", color: C.ink, margin: `${S[2]}px 0 ${S[3]}px`, userSelect: "all",
        }}>{code}</div>
        <Btn small variant="ghost" onClick={copy} style={{ background: C.paper }}>{copied ? "✓ 已複製" : "📋 複製查詢碼"}</Btn>
        <p style={{ fontSize: T.xs, color: "#8a6914", lineHeight: 1.7, marginTop: S[3] }}>
          這組碼只會顯示這一次，請截圖或記下來。<br />之後可以用它查看處理進度與我們的回覆。
        </p>
      </div>

      <label style={{ display: "flex", alignItems: "flex-start", gap: S[2], fontSize: T.sm, color: C.sub, marginBottom: S[5], cursor: "pointer", lineHeight: 1.6 }}>
        <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: C.primary, flexShrink: 0 }} />
        <span>在這台裝置記住這組查詢碼<br /><span style={{ fontSize: T.xs, color: C.muted }}>只存查詢碼，不存內容；公用電腦請不要勾選</span></span>
      </label>

      <div style={{ display: "flex", gap: S[3], flexDirection: "column" }}>
        <Btn full onClick={() => finish(onTrack)}>查看處理進度</Btn>
        <Btn full variant="ghost" onClick={() => finish(onAgain)}>再說一件事</Btn>
      </div>
    </Modal>
  );
}
