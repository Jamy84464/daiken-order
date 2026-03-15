import { memo } from "react";
import { C, BASE_URL } from "../constants";
import type { Product } from "../types";

interface ProductCardProps {
  product: Product;
  quantity: number;
  onQuantityChange: (q: number) => void;
  isMobile: boolean;
  showLink?: boolean;
}

export const ProductCard = memo(function ProductCard({ product: p, quantity: q, onQuantityChange, isMobile, showLink = true }: ProductCardProps) {
  return (
    <div style={{ background: p.outOfStock ? "#f5f5f5" : q > 0 ? "#f0faf4" : C.white, border: `1.5px solid ${q > 0 ? C.green : C.border}`, borderRadius: isMobile ? 10 : 12, padding: isMobile ? 10 : 13, opacity: p.outOfStock ? .6 : 1, transition: "all .15s" }}>
      {showLink ? (
        <a href={p.url || BASE_URL} target="_blank" rel="noreferrer" style={{ fontSize: isMobile ? "0.76rem" : "0.83rem", fontWeight: 500, lineHeight: 1.4, display: "block", minHeight: "2.2em", color: C.text, textDecoration: "none" }}
          onMouseEnter={e => e.currentTarget.style.color = C.gl} onMouseLeave={e => e.currentTarget.style.color = C.text}>
          {p.name} 🔗
        </a>
      ) : (
        <div style={{ fontSize: "0.82rem", fontWeight: 500, lineHeight: 1.4, marginBottom: 6 }}>{p.name}</div>
      )}
      <div className="serif" style={{ fontSize: isMobile ? "0.9rem" : "1rem", fontWeight: 700, color: C.green, margin: isMobile ? "4px 0" : "6px 0" }}>NT${p.price.toLocaleString()}</div>
      {p.outOfStock
        ? <div style={{ background: "#eee", color: C.muted, borderRadius: 7, padding: "6px 0", textAlign: "center", fontSize: "0.8rem" }}>暫時缺貨</div>
        : <div style={{ display: "flex", border: `1.5px solid ${C.border}`, borderRadius: 7, overflow: "hidden", width: "100%" }}>
            <button onClick={() => onQuantityChange(q - 1)} aria-label={`減少 ${p.name} 數量`} style={{ flexShrink: 0, width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, background: C.cream, border: "none", cursor: "pointer", color: C.green, fontWeight: 700, fontSize: isMobile ? "0.9rem" : "1rem" }}>−</button>
            <input type="number" value={q} onChange={e => onQuantityChange(parseInt(e.target.value) || 0)} aria-label={`${p.name} 數量`} style={{ flex: 1, minWidth: 0, width: 0, border: "none", textAlign: "center", fontSize: isMobile ? "0.82rem" : "0.88rem", fontWeight: 600, background: C.white, outline: "none" }} />
            <button onClick={() => onQuantityChange(q + 1)} aria-label={`增加 ${p.name} 數量`} style={{ flexShrink: 0, width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, background: C.cream, border: "none", cursor: "pointer", color: C.green, fontWeight: 700, fontSize: isMobile ? "0.9rem" : "1rem" }}>＋</button>
          </div>
      }
    </div>
  );
});
