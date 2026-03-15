import React, { useId, Children, isValidElement, cloneElement } from "react";
import { C } from "../constants";

// ── Btn ──────────────────────────────────────────────────────────────────────
interface BtnProps {
  onClick?: () => void;
  children: React.ReactNode;
  color?: string;
  outline?: boolean;
  small?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: React.CSSProperties;
  "aria-label"?: string;
}

export const Btn: React.FC<BtnProps> = ({ onClick, children, color = C.green, outline, small, disabled, full, style = {}, "aria-label": ariaLabel }) => (
  <button onClick={onClick} disabled={disabled} aria-label={ariaLabel} style={{
    background: outline ? "transparent" : disabled ? "#aaa" : color,
    color: outline ? color : C.white,
    border: `1.5px solid ${disabled ? "#aaa" : color}`,
    borderRadius: 9, padding: small ? "6px 12px" : "10px 18px",
    fontSize: small ? "0.78rem" : "0.87rem", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
    width: full ? "100%" : "auto", transition: "all .15s", ...style,
  }}>{children}</button>
);

// ── Field ────────────────────────────────────────────────────────────────────
interface FieldProps {
  label: string;
  required?: boolean;
  children: React.ReactElement;
  error?: string | null;
}

export function Field({ label, required, children, error }: FieldProps) {
  const id = useId();
  const child = Children.only(children);
  const linked = isValidElement(child) ? cloneElement(child, { id } as any) : child;
  return (
    <div style={{ marginBottom: 13 }}>
      <label htmlFor={id} style={{ display: "block", fontSize: "0.77rem", color: C.muted, marginBottom: 4, fontWeight: 500 }}>
        {label}{required && <span style={{ color: C.red }}> *</span>}
      </label>
      {linked}
      {error && <div style={{ color: C.red, fontSize: "0.73rem", marginTop: 3 }}>{error}</div>}
    </div>
  );
}

// ── inp (shared input style) ────────────────────────────────────────────────
export const inp = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8,
  padding: "8px 11px", fontSize: "0.86rem", background: C.cream, outline: "none", ...extra,
});

// ── TextInput ────────────────────────────────────────────────────────────────
interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  id?: string;
}

export const TextInput: React.FC<TextInputProps> = ({ value, onChange, placeholder, type = "text", onFocus, onBlur, id }) => (
  <input id={id} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={inp()} onFocus={e => { e.target.style.borderColor = C.green; onFocus && onFocus(e); }}
    onBlur={e => { e.target.style.borderColor = C.border; onBlur && onBlur(e); }} />
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
}

export const SelInput: React.FC<SelInputProps> = ({ value, onChange, options, id }) => (
  <select id={id} value={value} onChange={e => onChange(e.target.value)} style={inp()}>
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

export const TextArea: React.FC<TextAreaProps> = ({ value, onChange, rows = 3, placeholder, id }) => (
  <textarea id={id} value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder}
    style={{ ...inp(), resize: "vertical" as const }} />
);
