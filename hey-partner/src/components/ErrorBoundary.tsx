import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { C, R, S, T, E } from "../constants";

interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): State { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.warn("ErrorBoundary caught:", error, info); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", background: C.cream, display: "flex", alignItems: "center", justifyContent: "center", padding: S[5] }}>
        <div style={{ background: C.paper, borderRadius: R.xl, padding: S[6], maxWidth: 420, width: "100%", textAlign: "center", boxShadow: E[2] }}>
          <div style={{ fontSize: "2.75rem", marginBottom: S[3] }}>🙈</div>
          <div style={{ fontSize: T.lg, fontWeight: 700, marginBottom: S[2] }}>哎呀，出了點狀況</div>
          <div style={{ fontSize: T.sm, color: C.muted, lineHeight: 1.8, marginBottom: S[5] }}>請重新整理頁面；如果一直發生，請告訴管理員。</div>
          <button onClick={() => window.location.reload()} style={{ background: C.primary, color: C.white, border: "none", borderRadius: R.full, padding: "12px 28px", fontWeight: 700, cursor: "pointer" }}>重新整理</button>
        </div>
      </div>
    );
  }
}
