"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <button className="btn btn-secondary" style={{ width: "auto", padding: "8px 16px" }} onClick={handleLogout}>
      Sign out
    </button>
  );
}
