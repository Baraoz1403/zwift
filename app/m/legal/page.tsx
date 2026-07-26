import Link from "next/link";

export default function LegalPage() {
  return (
    <div style={{
      padding: "24px 20px 40px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <a href="/m/profile" style={{
          width: 40, height: 40, borderRadius: 12,
          background: "#111827", border: "1px solid #1e293b",
          display: "flex", alignItems: "center", justifyContent: "center",
          textDecoration: "none", color: "#94a3b8", fontSize: 20, flexShrink: 0,
        }}>←</a>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#f8fafc" }}>Legal</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Link href="/m/legal/terms" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px", borderRadius: 16,
          background: "#111827", border: "1px solid #1e293b",
          textDecoration: "none",
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Terms of Service</div>
            <div style={{ fontSize: 14, color: "#475569", marginTop: 3 }}>How you may use this application</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="#475569" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </Link>

        <Link href="/m/legal/privacy" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px", borderRadius: 16,
          background: "#111827", border: "1px solid #1e293b",
          textDecoration: "none",
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Privacy Policy</div>
            <div style={{ fontSize: 14, color: "#475569", marginTop: 3 }}>What data we collect and why</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="#475569" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </Link>
      </div>

      <div style={{ marginTop: 28, textAlign: "center", fontSize: 13, color: "#334155", lineHeight: 1.6 }}>
        Last updated: July 2026<br />
        Questions? Contact us at{" "}
        <a href="mailto:support@voltiq.ai" style={{ color: "#3b82f6", textDecoration: "none" }}>
          support@voltiq.ai
        </a>
      </div>
    </div>
  );
}
