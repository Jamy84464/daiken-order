import { C, T, S, R } from "../../constants";
import { Icon } from "../Icon";
import { Btn } from "../ui";

/**
 * 後台分頁的讀取失敗狀態。
 *
 * 原本所有分頁在讀不到資料時都顯示「尚無訂單 / 查無資料」，
 * 跟真的沒資料完全無法分辨 —— GAS 掛掉或手機沒訊號時，
 * 後台會安靜地回報「零筆訂單」，這對需要靠它判斷出貨的人是最糟的失敗方式。
 */
export function LoadError({ message, onRetry, busy }: { message: string; onRetry: () => void; busy?: boolean }) {
  return (
    <div role="alert" style={{
      background: "#fdf1ef", borderRadius: R.md, padding: S[5],
      display: "flex", flexDirection: "column", alignItems: "center", gap: S[3], textAlign: "center",
    }}>
      <Icon name="alert" size={24} color={C.redOn} strokeWidth={2} />
      <div>
        <div style={{ fontSize: T.base, fontWeight: 700, color: C.redOn }}>讀取失敗</div>
        <div style={{ fontSize: T.sm, color: "#8a5048", marginTop: S[1], lineHeight: 1.6 }}>
          {message}
          <br />
          這不代表沒有資料，請重試後再做任何操作。
        </div>
      </div>
      <Btn onClick={onRetry} disabled={busy} small color={C.redOn}>
        {busy ? "重試中…" : <><Icon name="refresh" size={14} strokeWidth={2.1} />重試</>}
      </Btn>
    </div>
  );
}

export function Loading({ label = "載入中…" }: { label?: string }) {
  return <div style={{ color: C.muted, fontSize: T.sm, padding: S[5], textAlign: "center" }}>{label}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: C.muted, fontSize: T.sm, padding: `${S[6]}px ${S[4]}px`, textAlign: "center", lineHeight: 1.8 }}>
      {children}
    </div>
  );
}
