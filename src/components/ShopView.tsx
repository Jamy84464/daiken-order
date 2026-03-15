import { useState, useRef, useMemo } from "react";
import { C } from "../constants";
import { isValidEmail, flatProducts, orderKey, nowStr } from "../utils/helpers";
import { load, save } from "../utils/storage";
import { requestSendEmail, genConfirmEmail } from "../utils/email";
import { showToast } from "../utils/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { Btn, Field, TextInput, SelInput } from "./ui";
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
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [emailLookupDone, setEmailLookupDone] = useState(false);
  const [emailChecked, setEmailChecked] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const recipientLinked = useRef(true);
  const isMobile = useIsMobile();
  const cartRef = useRef<HTMLDivElement>(null);

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

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const key = orderKey(settings.year, settings.month);
      const existing = (await load(key)) || {};
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
      await save(key, existing);
      const custs = (await load("customers")) || {};
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
      const emailContent = genConfirmEmail(order, cats);
      requestSendEmail({
        to: ek,
        subject: `【大研生醫團購】${settings.year}年${settings.month}月 訂購確認 — ${form.ordererName}`,
        body: emailContent,
        isHtml: true,
      });
      setSubmitting(false);
      onOrderSuccess(order);
      setCart({});
      setForm({ email: "", emailConfirm: "", ordererName: "", phone: "", relation: "", recipientName: "", recipientAddress: "", recipientPhone: "" });
      setEmailLookupDone(false);
      setEmailChecked(false);
    } catch (err) {
      console.warn("Submit error:", err);
      showToast("送出時發生錯誤，您的表單資料已保留，請再試一次。");
      setSubmitting(false);
      return;
    }
  };

  const shown = tab === "all"
    ? cats.map(c => ({ ...c, products: c.products.filter(p => !p.hidden) })).filter(c => c.products.length > 0)
    : cats.filter(c => c.key === tab).map(c => ({ ...c, products: c.products.filter(p => !p.hidden) }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 330px", gap: isMobile ? 16 : 24, alignItems: "start" }}>
      {/* Mobile: 浮動購物車摘要列 */}
      {isMobile && cartItems.length > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, background: C.green, color: C.white, padding: "10px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 -3px 16px rgba(0,0,0,.2)" }}>
          <div>
            <span style={{ fontSize: "0.82rem" }}>{cartItems.length} 種商品</span>
            <span className="serif" style={{ fontSize: "1.15rem", fontWeight: 700, marginLeft: 10 }}>NT${total.toLocaleString()}</span>
          </div>
          <button onClick={() => cartRef.current?.scrollIntoView({ behavior: "smooth" })}
            style={{ background: "rgba(255,255,255,.2)", color: C.white, border: "1px solid rgba(255,255,255,.4)", borderRadius: 8, padding: "7px 14px", fontSize: "0.82rem", cursor: "pointer", fontFamily: "'Noto Sans TC',sans-serif", fontWeight: 600 }}>
            送出訂單 ▼
          </button>
        </div>
      )}
      {/* Products */}
      <div>
        {errors.cart && <div style={{ background: "#fff5f5", border: `1px solid ${C.red}`, borderRadius: 8, padding: "8px 14px", fontSize: "0.82rem", color: C.red, marginBottom: 14 }}>{errors.cart}</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
          {[{ key: "all", label: "全部" }, ...cats.map(c => ({ key: c.key, label: c.label }))].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              background: tab === t.key ? C.green : C.white, color: tab === t.key ? C.white : C.muted,
              border: `1.5px solid ${tab === t.key ? C.green : C.border}`, borderRadius: 20,
              padding: "5px 12px", fontSize: "0.78rem", cursor: "pointer", transition: "all .15s",
            }}>{t.label}</button>
          ))}
        </div>
        {shown.map(cat => (
          <div key={cat.key} style={{ marginBottom: 26 }}>
            <div className="serif" style={{ fontSize: "0.93rem", fontWeight: 600, color: C.green, marginBottom: 10, paddingBottom: 7, borderBottom: `2px solid ${C.gp}` }}>{cat.label}</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(auto-fill,minmax(195px,1fr))", gap: isMobile ? 8 : 10 }}>
              {cat.products.map(p => (
                <ProductCard key={p.id} product={p} quantity={cart[p.id] || 0} onQuantityChange={q => setQ(p.id, q)} isMobile={isMobile} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar: Cart + Form */}
      <div ref={cartRef} style={{ position: isMobile ? "static" : "sticky", top: 72, display: "flex", flexDirection: "column", gap: 14, paddingBottom: isMobile && cartItems.length > 0 ? 60 : 0, ...(!isMobile && { maxHeight: "calc(100vh - 88px)", overflow: "hidden" }) }}>
        <div style={{ flexShrink: 0, background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 3px 18px rgba(0,0,0,.06)" }}>
          <div style={{ background: C.green, color: C.white, padding: "13px 17px", fontWeight: 600, fontSize: "0.93rem" }}>
            🛒 購物車 {cartItems.length > 0 && <span style={{ background: "rgba(255,255,255,.2)", borderRadius: 9, padding: "2px 8px", fontSize: "0.75rem", marginLeft: 6 }}>{cartItems.length} 種</span>}
          </div>
          <div style={{ padding: "10px 16px", maxHeight: 180, overflowY: "auto" }}>
            {cartItems.length === 0
              ? <div style={{ textAlign: "center", color: C.muted, fontSize: "0.82rem", padding: "18px 0", lineHeight: 2 }}>尚未加入商品</div>
              : cartItems.map(([id, q]) => { const p = fp[id]; return p && (
                  <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}`, gap: 8, fontSize: "0.8rem" }}>
                    <span style={{ flex: 1, lineHeight: 1.4 }}>{p.name}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <button onClick={() => setQ(id, q - 1)} style={{ width: 20, height: 20, border: `1px solid ${C.border}`, borderRadius: 4, background: C.cream, cursor: "pointer", color: C.green, fontWeight: 700, fontSize: "0.85rem" }}>−</button>
                      <span style={{ minWidth: 18, textAlign: "center", fontWeight: 600 }}>{q}</span>
                      <button onClick={() => setQ(id, q + 1)} style={{ width: 20, height: 20, border: `1px solid ${C.border}`, borderRadius: 4, background: C.cream, cursor: "pointer", color: C.green, fontWeight: 700, fontSize: "0.85rem" }}>＋</button>
                    </div>
                    <span style={{ fontWeight: 600, color: C.green, whiteSpace: "nowrap" }}>NT${(p.price * q).toLocaleString()}</span>
                  </div>
                ); })
            }
          </div>
          <div style={{ padding: "11px 17px", background: C.cream, borderTop: `2px solid ${C.gp}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.83rem", color: C.muted }}>合計</span>
            <span className="serif" style={{ fontSize: "1.35rem", fontWeight: 700, color: C.green }}>NT${total.toLocaleString()}</span>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 16, padding: 17 }}>
          <div className="serif" style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 14, color: C.text, paddingBottom: 8, borderBottom: `2px solid ${C.gp}` }}>📋 訂購人資訊</div>

          <Field label="Email" required error={errors.email}>
            <TextInput value={form.email} onChange={v => { setF("email", v); setEmailLookupDone(false); setEmailChecked(false); setErrors(p => ({ ...p, email: null, emailConfirm: null })); }} type="email" placeholder="請先輸入 Email"
              onBlur={handleEmailBlur} />
          </Field>
          {lookingUp && (
            <div style={{ background: "rgba(250,247,242,.85)", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "20px 16px", textAlign: "center", margin: "8px 0" }}>
              <div style={{ fontSize: "1.1rem", marginBottom: 6 }}>🔍</div>
              <div style={{ fontSize: "0.82rem", color: C.muted }}>查詢歷史訂購紀錄中，請稍候…</div>
            </div>
          )}
          {emailChecked && emailLookupDone && <div style={{ background: C.gp, border: `1px solid ${C.gl}`, borderRadius: 7, padding: "7px 11px", fontSize: "0.78rem", color: C.green, marginTop: -8, marginBottom: 10 }}>✅ 找到歷史紀錄，已自動帶入資料</div>}
          {emailChecked && !emailLookupDone && form.email && isValidEmail(form.email) && (
            <Field label="再次確認 Email" required error={errors.emailConfirm}>
              <TextInput value={form.emailConfirm} onChange={v => { setF("emailConfirm", v); setErrors(p => ({ ...p, emailConfirm: null })); }} type="email" placeholder="請再輸入一次 Email 確認" />
            </Field>
          )}

          <div style={{ position: "relative", ...(lookingUp && { pointerEvents: "none" as const, opacity: 0.35, filter: "blur(1px)" }) }}>
          <Field label="姓名" required error={errors.ordererName}><TextInput value={form.ordererName} onChange={v => {
            setF("ordererName", v);
            if (recipientLinked.current) setF("recipientName", v);
          }} placeholder="姓名" /></Field>
          <Field label="手機" required error={errors.phone}><TextInput value={form.phone} onChange={v => {
            setF("phone", v);
            if (recipientLinked.current) setF("recipientPhone", v);
          }} type="tel" placeholder="0912-345-678" /></Field>
          <Field label="與我的關係" required error={errors.relation}>
            <SelInput value={form.relation} onChange={v => setF("relation", v)} options={["109A同學", "109B同學", "109C同學", "EMBA學長姐", "老師", "朋友", "其他"]} />
          </Field>

          <div className="serif" style={{ fontSize: "0.9rem", fontWeight: 700, margin: "14px 0 10px", color: C.text, paddingBottom: 8, borderBottom: `2px solid ${C.gp}` }}>📦 收件人資訊</div>
          <Field label="收件人姓名" required error={errors.recipientName}><TextInput value={form.recipientName} onChange={v => { recipientLinked.current = false; setF("recipientName", v); }} placeholder="收件人姓名" /></Field>
          <Field label="收件地址" required error={errors.recipientAddress}><TextInput value={form.recipientAddress} onChange={v => setF("recipientAddress", v)} placeholder="縣市 + 詳細地址" /></Field>
          <Field label="收件人電話" required error={errors.recipientPhone}><TextInput value={form.recipientPhone} onChange={v => { recipientLinked.current = false; setF("recipientPhone", v); }} type="tel" placeholder="0912-345-678" /></Field>

          <Btn onClick={submit} disabled={submitting || lookingUp} full color={C.green} style={{ marginTop: 4, padding: "13px" }}>
            {submitting ? "處理中…" : "送出訂單 ✉️"}
          </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
