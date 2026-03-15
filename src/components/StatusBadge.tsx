import { memo } from "react";
import { C } from "../constants";

export const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
  const isHandled = status === "handled";
  return (
    <span style={{
      background: isHandled ? "rgba(183,121,31,.8)" : "rgba(255,255,255,.2)",
      color: C.white, padding: "3px 10px", borderRadius: 7, fontSize: "0.73rem",
    }}>
      {isHandled ? "✅ 已處理" : "⏳ 待處理"}
    </span>
  );
});
