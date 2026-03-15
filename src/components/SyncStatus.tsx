import { useState, useEffect } from "react";
import { C } from "../constants";
import { onSyncWarning } from "../utils/storage";

export function SyncStatus() {
  const [warnings, setWarnings] = useState<string[]>([]);
  useEffect(() => {
    return onSyncWarning((key: string) => {
      setWarnings(prev => {
        if (prev.includes(key)) return prev;
        return [...prev, key];
      });
    });
  }, []);
  if (warnings.length === 0) return null;
  return (
    <div style={{
      position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
      zIndex: 3000, background: "#fff5f5", border: `1.5px solid ${C.red}`,
      borderRadius: 12, padding: "10px 18px", boxShadow: "0 4px 20px rgba(0,0,0,.15)",
      maxWidth: 420, width: "calc(100% - 32px)", fontSize: "0.82rem", lineHeight: 1.7,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <strong style={{ color: C.red }}>⚠️ 雲端同步異常</strong><br />
          部分資料可能未成功寫入 Google Sheets，請稍後重新整理頁面確認。
        </div>
        <button onClick={() => setWarnings([])} aria-label="關閉"
          style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "1.1rem", flexShrink: 0 }}>✕</button>
      </div>
    </div>
  );
}
