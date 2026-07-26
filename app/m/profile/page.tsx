import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getStoredAthleteState, getCachedPlan } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { kvGet } from "@/lib/kv";
import { getFingerprint } from "@/lib/rider-fingerprint";

export default async function MobileProfilePage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) redirect("/login?next=/m");
  const session = await decryptSession(raw);
  if (!session?.athleteId) redirect("/login?next=/m");

  const athleteId = session.athleteId!;

  const [state, currentPlan, fingerprint] = await Promise.all([
    getStoredAthleteState(athleteId),
    getCachedPlan(athleteId, mondayOfCurrentWeek()),
    getFingerprint(athleteId).catch(() => null),
  ]);

  // Training load from KV (stored alongside plan after each generation)
  let ctl = 0, atl = 0, tsb = 0;
  try {
    const loadRaw = await kvGet(`zwift:${athleteId}:training_load`);
    if (loadRaw) {
      const load = JSON.parse(loadRaw);
      ctl = load.ctl ?? 0;
      atl = load.atl ?? 0;
      tsb = load.tsb ?? 0;
    }
  } catch { /* best-effort */ }

  const profile = state.riderProfile;
  const macro = state.macroCycle;

  // FTP from fingerprint history (most recent entry)
  const ftpEntry = fingerprint?.ftpHistory?.length
    ? fingerprint.ftpHistory[fingerprint.ftpHistory.length - 1]
    : null;
  const ftpWatts = ftpEntry?.ftp ?? null;

  // Compute training phase from weekIndex (matches periodization.ts logic)
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

  const GOAL_LABELS: Record<string, string> = {
    fitness: "Improve fitness",
    ftp: "Raise FTP",
    weight: "Lose weight",
    event: "Event prep",
    fun: "Ride for fun",
  };

  return (
    <div style={{ padding: "16px 16px 0" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#475569", fontWeight: 500, letterSpacing: ".4px", textTransform: "uppercase" }}>
          Athlete
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#f8fafc", letterSpacing: "-.4px", marginTop: 2 }}>
          Profile &amp; Stats
        </div>
      </div>

      {/* Fitness metrics */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Fitness metrics</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {ftpWatts ? (
            <MetricCard
              value={`${ftpWatts}W`}
              label="FTP"
              color="#3b82f6"
              desc={ftpEntry?.source === "measured" ? "Measured" : "Estimated"}
            />
          ) : (
            <MetricCard value="—" label="FTP" color="#475569" desc="Not yet available" />
          )}
          <MetricCard
            value={tsbLabel}
            label="Freshness"
            color={tsb !== 0 ? tsbColor : "#475569"}
            desc={tsb !== 0 ? `TSB ${tsb > 0 ? "+" : ""}${tsb.toFixed(1)}` : "No data yet"}
          />
          {ctl > 0 ? (
            <>
              <MetricCard value={ctl.toFixed(1)} label="CTL (Fitness)" color="#818cf8" desc="42-day average" />
              <MetricCard value={atl.toFixed(1)} label="ATL (Fatigue)" color="#f59e0b" desc="7-day average" />
            </>
          ) : (
            <div style={{
              gridColumn: "1/-1",
              padding: "14px 16px",
              background: "#111827", borderRadius: 14, border: "1px solid #1e293b",
              fontSize: 13, color: "#475569", lineHeight: 1.5,
            }}>
              CTL / ATL / TSB will appear here once your rides are processed.
            </div>
          )}
        </div>
      </div>

      {/* This week */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>This week</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <MetricCard value={String(workoutsThisWeek)} label="Workouts planned" color="#f1f5f9" />
          {currentPhase && (
            <MetricCard
              value={currentPhase}
              label="Training phase"
              color={currentPhase === "Recovery" ? "#f59e0b" : currentPhase === "Build" ? "#ef4444" : "#818cf8"}
              desc={`Week ${(macro?.weekIndex ?? 0) + 1}`}
            />
          )}
        </div>
      </div>

      {/* Training profile */}
      {profile && (
        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Training profile</SectionLabel>
          <div style={{
            background: "#111827", borderRadius: 14, border: "1px solid #1e293b",
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
              <ProfileRow label="Target event" value={profile.eventDate} />
            )}
          </div>
        </div>
      )}

      {/* Account */}
      <div style={{ marginBottom: 8 }}>
        <SectionLabel>Account</SectionLabel>
        <div style={{
          background: "#111827", borderRadius: 14, border: "1px solid #1e293b",
          padding: "4px 0",
        }}>
          <a
            href="/dashboard"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", textDecoration: "none",
              borderBottom: "1px solid #1e293b",
            }}
          >
            <span style={{ fontSize: 14, color: "#c4d0e3" }}>Full dashboard</span>
            <ChevronRight />
          </a>
          <a
            href="/api/auth/logout"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", textDecoration: "none",
            }}
          >
            <span style={{ fontSize: 14, color: "#ef4444" }}>Sign out</span>
            <ChevronRight color="#ef4444" />
          </a>
        </div>
      </div>

    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: "#475569",
      letterSpacing: ".5px", textTransform: "uppercase",
      marginBottom: 8,
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
      background: "#111827", borderRadius: 14, border: "1px solid #1e293b",
      padding: "14px 16px",
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 2 }}>
        {label}
      </div>
      {desc && (
        <div style={{ fontSize: 11, color: "#475569" }}>{desc}</div>
      )}
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: 12, padding: "8px 0",
      borderBottom: "1px solid #1e293b",
    }}>
      <span style={{ fontSize: 13, color: "#64748b", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#c4d0e3", textAlign: "right" }}>{value}</span>
    </div>
  );
}

function ChevronRight({ color = "#475569" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M9 18l6-6-6-6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
