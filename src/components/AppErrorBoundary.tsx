import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("Frontend render failure", error, info);
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main
        style={{
          minHeight: "100vh",
          margin: 0,
          padding: "32px",
          background: "#080b11",
          color: "#e2e8f0",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          boxSizing: "border-box",
        }}
      >
        <section
          style={{
            maxWidth: "760px",
            margin: "48px auto",
            padding: "24px",
            border: "1px solid rgba(244,63,94,.45)",
            borderRadius: "12px",
            background: "#121621",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#fb7185" }}>
            <AlertTriangle size={22} />
            <strong>Frontend render failed</strong>
          </div>
          <p style={{ color: "#94a3b8", lineHeight: 1.6 }}>
            The backend is still reachable, but a browser-side component failed to render.
          </p>
          <pre
            style={{
              padding: "12px",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              borderRadius: "8px",
              background: "#080b11",
              color: "#fda4af",
              fontSize: "12px",
            }}
          >
            {this.state.error.message || "Unknown frontend error"}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "8px",
              padding: "9px 14px",
              border: "1px solid rgba(34,211,238,.45)",
              borderRadius: "8px",
              background: "rgba(34,211,238,.12)",
              color: "#67e8f9",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            <RefreshCw size={15} /> Reload application
          </button>
        </section>
      </main>
    );
  }
}
