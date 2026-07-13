import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchActivities } from "@/lib/zwift";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import WeeklyPlan from "./weekly-plan";
import AiInsights from "./ai-insights";
import HRAlertBanner from "./hr-alert-banner";

const HeroBanner = dynamic(() => import("./hero-banner"), { ssr: false });

/**
 * Coach page — the daily training hub.
 * Hero banner above the workout grid, Today's Note + AI coaching below.
 */
export default async function CoachPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) redirect("/login");

  const session = await decryptSession(raw);
  if (!session) redirect("/login");

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
      <Suspense fallback={null}>
        <HeroBanner />
      </Suspense>
      <div className="section fade-in" id="weekly-plan" style={{ scrollMarginTop: 24 }}>
        <WeeklyPlan />
      </div>
      <div className="section fade-in" id="ai-insights" style={{ scrollMarginTop: 24 }}>
        <AiInsights />
      </div>
    </>
  );
}
