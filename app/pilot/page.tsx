"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./pilot.module.css";

type Stage = "landing" | "login" | "icu" | "analyzing" | "review" | "syncing" | "done";
type Workout = {
  day: string;
  date?: string;
  type: string;
  title: string;
  durationMin: number;
  targetPowerPctFtp?: string;
  description: string;
};
type Plan = { weekOf: string; summary: string; workouts: Workout[] };

const dayShort: Record<string, string> = {
  Monday: "MON", Tuesday: "TUE", Wednesday: "WED", Thursday: "THU",
  Friday: "FRI", Saturday: "SAT", Sunday: "SUN",
};

function VoltMark() {
  return <span className={styles.mark}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13 1 3 11h5.5L6 19 17 9h-5.5L13 1Z" /></svg></span>;
}

function StepRail({ stage }: { stage: Stage }) {
  const order: Stage[] = ["login", "icu", "analyzing", "review", "done"];
  const active = stage === "landing" ? -1 : order.indexOf(stage === "syncing" ? "review" : stage);
  const labels = ["Zwift", "Intervals.icu", "30 activities", "Review", "Synced"];
  return <div className={styles.steps}>{labels.map((label, index) => (
    <div className={`${styles.step} ${index <= active ? styles.stepOn : ""}`} key={label}>
      <span>{index < active ? "✓" : index + 1}</span><small>{label}</small>
    </div>
  ))}</div>;
}

export default function PilotPage() {
  const [stage, setStage] = useState<Stage>("landing");
  const [dark, setDark] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [icuApiKey, setIcuApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<{ firstName?: string; ftp?: number } | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [syncResult, setSyncResult] = useState<{ pushed?: number; deleted?: number } | null>(null);

  const activeWorkouts = useMemo(() => plan?.workouts.filter(w => w.type !== "Rest" && w.durationMin > 0) ?? [], [plan]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("icu_connected") === "1") {
      void resumeAfterIcu();
    }
  }, []);

  async function resumeAfterIcu() {
    setStage("analyzing");
    setError(null);
    const profileRes = await fetch("/api/zwift/profile", { cache: "no-store" });
    const profileData = await profileRes.json().catch(() => null);
    if (profileData?.profile) setProfile(profileData.profile);
    await generateDraft();
  }

  async function startCleanPilot() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.history.replaceState({}, "", "/pilot");
    setEmail(""); setPassword(""); setPlan(null); setProfile(null); setError(null);
    setStage("login"); setBusy(false);
  }

  async function login(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, pilot: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Zwift sign-in failed.");
      const p = await fetch("/api/zwift/profile", { cache: "no-store" }).then(r => r.json());
      if (p?.profile) setProfile(p.profile);
      setStage("icu");
    } catch (e) { setError(e instanceof Error ? e.message : "Sign-in failed."); }
    finally { setBusy(false); }
  }

  function connectIcu() {
    window.location.href = "/api/intervals/oauth-start?from=pilot";
  }

  async function connectIcuWithKey(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const res = await fetch("/api/intervals/connect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: icuApiKey }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Intervals.icu connection failed.");
      await generateDraft();
    } catch (e) { setError(e instanceof Error ? e.message : "Intervals.icu connection failed."); }
    finally { setBusy(false); }
  }

  async function generateDraft() {
    setStage("analyzing"); setBusy(true); setError(null);
    try {
      const res = await fetch("/api/ai/weekly-plan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pilot: true, forceRegenerate: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.plan) throw new Error(data.error || "Plan generation failed.");
      setPlan(data.plan); setStage("review");
    } catch (e) { setError(e instanceof Error ? e.message : "Plan generation failed."); setStage("icu"); }
    finally { setBusy(false); }
  }

  async function approveAndSync() {
    setStage("syncing"); setError(null);
    try {
      const res = await fetch("/api/m/resync-plan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "APPROVE_ICU_SYNC" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || data.errors?.join(" · ") || "Sync failed.");
      setSyncResult(data); setStage("done");
    } catch (e) { setError(e instanceof Error ? e.message : "Sync failed."); setStage("review"); }
  }

  return <main className={`${styles.shell} ${dark ? styles.dark : styles.light}`}>
    <div className={styles.aurora} />
    <header className={styles.header}>
      <a className={styles.brand} href="/pilot"><VoltMark /><span>VOLT <b>AI</b></span></a>
      <div className={styles.headerRight}>
        <span className={styles.pilotBadge}>LIVE PILOT</span>
        <button className={styles.theme} onClick={() => setDark(v => !v)} aria-label="Toggle theme">{dark ? "☀" : "☾"}</button>
      </div>
    </header>

    {stage !== "landing" && <StepRail stage={stage} />}

    {stage === "landing" && <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <div className={styles.eyebrow}><i /> PERSONAL TRAINING INTELLIGENCE</div>
        <h1>Your strongest season<br /><em>starts with your data.</em></h1>
        <p>Volt studies your latest rides, understands your fitness load, and builds the week your body is ready for — then delivers it to Zwift through Intervals.icu.</p>
        <div className={styles.heroActions}>
          <button className={styles.primary} onClick={startCleanPilot} disabled={busy}>Start the live pilot <span>→</span></button>
          <span className={styles.micro}>30 activities · 1 personal week · 0 generic plans</span>
        </div>
        <div className={styles.trust}><span>✓ Private by design</span><span>✓ Review before sync</span><span>✓ Built for iPad & mobile</span></div>
      </div>
      <div className={styles.heroVisual} aria-hidden="true">
        <div className={styles.riderGlow} />
        <div className={styles.rider}><div className={styles.head} /><div className={styles.body} /><div className={styles.bike}><i /><i /></div></div>
        <div className={`${styles.metric} ${styles.metricOne}`}><small>eFTP</small><strong>220<span>W</span></strong><b>+4.8%</b></div>
        <div className={`${styles.metric} ${styles.metricTwo}`}><small>FITNESS</small><strong>42</strong><b>CTL</b></div>
        <div className={`${styles.metric} ${styles.metricThree}`}><small>FORM</small><strong>+7</strong><b>READY</b></div>
        <svg className={styles.graph} viewBox="0 0 600 260"><defs><linearGradient id="line" x1="0" x2="1"><stop stopColor="#7c5cff"/><stop offset=".5" stopColor="#16d9ff"/><stop offset="1" stopColor="#ff5a1f"/></linearGradient></defs><path d="M10 220 C90 190 100 210 170 155 S280 190 340 105 S460 130 590 34"/><path className={styles.graphGlow} d="M10 220 C90 190 100 210 170 155 S280 190 340 105 S460 130 590 34"/></svg>
      </div>
    </section>}

    {stage === "login" && <section className={styles.flowGrid}>
      <div className={styles.flowIntro}><span className={styles.bigNumber}>01</span><div className={styles.eyebrow}><i /> CONNECT YOUR TRAINING</div><h2>Start with Zwift.</h2><p>Volt reads your rider profile and exactly the latest 30 activities. Your password is sent directly to Zwift and is never stored.</p></div>
      <form className={styles.card} onSubmit={login}>
        <div className={styles.cardHead}><span className={styles.zwiftIcon}>Z</span><div><strong>Connect Zwift</strong><small>Secure one-time sign in</small></div></div>
        <label>ZWIFT EMAIL<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" required /></label>
        <label>PASSWORD<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••" required /></label>
        {error && <div className={styles.error}>{error}</div>}
        <button className={styles.primary} disabled={busy}>{busy ? "Connecting securely…" : "Connect Zwift →"}</button>
        <p className={styles.secure}>🔒 Encrypted session · Password never stored</p>
      </form>
    </section>}

    {stage === "icu" && <section className={styles.flowGrid}>
      <div className={styles.flowIntro}><span className={styles.bigNumber}>02</span><div className={styles.eyebrow}><i /> DELIVERY BRIDGE</div><h2>Now connect Intervals.icu.</h2><p>This is the bridge that delivers the approved week to Zwift. Volt will not upload anything until you review the plan.</p>{profile?.firstName && <div className={styles.connectedChip}>✓ Zwift connected · {profile.firstName}{profile.ftp ? ` · ${profile.ftp}W FTP` : ""}</div>}</div>
      <form className={styles.card} onSubmit={connectIcuWithKey}>
        <div className={styles.cardHead}><span className={styles.icuIcon}>↗</span><div><strong>Connect Intervals.icu</strong><small>Official authorization flow</small></div></div>
        <div className={styles.permission}><span>READ</span><p>Activities and fitness metrics</p></div>
        <div className={styles.permission}><span>WRITE</span><p>Only the week you explicitly approve</p></div>
        {error && <div className={styles.error}>{error}</div>}
        <button type="button" className={styles.primary} onClick={connectIcu}>Continue to Intervals.icu →</button>
        <div className={styles.apiDivider}><span>or use a personal API key</span></div>
        <label>INTERVALS.ICU API KEY<input type="password" autoComplete="off" value={icuApiKey} onChange={e => setIcuApiKey(e.target.value)} placeholder="Paste your API key" /></label>
        <button className={styles.secondary} disabled={busy || !icuApiKey.trim()}>{busy ? "Connecting…" : "Connect with API key"}</button>
        <p className={styles.secure}>OAuth returns here automatically · API key is stored securely</p>
      </form>
    </section>}

    {stage === "analyzing" && <section className={styles.analyzing}>
      <div className={styles.scan}><span>30</span><i /></div><div className={styles.eyebrow}><i /> LIVE ANALYSIS</div><h2>Building your week.</h2><p>Reading the latest 30 activities, profile, fitness load and training history.</p><div className={styles.progress}><i /></div><div className={styles.analysisLabels}><span>Zwift profile ✓</span><span>30 activities</span><span>Training load</span><span>Personal week</span></div>
    </section>}

    {(stage === "review" || stage === "syncing") && plan && <section className={styles.review}>
      <div className={styles.reviewHead}><div><div className={styles.eyebrow}><i /> YOUR PERSONAL WEEK</div><h2>Review before it rides.</h2><p>{plan.summary}</p></div><div className={styles.weekStats}><span><strong>{activeWorkouts.length}</strong> sessions</span><span><strong>{activeWorkouts.reduce((n,w)=>n+w.durationMin,0)}</strong> minutes</span></div></div>
      <div className={styles.week}>{plan.workouts.map((w, i) => <article className={`${styles.workout} ${w.type === "Rest" ? styles.rest : ""}`} key={`${w.day}-${i}`}><div className={styles.day}><small>{dayShort[w.day] ?? w.day.slice(0,3).toUpperCase()}</small><strong>{w.date?.slice(-2) ?? i + 1}</strong></div><div className={styles.workoutBody}><span>{w.type}</span><h3>{w.title}</h3><p>{w.description}</p></div><div className={styles.workoutMeta}>{w.durationMin > 0 ? <><strong>{w.durationMin}</strong><small>MIN</small>{w.targetPowerPctFtp && <b>{w.targetPowerPctFtp}</b>}</> : <em>RECOVER</em>}</div></article>)}</div>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.approval}><div><strong>Nothing has been uploaded yet.</strong><small>Your approval will replace planned workout events for this week in ICU and let ICU deliver them to Zwift.</small></div><button className={styles.primary} onClick={approveAndSync} disabled={stage === "syncing"}>{stage === "syncing" ? "Syncing to ICU…" : "Approve & sync to Zwift →"}</button></div>
    </section>}

    {stage === "done" && <section className={styles.done}><div className={styles.doneRing}>✓</div><div className={styles.eyebrow}><i /> WEEK DELIVERED</div><h2>Your plan is on its way to Zwift.</h2><p>Intervals.icu accepted {syncResult?.pushed ?? activeWorkouts.length} planned workouts{syncResult?.deleted ? ` and replaced ${syncResult.deleted} older events` : ""}.</p><div className={styles.doneFlow}><span>VOLT <b>APPROVED</b></span><i>→</i><span>INTERVALS.ICU <b>SYNCED</b></span><i>→</i><span>ZWIFT <b>DELIVERY</b></span></div><a className={styles.primary} href="/tablet/today">Open your Volt dashboard →</a></section>}
  </main>;
}
