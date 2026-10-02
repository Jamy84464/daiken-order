import { memo } from "react";
import { C, T, S, R, E, BASE_URL } from "../constants";
import { Icon } from "./Icon";
import type { Product } from "../types";

interface ProductCardProps {
  product: Product;
  quantity: number;
  onQuantityChange: (q: number) => void;
  isMobile: boolean;
  showLink?: boolean;
}

export const ProductCard = memo(function ProductCard({
  product: p, quantity: q, onQuantityChange, isMobile, showLink = true,
}: ProductCardProps) {
  const selected = q > 0;
  const step = isMobile ? 40 : 44;

  // 單層分層：細邊用 box-shadow 的 spread 畫，不佔版面寬度，
  // 選取時換成綠色外框，不會因為邊框變粗而讓內容位移。
  const ring = p.outOfStock
    ? `0 0 0 1px ${C.hairline}`
    : selected
      ? `0 0 0 1.5px ${C.green}, ${E[2]}`
      : `0 0 0 1px ${C.hairline}, ${E[1]}`;

  return (
    <div style={{
      background: p.outOfStock ? "#fbfaf8" : selected ? "#f4faf6" : C.white,
      borderRadius: R.md,
      padding: isMobile ? S[3] : S[4],
      boxShadow: ring,
      display: "flex",
      flexDirection: "column",
      transition: "box-shadow .15s, background .15s",
    }}>
      {showLink ? (
        <a href={p.url || BASE_URL} target="_blank" rel="noreferrer"
          style={{
            display: "flex", alignItems: "flex-start", gap: S[1],
            fontSize: T.sm, fontWeight: 500, lineHeight: 1.45,
            minHeight: "2.9em", color: p.outOfStock ? C.muted : C.text, textDecoration: "none",
          }}>
          <span>{p.name}</span>
          <Icon name="external" size={12} style={{ marginTop: 3, opacity: .45 }} />
        </a>
      ) : (
        <div style={{ fontSize: T.sm, fontWeight: 500, lineHeight: 1.45, minHeight: "2.9em", color: p.outOfStock ? C.muted : C.text }}>
          {p.name}
        </div>
      )}

      <div className="serif" style={{
        fontSize: T.md, fontWeight: 700,
        color: p.outOfStock ? "#8a9199" : C.green,
        margin: `${S[2]}px 0 ${S[3]}px`,
      }}>
        NT${p.price.toLocaleString()}
      </div>

      {p.outOfStock ? (
        <div style={{
          height: step, background: "#efedea", color: C.muted, borderRadius: R.sm,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: T.sm, fontWeight: 500,
        }}>暫時缺貨</div>
      ) : (
        <div style={{
          display: "flex", alignItems: "center", height: step,
          border: `1px solid ${selected ? C.green : C.border}`,
          borderRadius: R.sm, overflow: "hidden", marginTop: "auto",
        }}>
          <button onClick={() => onQuantityChange(q - 1)} aria-label={`減少 ${p.name} 數量`} style={{
            width: step, height: step, flexShrink: 0,
            background: selected ? "#eaf3ee" : C.surface, border: "none",
            color: C.green, fontWeight: 700, fontSize: T.md, fontFamily: "inherit", cursor: "pointer",
          }}>−</button>
          <input type="number" value={q} aria-label={`${p.name} 數量`} inputMode="numeric"
            onChange={e => onQuantityChange(parseInt(e.target.value) || 0)}
            style={{
              flex: 1, minWidth: 0, width: 0, height: step, border: "none", textAlign: "center",
              fontSize: T.base, fontWeight: selected ? 700 : 600,
              color: selected ? C.green : C.text,
              background: "transparent", outline: "none", fontFamily: "inherit",
            }} />
          <button onClick={() => onQuantityChange(q + 1)} aria-label={`增加 ${p.name} 數量`} style={{
            width: step, height: step, flexShrink: 0,
            background: selected ? "#eaf3ee" : C.surface, border: "none",
            color: C.green, fontWeight: 700, fontSize: T.md, fontFamily: "inherit", cursor: "pointer",
          }}>＋</button>
        </div>
      )}
    </div>
  );
});
