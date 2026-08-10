"use client";

import dynamic from "next/dynamic";

// ssr: false must live in a Client Component — not allowed in Server Components.
const FeedbackBanner = dynamic(() => import("@/app/m/today/feedback-banner"), { ssr: false });

export default FeedbackBanner;
