import Link from "next/link";

export const metadata = { title: "Privacy Policy — Zwift AI Dashboard" };

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 80px", fontFamily: "Inter, -apple-system, sans-serif", color: "#14171a", lineHeight: 1.8 }}>
      <div style={{ marginBottom: 32 }}>
        <a href="javascript:history.back()" style={{ fontSize: 13, color: "#2f8fe0", textDecoration: "none" }}>← Back</a>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6, letterSpacing: "-0.5px" }}>Privacy Policy</h1>
      <p style={{ fontSize: 13, color: "#5b6168", marginBottom: 40 }}>Last updated: July 2026</p>

      <Section title="What data we collect">
        This service does <strong>not</strong> operate a database or user-account system. The only data we handle is:
        <ul style={{ marginTop: 10, paddingLeft: 20 }}>
          <li><strong>Zwift session token</strong> — an encrypted OAuth token stored in a secure, HTTP-only browser cookie.
            Used solely to fetch your ride data from Zwift on your behalf. Never shared with third parties.</li>
          <li><strong>Ride telemetry (FIT files)</strong> — downloaded from Zwift&apos;s servers directly to your browser
            for chart rendering. Not stored on our servers.</li>
          <li><strong>AI-generated plans</strong> — stored in your browser&apos;s localStorage only. Never transmitted to
            our servers.</li>
          <li><strong>HR alert state</strong> — stored in your browser&apos;s localStorage (view count, dismiss timer).
            Never transmitted to our servers.</li>
        </ul>
      </Section>

      <Section title="What data we do NOT collect">
        <ul style={{ paddingLeft: 20 }}>
          <li>Your Zwift email address or password (you log in directly to Zwift)</li>
          <li>Your name, email, or any personally identifiable information beyond what Zwift sends in your profile</li>
          <li>Ride history, routes, or performance data stored on our servers</li>
          <li>Cookies for advertising, analytics, or tracking</li>
          <li>IP addresses or usage logs beyond standard Vercel infrastructure logs (retained for up to 30 days)</li>
        </ul>
      </Section>

      <Section title="Third-party services">
        <strong>Zwift API</strong> — your ride data is fetched from Zwift&apos;s servers using your session token.
        Zwift&apos;s own{" "}
        <a href="https://www.zwift.com/eu/privacy-policy" target="_blank" rel="noopener noreferrer"
           style={{ color: "#2f8fe0" }}>privacy policy</a>{" "}applies to that data.
        <br /><br />
        <strong>OpenAI API</strong> — your ride summary data (aggregated statistics, not raw telemetry) is sent to
        OpenAI to generate training plans and insights. OpenAI processes this data under their own{" "}
        <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer"
           style={{ color: "#2f8fe0" }}>privacy policy</a>.
        OpenAI does not use API data submitted via the API to train their models.
        <br /><br />
        <strong>Vercel</strong> — this service is hosted on Vercel&apos;s infrastructure. Standard server access logs
        (IP, request path, timestamp) may be retained by Vercel for up to 30 days.
      </Section>

      <Section title="Cookies">
        We use a single secure, HTTP-only cookie named <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, fontSize: 12.5 }}>zwift_session</code>.
        It contains an encrypted Zwift OAuth token and is required for authentication. It is not used for advertising
        or tracking. It expires when you sign out or after 30 days, whichever comes first.
        <br /><br />
        We do not use any third-party analytics, advertising, or tracking cookies.
      </Section>

      <Section title="Data retention and deletion">
        Since we store no personal data on our servers, there is nothing to delete on our end.
        To remove all local data from your browser, sign out of the dashboard — this clears the session cookie —
        and then clear your browser&apos;s localStorage for this site.
      </Section>

      <Section title="Your rights">
        Under applicable data protection law (including the Israeli Privacy Protection Law and GDPR where applicable),
        you may have the right to access, correct, or delete personal data held about you. As we hold no personal data
        on our servers, any such request would be fulfilled by directing you to the relevant third-party service
        (Zwift or OpenAI).
      </Section>

      <Section title="Contact">
        Questions about this privacy policy? Contact the site owner at{" "}
        <a href="mailto:barak1403@gmail.com" style={{ color: "#2f8fe0" }}>barak1403@gmail.com</a>.
      </Section>

      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 24, marginTop: 40, fontSize: 12.5, color: "#5b6168" }}>
        Also see: <Link href="/legal/disclaimer" style={{ color: "#2f8fe0" }}>Disclaimer</Link>
        {" · "}
        <Link href="/legal/terms" style={{ color: "#2f8fe0" }}>Terms of Use</Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: "#14171a" }}>{title}</h2>
      <div style={{ fontSize: 14, color: "#374151" }}>{children}</div>
    </div>
  );
}
