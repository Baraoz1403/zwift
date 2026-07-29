/**
 * Mobile — Settings page
 * Contains: Connections (Zwift + ICU), Appearance (theme), Legal, Sign out.
 * Moved here from Profile so Profile stays a pure athletic-data page.
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getIntervalsCredentials } from "@/lib/kv-plan-state";
import SignOutButton from "@/app/m/profile/sign-out-button";
import { ThemeToggleButton } from "@/app/m/theme-toggle-button";

export default async function MobileSettingsPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const session = await decryptSession(raw);
  if (!session?.athleteId) return null;

  const icuKeyCookie = cookieStore.get("zwift_intervals_key")?.value ?? null;
  const icuName      = cookieStore.get("zwift_intervals_name")?.value ?? null;
  const icuKvCreds   = icuKeyCookie ? null : await getIntervalsCredentials(String(session.athleteId)).catch(() => null);
  const icuConnected = !!(icuKeyCookie ?? icuKvCreds?.icuKey);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Pinned header */}
      <div style={{
        flexShrink: 0, padding: "16px 16px 14px",
        background: "var(--m-card)", borderBottom: "1px solid var(--m-border)",
      }}>
        <div style={{ fontSize: 12, color: "var(--m-muted)", fontWeight: 500, letterSpacing: ".3px", textTransform: "uppercase", marginBottom: 4 }}>
          Settings
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-.6px" }}>
          App Settings
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>
        <div style={{ padding: "20px 16px 0" }}>

          {/* Connections */}
          <div style={{ marginBottom: 20 }}>
            <SectionLabel>Connections</SectionLabel>
            <div style={{ background: "var(--m-card)", borderRadius: 14, border: "1px solid var(--m-border)", padding: "4px 0" }}>
              {/* Zwift */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", borderBottom: "1px solid var(--m-border)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 11, background: "rgba(59,130,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#3b82f6"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 18, color: "var(--m-text)", fontWeight: 700 }}>Zwift</div>
                    <div style={{ fontSize: 15, color: "#22c55e", marginTop: 2, fontWeight: 500 }}>Connected</div>
                  </div>
                </div>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }}/>
              </div>
              {/* Intervals.icu */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 11, background: icuConnected ? "rgba(34,197,94,0.12)" : "rgba(100,116,139,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={icuConnected ? "#22c55e" : "var(--m-muted)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 18, color: "var(--m-text)", fontWeight: 700 }}>Intervals.icu</div>
                    <div style={{ fontSize: 15, color: icuConnected ? "#22c55e" : "var(--m-muted)", marginTop: 2, fontWeight: 500 }}>
                      {icuConnected ? "Connected" : "Not connected"}
                    </div>
                  </div>
                </div>
                {icuConnected ? (
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }}/>
                ) : (
                  <a href="/api/intervals/oauth-start?from=m" style={{ fontSize: 14, fontWeight: 600, color: "var(--m-btn-muted-txt)", textDecoration: "none", padding: "7px 14px", background: "var(--m-btn-muted)", borderRadius: 9 }}>
                    Connect
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div style={{ marginBottom: 20 }}>
            <SectionLabel>Appearance</SectionLabel>
            <div style={{ background: "var(--m-card)", borderRadius: 14, border: "1px solid var(--m-border)", padding: "4px 0" }}>
              <ThemeToggleButton />
            </div>
          </div>

          {/* Legal */}
          <div style={{ marginBottom: 20 }}>
            <SectionLabel>Legal</SectionLabel>
            <div style={{ background: "var(--m-card)", borderRadius: 14, border: "1px solid var(--m-border)", padding: "4px 0" }}>
              <a href="/legal/terms" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", textDecoration: "none", borderBottom: "1px solid var(--m-border)" }}>
                <div style={{ fontSize: 18, color: "var(--m-text)", fontWeight: 600 }}>Terms of Service</div>
                <ChevronRight />
              </a>
              <a href="/legal/privacy" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", textDecoration: "none", borderBottom: "1px solid var(--m-border)" }}>
                <div style={{ fontSize: 18, color: "var(--m-text)", fontWeight: 600 }}>Privacy Policy</div>
                <ChevronRight />
              </a>
              <a href="/legal/disclaimer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", textDecoration: "none" }}>
                <div style={{ fontSize: 18, color: "var(--m-text)", fontWeight: 600 }}>Disclaimer</div>
                <ChevronRight />
              </a>
            </div>
          </div>

          {/* Account */}
          <div style={{ marginBottom: 20 }}>
            <SectionLabel>Account</SectionLabel>
            <div style={{ background: "var(--m-card)", borderRadius: 14, border: "1px solid var(--m-border)", padding: "4px 0" }}>
              <SignOutButton />
            </div>
          </div>

          <div style={{ height: 8 }} />
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--m-muted-2)", letterSpacing: ".4px", textTransform: "uppercase", marginBottom: 12 }}>
      {children}
    </div>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M9 18l6-6-6-6" stroke="var(--m-muted-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
