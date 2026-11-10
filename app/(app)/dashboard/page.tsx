"use client";
import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import { Button, LevelBadge, PageHead, PriorityBadge, pct, when } from "@/components/ui";
import { ProgressChart, ProgressTable } from "@/components/ProgressChart";
import { attemptScore } from "@/lib/analysis";

export default function Dashboard() {
  const { data, user } = useApp();
  const report = data.reports[data.reports.length - 1];
  const prev = data.reports[data.reports.length - 2];
  const attempts = [...data.attempts].sort((a, b) => a.createdAt - b.createdAt);
  const last = attempts[attempts.length - 1];
  const weak = report?.topics.filter((t) => t.level === "weak") ?? [];
  const count = (l: string) => report?.topics.filter((t) => t.level === l).length ?? data.topics.length * Number(l === "untested");
  const upcoming = (data.plan?.schedule ?? []).flatMap((d) => d.blocks.filter((b) => !b.done).map((b) => ({ day: d.day, b }))).slice(0, 4);
  const reassess = report?.topics.filter((t) => t.needsReassessment && t.level !== "untested") ?? [];

  const next = !data.materials.length
    ? { title: "Upload your study material", body: "Add your syllabus, textbook chapters or notes, and past papers.", href: "/materials", cta: "Upload material" }
    : !data.topics.length
    ? { title: "Build your topic map", body: "GapFinder reads your syllabus and links every past-paper question to a topic.", href: "/materials", cta: "Build topic map" }
    : !data.attempts.length
    ? { title: "Take your first diagnostic quiz", body: "Questions are generated from your own notes, each with a citation.", href: "/quiz", cta: "Start diagnostic" }
    : {
        title: weak.length ? `Fix your weakest topic: ${weak[0].name}` : "Keep going — re-test to confirm progress",
        body: weak.length ? weak[0].reason : "Your plan is up to date. Take another quiz to update it.",
        href: weak.length ? "/plan" : "/quiz",
        cta: weak.length ? "Open revision plan" : "Re-test now",
      };

  return (
    <>
      <PageHead
        title={`Hi, ${user?.name.split(" ")[0]} 👋`}
        desc={<>Personalized diagnostic workspace for <b>{data.subject || "your studies"}</b></>}
      >
        <Link className="btn secondary sm" href="/materials">Manage Materials</Link>
        <Link className="btn sm" href="/quiz">Take Diagnostic →</Link>
      </PageHead>

      {/* Recommended Next Step Hero Banner */}
      <div
        className="card"
        style={{
          background: "linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)",
          border: "1px solid #c7d2fe",
          boxShadow: "0 4px 14px rgba(99, 102, 241, 0.08)",
        }}
      >
        <div className="row between" style={{ gap: 16 }}>
          <div style={{ maxWidth: 720 }}>
            <span className="badge brand" style={{ marginBottom: 8 }}>
              🎯 Recommended Next Step
            </span>
            <h2 style={{ marginTop: 6, fontSize: 20 }}>{next.title}</h2>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>{next.body}</p>
          </div>
          <Link className="btn lg" href={next.href}>
            {next.cta} →
          </Link>
        </div>
      </div>

      <div className="spacer" />

      {/* High-level Diagnostic Stats */}
      <div className="grid grid-4">
        <div className="stat-card brand">
          <div className="stat-label">Overall Mastery</div>
          <div className="stat">{report ? pct(report.overallMastery) : "—"}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {last && `Latest quiz: ${pct(attemptScore(last))}`}
            {attempts.length > 1 && ` (Initial: ${pct(attemptScore(attempts[0]))})`}
            {!last && "Take a diagnostic quiz to assess"}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Coverage Assessed</div>
          <div className="stat">{report ? `${report.coverage.assessed}/${report.coverage.total}` : `0/${data.topics.length}`}</div>
          <div className="muted" style={{ fontSize: 12 }}>{count("untested")} topic(s) pending assessment</div>
        </div>

        <div className="stat-card strong">
          <div className="stat-label">Strong Topics</div>
          <div className="stat" style={{ color: "var(--strong)" }}>{count("strong")}</div>
          <div className="muted" style={{ fontSize: 12 }}>{count("medium")} medium topics identified</div>
        </div>

        <div className="stat-card weak">
          <div className="stat-label">Critical Knowledge Gaps</div>
          <div className="stat" style={{ color: weak.length ? "var(--weak)" : "var(--strong)" }}>{weak.length}</div>
          <div className="muted" style={{ fontSize: 12 }}>{weak.length ? "Priority topics requiring focus" : "No critical gaps detected"}</div>
        </div>
      </div>

      <div className="spacer" />

      {/* Tasks & Recent Diagnostics */}
      <div className="grid grid-2">
        <div className="card">
          <div className="card-header">
            <h2>Upcoming Revision Tasks</h2>
            <Link className="btn secondary sm" href="/plan">Full plan →</Link>
          </div>
          {!upcoming.length ? (
            <p className="muted" style={{ padding: "16px 0", textAlign: "center" }}>
              {data.plan ? "All scheduled tasks completed! Take a follow-up quiz to reassess." : "No active revision plan yet."}
            </p>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {upcoming.map(({ day, b }) => (
                <div
                  key={b.id}
                  className="row between"
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    background: "var(--panel)",
                    flexWrap: "nowrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                    <div className="row" style={{ gap: 6, marginBottom: 2 }}>
                      <b>{b.topicName}</b>
                      <span className="badge" style={{ fontSize: 11 }}>Day {day} · {b.minutes} min</span>
                    </div>
                    <div className="muted" style={{ fontSize: 13, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {b.activity}
                    </div>
                  </div>
                  {b.priority && <PriorityBadge p={b.priority} />}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Recent Diagnostics</h2>
            <Link className="btn secondary sm" href="/quiz">New quiz →</Link>
          </div>
          {!attempts.length ? (
            <p className="muted" style={{ padding: "16px 0", textAlign: "center" }}>No diagnostic quizzes taken yet.</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {[...attempts].reverse().slice(0, 4).map((a) => (
                <div
                  key={a.id}
                  className="row between"
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    background: "var(--panel)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>Attempt #{attempts.indexOf(a) + 1}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{when(a.createdAt)} · {a.questions.length} questions</div>
                  </div>
                  <span className="badge brand" style={{ fontSize: 14, fontWeight: 700 }}>
                    {pct(attemptScore(a))}
                  </span>
                </div>
              ))}
              {reassess.length > 0 && (
                <div className="alert" style={{ marginTop: 6, padding: "8px 12px", fontSize: 13 }}>
                  <span>Re-test recommended: <b>{reassess.map((t) => t.name).join(", ")}</b></span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="spacer" />

      {/* Progress Chart and Topic Snapshot */}
      <div className="grid grid-2">
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Mastery Trajectory</h2>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Score progression across {attempts.length} diagnostic session(s)</p>
            </div>
          </div>
          <ProgressChart data={data} />
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h2>Gap Snapshot</h2>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>{report ? `Updated ${when(report.createdAt)}` : "Pending first diagnostic"}</p>
            </div>
            <Link className="btn secondary sm" href="/report">Full report →</Link>
          </div>
          {!report ? (
            <p className="muted" style={{ padding: "16px 0", textAlign: "center" }}>No gap report generated yet.</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {report.topics.map((t) => {
                const before = prev?.topics.find((x) => x.topicId === t.topicId);
                return (
                  <div
                    key={t.topicId}
                    className="row between"
                    style={{
                      borderBottom: "1px solid var(--line-light)",
                      paddingBottom: 8,
                    }}
                  >
                    <div className="row" style={{ gap: 8 }}>
                      <LevelBadge level={t.level} />
                      <span style={{ fontWeight: 500 }}>{t.name}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {before && before.level !== t.level && before.level !== "untested" && (
                        <span style={{ fontStyle: "italic", marginRight: 4 }}>was {before.level} ·</span>
                      )}
                      <b style={{ color: "var(--ink)" }}>{t.level === "untested" ? "Not assessed" : pct(t.mastery)}</b>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="spacer" />

      <div className="card">
        <div className="card-header">
          <h2>Topic Performance Matrix</h2>
        </div>
        <ProgressTable data={data} />
      </div>
    </>
  );
}
