import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { C } from "../constants";
import { Btn } from "./ui";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error): State { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.warn("ErrorBoundary caught:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", background: C.cream, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: C.white, borderRadius: 16, padding: 32, maxWidth: 440, width: "100%", textAlign: "center", border: `1.5px solid ${C.border}`, boxShadow: "0 4px 20px rgba(0,0,0,.07)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>😵</div>
            <div className="serif" style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 10, color: C.red }}>發生錯誤</div>
            <div style={{ fontSize: "0.85rem", color: C.muted, lineHeight: 1.8, marginBottom: 20 }}>
              應用程式遇到未預期的錯誤，請重新整理頁面。<br />
              如持續發生請聯絡管理員。
            </div>
            <div style={{ fontSize: "0.75rem", color: C.muted, background: "#f5f5f5", borderRadius: 8, padding: "8px 12px", marginBottom: 16, fontFamily: "monospace", textAlign: "left", wordBreak: "break-all" }}>
              {this.state.error?.message || "Unknown error"}
            </div>
            <Btn onClick={() => window.location.reload()} color={C.green}>🔄 重新整理</Btn>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
