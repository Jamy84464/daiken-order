import { C, T, S } from "../constants";
import { Btn, Modal } from "./ui";

interface Props {
  title: string;
  msg: string;
  okLabel?: string;
  onOk: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ title, msg, okLabel = "確定", onOk, onCancel }: Props) {
  return (
    <Modal onClose={onCancel} labelledBy="confirm-title" maxWidth={400}>
      <h2 id="confirm-title" className="display" style={{ fontSize: T.lg, fontWeight: 400, marginBottom: S[3] }}>{title}</h2>
      <p style={{ fontSize: T.base, lineHeight: 1.8, color: C.sub, whiteSpace: "pre-line", marginBottom: S[5] }}>{msg}</p>
      <div style={{ display: "flex", gap: S[3] }}>
        <Btn variant="ghost" onClick={onCancel} style={{ flex: 1 }}>取消</Btn>
        <Btn variant="coral" onClick={onOk} style={{ flex: 1 }}>{okLabel}</Btn>
      </div>
    </Modal>
  );
}
