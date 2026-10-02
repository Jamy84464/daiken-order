import React, { useId, Children, isValidElement, cloneElement } from "react";
import { C, T, S, R, TAP } from "../constants";

// ── Btn ──────────────────────────────────────────────────────────────────────
interface BtnProps {
  onClick?: () => void;
  children: React.ReactNode;
  color?: string;
  outline?: boolean;
  small?: boolean;
  disabled?: boolean;
  full?: boolean;
  type?: "button" | "submit";
  style?: React.CSSProperties;
  "aria-label"?: string;
}

export const Btn: React.FC<BtnProps> = ({
  onClick, children, color = C.green, outline, small, disabled, full,
  type = "button", style = {}, "aria-label": ariaLabel,
}) => (
  <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel} style={{
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: S[2],
    // 觸控門檻 44px；small 用於後台密集列表，仍保 36px（原本只有 29px）
    minHeight: small ? 36 : TAP,
    padding: small ? `0 ${S[3]}px` : `0 ${S[4]}px`,
    background: outline ? "transparent" : disabled ? "#dcd7cf" : color,
    color: outline ? (disabled ? "#9aa0a8" : color) : disabled ? "#8a8f99" : C.white,
    border: outline ? `1.5px solid ${disabled ? "#dcd7cf" : color}` : "none",
    borderRadius: R.sm,
    fontSize: small ? T.sm : T.base,
    fontWeight: 600,
    fontFamily: "inherit",
    lineHeight: 1.2,
    cursor: disabled ? "not-allowed" : "pointer",
    width: full ? "100%" : "auto",
    transition: "background .15s, border-color .15s, opacity .15s",
    ...style,
  }}>{children}</button>
);

// ── Field ────────────────────────────────────────────────────────────────────
interface FieldProps {
  label: string;
  required?: boolean;
  children: React.ReactElement;
  error?: string | null;
  hint?: string;
}

export function Field({ label, required, children, error, hint }: FieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const child = Children.only(children);
  const linked = isValidElement(child)
    ? cloneElement(child, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? errId : undefined,
      } as any)
    : child;
  return (
    <div style={{ marginBottom: S[4] }}>
      <label htmlFor={id} style={{ display: "block", fontSize: T.sm, color: "#3d4752", marginBottom: S[2], fontWeight: 600 }}>
        {label}{required && <span style={{ color: C.red }}> *</span>}
      </label>
      {linked}
      {hint && !error && <div style={{ color: C.muted, fontSize: T.xs, marginTop: S[1] }}>{hint}</div>}
      {error && (
        <div id={errId} role="alert" style={{ display: "flex", alignItems: "center", gap: S[1], color: C.redOn, fontSize: T.xs, marginTop: S[1] }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}

// ── inp（共用輸入框樣式）─────────────────────────────────────────────────────
// 焦點狀態交給 globalCSS 的 :focus-visible 處理，不再用 inline JS 改邊框色。
export const inp = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  width: "100%",
  minHeight: TAP + 4,
  border: `1.5px solid ${C.border}`,
  borderRadius: R.sm,
  padding: `0 ${S[3]}px`,
  fontSize: T.base,
  fontFamily: "inherit",
  color: C.text,
  background: C.white,
  outline: "none",
  transition: "border-color .15s, box-shadow .15s",
  ...extra,
});

// ── TextInput ────────────────────────────────────────────────────────────────
interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  id?: string;
  /** 瀏覽器自動填入：email / tel / name / street-address … 大幅減少手機打字 */
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "numeric" | "decimal" | "search" | "url";
  invalid?: boolean;
}

export const TextInput: React.FC<TextInputProps> = ({
  value, onChange, placeholder, type = "text", onFocus, onBlur, onKeyDown, id,
  autoComplete, inputMode, invalid, ...rest
}) => (
  <input
    id={id} type={type} value={value} placeholder={placeholder}
    autoComplete={autoComplete} inputMode={inputMode}
    onChange={e => onChange(e.target.value)}
    onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown}
    style={inp(invalid ? { borderColor: C.red } : {})}
    {...rest}
  />
);

// ── SelInput ─────────────────────────────────────────────────────────────────
interface SelOption {
  v?: string;
  l?: string;
}

interface SelInputProps {
  value: string;
  onChange: (value: string) => void;
  options: (string | SelOption)[];
  id?: string;
  invalid?: boolean;
}

export const SelInput: React.FC<SelInputProps> = ({ value, onChange, options, id, invalid, ...rest }) => (
  <select
    id={id} value={value} onChange={e => onChange(e.target.value)}
    style={inp({ cursor: "pointer", ...(invalid ? { borderColor: C.red } : {}) })}
    {...rest}
  >
    <option value="">請選擇</option>
    {options.map(o => {
      const val = typeof o === "string" ? o : (o.v || "");
      const label = typeof o === "string" ? o : (o.l || o.v || "");
      return <option key={val} value={val}>{label}</option>;
    })}
  </select>
);

// ── TextArea ─────────────────────────────────────────────────────────────────
interface TextAreaProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  id?: string;
}

export const TextArea: React.FC<TextAreaProps> = ({ value, onChange, rows = 3, placeholder, id, ...rest }) => (
  <textarea
    id={id} value={value} rows={rows} placeholder={placeholder}
    onChange={e => onChange(e.target.value)}
    style={inp({ resize: "vertical" as const, padding: `${S[3]}px`, lineHeight: 1.7 })}
    {...rest}
  />
);
