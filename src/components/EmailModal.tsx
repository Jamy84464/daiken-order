import { C } from "../constants";
import { Btn } from "./ui";

interface EmailModalProps {
  title: string;
  content: string;
  onClose: () => void;
}

export function EmailModal({ title, content, onClose }: EmailModalProps) {
  return (
    <div role="dialog" aria-label={title} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="pop" style={{ background: C.white, borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "85vh", overflow: "auto", boxShadow: "0 8px 40px rgba(0,0,0,.15)" }}>
        <div style={{ background: C.green, color: C.white, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "18px 18px 0 0" }}>
          <span className="serif" style={{ fontWeight: 700 }}>{title}</span>
          <button onClick={onClose} aria-label="關閉" style={{ background: "none", border: "none", color: C.white, cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          <textarea readOnly value={content} rows={16}
            onFocus={e => e.target.select()}
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: "0.8rem", fontFamily: "monospace", background: "#f8f8f5", resize: "vertical", outline: "none", lineHeight: 1.8 }}
          />
          <div style={{ marginTop: 12 }}>
            <Btn onClick={onClose} outline color={C.muted} small>關閉</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
