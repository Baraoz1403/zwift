"use client";

export default function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    // Hard navigation (not router.push) - see app/login/page.tsx for why:
    // a soft navigation can leave this session's cached layout/page output
    // sitting in the Router Cache for the next person who signs in on this
    // same browser. A full page load guarantees a clean slate.
    window.location.href = "/login";
  }

  return (
    <button className="signout-btn" onClick={handleLogout}>
      Sign out
    </button>
  );
}
