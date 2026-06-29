"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Login failed.");
        setLoading(false);
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="page-center">
      <form className="card" onSubmit={handleSubmit}>
        <h1>Sign in with Zwift</h1>

        <div className="field">
          <label htmlFor="email">Zwift email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Zwift password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>

        {error && <p className="error-text">{error}</p>}

        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 16 }}>
          Your password is sent directly to Zwift's own servers to sign you
          in. It is never stored - only an encrypted session token is kept,
          in a secure cookie in your browser.
        </p>
      </form>
    </div>
  );
}
