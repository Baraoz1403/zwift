import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export default async function Home() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.has(SESSION_COOKIE_NAME);
  redirect(hasSession ? "/dashboard" : "/login");
}
