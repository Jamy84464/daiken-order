import { C } from "../constants";
import { Btn } from "./ui";

interface ConfirmModalProps {
  msg: string;
  onOk: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ msg, onOk, onCancel }: ConfirmModalProps) {
  return (
    <div role="dialog" aria-label="確認對話框" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="pop" style={{ background: C.white, borderRadius: 16, padding: 28, maxWidth: 380, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: "0.92rem", lineHeight: 1.8, marginBottom: 20 }}>{msg}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <Btn onClick={onOk} color={C.red}>確認</Btn>
          <Btn onClick={onCancel} outline color={C.muted}>取消</Btn>
        </div>
      </div>
    </div>
  );
}
