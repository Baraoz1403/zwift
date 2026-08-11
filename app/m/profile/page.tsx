import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getStoredAthleteState, getCachedPlan, getIntervalsCredentials } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { getFingerprint } from "@/lib/rider-fingerprint";
import { fetchOwnProfile } from "@/lib/zwift";
import { fetchIcuWellness } from "@/lib/intervals";
import MobileRefreshButton from "@/app/m/refresh-button";
import { ThemeToggleButton } from "@/app/m/theme-toggle-button";

export default async function MobileProfilePage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null; // layout handles unauthenticated state
  const session = await decryptSession(raw);
  if (!session?.athleteId) return null;

  const athleteId = session.athleteId!;

  // ICU credentials — cookie first, then KV fallback
  const icuKeyCookie = cookieStore.get("zwift_intervals_key")?.value ?? null;
  const icuIdCookie  = cookieStore.get("zwift_intervals_id")?.value ?? null;
  const icuName      = cookieStore.get("zwift_intervals_name")?.value ?? null;

  const icuKvCreds = icuKeyCookie ? null : await getIntervalsCredentials(String(athleteId)).catch(() => null);
  const icuKey = icuKeyCookie ?? icuKvCreds?.icuKey ?? null;
  const icuId  = icuIdCookie  ?? icuKvCreds?.icuId  ?? null;
  const icuConnected = !!icuKey;

  const [state, currentPlan, fingerprint, zwiftProfile, wellness] = await Promise.all([
    getStoredAthleteState(athleteId),
    getCachedPlan(athleteId, mondayOfCurrentWeek()),
    getFingerprint(athleteId).catch(() => null),
    fetchOwnProfile(session.accessToken).catch(() => null),
    // Fetch live CTL/ATL/TSB from ICU — always fresh, no caching needed
    (icuKey && icuId)
      ? fetchIcuWellness(icuKey, icuId).catch(() => null)
      : Promise.resolve(null),
  ]);

  // CTL/ATL/TSB: live from ICU (most accurate — uses all activity sources)
  const ctl = wellness?.ctl ?? 0;
  const atl = wellness?.atl ?? 0;
  const tsb = wellness?.tsb ?? 0;

  const profile = state.riderProfile;
  const macro = state.macroCycle;

  // FTP: Zwift profile is the single source of truth (set after a real FTP test).
  // Fall back to fingerprint history only if Zwift profile fetch failed.
  const ftpWatts: number | null =
    zwiftProfile?.ftp != null ? zwiftProfile.ftp :
    fingerprint?.ftpHistory?.length
      ? fingerprint.ftpHistory[fingerprint.ftpHistory.length - 1].ftp
      : null;
  const ftpSource = zwiftProfile?.ftp != null ? "Zwift profile" : "Estimated";

  // Compute training phase from weekIndex (matches periodization.ts logic)
  let currentPhase: string | null = null;
  if (macro) {
    const wi = macro.weekIndex ?? 0;
    if (wi === 0) currentPhase = "Base";
    else if ((wi % 4) === 3) currentPhase = "Recovery";
    else currentPhase = "Build";
  }

  const hasWellness = wellness !== null;
  const tsbLabel = !hasWellness ? "—" : tsb > 5 ? "Fresh" : tsb < -5 ? "Fatigued" : "Neutral";
  const tsbColor = !hasWellness ? "#475569" : tsb > 5 ? "#22c55e" : tsb < -5 ? "#ef4444" : "var(--m-muted)";
  // TSB = Form = CTL − ATL. Positive = rested, negative = accumulated fatigue.
  const tsbDescText = tsb > 10 ? "Peak form — race ready" :
                      tsb > 5  ? "Rested, ready to train hard" :
                      tsb > -5 ? "Balanced — normal training" :
                      tsb > -15 ? "Fatigued — ease up slightly" :
                                  "Deep fatigue — recovery needed";
  const tsbDesc  = !hasWellness ? (icuConnected ? "Loading from ICU…" : "Connect Intervals.icu") :
                   `Form (TSB ${tsb > 0 ? "+" : ""}${tsb.toFixed(1)}) · ${tsbDescText}`;

  const workoutsThisWeek = currentPlan?.workouts.filter(w => {
    const t = (w.title + " " + (w.type ?? "")).toLowerCase();
    return !t.includes("rest") && !t.includes("off")  /* "Recovery" = real workout */;
  }).length ?? 0;

  const GOAL_LABELS: Record<string, string> = {
    fitness: "Improve fitness",
    ftp: "Raise FTP",
    weight: "Lose weight",
    event: "Event prep",
    fun: "Ride for fun",
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Pinned header — outside scroll, never moves */}
      <div style={{
        flexShrink: 0,
        padding: "20px 20px 16px",
        background: "var(--m-card)",
        borderBottom: "1px solid var(--m-border)",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 17, color: "var(--m-muted)", fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 8 }}>
            Profile
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-.6px" }}>
            {zwiftProfile?.firstName ? `${zwiftProfile.firstName} ${zwiftProfile.lastName ?? ""}`.trim() : "Athlete"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <MobileRefreshButton />
          <ThemeToggleButton compact />
        </div>
      </div>

    <div style={{
      flex: 1,
      overflowY: "auto",
      overscrollBehavior: "contain",
    }}>
    <div style={{ padding: "20px 20px 0" }}>

      <div style={{ marginBottom: 24 }} />

      {/* Fitness metrics */}
      <div style={{ marginBottom: 24 }}>
        <SectionLabel>Fitness metrics</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {ftpWatts ? (
            <MetricCard
              value={`${ftpWatts}W`}
              label="FTP"
              color="#00C2FF"
              desc={ftpSource}
            />
          ) : (
            <MetricCard value="—" label="FTP" color="#475569" desc="Set FTP in Zwift app" />
          )}
          <MetricCard
            value={tsbLabel}
            label="Freshness"
            color={tsbColor}
            desc={tsbDesc}
          />
          {hasWellness && ctl > 0 ? (
            <>
              {/* CTL = how fit you are right now (42-day average of training stress) */}
              <MetricCard value={ctl.toFixed(1)} label="Fitness" color="#818cf8" desc={`CTL — 42-day load${ctl >= 60 ? " · High fitness" : ctl >= 40 ? " · Good base" : " · Building"}`} />
              {/* ATL = how fatigued you are from recent training (7-day average) */}
              <MetricCard value={atl.toFixed(1)} label="Fatigue" color="#FF5A1F" desc={`ATL — 7-day load${atl > ctl ? " · Accumulating" : " · Manageable"}`} />
            </>
          ) : !icuConnected ? (
            <div style={{
              gridColumn: "1/-1",
              padding: "20px 20px",
              background: "var(--m-card)", borderRadius: 14, border: "1px solid var(--m-border)",
              fontSize: 18, color: "var(--m-muted)", lineHeight: 1.6,
            }}>
              Connect Intervals.icu to see fitness load (CTL), fatigue (ATL), and form (TSB) — fetched automatically.
            </div>
          ) : null}
        </div>
      </div>

      {/* This week */}
      <div style={{ marginBottom: 24 }}>
        <SectionLabel>This week</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <MetricCard value={String(workoutsThisWeek)} label="Workouts planned" color="#FF5A1F" />
          {currentPhase && (
            <MetricCard
              value={currentPhase}
              label="Training phase"
              color={currentPhase === "Recovery" ? "var(--m-muted)" : currentPhase === "Build" ? "#FF5A1F" : "#818cf8"}
              desc={`Week ${(macro?.weekIndex ?? 0) + 1}`}
            />
          )}
        </div>
      </div>

      {/* Training profile */}
      {profile && (
        <div style={{ marginBottom: 24 }}>
          <SectionLabel>Training profile</SectionLabel>
          <div style={{
            background: "var(--m-card)", borderRadius: 14, border: "1px solid var(--m-border)",
            padding: "14px 16px",
          }}>
            {profile.goals && profile.goals.length > 0 && (
              <ProfileRow label="Goals" value={profile.goals.map(g => GOAL_LABELS[g] ?? g).join(", ")} />
            )}
            {profile.daysRange && (
              <ProfileRow label="Days/week" value={profile.daysRange + " sessions"} />
            )}
            {profile.sessionLength && (
              <ProfileRow
                label="Session length"
                value={
                  profile.sessionLength === "45" ? "Up to 45 min" :
                  profile.sessionLength === "60" ? "45–60 min" :
                  profile.sessionLength === "90" ? "60–90 min" : "90+ min"
                }
              />
            )}
            {profile.environment && (
              <ProfileRow
                label="Environment"
                value={
                  profile.environment === "indoor" ? "Indoor (Zwift)" :
                  profile.environment === "outdoor" ? "Outdoor only" : "Indoor & Outdoor"
                }
              />
            )}
            {profile.ageYears && (
              <ProfileRow label="Age" value={`${profile.ageYears} years`} />
            )}
            {profile.eventDate && (
              <ProfileRow
                label="Event date"
                value={new Date(profile.eventDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              />
            )}
            {profile.eventType && (
              <ProfileRow
                label="Event type"
                value={{
                  "road-race-1day": "🚴 Road race (1-day)",
                  "road-race-stage": "📅 Stage race",
                  "gravel-race": "🪨 Gravel race",
                  "mtb-race": "🌲 MTB race",
                  "time-trial": "⏱️ Time trial",
                  "gran-fondo": "🏔️ Gran Fondo",
                  "zwift-race": "⚡ Zwift race",
                  "run-5k": "🏃 5K run",
                  "run-10k": "🏃 10K run",
                  "half-marathon": "🏃 Half marathon",
                  "marathon": "🏃 Marathon",
                  "sprint-tri": "🏊 Sprint triathlon",
                  "olympic-tri": "🏊 Olympic triathlon",
                  "half-ironman": "🏊 70.3 / Half Ironman",
                  "ironman": "🏊 Full Ironman",
                  "other": "🏆 Other event",
                }[profile.eventType] ?? profile.eventType}
              />
            )}
          </div>
        </div>
      )}

      {/* Account */}
      <div style={{ marginBottom: 24 }}>
        <SectionLabel>Account</SectionLabel>
        <div style={{
          background: "var(--m-card)", borderRadius: 14, border: "1px solid var(--m-border)",
          padding: "4px 0",
        }}>
          <a
            href="profile/edit"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "22px 20px", textDecoration: "none",
              borderBottom: "1px solid var(--m-border)",
            }}
          >
            <div>
              <div style={{ fontSize: 21, color: "var(--m-text)", fontWeight: 700 }}>Edit training profile</div>
              <div style={{ fontSize: 18, color: "var(--m-muted)", marginTop: 4 }}>Goals, schedule, session length</div>
            </div>
            <ChevronRight />
          </a>
          <a
            href="/api/auth/logout"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "22px 20px", textDecoration: "none",
            }}
          >
            <div style={{ fontSize: 21, color: "#ef4444", fontWeight: 700 }}>Log out</div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      </div>

    </div>
    </div>
  </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 15, fontWeight: 700, color: "var(--m-muted)",
      letterSpacing: "1.2px", textTransform: "uppercase",
      marginBottom: 18, marginTop: 4,
    }}>
      {children}
    </div>
  );
}

function MetricCard({ value, label, color, desc }: {
  value: string; label: string; color: string; desc?: string;
}) {
  return (
    <div style={{
      background: "var(--m-card)", borderRadius: 14, border: "1px solid var(--m-border)",
      padding: "22px 20px",
    }}>
      <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1, marginBottom: 10 }}>
        {value}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--m-label)", marginBottom: 5 }}>
        {label}
      </div>
      {desc && (
        <div style={{ fontSize: 17, color: "var(--m-muted)", lineHeight: 1.5 }}>{desc}</div>
      )}
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: 14, padding: "18px 0",
      borderBottom: "1px solid var(--m-border)",
    }}>
      <span style={{ fontSize: 20, color: "var(--m-muted)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 20, color: "var(--m-text-2)", textAlign: "right", fontWeight: 600 }}>{value}</span>
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
