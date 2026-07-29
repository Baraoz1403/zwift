/**
 * Tablet — Profile tab
 * Wraps the mobile profile page content in a proper tablet shell:
 *   - TabletPageHeader pinned outside the scroll area (so it never scrolls away)
 *   - Scroll container with bottom padding to clear the portrait bottom nav
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getStoredAthleteState, getCachedPlan, getRiderIdentity, getIntervalsCredentials } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { kvGet } from "@/lib/kv";
import { getFingerprint } from "@/lib/rider-fingerprint";
import { fetchOwnProfile } from "@/lib/zwift";
// Re-use all the sub-components from the mobile profile page
import SignOutButton from "@/app/m/profile/sign-out-button";
import { ThemeToggleButton } from "@/app/m/theme-toggle-button";

const GOAL_LABELS: Record<string, string> = {
  fitness: "Improve fitness",
  ftp: "Raise FTP",
  weight: "Lose weight",
  event: "Event prep",
  fun: "Ride for fun",
};

export default async function TabletProfilePage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const session = await decryptSession(raw);
  if (!session?.athleteId) return null;

  const athleteId = session.athleteId!;

  const [state, currentPlan, fingerprint, zwiftProfile] = await Promise.all([
    getStoredAthleteState(athleteId),
    getCachedPlan(athleteId, mondayOfCurrentWeek()),
    getFingerprint(athleteId).catch(() => null),
    fetchOwnProfile(session.accessToken).catch(() => null),
  ]);

  let ctl = 0, atl = 0, tsb = 0;
  try {
    const loadRaw = await kvGet(`zwift:${athleteId}:training_load`);
    if (loadRaw) { const l = JSON.parse(loadRaw); ctl = l.ctl ?? 0; atl = l.atl ?? 0; tsb = l.tsb ?? 0; }
  } catch { /* best-effort */ }

  const icuName      = cookieStore.get("zwift_intervals_name")?.value ?? null;
  const icuConnected = !!cookieStore.get("zwift_intervals_key")?.value;
  const profile      = state.riderProfile;
  const macro        = state.macroCycle;

  const ftpWatts: number | null =
    zwiftProfile?.ftp != null ? zwiftProfile.ftp :
    fingerprint?.ftpHistory?.length
      ? fingerprint.ftpHistory[fingerprint.ftpHistory.length - 1].ftp : null;
  const ftpSource = zwiftProfile?.ftp != null ? "Zwift profile" : "Estimated";

  let currentPhase: string | null = null;
  if (macro) {
    const wi = macro.weekIndex ?? 0;
    if (wi === 0) currentPhase = "Base";
    else if ((wi % 4) === 3) currentPhase = "Recovery";
    else currentPhase = "Build";
  }

  const tsbLabel = tsb > 5 ? "Fresh" : tsb < -5 ? "Fatigued" : "Neutral";
  const tsbColor = tsb > 5 ? "#22c55e" : tsb < -5 ? "#ef4444" : "#f59e0b";
  const workoutsThisWeek = currentPlan?.workouts.filter(w => {
    const t = (w.title + " " + (w.type ?? "")).toLowerCase();
    return !t.includes("rest") && !t.includes("recovery") && !t.includes("off");
  }).length ?? 0;

  const firstName = zwiftProfile?.firstName ?? null;
  const fullName  = zwiftProfile?.firstName
    ? `${zwiftProfile.firstName} ${zwiftProfile.lastName ?? ""}`.trim()
    : "Profile";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--m-bg)", overflow: "hidden" }}>
      {/* Small in-content section header — main name/chips shown in layout TabletTopBar */}
      <div style={{ padding:"14px 28px 10px", borderBottom:"1px solid var(--m-border)", background:"var(--m-card)", flexShrink:0 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"var(--m-muted)", textTransform:"uppercase", letterSpacing:".12em" }}>Profile</div>
        <div style={{ fontSize:14, color:"var(--m-muted)", marginTop:2, fontWeight:500 }}>Stats &amp; settings</div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "24px 28px" }}>

        {/* Athlete name */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: "var(--m-text)", letterSpacing: "-.4px" }}>{fullName}</div>
          <div style={{ fontSize: 17, color: "var(--m-muted-2)", marginTop: 4 }}>Profile &amp; Stats</div>
        </div>

        {/* Fitness metrics */}
        <SectionLabel>Fitness metrics</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          {ftpWatts ? (
            <MetricCard value={`${ftpWatts}W`} label="FTP" color="#00C2FF" desc={ftpSource} />
          ) : (
            <MetricCard value="—" label="FTP" color="#475569" desc="Set FTP in Zwift app" />
          )}
          <MetricCard value={tsbLabel} label="Freshness" color={tsb !== 0 ? tsbColor : "#475569"} desc={tsb !== 0 ? `TSB ${tsb > 0 ? "+" : ""}${tsb.toFixed(1)}` : "No data yet"} />
          {ctl > 0 ? (
            <>
              <MetricCard value={ctl.toFixed(1)} label="CTL (Fitness)" color="#818cf8" desc="42-day avg" />
              <MetricCard value={atl.toFixed(1)} label="ATL (Fatigue)" color="#f59e0b" desc="7-day avg" />
            </>
          ) : (
            <div style={{ gridColumn: "3/-1", padding: "16px 18px", background: "var(--m-card)", borderRadius: 14, border: "1px solid var(--m-border)", fontSize: 15, color: "var(--m-muted)", lineHeight: 1.6 }}>
              CTL / ATL / TSB appear once rides are processed.
            </div>
          )}
        </div>

        {/* This week */}
        <SectionLabel>This week</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <MetricCard value={String(workoutsThisWeek)} label="Workouts planned" color="#FF5A1F" />
          {currentPhase && (
            <MetricCard value={currentPhase} label="Training phase"
              color={currentPhase === "Recovery" ? "#f59e0b" : currentPhase === "Build" ? "#ef4444" : "#818cf8"}
              desc={`Week ${(macro?.weekIndex ?? 0) + 1}`} />
          )}
        </div>

        {/* Connections */}
        <SectionLabel>Connections</SectionLabel>
        <div style={{ background: "var(--m-card)", borderRadius: 14, border: "1px solid var(--m-border)", padding: "4px 0", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--m-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: "var(--m-icon-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#3b82f6" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 17, color: "var(--m-text)", fontWeight: 700 }}>Zwift</div>
                <div style={{ fontSize: 14, color: "#22c55e", marginTop: 2 }}>Connected</div>
              </div>
            </div>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#22c55e" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: icuConnected ? "var(--m-icon-success)" : "var(--m-icon-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={icuConnected ? "#22c55e" : "var(--m-muted)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 17, color: "var(--m-text)", fontWeight: 700 }}>Intervals.icu</div>
                <div style={{ fontSize: 14, color: icuConnected ? "#22c55e" : "var(--m-muted)", marginTop: 2 }}>{icuConnected ? (icuName ?? "Connected") : "Not connected"}</div>
              </div>
            </div>
            {!icuConnected && (
              <a href="/api/intervals/oauth-start?from=tablet" style={{ fontSize: 14, fontWeight: 600, color: "var(--m-btn-muted-txt)", textDecoration: "none", padding: "7px 14px", background: "var(--m-btn-muted)", borderRadius: 9 }}>Connect</a>
            )}
          </div>
        </div>

        {/* Training profile */}
        {profile && (
          <>
            <SectionLabel>Training profile</SectionLabel>
            <div style={{ background: "var(--m-card)", borderRadius: 14, border: "1px solid var(--m-border)", padding: "14px 16px", marginBottom: 20 }}>
              {profile.goals?.length ? <ProfileRow label="Goals" value={profile.goals.map(g => GOAL_LABELS[g] ?? g).join(", ")} /> : null}
              {profile.daysRange && <ProfileRow label="Days/week" value={`${profile.daysRange} sessions`} />}
              {profile.ageYears && <ProfileRow label="Age" value={`${profile.ageYears} years`} />}
            </div>
          </>
        )}

        {/* Account */}
        <SectionLabel>Account</SectionLabel>
        <div style={{ background: "var(--m-card)", borderRadius: 14, border: "1px solid var(--m-border)", padding: "4px 0", marginBottom: 20 }}>
          <a href="/tablet/profile/edit" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", textDecoration: "none", borderBottom: "1px solid var(--m-border)" }}>
            <div>
              <div style={{ fontSize: 17, color: "var(--m-text)", fontWeight: 700 }}>Edit training profile</div>
              <div style={{ fontSize: 14, color: "var(--m-muted-2)", marginTop: 3 }}>Goals, schedule, session length</div>
            </div>
            <ChevronRight />
          </a>
          <a href="/m/legal" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", textDecoration: "none", borderBottom: "1px solid var(--m-border)" }}>
            <div>
              <div style={{ fontSize: 17, color: "var(--m-text)", fontWeight: 700 }}>Legal</div>
              <div style={{ fontSize: 14, color: "var(--m-muted-2)", marginTop: 3 }}>Terms of Service &amp; Privacy Policy</div>
            </div>
            <ChevronRight />
          </a>
          <div style={{ borderBottom: "1px solid var(--m-border)" }}>
            <ThemeToggleButton />
          </div>
          <SignOutButton />
        </div>

        {/* Bottom padding to clear portrait bottom nav */}
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--m-muted-2)", letterSpacing: ".4px", textTransform: "uppercase", marginBottom: 12 }}>
      {children}
    </div>
  );
}

function MetricCard({ value, label, color, desc }: { value: string; label: string; color: string; desc?: string }) {
  return (
    <div style={{ background: "var(--m-card)", borderRadius: 14, border: "1px solid var(--m-border)", padding: "16px 18px" }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1, marginBottom: 6 }}>{value}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--m-label)", marginBottom: 4 }}>{label}</div>
      {desc && <div style={{ fontSize: 13, color: "var(--m-muted)" }}>{desc}</div>}
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--m-border)" }}>
      <span style={{ fontSize: 15, color: "var(--m-muted)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 15, color: "var(--m-text-2)", textAlign: "right", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M9 18l6-6-6-6" stroke="var(--m-muted-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
