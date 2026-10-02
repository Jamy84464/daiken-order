import { useState, useMemo } from "react";
import { C, T, S, R, E } from "../constants";
import { flatProducts, orderKey, nowStr } from "../utils/helpers";
import { load, save, loadFromGAS, verifySaved } from "../utils/storage";
import { requestSendEmail, genConfirmEmail } from "../utils/email";
import { showToast } from "../utils/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { Btn, Field, TextInput } from "./ui";
import { Icon } from "./Icon";
import { ProductCard } from "./ProductCard";
import { StatusBadge } from "./StatusBadge";
import type { Settings, Category, Order, Cart } from "../types";

interface MyOrderViewProps {
  settings: Settings;
  cats: Category[];
}

export function MyOrderView({ settings, cats }: MyOrderViewProps) {
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [cart, setCart] = useState<Cart>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [saved, setSaved] = useState(false);
  const fp = useMemo(() => flatProducts(cats), [cats]);
  const isMobile = useIsMobile();

  const lookup = async () => {
    if (!email.trim()) { return; }
    setLoading(true); setNotFound(false); setOrder(null); setSaved(false);
    const key = orderKey(settings.year, settings.month);
    const orders = (await load(key)) || {};
    const found = orders[email.toLowerCase().trim()];
    setLoading(false);
    if (found) { setOrder(found); } else { setNotFound(true); }
  };

  const startEdit = () => {
    if (!order) return;
    setCart({ ...order.cart });
    setForm({ ordererName: order.ordererName, email: order.email, lineId: order.lineId || "", phone: order.phone, relation: order.relation, recipientName: order.recipientName, recipientAddress: order.recipientAddress, recipientPhone: order.recipientPhone, note: order.note || "" });
    setEditMode(true); setSaved(false);
  };

  const handleSave = async () => {
    if (!Object.values(cart).some(q => q > 0)) { showToast("購物車是空的！"); return; }
    setSaving(true);
    try {
      const key = orderKey(settings.year, settings.month);
      const orders = (await loadFromGAS(key)) || {};
      const oldOrder = orders[email.toLowerCase()];
      const updated: Order = {
        ...oldOrder, ...form, cart,
        total: Object.entries(cart).filter(([, q]) => q > 0).reduce((s, [id, q]) => s + (fp[id]?.price || 0) * q, 0),
        updatedAt: nowStr(),
      };
      orders[email.toLowerCase()] = updated;
      setSaveStatus("儲存中…");
      await save(key, orders);
      const savedV = orders._v;
      setSaveStatus("驗證寫入中…");
      const verified = await verifySaved(key, email.toLowerCase(), savedV);
      if (!verified) {
        alert("訂單儲存驗證失敗，請稍後再試一次。若問題持續，請聯絡我們。");
        setSaving(false);
        setSaveStatus("");
        return;
      }
      const cartChanged = JSON.stringify(oldOrder?.cart) !== JSON.stringify(cart);
      const infoChanged = oldOrder?.recipientName !== form.recipientName || oldOrder?.recipientAddress !== form.recipientAddress || oldOrder?.recipientPhone !== form.recipientPhone;
      if (cartChanged || infoChanged) {
        setSaveStatus("寄送確認信…");
        await requestSendEmail({
          to: email.toLowerCase(),
          subject: `【大研生醫團購】${settings.year}年${settings.month}月 訂單已更新 — ${updated.ordererName}`,
          body: genConfirmEmail(updated, cats),
          isHtml: true,
        });
      }
      setSaving(false); setSaveStatus(""); setOrder(updated); setEditMode(false); setSaved(true);
    } catch (err) {
      console.warn("Save error:", err);
      showToast("儲存時發生錯誤，請再試一次。");
      setSaving(false);
      setSaveStatus("");
    }
  };

  if (editMode) return (
    <div className="fu">
      <button onClick={() => setEditMode(false)} style={{ background: "none", border: "none", color: C.green, cursor: "pointer", fontSize: "0.85rem", marginBottom: 14 }}>← 取消修改</button>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 330px", gap: isMobile ? 16 : 24, alignItems: "start" }}>
        <div>
          {cats.map(cat => {
            const visibleProds = cat.products.filter(p => !p.hidden && !p.outOfStock);
            if (visibleProds.length === 0) return null;
            return (
              <div key={cat.key} style={{ marginBottom: 22 }}>
                <h2 className="serif" style={{ margin: `0 0 ${S[3]}px`, fontSize: T.md, fontWeight: 700, color: C.text }}>{cat.label}</h2>
                {/* 原本這裡的格線與 ProductCard 都寫死桌面版（isMobile={false}），
                    手機上改訂單時卡片會過大、字會擠。 */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(auto-fill,minmax(190px,1fr))", gap: S[3] }}>
                  {visibleProds.map(p => (
                    <ProductCard key={p.id} product={p} quantity={cart[p.id] || 0}
                      onQuantityChange={q => setCart(prev => ({ ...prev, [p.id]: Math.max(0, Math.min(99, q)) }))}
                      isMobile={isMobile} showLink={false} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ position: isMobile ? "static" : "sticky", top: 72, display: "flex", flexDirection: "column", gap: 14, ...(!isMobile && { maxHeight: "calc(100vh - 88px)", overflow: "hidden" }) }}>
          {(() => { const editItems = Object.entries(cart).filter(([, q]) => q > 0); const editTotal = editItems.reduce((s, [id, q]) => s + (fp[id]?.price || 0) * q, 0); return (
          <div style={{ flexShrink: 0, background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 3px 18px rgba(0,0,0,.06)" }}>
            <div style={{ background: C.green, color: C.white, padding: "12px 16px", fontWeight: 600, fontSize: "0.9rem" }}>
              🛒 購物車 {editItems.length > 0 && <span style={{ background: "rgba(255,255,255,.2)", borderRadius: 9, padding: "2px 8px", fontSize: "0.75rem", marginLeft: 6 }}>{editItems.length} 種</span>}
            </div>
            <div style={{ padding: "10px 16px", maxHeight: 200, overflowY: "auto" }}>
              {editItems.length === 0
                ? <div style={{ textAlign: "center", color: C.muted, fontSize: "0.82rem", padding: "14px 0" }}>尚未加入商品</div>
                : editItems.map(([id, q]) => { const p = fp[id]; return p && (
                  <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}`, gap: 8, fontSize: "0.8rem" }}>
                    <span style={{ flex: 1, lineHeight: 1.4 }}>{p.name}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <button onClick={() => setCart(prev => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) - 1) }))} aria-label={`減少 ${p.name} 數量`} style={{ width: 36, height: 36, border: `1px solid ${C.border}`, borderRadius: R.sm, background: C.surface, cursor: "pointer", color: C.green, fontWeight: 700, fontSize: T.base, fontFamily: "inherit" }}>−</button>
                      <span style={{ minWidth: 26, textAlign: "center", fontWeight: 600 }}>{q}</span>
                      <button onClick={() => setCart(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }))} aria-label={`增加 ${p.name} 數量`} style={{ width: 36, height: 36, border: `1px solid ${C.border}`, borderRadius: R.sm, background: C.surface, cursor: "pointer", color: C.green, fontWeight: 700, fontSize: T.base, fontFamily: "inherit" }}>＋</button>
                    </div>
                    <span style={{ fontWeight: 600, color: C.green, whiteSpace: "nowrap" }}>NT${(p.price * q).toLocaleString()}</span>
                  </div>
              ); })
              }
            </div>
            <div style={{ padding: "10px 16px", background: C.cream, borderTop: `2px solid ${C.gp}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.82rem", color: C.muted }}>合計</span>
              <span className="serif" style={{ fontSize: "1.2rem", fontWeight: 700, color: C.green }}>NT${editTotal.toLocaleString()}</span>
            </div>
          </div>); })()}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: C.white, borderRadius: R.lg, padding: S[5], boxShadow: `0 0 0 1px ${C.hairline}, ${E[1]}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[4] }}>
            <Icon name="box" size={16} color={C.green} />
            <h2 className="serif" style={{ margin: 0, fontSize: T.md, fontWeight: 700, color: C.text }}>修改收件資訊</h2>
          </div>
          <Field label="收件人姓名" required><TextInput value={form.recipientName} autoComplete="shipping name" onChange={v => setForm(p => ({ ...p, recipientName: v }))} /></Field>
          <Field label="收件地址" required><TextInput value={form.recipientAddress} autoComplete="shipping street-address" onChange={v => setForm(p => ({ ...p, recipientAddress: v }))} /></Field>
          <Field label="收件人電話" required><TextInput value={form.recipientPhone} type="tel" autoComplete="shipping tel" inputMode="tel" onChange={v => setForm(p => ({ ...p, recipientPhone: v }))} /></Field>
          <Btn onClick={handleSave} disabled={saving} full style={{ minHeight: 52, fontSize: T.md }}>
            {saving ? (saveStatus || "儲存中…") : <><Icon name="check" size={17} strokeWidth={2.4} />確認更新訂單</>}
          </Btn>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fu" style={{ maxWidth: 580, margin: "0 auto" }}>
      <h1 className="serif" style={{ margin: `0 0 ${S[5]}px`, fontSize: T.lg, fontWeight: 700, color: C.text }}>查詢 / 修改我的訂單</h1>
      <div style={{ background: C.white, borderRadius: R.lg, padding: S[5], marginBottom: S[4], boxShadow: `0 0 0 1px ${C.hairline}, ${E[1]}` }}>
        <p style={{ fontSize: T.sm, color: C.sub, marginBottom: S[4], lineHeight: 1.8 }}>請輸入訂購時使用的 Email，查詢本月訂單。</p>
        <Field label="Email">
          <TextInput value={email} onChange={setEmail} type="email" autoComplete="email" inputMode="email" placeholder="your@email.com"
            onKeyDown={e => { if (e.key === "Enter" && !loading) lookup(); }} />
        </Field>
        <Btn onClick={lookup} disabled={loading} full style={{ minHeight: 48 }}>
          {loading ? "查詢中…" : <><Icon name="search" size={16} strokeWidth={2.1} />查詢訂單</>}
        </Btn>
        {notFound && (
          <div role="alert" style={{ display: "flex", alignItems: "center", gap: S[2], marginTop: S[3], background: "#fdf1ef", borderRadius: R.sm, padding: `${S[3]}px`, fontSize: T.sm, color: C.redOn }}>
            <Icon name="alert" size={16} strokeWidth={2.1} />
            查無本月訂單，請確認 Email 是否正確。
          </div>
        )}
      </div>

      {order && (
        <div className="pop" style={{ background: C.white, borderRadius: R.lg, overflow: "hidden", boxShadow: `0 0 0 1px ${C.hairline}, ${E[1]}` }}>
          {saved && (
            <div style={{ display: "flex", alignItems: "center", gap: S[2], background: "#edf6f1", color: "#1f5c40", padding: `${S[3]}px ${S[4]}px`, fontSize: T.sm }}>
              <Icon name="check" size={16} strokeWidth={2.4} />
              訂單已成功更新
            </div>
          )}
          <div style={{ background: C.green, color: C.white, padding: "13px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="serif" style={{ fontWeight: 700, fontSize: "0.97rem" }}>{order.ordererName} 的訂單</div>
              <div style={{ fontSize: "0.72rem", opacity: .8, marginTop: 2 }}>{order.createdAt}{order.updatedAt && ` | 更新：${order.updatedAt}`}</div>
            </div>
            <StatusBadge status={order.status} />
          </div>
          <div style={{ padding: "15px 18px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 14px", marginBottom: 13, fontSize: "0.82rem" }}>
              {([["📱", order.phone], ["👥", order.relation]] as [string, string][]).map(([k, v]) => (
                <div key={k}><span style={{ color: C.muted }}>{k}：</span>{v}</div>
              ))}
              <div style={{ gridColumn: "1/-1" }}><span style={{ color: C.muted }}>📍 收件：</span>{order.recipientName}｜{order.recipientPhone}｜{order.recipientAddress}</div>
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 11 }}>
              {Object.entries(order.cart).filter(([, q]) => q > 0).map(([id, q]) => { const p = fp[id]; return p && (
                <div key={id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span>{p.name} × {q}</span>
                  <span style={{ fontWeight: 600, color: C.green }}>NT${(p.price * q).toLocaleString()}</span>
                </div>
              ); })}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontWeight: 700, color: C.green }}>
                <span className="serif">合計</span><span className="serif" style={{ fontSize: "1.1rem" }}>NT${order.total.toLocaleString()}</span>
              </div>
            </div>
          </div>
          {order.status !== "handled" && (
            <div style={{ padding: "11px 18px", borderTop: `1px solid ${C.border}`, background: C.cream }}>
              <Btn onClick={startEdit} full color={C.gold}>✏️ 修改訂單</Btn>
            </div>
          )}
          {order.status === "handled" && (
            <div style={{ padding: "10px 18px", background: C.cream, fontSize: "0.78rem", color: C.muted, textAlign: "center", borderTop: `1px solid ${C.border}` }}>此訂單已處理，如需更改請聯絡 <a href="mailto:jamy844.bot@gmail.com" style={{ color: C.gl }}>jamy844.bot@gmail.com</a></div>
          )}
        </div>
      )}
    </div>
  );
}
