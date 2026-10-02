import { useState, useRef, useMemo } from "react";
import { C, T, S, R, E, TAP } from "../constants";
import { isValidEmail, flatProducts, orderKey, nowStr } from "../utils/helpers";
import { load, save, loadFromGAS, verifySaved } from "../utils/storage";
import { requestSendEmail, genConfirmEmail } from "../utils/email";
import { showToast } from "../utils/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { Btn, Field, TextInput, SelInput } from "./ui";
import { Icon } from "./Icon";
import { ProductCard } from "./ProductCard";
import type { Settings, Category, Order, Cart } from "../types";

interface ShopViewProps {
  settings: Settings;
  cats: Category[];
  onOrderSuccess: (order: Order) => void;
}

export function ShopView({ settings, cats, onOrderSuccess }: ShopViewProps) {
  const [tab, setTab] = useState("all");
  const [cart, setCart] = useState<Cart>({});
  const [form, setForm] = useState({ email: "", emailConfirm: "", ordererName: "", phone: "", relation: "", recipientName: "", recipientAddress: "", recipientPhone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [emailLookupDone, setEmailLookupDone] = useState(false);
  const [emailChecked, setEmailChecked] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const recipientLinked = useRef(true);
  const isMobile = useIsMobile();
  const cartRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const fp = useMemo(() => flatProducts(cats), [cats]);
  const cartItems = Object.entries(cart).filter(([, q]) => q > 0);
  const total = cartItems.reduce((s, [id, q]) => s + (fp[id]?.price || 0) * q, 0);

  const setQ = (id: string, q: number) => setCart(p => ({ ...p, [id]: Math.max(0, Math.min(99, q)) }));
  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleEmailBlur = async () => {
    const ek = form.email.trim().toLowerCase();
    if (!ek || !isValidEmail(ek)) { setEmailChecked(true); return; }
    setLookingUp(true);
    const custs = (await load("customers")) || {};
    const found = custs[ek];
    setLookingUp(false);
    setEmailChecked(true);
    if (found) {
      setForm(p => ({
        ...p,
        ordererName: found.name || "",
        phone: found.phone || "",
        relation: found.relation || "",
        recipientName: found.lastRecipientName || "",
        recipientAddress: found.lastRecipientAddress || "",
        recipientPhone: found.lastRecipientPhone || "",
        emailConfirm: ek,
      }));
      setEmailLookupDone(true);
    } else {
      setEmailLookupDone(false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.email || !isValidEmail(form.email.trim())) e.email = "請填寫有效 Email";
    if (!emailLookupDone && form.email.trim().toLowerCase() !== form.emailConfirm.trim().toLowerCase()) e.emailConfirm = "兩次 Email 不一致";
    if (!form.ordererName) e.ordererName = "必填";
    if (!form.phone) e.phone = "必填";
    if (!form.relation) e.relation = "必填";
    if (!form.recipientName) e.recipientName = "必填";
    if (!form.recipientAddress) e.recipientAddress = "必填";
    if (!form.recipientPhone) e.recipientPhone = "必填";
    if (cartItems.length === 0) e.cart = "請至少選擇一項商品";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // 驗證失敗時捲到第一個有問題的欄位。
  // 手機版表單在商品列表下方，不捲動的話按了送出畫面毫無反應，會以為網站壞了。
  const scrollToFirstError = () => {
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      const target = el || summaryRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el) el.focus({ preventScroll: true });
    });
  };

  const submit = async () => {
    if (!validate()) { scrollToFirstError(); return; }
    setSubmitting(true);
    try {
      const key = orderKey(settings.year, settings.month);
      const existing = (await loadFromGAS(key)) || {};
      const ek = form.email.trim().toLowerCase();
      const order: Order = {
        ordererName: form.ordererName, email: ek, phone: form.phone,
        relation: form.relation,
        recipientName: form.recipientName, recipientAddress: form.recipientAddress, recipientPhone: form.recipientPhone,
        cart, total,
        status: "pending",
        createdAt: nowStr(),
        updatedAt: null,
      };
      existing[ek] = order;
      setSubmitStatus("儲存訂單中…");
      await save(key, existing);
      const savedV = existing._v;
      const custs = (await loadFromGAS("customers")) || {};
      custs[ek] = {
        name: form.ordererName,
        email: ek,
        phone: form.phone,
        relation: form.relation,
        lastRecipientName: form.recipientName,
        lastRecipientAddress: form.recipientAddress,
        lastRecipientPhone: form.recipientPhone,
        lastOrder: `${settings.year}/${settings.month}`,
        orderCount: (custs[ek]?.orderCount || 0) + 1,
        firstOrderAt: custs[ek]?.firstOrderAt || nowStr(),
      };
      await save("customers", custs);
      setSubmitStatus("驗證寫入中…");
      const verified = await verifySaved(key, ek, savedV);
      if (!verified) {
        alert("訂單儲存驗證失敗，請稍後再試一次。若問題持續，請聯絡我們。");
        setSubmitting(false);
        setSubmitStatus("");
        return;
      }
      setSubmitStatus("寄送確認信…");
      const emailContent = genConfirmEmail(order, cats);
      await requestSendEmail({
        to: ek,
        subject: `【大研生醫團購】${settings.year}年${settings.month}月 訂購確認 — ${form.ordererName}`,
        body: emailContent,
        isHtml: true,
      });
      setSubmitting(false);
      setSubmitStatus("");
      onOrderSuccess(order);
      setCart({});
      setForm({ email: "", emailConfirm: "", ordererName: "", phone: "", relation: "", recipientName: "", recipientAddress: "", recipientPhone: "" });
      setEmailLookupDone(false);
      setEmailChecked(false);
    } catch (err) {
      console.warn("Submit error:", err);
      showToast("無法連線伺服器，您的表單資料已保留，請檢查網路後再試。");
      setSubmitting(false);
      return;
    }
  };

  const shown = tab === "all"
    ? cats.map(c => ({ ...c, products: c.products.filter(p => !p.hidden) })).filter(c => c.products.length > 0)
    : cats.filter(c => c.key === tab).map(c => ({ ...c, products: c.products.filter(p => !p.hidden) }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 330px", gap: isMobile ? 16 : 24, alignItems: "start" }}>
      {/* Mobile: 浮動購物車摘要列。
          paddingBottom 加上 safe-area-inset，避免被 iPhone 的手勢橫條蓋住。 */}
      {isMobile && cartItems.length > 0 && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
          background: C.green, color: C.white,
          padding: `${S[3]}px ${S[4]}px calc(${S[3]}px + env(safe-area-inset-bottom, 0px))`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          boxShadow: "0 -4px 20px rgba(0,0,0,.18)",
        }}>
          <div>
            <div style={{ fontSize: T.xs, color: "#bcdcc9", letterSpacing: ".04em" }}>{cartItems.length} 種商品</div>
            <div className="serif" style={{ fontSize: T.lg, fontWeight: 700, marginTop: 1 }}>NT${total.toLocaleString()}</div>
          </div>
          <button onClick={() => cartRef.current?.scrollIntoView({ behavior: "smooth" })}
            style={{
              display: "flex", alignItems: "center", gap: S[2], height: TAP, padding: `0 ${S[5]}px`,
              background: C.white, color: C.green, border: "none", borderRadius: R.md,
              fontSize: T.base, cursor: "pointer", fontFamily: "inherit", fontWeight: 700,
            }}>
            前往結帳
            <Icon name="arrowRight" size={16} strokeWidth={2.2} />
          </button>
        </div>
      )}
      {/* Products */}
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: S[2], marginBottom: S[5] }}>
          {[{ key: "all", label: "全部" }, ...cats.map(c => ({ key: c.key, label: c.label }))].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              height: 36, padding: `0 ${S[4]}px`,
              background: tab === t.key ? C.green : C.white,
              color: tab === t.key ? C.white : "#4a5560",
              border: tab === t.key ? "none" : `1px solid ${C.border}`,
              borderRadius: R.full, fontSize: T.sm, fontWeight: tab === t.key ? 600 : 400,
              fontFamily: "inherit", cursor: "pointer", transition: "all .15s",
            }}>{t.label}</button>
          ))}
        </div>
        {shown.map(cat => (
          <div key={cat.key} style={{ marginBottom: S[6] }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: S[3] }}>
              <h2 className="serif" style={{ margin: 0, fontSize: T.md, fontWeight: 700, color: C.text, letterSpacing: ".02em" }}>{cat.label}</h2>
              <span style={{ fontSize: T.xs, color: "#78808c" }}>{cat.products.length} 項商品</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(auto-fill,minmax(195px,1fr))", gap: S[3] }}>
              {cat.products.map(p => (
                <ProductCard key={p.id} product={p} quantity={cart[p.id] || 0} onQuantityChange={q => setQ(p.id, q)} isMobile={isMobile} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar: Cart + Form */}
      <div ref={cartRef} style={{ position: isMobile ? "static" : "sticky", top: 72, display: "flex", flexDirection: "column", gap: S[4], paddingBottom: isMobile && cartItems.length > 0 ? 80 : 0, ...(!isMobile && { maxHeight: "calc(100vh - 88px)", overflow: "hidden" }) }}>
        <div style={{ flexShrink: 0, background: C.white, borderRadius: R.lg, overflow: "hidden", boxShadow: `0 0 0 1px ${C.hairline}, ${E[2]}` }}>
          <div style={{ background: C.green, color: C.white, padding: `${S[3]}px ${S[4]}px`, display: "flex", alignItems: "center", gap: S[2], fontWeight: 600, fontSize: T.base }}>
            <Icon name="cart" size={17} />
            購物車
            {cartItems.length > 0 && <span style={{ background: "rgba(255,255,255,.22)", borderRadius: R.full, padding: `2px ${S[2]}px`, fontSize: T.xs, marginLeft: "auto" }}>{cartItems.length} 種</span>}
          </div>
          <div style={{ padding: `${S[2]}px ${S[4]}px`, maxHeight: 200, overflowY: "auto" }}>
            {cartItems.length === 0
              ? <div style={{ textAlign: "center", color: C.muted, fontSize: T.sm, padding: `${S[5]}px 0`, lineHeight: 1.9 }}>尚未加入商品</div>
              : cartItems.map(([id, q]) => { const p = fp[id]; return p && (
                  <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${S[2]}px 0`, borderBottom: `1px solid ${C.hairline}`, gap: S[2], fontSize: T.sm }}>
                    <span style={{ flex: 1, minWidth: 0, lineHeight: 1.45, wordBreak: "break-word" }}>{p.name}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => setQ(id, q - 1)} aria-label={`減少 ${p.name} 數量`} style={{ width: 36, height: 36, border: `1px solid ${C.border}`, borderRadius: R.sm, background: C.surface, cursor: "pointer", color: C.green, fontWeight: 700, fontSize: T.base, fontFamily: "inherit" }}>−</button>
                      <span style={{ minWidth: 26, textAlign: "center", fontWeight: 600 }}>{q}</span>
                      <button onClick={() => setQ(id, q + 1)} aria-label={`增加 ${p.name} 數量`} style={{ width: 36, height: 36, border: `1px solid ${C.border}`, borderRadius: R.sm, background: C.surface, cursor: "pointer", color: C.green, fontWeight: 700, fontSize: T.base, fontFamily: "inherit" }}>＋</button>
                    </div>
                    <span className="serif" style={{ fontWeight: 700, color: C.green, whiteSpace: "nowrap", flexShrink: 0 }}>NT${(p.price * q).toLocaleString()}</span>
                  </div>
                ); })
            }
          </div>
          <div style={{ padding: `${S[3]}px ${S[4]}px`, background: C.surface, borderTop: `1px solid ${C.hairline}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: T.sm, color: C.sub }}>合計</span>
            <span className="serif" style={{ fontSize: T.xl, fontWeight: 700, color: C.green }}>NT${total.toLocaleString()}</span>
          </div>
        </div>

        <div ref={formRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", background: C.white, borderRadius: R.lg, padding: S[5], boxShadow: `0 0 0 1px ${C.hairline}, ${E[1]}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[4] }}>
            <Icon name="user" size={16} color={C.green} />
            <h2 className="serif" style={{ margin: 0, fontSize: T.md, fontWeight: 700, color: C.text }}>訂購人資訊</h2>
          </div>

          <Field label="Email" required error={errors.email}>
            <TextInput value={form.email} onChange={v => { setF("email", v); setEmailLookupDone(false); setEmailChecked(false); setErrors(p => ({ ...p, email: null, emailConfirm: null })); }}
              type="email" autoComplete="email" inputMode="email" placeholder="請先輸入 Email"
              onBlur={handleEmailBlur} />
          </Field>
          {lookingUp && (
            <div style={{ background: C.surface, borderRadius: R.md, padding: `${S[5]}px ${S[4]}px`, textAlign: "center", margin: `${S[2]}px 0 ${S[4]}px`, display: "flex", flexDirection: "column", alignItems: "center", gap: S[2] }}>
              <Icon name="search" size={20} color={C.gl} />
              <div style={{ fontSize: T.sm, color: C.sub }}>查詢歷史訂購紀錄中，請稍候…</div>
            </div>
          )}
          {emailChecked && emailLookupDone && (
            <div style={{ display: "flex", alignItems: "center", gap: S[2], background: "#edf6f1", borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, fontSize: T.sm, color: "#1f5c40", marginTop: -S[2], marginBottom: S[4] }}>
              <Icon name="check" size={15} strokeWidth={2.4} />
              找到歷史紀錄，已自動帶入資料
            </div>
          )}
          {emailChecked && !emailLookupDone && form.email && isValidEmail(form.email) && (
            <Field label="再次確認 Email" required error={errors.emailConfirm} hint="為避免打錯，請再輸入一次">
              {/* autoComplete 關閉：若讓瀏覽器自動填入，兩欄必然一致，防呆就失效了 */}
              <TextInput value={form.emailConfirm} onChange={v => { setF("emailConfirm", v); setErrors(p => ({ ...p, emailConfirm: null })); }}
                type="email" autoComplete="off" inputMode="email" placeholder="請再輸入一次 Email 確認" />
            </Field>
          )}

          <div style={{ position: "relative", ...(lookingUp && { pointerEvents: "none" as const, opacity: 0.35 }) }}>
          <Field label="姓名" required error={errors.ordererName}><TextInput value={form.ordererName} autoComplete="name" onChange={v => {
            setF("ordererName", v);
            if (recipientLinked.current) setF("recipientName", v);
          }} placeholder="姓名" /></Field>
          <Field label="手機" required error={errors.phone}><TextInput value={form.phone} type="tel" autoComplete="tel" inputMode="tel" onChange={v => {
            setF("phone", v);
            if (recipientLinked.current) setF("recipientPhone", v);
          }} placeholder="0912-345-678" /></Field>
          <Field label="與我的關係" required error={errors.relation}>
            <SelInput value={form.relation} onChange={v => setF("relation", v)} options={["109A同學", "109B同學", "109C同學", "EMBA學長姐", "老師", "朋友", "其他"]} />
          </Field>

          <div style={{ display: "flex", alignItems: "center", gap: S[2], margin: `${S[5]}px 0 ${S[4]}px`, paddingTop: S[4], borderTop: `1px solid ${C.hairline}` }}>
            <Icon name="box" size={16} color={C.green} />
            <h2 className="serif" style={{ margin: 0, fontSize: T.md, fontWeight: 700, color: C.text }}>收件人資訊</h2>
          </div>
          <Field label="收件人姓名" required error={errors.recipientName}><TextInput value={form.recipientName} autoComplete="shipping name" onChange={v => { recipientLinked.current = false; setF("recipientName", v); }} placeholder="收件人姓名" /></Field>
          <Field label="收件地址" required error={errors.recipientAddress}><TextInput value={form.recipientAddress} autoComplete="shipping street-address" onChange={v => setF("recipientAddress", v)} placeholder="縣市 + 詳細地址" /></Field>
          <Field label="收件人電話" required error={errors.recipientPhone}><TextInput value={form.recipientPhone} type="tel" autoComplete="shipping tel" inputMode="tel" onChange={v => { recipientLinked.current = false; setF("recipientPhone", v); }} placeholder="0912-345-678" /></Field>

          {/* 錯誤摘要放在按鈕上方：原本「請至少選擇一項商品」顯示在商品欄最上方，
              手機版按下送出時它在畫面外，使用者會以為按鈕沒反應。 */}
          {errors.cart && (
            <div ref={summaryRef} role="alert" style={{ display: "flex", alignItems: "center", gap: S[2], background: "#fdf1ef", borderRadius: R.sm, padding: `${S[3]}px ${S[3]}px`, fontSize: T.sm, color: C.redOn, marginBottom: S[3] }}>
              <Icon name="alert" size={16} strokeWidth={2.1} />
              {errors.cart}
            </div>
          )}

          <Btn onClick={submit} disabled={submitting || lookingUp} full color={C.green} style={{ marginTop: S[1], minHeight: 52, fontSize: T.md }}>
            {submitting ? (submitStatus || "處理中…") : <><Icon name="mail" size={17} />送出訂單</>}
          </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
