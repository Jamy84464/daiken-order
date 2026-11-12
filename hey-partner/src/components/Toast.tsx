import { useState, useEffect } from "react";
import { C, R, E, S, T } from "../constants";
import { onToast } from "../utils/toast";

interface Item { id: number; msg: string; type: "success" | "error" }

export function Toast() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => onToast(({ msg, type }) => {
    const id = Date.now() + Math.random();
    setItems(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 4500);
  }), []);
  if (items.length === 0) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: "fixed", top: S[4], left: "50%", transform: "translateX(-50%)", zIndex: 4000, display: "flex", flexDirection: "column", gap: S[2], maxWidth: 440, width: "calc(100% - 32px)" }}>
      {items.map(t => (
        <div key={t.id} className="pop" style={{
          background: t.type === "success" ? C.primary : C.paper,
          color: t.type === "success" ? C.white : C.redDark,
          border: t.type === "success" ? "none" : "1.5px solid #f1c9b8",
          borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`, fontSize: T.sm, lineHeight: 1.6, fontWeight: 600,
          boxShadow: E[3], display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: S[3],
        }}>
          <span>{t.type === "success" ? "✨" : "⚠️"} {t.msg}</span>
          <button onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))} aria-label="關閉"
            style={{ background: "none", border: "none", color: "inherit", opacity: .7, cursor: "pointer", fontSize: T.base }}>✕</button>
        </div>
      ))}
    </div>
  );
}
