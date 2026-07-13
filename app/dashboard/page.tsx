import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchActivities } from "@/lib/zwift";
import WeeklyPlan from "./weekly-plan";
import HeroBanner from "./hero-banner";
import AiInsights from "./ai-insights";
import HRAlertBanner from "./hr-alert-banner";

/**
 * Coach page (default dashboard route, "/dashboard") - the daily "what do I
 * ride today" view: Today's Note + this week's workout cards (both inside
 * WeeklyPlan) and the coach-message area (AiInsights, plus the session
 * feedback chat inside WeeklyPlan). Deliberately NO statistics here - see
 * app/dashboard/stats/page.tsx for Power/Cadence, Fitness, Personal Bests,
 * and ride history. Shared header/auth lives in app/dashboard/layout.tsx.
 */
export default async function CoachPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) redirect("/login");

  const session = await decryptSession(raw);
  if (!session) redirect("/login");

  // Only need to know whether the rider has ANY ride history yet, to decide
  // between the coaching UI and a "go ride first" message - the actual data
  // WeeklyPlan/AiInsights/HRAlertBanner need, they fetch themselves client-side.
  let hasRides = false;
  let activitiesError: string | null = null;
  try {
    const athleteId = session.athleteId;
    const activities = athleteId
      ? await fetchActivities(session.accessToken, athleteId, 1)
      : [];
    hasRides = activities.length > 0;
  } catch (e) {
    activitiesError = e instanceof Error ? e.message : "Could not load ride history.";
  }

  if (!hasRides) {
    return (
      <div className="section fade-in">
        <div className="notice">
          {activitiesError
            ? `Ride history couldn't be loaded right now (${activitiesError}).`
            : "No rides yet — once you've logged at least one ride on Zwift, your AI coach will build your first weekly plan here automatically."}
        </div>
      </div>
    );
  }

  return (
    <>
      <HRAlertBanner />
      <div className="section fade-in" id="weekly-plan" style={{ scrollMarginTop: 24 }}>
        <WeeklyPlan />
      </div>
      <div className="section fade-in" id="ai-insights" style={{ scrollMarginTop: 24 }}>
        <AiInsights />
      </div>
    </>
  );
}
