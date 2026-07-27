/**
 * Preview-only route — shows the ICU onboarding screen without auth check.
 * For internal review only. Remove before going public.
 */
import MobileIcuConnect from "@/app/m/mobile-icu-connect";

export default function PreviewIcuPage() {
  return <MobileIcuConnect />;
}
