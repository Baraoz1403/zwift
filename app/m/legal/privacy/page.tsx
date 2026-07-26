export default function PrivacyPage() {
  return (
    <div style={{
      padding: "24px 20px 60px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      maxWidth: 680,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <a href="/m/legal" style={{
          width: 40, height: 40, borderRadius: 12,
          background: "#111827", border: "1px solid #1e293b",
          display: "flex", alignItems: "center", justifyContent: "center",
          textDecoration: "none", color: "#94a3b8", fontSize: 20, flexShrink: 0,
        }}>←</a>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#f8fafc" }}>Privacy Policy</div>
          <div style={{ fontSize: 14, color: "#475569", marginTop: 2 }}>Last updated: July 2026</div>
        </div>
      </div>

      <LegalSection title="1. What we collect">
        <b>From Zwift:</b> Your athlete ID, first name, last name, FTP (watts), and the list of
        recent rides (date, distance, duration, average power, average heart rate). We do not
        collect your full ride GPS tracks or personal health records beyond what is shown in
        your Zwift profile.<br /><br />
        <b>From Intervals.icu:</b> Your activity list for the current week, used only to determine
        whether you completed today&apos;s planned workout.<br /><br />
        <b>From you directly:</b> Your training profile (goals, age, training days, session length,
        sport, event date and type). This is stored securely in Vercel KV under your athlete ID.
      </LegalSection>

      <LegalSection title="2. What we never collect">
        We never store your Zwift password. It is transmitted directly to Zwift&apos;s servers via
        their official API and we never see or log it. We do not collect payment information,
        government IDs, location data, or any biometric data beyond what Zwift provides.
      </LegalSection>

      <LegalSection title="3. How we use your data">
        Your data is used exclusively to:
        <ul style={{ marginTop: 8, paddingLeft: 18, lineHeight: 2 }}>
          <li>Generate your weekly AI training plan</li>
          <li>Show your training load metrics (CTL / ATL / TSB)</li>
          <li>Display today&apos;s workout and weekly progress</li>
          <li>Push workouts to your Zwift / Intervals.icu calendar</li>
        </ul>
        Your data is never sold, shared with advertisers, or used for any purpose other than
        operating this application.
      </LegalSection>

      <LegalSection title="4. AI processing">
        Your ride history and profile are sent to OpenAI (GPT-4) to generate training plans.
        This is done via the OpenAI API under their data processing agreement. OpenAI does not
        use API inputs to train their models. Sent data includes: ride count, recent TSS values,
        FTP, training profile fields. It does not include your email, name, or password.
      </LegalSection>

      <LegalSection title="5. Storage and security">
        Data is stored in Vercel KV (Redis), a secure cloud database. All connections use HTTPS/TLS.
        Your session is managed via a signed, encrypted cookie. API keys are stored encrypted
        at rest. We do not log your training data to external analytics services.
      </LegalSection>

      <LegalSection title="6. Your rights">
        You may delete all your data at any time by signing out and contacting us. We will
        permanently delete your athlete ID, training profile, and stored plan from our database
        within 7 days of request. You may also revoke Intervals.icu access from the Profile tab
        at any time without deleting your account.
      </LegalSection>

      <LegalSection title="7. Cookies">
        We use one session cookie to keep you signed in. We use no advertising cookies,
        no tracking pixels, and no third-party analytics scripts. The app has no ads.
      </LegalSection>

      <LegalSection title="8. Children">
        This app is not directed at children under 16. If you believe a child has provided
        us with personal data, contact us and we will delete it immediately.
      </LegalSection>

      <LegalSection title="9. Contact">
        For privacy questions or data deletion requests:{" "}
        <a href="mailto:privacy@voltiq.ai" style={{ color: "#3b82f6" }}>privacy@voltiq.ai</a>
      </LegalSection>
    </div>
  );
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 16, fontWeight: 700, color: "#94a3b8",
        marginBottom: 8, letterSpacing: ".2px",
      }}>
        {title}
      </div>
      <div style={{
        fontSize: 15, color: "#475569", lineHeight: 1.75,
        background: "#0f172a", borderRadius: 12,
        padding: "14px 16px", border: "1px solid #1e293b",
      }}>
        {children}
      </div>
    </div>
  );
}
