import { useEffect, useRef } from "react";
import { C, T, S, R } from "../constants";
import { Btn } from "./ui";

interface ConfirmModalProps {
  msg: string;
  onOk: () => void;
  onCancel: () => void;
  /** 確認鈕文字，預設「確認」。危險操作建議寫明做什麼，例如「確定清除」 */
  okLabel?: string;
}

export function ConfirmModal({ msg, onOk, onCancel, okLabel = "確認" }: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Esc 關閉，並把初始焦點放在「取消」—— 安全選項才是預設
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    cancelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div role="dialog" aria-modal="true" aria-label="確認對話框"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(26,26,26,.55)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: S[4] }}>
      <div className="pop" style={{ background: C.white, borderRadius: R.lg, padding: S[6], maxWidth: 400, width: "100%" }}>
        {/* pre-line：訊息裡的換行要能顯示，否則多行說明會黏成一整段 */}
        <div style={{ fontSize: T.base, lineHeight: 1.8, marginBottom: S[5], whiteSpace: "pre-line", color: C.text }}>{msg}</div>
        {/* 取消在左且為預設焦點；原本危險的「確認」在左邊又是實心主視覺，剛好相反 */}
        <div style={{ display: "flex", gap: S[3] }}>
          <button ref={cancelRef} onClick={onCancel} style={{
            flex: 1, minHeight: 48, background: C.white, color: "#3d4752",
            border: "1.5px solid #d5cec3", borderRadius: R.md,
            fontSize: T.base, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
          }}>取消</button>
          <Btn onClick={onOk} color={C.redOn} style={{ flex: 1, minHeight: 48 }}>{okLabel}</Btn>
        </div>
      </div>
    </div>
  );
}
