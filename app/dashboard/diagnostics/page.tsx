"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface RideOption {
  id: string;
  label: string;
}

interface DiagnosticsReport {
  activityId: string;
  activityName?: string;
  rawKeys: string[];
  rideTypeCandidates: Record<string, unknown>;
  fitFile: {
    attempted: boolean;
    urlTried?: string;
    ok: boolean;
    status?: number;
    contentType?: string;
    byteLength?: number;
    looksLikeFit?: boolean;
    error?: string;
    fieldSummary?: {
      fieldNum: number;
      baseTypeNum: number;
      isDevField: boolean;
      valuesSeen: number;
      sampleValues: number[];
    }[];
  };
  rideOn: {
    attempted: boolean;
    ok: boolean;
    status?: number;
    count?: number;
    sample?: unknown;
    error?: string;
  };
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 700,
        background: ok ? "#1f7a3a" : "#7a1f1f",
        color: "white",
        marginRight: 8,
      }}
    >
      {ok ? "OK" : "FAILED"}
    </span>
  );
}

export default function DiagnosticsPage() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rides, setRides] = useState<RideOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    fetch("/api/zwift/activities")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) return;
        const sorted = [...data.activities].sort(
          (a: any, b: any) => new Date(b.startDate ?? 0).getTime() - new Date(a.startDate ?? 0).getTime()
        );
        setRides(
          sorted.map((a: any) => ({
            id: a.id_str ?? String(a.id),
            label: `${a.startDate ? new Date(a.startDate).toLocaleDateString("en-GB") : "?"} - ${a.name ?? "(no name)"} (${a.sport ?? "?"})`,
          }))
        );
      })
      .catch(() => {});
  }, []);

  async function runTest() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const url = selectedId
        ? `/api/zwift/diagnostics?id=${encodeURIComponent(selectedId)}`
        : "/api/zwift/diagnostics";
      const res = await fetch(url);
      const data = await res.json();
      if (data.ok) {
        setReport(data.report);
      } else {
        setError(data.error ?? "Test failed.");
      }
    } catch {
      setError("Network error reaching the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 style={{ margin: 0, fontSize: 20 }}>Data-availability test</h1>
        <Link href="/dashboard" className="btn-secondary btn" style={{ width: "auto", padding: "8px 16px" }}>
          Back to dashboard
        </Link>
      </div>

      <div className="notice" style={{ marginBottom: 20 }}>
        This is a one-off exploratory test, not a permanent feature. It checks
        your most recent real ride for three things: whether the raw FIT file
        (in-ride heart rate / cadence / power over time) can be downloaded,
        whether any field marks the ride as a free ride vs. group ride vs.
        event, and whether the Ride On givers for that ride can be listed
        individually.
      </div>

      {rides.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <select className="select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">(most recent ride)</option>
            {rides.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <button className="btn" style={{ width: "auto", padding: "10px 20px" }} onClick={runTest} disabled={loading}>
        {loading ? "Running test..." : "Run test on selected ride"}
      </button>

      {error && <div className="notice" style={{ marginTop: 16 }}>{error}</div>}

      {report && (
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="notice">
            Tested against: <strong>{report.activityName ?? "(no name)"}</strong> (id {report.activityId})
          </div>

          <div className="stat-card">
            <div className="label" style={{ marginBottom: 8 }}>
              <StatusBadge ok={report.fitFile.ok} />
              1. FIT file (in-ride HR / cadence / power)
            </div>

            {report.fitFile.fieldSummary && (
              <div
                className="notice"
                style={{
                  marginBottom: 10,
                  fontSize: 12.5,
                  background: report.fitFile.fieldSummary.some((f) => f.fieldNum === 4 && !f.isDevField && f.valuesSeen > 0)
                    ? undefined
                    : "rgba(122, 31, 31, 0.12)",
                }}
              >
                {(() => {
                  const cadence = report.fitFile.fieldSummary!.find((f) => f.fieldNum === 4 && !f.isDevField);
                  if (!cadence) {
                    return "Cadence (standard field 4) was not found at all in this ride's RECORD messages - this FIT file has no cadence stream.";
                  }
                  if (cadence.valuesSeen === 0) {
                    return "Cadence (standard field 4) is present in the file's field definitions, but every value read back as invalid/null.";
                  }
                  return `Cadence (standard field 4) found with ${cadence.valuesSeen} non-null values. Sample: ${cadence.sampleValues.join(", ")} rpm.`;
                })()}
              </div>
            )}

            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "var(--muted)", margin: 0 }}>
              {JSON.stringify(report.fitFile, null, 2)}
            </pre>
          </div>

          <div className="stat-card">
            <div className="label" style={{ marginBottom: 8 }}>
              2. Ride-type related fields found on the activity
            </div>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "var(--muted)", margin: 0 }}>
              {Object.keys(report.rideTypeCandidates).length > 0
                ? JSON.stringify(report.rideTypeCandidates, null, 2)
                : "(none found - no key name matched group/event/subgroup/type/tag/world)"}
            </pre>
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 12 }}>
                Show all raw field names on this activity
              </summary>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "var(--muted)" }}>
                {report.rawKeys.join(", ")}
              </pre>
            </details>
          </div>

          <div className="stat-card">
            <div className="label" style={{ marginBottom: 8 }}>
              <StatusBadge ok={report.rideOn.ok} />
              3. Who gave Ride On (individually)
            </div>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "var(--muted)", margin: 0 }}>
              {JSON.stringify(report.rideOn, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
