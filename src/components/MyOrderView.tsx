import { useState, useMemo } from "react";
import { C } from "../constants";
import { flatProducts, orderKey, nowStr } from "../utils/helpers";
import { load, save } from "../utils/storage";
import { requestSendEmail, genConfirmEmail } from "../utils/email";
import { showToast } from "../utils/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { Btn, Field, TextInput } from "./ui";
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
    const key = orderKey(settings.year, settings.month);
    const orders = (await load(key)) || {};
    const oldOrder = orders[email.toLowerCase()];
    const updated: Order = {
      ...oldOrder, ...form, cart,
      total: Object.entries(cart).filter(([, q]) => q > 0).reduce((s, [id, q]) => s + (fp[id]?.price || 0) * q, 0),
      updatedAt: nowStr(),
    };
    orders[email.toLowerCase()] = updated;
    await save(key, orders);
    const cartChanged = JSON.stringify(oldOrder?.cart) !== JSON.stringify(cart);
    const infoChanged = oldOrder?.recipientName !== form.recipientName || oldOrder?.recipientAddress !== form.recipientAddress || oldOrder?.recipientPhone !== form.recipientPhone;
    if (cartChanged || infoChanged) {
      requestSendEmail({
        to: email.toLowerCase(),
        subject: `【大研生醫團購】${settings.year}年${settings.month}月 訂單已更新 — ${updated.ordererName}`,
        body: genConfirmEmail(updated, cats),
        isHtml: true,
      });
    }
    setSaving(false); setOrder(updated); setEditMode(false); setSaved(true);
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
                <div className="serif" style={{ fontSize: "0.9rem", fontWeight: 600, color: C.green, marginBottom: 9, paddingBottom: 6, borderBottom: `2px solid ${C.gp}` }}>{cat.label}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 9 }}>
                  {visibleProds.map(p => (
                    <ProductCard key={p.id} product={p} quantity={cart[p.id] || 0}
                      onQuantityChange={q => setCart(prev => ({ ...prev, [p.id]: Math.max(0, Math.min(99, q)) }))}
                      isMobile={false} showLink={false} />
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
                      <button onClick={() => setCart(prev => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) - 1) }))} style={{ width: 20, height: 20, border: `1px solid ${C.border}`, borderRadius: 4, background: C.cream, cursor: "pointer", color: C.green, fontWeight: 700, fontSize: "0.85rem" }}>−</button>
                      <span style={{ minWidth: 18, textAlign: "center", fontWeight: 600 }}>{q}</span>
                      <button onClick={() => setCart(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }))} style={{ width: 20, height: 20, border: `1px solid ${C.border}`, borderRadius: 4, background: C.cream, cursor: "pointer", color: C.green, fontWeight: 700, fontSize: "0.85rem" }}>＋</button>
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
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 16, padding: 17 }}>
          <div className="serif" style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 12 }}>修改收件資訊</div>
          <Field label="收件人姓名" required><TextInput value={form.recipientName} onChange={v => setForm(p => ({ ...p, recipientName: v }))} /></Field>
          <Field label="收件地址" required><TextInput value={form.recipientAddress} onChange={v => setForm(p => ({ ...p, recipientAddress: v }))} /></Field>
          <Field label="收件人電話" required><TextInput value={form.recipientPhone} onChange={v => setForm(p => ({ ...p, recipientPhone: v }))} /></Field>
          <Btn onClick={handleSave} disabled={saving} full>✅ {saving ? "儲存中…" : "確認更新訂單"}</Btn>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fu" style={{ maxWidth: 580, margin: "0 auto" }}>
      <div className="serif" style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 18 }}>🔍 查詢 / 修改我的訂單</div>
      <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 22, marginBottom: 16 }}>
        <p style={{ fontSize: "0.85rem", color: C.muted, marginBottom: 14, lineHeight: 1.8 }}>請輸入訂購時使用的 Email，查詢本月訂單。</p>
        <Field label="Email"><TextInput value={email} onChange={setEmail} type="email" placeholder="your@email.com" /></Field>
        <Btn onClick={lookup} disabled={loading} full>{loading ? "查詢中…" : "查詢訂單"}</Btn>
        {notFound && <div style={{ marginTop: 12, background: "#fff5f5", border: `1px solid #feb2b2`, borderRadius: 8, padding: "9px 13px", fontSize: "0.82rem", color: C.red }}>查無本月訂單，請確認 Email 是否正確。</div>}
      </div>

      {order && (
        <div className="pop" style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
          {saved && <div style={{ background: C.gp, color: C.green, padding: "9px 16px", fontSize: "0.82rem", borderBottom: `1px solid ${C.gl}` }}>✅ 訂單已成功更新！</div>}
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
