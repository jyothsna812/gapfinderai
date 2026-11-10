"use client";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Alert, Button, Empty, PageHead, pct, when } from "@/components/ui";
import type { GapReport, Level } from "@/lib/types";
import { THRESHOLDS } from "@/lib/analysis";
import { analyze, withRuns, type RunLog } from "@/lib/workflows";

const COLOR: Record<Level, string> = {
  weak: "var(--weak)",
  medium: "var(--medium)",
  strong: "var(--strong)",
  untested: "var(--untested)",
};

/** Horizontal mastery bars with the weak/strong thresholds marked. */
function MasteryChart({ report }: { report: GapReport }) {
  const rows = report.topics.filter((t) => t.level !== "untested").sort((a, b) => a.mastery - b.mastery);
  if (!rows.length) return null;
  const W = 640, L = 190, R = 50, H = 28 * rows.length + 32;
  const x = (v: number) => L + v * (W - L - R);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Mastery by topic">
      {[0, THRESHOLDS.weak, THRESHOLDS.strong, 1].map((v) => (
        <g key={v}>
          <line
            x1={x(v)}
            x2={x(v)}
            y1={6}
            y2={H - 24}
            stroke={v === 0 || v === 1 ? "#e2e8f0" : "#cbd5e1"}
            strokeDasharray={v === 0 || v === 1 ? "" : "4 4"}
            strokeWidth="1.2"
          />
          <text x={x(v)} y={H - 6} fontSize="11" textAnchor="middle" fill="#64748b" fontWeight="600">
            {Math.round(v * 100)}%
          </text>
        </g>
      ))}
      {rows.map((t, i) => (
        <g key={t.topicId}>
          <text
            x={L - 10}
            y={24 + i * 28}
            fontSize="12.5"
            textAnchor="end"
            fill="#1e293b"
            fontWeight="500"
          >
            {t.name.length > 25 ? t.name.slice(0, 24) + "…" : t.name}
          </text>
          <rect
            x={x(0)}
            y={12 + i * 28}
            width={Math.max(3, x(t.mastery) - x(0))}
            height={16}
            rx={4}
            fill={COLOR[t.level]}
            opacity={t.confidence === "low" ? 0.6 : 0.95}
          >
            <title>{`${t.name}: ${pct(t.mastery)} (${t.confidence} confidence)`}</title>
          </rect>
          <text x={x(t.mastery) + 8} y={24 + i * 28} fontSize="12" fontWeight="700" fill="#475569">
            {pct(t.mastery)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function ReportPage() {
  const { data, update } = useApp();
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState("");
  const report = data.reports[data.reports.length - 1];
  const prev = data.reports[data.reports.length - 2];

  if (!report)
    return (
      <>
        <PageHead title="4 · Knowledge Gap Report" />
        <Empty title="No gap analysis report generated">
          Take a <Link href="/quiz">diagnostic quiz</Link> first — your gap report is synthesized mathematically from your actual answers.
        </Empty>
      </>
    );

  async function regenerate() {
    setBusy(true);
    setWarn("");
    const log: RunLog = [];
    const { report: r, warning } = await analyze(data, log);
    if (warning) setWarn(warning);
    await update((d) => withRuns({ ...d, reports: [...d.reports.slice(0, -1), { ...r, id: report.id }] }, log));
    setBusy(false);
  }

  const weakest = report.topics
    .filter((t) => t.level === "weak" || t.level === "medium")
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 3);

  return (
    <>
      <PageHead
        title="4 · Knowledge Gap Report"
        desc={
          <>
            Mastery levels are <b>mathematically computed</b> from your answers across recency, question difficulty, and format.
            Weak &lt; {pct(THRESHOLDS.weak)} ≤ Medium &lt; {pct(THRESHOLDS.strong)} ≤ Strong. The AI evaluates ground-truth citations to isolate misconceptions.
          </>
        }
      >
        <Button variant="secondary" onClick={regenerate} loading={busy}>
          Regenerate AI Analysis ↺
        </Button>
        <Link className="btn" href="/plan">
          Open Revision Plan →
        </Link>
      </PageHead>

      {/* High Impact Overview Cards */}
      <div className="grid grid-4">
        <div className="stat-card brand">
          <div className="stat-label">Overall Assessed Mastery</div>
          <div className="stat">{pct(report.overallMastery)}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {prev?.overallMastery != null ? `Previous: ${pct(prev.overallMastery)}` : "Baseline assessment"}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Coverage Assessed</div>
          <div className="stat">{report.coverage.assessed}/{report.coverage.total}</div>
          <div className="muted" style={{ fontSize: 12 }}>Syllabus topics tested</div>
        </div>

        <div
          className="stat-card weak"
          style={{
            border: "1.5px solid rgba(239, 68, 68, 0.4)",
            background: "linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)",
            boxShadow: "0 4px 14px rgba(239, 68, 68, 0.12)",
          }}
        >
          <div className="stat-label" style={{ color: "#991b1b", fontWeight: 700 }}>Priority Knowledge Gaps</div>
          <div className="stat" style={{ color: "var(--weak)" }}>
            {report.topics.filter((t) => t.level === "weak").length}
          </div>
          <div className="muted" style={{ fontSize: 12, color: "#b91c1c" }}>Critical topics needing review</div>
        </div>

        <div className="stat-card medium">
          <div className="stat-label">Identified Misconceptions</div>
          <div className="stat" style={{ color: "var(--medium)" }}>
            {report.misconceptions.length}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Specific flawed concepts detected</div>
        </div>
      </div>

      <div className="spacer" />

      {warn && (
        <div style={{ marginBottom: 16 }}>
          <Alert kind="error">{warn}</Alert>
        </div>
      )}

      {/* Highlighted Diagnostic Synthesis & Mastery Distribution */}
      <div className="grid grid-2" style={{ alignItems: "stretch", gap: 20 }}>
        {/* Feature 1: Diagnostic Synthesis */}
        <div
          className="card"
          style={{
            background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
            border: "1.5px solid #cbd5e1",
            borderRadius: "14px",
            boxShadow: "0 8px 24px -4px rgba(99, 102, 241, 0.08)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div className="card-header row between" style={{ alignItems: "center", marginBottom: 12 }}>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 20 }}>💡</span>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--ink)" }}>
                Diagnostic Synthesis
              </h2>
            </div>
            <span className="badge" style={{ fontSize: 12, background: "var(--canvas-sunken)" }}>
              Updated {when(report.createdAt)}
            </span>
          </div>

          <div
            style={{
              background: "rgba(99, 102, 241, 0.04)",
              borderLeft: "4px solid var(--brand-primary)",
              padding: "12px 16px",
              borderRadius: "0 8px 8px 0",
              fontSize: 14.5,
              lineHeight: 1.6,
              color: "var(--ink)",
              marginBottom: 16,
            }}
          >
            {report.summary}
          </div>

          {weakest.length > 0 && (
            <div style={{ marginTop: "auto" }}>
              <div className="row between" style={{ alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  🎯 Immediate Focus Areas
                </span>
                <span className="muted" style={{ fontSize: 12 }}>Targeted study priorities</span>
              </div>

              <div className="stack" style={{ gap: 8 }}>
                {weakest.map((t, i) => {
                  const isWeak = t.level === "weak";
                  return (
                    <div
                      key={t.topicId}
                      style={{
                        background: isWeak ? "rgba(239, 68, 68, 0.04)" : "#ffffff",
                        border: isWeak ? "1.5px solid rgba(239, 68, 68, 0.3)" : "1px solid var(--line)",
                        borderLeft: `4px solid ${isWeak ? "var(--weak)" : "var(--medium)"}`,
                        padding: "10px 14px",
                        borderRadius: "8px",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
                      }}
                    >
                      <div className="row between" style={{ alignItems: "center", marginBottom: 4 }}>
                        <div className="row" style={{ gap: 8, alignItems: "center" }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: isWeak ? "#991b1b" : "var(--ink)" }}>
                            {i + 1}. {t.name}
                          </span>
                          <span
                            className={`badge ${isWeak ? "weak" : "medium"}`}
                            style={{ fontSize: 11, padding: "1px 7px" }}
                          >
                            {pct(t.mastery)}
                          </span>
                        </div>
                        <Link
                          href={`/explain?topic=${encodeURIComponent(t.name)}`}
                          style={{ fontSize: 12, color: "var(--brand-primary)", textDecoration: "none", fontWeight: 600 }}
                        >
                          Ask Assistant →
                        </Link>
                      </div>
                      <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
                        {t.recommendedAction}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Feature 2: Mastery Distribution by Topic */}
        <div
          className="card"
          style={{
            background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
            border: "1.5px solid #cbd5e1",
            borderRadius: "14px",
            boxShadow: "0 8px 24px -4px rgba(99, 102, 241, 0.08)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div className="card-header row between" style={{ alignItems: "center", marginBottom: 8 }}>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 20 }}>📊</span>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--ink)" }}>
                Mastery Distribution by Topic
              </h2>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <span className="badge weak" style={{ fontSize: 10.5, padding: "1px 6px" }}>Weak &lt;50%</span>
              <span className="badge medium" style={{ fontSize: 10.5, padding: "1px 6px" }}>Medium 50-79%</span>
              <span className="badge strong" style={{ fontSize: 10.5, padding: "1px 6px" }}>Strong ≥80%</span>
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <MasteryChart report={report} />
          </div>

          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: "1px solid var(--line)",
              fontSize: 12,
              color: "var(--muted)",
              lineHeight: 1.5,
            }}
          >
            Dashed vertical guides represent weak (&lt;50%) and strong (≥80%) thresholds. Faded bars denote low diagnostic confidence.
          </div>
        </div>
      </div>
    </>
  );
}
