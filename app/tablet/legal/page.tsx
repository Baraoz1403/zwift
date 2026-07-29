/**
 * Tablet — Legal hub
 * Serves within the tablet layout (TopBar + Sidebar) so the page renders
 * correctly on iPad without bouncing back to home. Links go to the
 * standalone /legal/* pages which are full-width and have no layout wrapper.
 *
 * Root cause of the bounce: the profile page previously linked to /m/legal,
 * which is under the /m layout that contains <IpadRedirect>. IpadRedirect
 * had no TABLET_MAP entry for /m/legal/* so it redirected iPads to
 * /tablet/today (the fallback). Fixed by pointing to /tablet/legal instead.
 */

export default function TabletLegalPage() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--m-bg)", overflow: "hidden" }}>
      {/* In-content sub-header */}
      <div style={{ padding: "14px 28px 10px", borderBottom: "1px solid var(--m-border)", background: "var(--m-card)", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".12em" }}>Legal</div>
        <div style={{ fontSize: 14, color: "var(--m-muted)", marginTop: 2, fontWeight: 500 }}>Terms &amp; Privacy</div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "32px 28px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
          <a href="/legal/terms" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "20px 22px", borderRadius: 16,
            background: "var(--m-card)", border: "1px solid var(--m-border)",
            textDecoration: "none",
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--m-text)" }}>Terms of Service</div>
              <div style={{ fontSize: 14, color: "var(--m-muted-2)", marginTop: 3 }}>How you may use this application</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="var(--m-muted-2)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </a>

          <a href="/legal/privacy" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "20px 22px", borderRadius: 16,
            background: "var(--m-card)", border: "1px solid var(--m-border)",
            textDecoration: "none",
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--m-text)" }}>Privacy Policy</div>
              <div style={{ fontSize: 14, color: "var(--m-muted-2)", marginTop: 3 }}>What data we collect and why</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="var(--m-muted-2)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </a>

          <a href="/legal/disclaimer" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "20px 22px", borderRadius: 16,
            background: "var(--m-card)", border: "1px solid var(--m-border)",
            textDecoration: "none",
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--m-text)" }}>Disclaimer</div>
              <div style={{ fontSize: 14, color: "var(--m-muted-2)", marginTop: 3 }}>Medical &amp; fitness disclaimer</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="var(--m-muted-2)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </a>
        </div>

        <div style={{ marginTop: 32, fontSize: 13, color: "var(--m-muted)", lineHeight: 1.6 }}>
          Last updated: July 2026 · Questions?{" "}
          <a href="mailto:support@voltiq.ai" style={{ color: "var(--accent)", textDecoration: "none" }}>
            support@voltiq.ai
          </a>
        </div>
      </div>
    </div>
  );
}
