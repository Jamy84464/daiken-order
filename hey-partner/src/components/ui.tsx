import React, { useId, Children, isValidElement, cloneElement, useEffect, useRef } from "react";
import { C, T, S, R, TAP, E, DISPLAY } from "../constants";

// ── Btn ──────────────────────────────────────────────────────────────────────
type BtnVariant = "primary" | "coral" | "ghost" | "soft" | "danger";
interface BtnProps {
  onClick?: () => void;
  children: React.ReactNode;
  variant?: BtnVariant;
  small?: boolean;
  large?: boolean;
  disabled?: boolean;
  full?: boolean;
  type?: "button" | "submit";
  style?: React.CSSProperties;
  "aria-label"?: string;
}

const BTN: Record<BtnVariant, { bg: string; fg: string; border: string; shadow?: string }> = {
  primary: { bg: C.primary, fg: C.white, border: C.primary, shadow: "0 6px 16px rgba(47,93,98,.22)" },
  coral: { bg: C.coralDark, fg: C.white, border: C.coralDark, shadow: "0 6px 16px rgba(184,90,66,.25)" },
  ghost: { bg: "transparent", fg: C.primary, border: C.border },
  soft: { bg: C.primarySoft, fg: C.primaryDark, border: "transparent" },
  danger: { bg: C.paper, fg: C.redDark, border: "#f1c9b8" },
};

export const Btn: React.FC<BtnProps> = ({
  onClick, children, variant = "primary", small, large, disabled, full,
  type = "button", style = {}, "aria-label": ariaLabel,
}) => {
  const v = BTN[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel} className="lift" style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: S[2],
      minHeight: small ? 36 : large ? 54 : TAP,
      padding: small ? `0 ${S[3]}px` : large ? `0 ${S[6]}px` : `0 ${S[5]}px`,
      background: disabled ? "#e5e0d8" : v.bg,
      color: disabled ? "#9aa1a9" : v.fg,
      border: `1.5px solid ${disabled ? "#e5e0d8" : v.border}`,
      borderRadius: R.full,
      fontSize: small ? T.sm : large ? T.md : T.base,
      fontWeight: 700, lineHeight: 1.2, letterSpacing: ".02em",
      cursor: disabled ? "not-allowed" : "pointer",
      width: full ? "100%" : "auto",
      boxShadow: disabled ? "none" : v.shadow,
      ...style,
    }}>{children}</button>
  );
};

// ── Card ─────────────────────────────────────────────────────────────────────
export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; className?: string }> = ({ children, style, className }) => (
  <div className={className} style={{
    background: C.paper, borderRadius: R.lg, border: `1px solid ${C.hairline}`,
    boxShadow: E[1], padding: S[5], ...style,
  }}>{children}</div>
);

// ── StepTitle：前台分段標題（圓形序號 + 粉圓字）────────────────────────────────
export const StepTitle: React.FC<{ n: number; title: string; sub?: string; done?: boolean }> = ({ n, title, sub, done }) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: S[3], marginBottom: S[4] }}>
    <span aria-hidden="true" style={{
      flexShrink: 0, width: 30, height: 30, borderRadius: R.full,
      background: done ? C.primary : C.sun, color: done ? C.white : C.ink,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: DISPLAY, fontSize: T.base, fontWeight: 700, marginTop: 1,
      transition: "background .2s",
    }}>{done ? "✓" : n}</span>
    <div>
      <h2 className="display" style={{ fontSize: T.lg, fontWeight: 400, color: C.ink, lineHeight: 1.4 }}>{title}</h2>
      {sub && <p style={{ fontSize: T.sm, color: C.muted, marginTop: 2 }}>{sub}</p>}
    </div>
  </div>
);

// ── Chip ─────────────────────────────────────────────────────────────────────
interface ChipProps {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  color?: string;
  tint?: string;
  small?: boolean;
  title?: string;
}
export const Chip: React.FC<ChipProps> = ({ children, active, onClick, color = C.primary, tint = C.primarySoft, small, title }) => {
  const style: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 4,
    minHeight: small ? 26 : 34, padding: small ? "0 10px" : "0 14px",
    borderRadius: R.full, fontSize: small ? T.xs : T.sm, fontWeight: 600,
    border: `1.5px solid ${active ? color : C.border}`,
    background: active ? tint : C.paper, color: active ? color : C.sub,
    cursor: onClick ? "pointer" : "default", whiteSpace: "nowrap",
  };
  return onClick
    ? <button type="button" className="chip-btn" onClick={onClick} aria-pressed={active} title={title} style={style}>{children}</button>
    : <span title={title} style={style}>{children}</span>;
};

// ── Pill：唯讀小標籤 ─────────────────────────────────────────────────────────
export const Pill: React.FC<{ children: React.ReactNode; color: string; tint: string; style?: React.CSSProperties }> = ({ children, color, tint, style }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px",
    borderRadius: R.full, background: tint, color, fontSize: T.xs, fontWeight: 700, whiteSpace: "nowrap", ...style,
  }}>{children}</span>
);

// ── Field ────────────────────────────────────────────────────────────────────
interface FieldProps {
  label: string;
  required?: boolean;
  children: React.ReactElement;
  error?: string | null;
  hint?: React.ReactNode;
}
export function Field({ label, required, children, error, hint }: FieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const child = Children.only(children);
  const linked = isValidElement(child)
    ? cloneElement(child, { id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? errId : undefined } as any)
    : child;
  return (
    <div style={{ marginBottom: S[4] }}>
      <label htmlFor={id} style={{ display: "block", fontSize: T.sm, color: C.sub, marginBottom: S[2], fontWeight: 700 }}>
        {label}{required && <span style={{ color: C.coralDark }}> *</span>}
      </label>
      {linked}
      {hint && !error && <div style={{ color: C.muted, fontSize: T.xs, marginTop: S[1] }}>{hint}</div>}
      {error && <div id={errId} role="alert" style={{ color: C.redDark, fontSize: T.xs, marginTop: S[1], fontWeight: 600 }}>⚠ {error}</div>}
    </div>
  );
}

// ── 輸入框 ───────────────────────────────────────────────────────────────────
export const inp = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  width: "100%", minHeight: TAP + 4,
  border: `1.5px solid ${C.border}`, borderRadius: R.md,
  padding: `0 ${S[4]}px`, fontSize: T.base, color: C.ink, background: C.paper,
  outline: "none", transition: "border-color .15s, box-shadow .15s",
  ...extra,
});

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  id?: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "search";
  maxLength?: number;
  invalid?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  style?: React.CSSProperties;
}
export const TextInput: React.FC<TextInputProps> = ({ value, onChange, invalid, style, ...rest }) => (
  <input {...rest} value={value} onChange={e => onChange(e.target.value)}
    style={inp({ ...(invalid ? { borderColor: C.red } : {}), ...style })} />
);

interface TextAreaProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  id?: string;
  maxLength?: number;
  invalid?: boolean;
  style?: React.CSSProperties;
}
export const TextArea: React.FC<TextAreaProps> = ({ value, onChange, rows = 4, invalid, style, ...rest }) => (
  <textarea {...rest} rows={rows} value={value} onChange={e => onChange(e.target.value)}
    style={inp({ resize: "vertical", padding: `${S[3]}px ${S[4]}px`, lineHeight: 1.8, ...(invalid ? { borderColor: C.red } : {}), ...style })} />
);

// ── Modal 外框：遮罩、Esc 關閉、開啟時鎖住焦點起點 ──────────────────────────────
export function Modal({ children, onClose, labelledBy, maxWidth = 440, bare }: {
  children: React.ReactNode; onClose: () => void; labelledBy: string; maxWidth?: number;
  /** 內容自己就是卡片時，外框不加底色與內距 */
  bare?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    boxRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "fixed", inset: 0, zIndex: 2000, background: "rgba(31,41,51,.45)",
      backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: S[4],
    }}>
      <div ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="pop" style={{
        background: bare ? "transparent" : C.paper, borderRadius: R.xl, padding: bare ? 0 : S[6], maxWidth, width: "100%",
        maxHeight: "92vh", overflowY: "auto", boxShadow: E[3], outline: "none",
      }}>{children}</div>
    </div>
  );
}
