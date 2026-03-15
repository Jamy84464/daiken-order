import { useState, useEffect } from "react";
import { C } from "../constants";
import { onToast } from "../utils/toast";
import type { ToastItem } from "../types";

export function Toast() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    return onToast(({ msg, type }) => {
      const id = Date.now();
      setItems(prev => [...prev, { id, msg, type: type as ToastItem["type"] }]);
      setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 4000);
    });
  }, []);
  if (items.length === 0) return null;
  return (
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 4000, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420, width: "calc(100% - 32px)" }}>
      {items.map(t => (
        <div key={t.id} className="pop" style={{
          background: t.type === "success" ? C.gp : "#fff5f5",
          border: `1.5px solid ${t.type === "success" ? C.gl : C.red}`,
          color: t.type === "success" ? C.green : C.red,
          borderRadius: 10, padding: "10px 16px", fontSize: "0.84rem", lineHeight: 1.6,
          boxShadow: "0 4px 20px rgba(0,0,0,.12)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10,
        }}>
          <span>{t.type === "success" ? "✅" : "⚠️"} {t.msg}</span>
          <button onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))} aria-label="關閉"
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "1rem", flexShrink: 0 }}>✕</button>
        </div>
      ))}
    </div>
  );
}
