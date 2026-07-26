import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getStoredAthleteState, getCachedPlan } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { kvGet } from "@/lib/kv";
import { getFingerprint } from "@/lib/rider-fingerprint";
import { fetchOwnProfile } from "@/lib/zwift";
import SignOutButton from "./sign-out-button";

export default async function MobileProfilePage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null; // layout handles unauthenticated state
  const session = await decryptSession(raw);
  if (!session?.athleteId) return null;

  const athleteId = session.athleteId!;

  const [state, currentPlan, fingerprint, zwiftProfile] = await Promise.all([
    getStoredAthleteState(athleteId),
    getCachedPlan(athleteId, mondayOfCurrentWeek()),
    getFingerprint(athleteId).catch(() => null),
    fetchOwnProfile(session.accessToken).catch(() => null),
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

  // ICU connection status (cookie readable server-side)
  const icuName = cookieStore.get("zwift_intervals_name")?.value ?? null;
  const icuConnected = !!cookieStore.get("zwift_intervals_key")?.value;

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
        <div style={{ fontSize: 15, color: "#475569", fontWeight: 600, letterSpacing: ".4px", textTransform: "uppercase" }}>
          Athlete
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, color: "#f8fafc", letterSpacing: "-.4px", marginTop: 2 }}>
          {zwiftProfile?.firstName ? `${zwiftProfile.firstName} ${zwiftProfile.lastName ?? ""}`.trim() : "Profile & Stats"}
        </div>
        {zwiftProfile?.firstName && (
          <div style={{ fontSize: 17, color: "#475569", marginTop: 4 }}>Profile &amp; Stats</div>
        )}
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
              desc={ftpSource}
            />
          ) : (
            <MetricCard value="—" label="FTP" color="#475569" desc="Set FTP in Zwift app" />
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
              padding: "16px 18px",
              background: "#111827", borderRadius: 14, border: "1px solid #1e293b",
              fontSize: 16, color: "#475569", lineHeight: 1.6,
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

      {/* Connections */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Connections</SectionLabel>

        {/* All-synced banner */}
        {icuConnected && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.25)",
            borderRadius: 14, padding: "14px 16px", marginBottom: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9, flexShrink: 0,
              background: "rgba(34,197,94,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#22c55e" }}>All systems synced</div>
              <div style={{ fontSize: 15, color: "#475569", marginTop: 3 }}>Zwift + Intervals.icu connected</div>
            </div>
          </div>
        )}

        <div style={{
          background: "#111827", borderRadius: 14, border: "1px solid #1e293b",
          padding: "4px 0",
        }}>
          {/* Zwift — always connected (they're logged in) */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px", borderBottom: "1px solid #1e293b",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9, background: "#0f2a4a",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#3b82f6" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 18, color: "#f1f5f9", fontWeight: 700 }}>Zwift</div>
                <div style={{ fontSize: 15, color: "#22c55e", marginTop: 2 }}>Connected</div>
              </div>
            </div>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#22c55e" }} />
          </div>

          {/* Intervals.icu */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9, background: icuConnected ? "#0f2a1a" : "#1a1a2e",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={icuConnected ? "#22c55e" : "#475569"}
                    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 18, color: "#f1f5f9", fontWeight: 700 }}>Intervals.icu</div>
                <div style={{ fontSize: 15, color: icuConnected ? "#22c55e" : "#64748b", marginTop: 2 }}>
                  {icuConnected ? (icuName ?? "Connected") : "Not connected"}
                </div>
              </div>
            </div>
            {icuConnected ? (
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#22c55e" }} />
            ) : (
              <a
                href="/api/intervals/oauth-start?from=m"
                style={{
                  fontSize: 14, fontWeight: 600, color: "#3b82f6",
                  textDecoration: "none", padding: "7px 14px",
                  background: "#1e3a5f", borderRadius: 9,
                }}
              >
                Connect
              </a>
            )}
          </div>
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
            href="/m/profile/edit"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 18px", textDecoration: "none",
              borderBottom: "1px solid #1e293b",
            }}
          >
            <div>
              <div style={{ fontSize: 18, color: "#f1f5f9", fontWeight: 700 }}>Edit training profile</div>
              <div style={{ fontSize: 15, color: "#475569", marginTop: 3 }}>Goals, schedule, session length</div>
            </div>
            <ChevronRight />
          </a>
          <SignOutButton />
        </div>
      </div>

    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 16, fontWeight: 700, color: "#475569",
      letterSpacing: ".4px", textTransform: "uppercase",
      marginBottom: 12,
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
      padding: "16px 18px",
    }}>
      <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1, marginBottom: 6 }}>
        {value}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#94a3b8", marginBottom: 4 }}>
        {label}
      </div>
      {desc && (
        <div style={{ fontSize: 14, color: "#475569" }}>{desc}</div>
      )}
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: 12, padding: "11px 0",
      borderBottom: "1px solid #1e293b",
    }}>
      <span style={{ fontSize: 16, color: "#64748b", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 16, color: "#c4d0e3", textAlign: "right", fontWeight: 500 }}>{value}</span>
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
