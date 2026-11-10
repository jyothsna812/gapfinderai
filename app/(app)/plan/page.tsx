"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Alert, Button, Empty, LevelBadge, PageHead, PriorityBadge, when } from "@/components/ui";
import type { PlanBlock } from "@/lib/types";
import { daysUntil } from "@/lib/planner";
import { makePlan, withRuns, type RunLog } from "@/lib/workflows";

const KIND_LABEL: Record<PlanBlock["kind"], string> = { learn: "Concept Revision", practice: "Targeted Practice", review: "Spaced Review", retest: "Follow-up Assessment" };

export default function PlanPage() {
  const { data, update } = useApp();
  const report = data.reports[data.reports.length - 1];

  // Calendar constraints: strictly from today through the last day of the current month
  const { todayStr, endOfMonthStr } = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const end = `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`;
    return { todayStr: today, endOfMonthStr: end };
  }, []);

  const [days, setDays] = useState(data.planPrefs.days);
  const [hours, setHours] = useState(data.planPrefs.hoursPerDay);
  const [examDate, setExamDate] = useState(() => {
    const saved = data.planPrefs.examDate ?? "";
    if (saved && (saved < todayStr || saved > endOfMonthStr)) return "";
    return saved;
  });
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState("");
  const plan = data.plan;

  function handleExamDateChange(val: string) {
    if (!val) {
      setExamDate("");
      return;
    }
    // Clamp to valid range: not before today, not outside current month
    if (val < todayStr) {
      setExamDate(todayStr);
    } else if (val > endOfMonthStr) {
      setExamDate(endOfMonthStr);
    } else {
      setExamDate(val);
    }
  }

  if (!report)
    return (
      <>
        <PageHead title="5 · Revision planner" />
        <Empty title="No revision plan available">
          Take a <Link href="/quiz">diagnostic quiz</Link> first — the revision plan is automatically generated from your diagnosed knowledge gaps.
        </Empty>
      </>
    );

  async function rebuild() {
    const calculatedDays = examDate ? daysUntil(examDate) : days;
    const prefs = {
      days: Math.max(1, Math.min(30, Math.round(calculatedDays))),
      hoursPerDay: Math.max(0.5, Math.min(10, hours)),
      examDate: examDate || undefined,
    };
    setBusy(true);
    setWarn("");
    const log: RunLog = [];
    const { plan: p, warning } = await makePlan(data, report, prefs, log);
    if (warning) setWarn(warning);
    await update((x) => withRuns({ ...x, plan: p, planPrefs: prefs }, log));
    setBusy(false);
  }

  function toggle(blockId: string) {
    update((x) =>
      x.plan
        ? { ...x, plan: { ...x.plan, schedule: x.plan.schedule.map((dd) => ({ ...dd, blocks: dd.blocks.map((b) => (b.id === blockId ? { ...b, done: !b.done } : b)) })) } }
        : x
    );
  }

  const stale = plan && plan.reportId !== report.id;
  const allBlocks = plan?.schedule.flatMap((d) => d.blocks) ?? [];
  const doneMin = allBlocks.filter((b) => b.done).reduce((s, b) => s + b.minutes, 0);
  const totalMin = allBlocks.reduce((s, b) => s + b.minutes, 0);
  const levelOf = (topicId: string) => report.topics.find((t) => t.topicId === topicId)?.level;
  const fmtDate = (iso?: string) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "");

  return (
    <>
      <PageHead
        title="5 · Personalized Revision Plan"
        desc="Adaptive schedule strictly prioritized: weak prerequisite topics → high-frequency exam topics → persistent misconceptions → spaced consolidation. The schedule rebuilds dynamically after every diagnostic quiz."
      />

      {/* Plan Parameters Toolbar & Rebuild Button */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 12 }}>
          <h2>Revision Budget & Deadlines</h2>
          {plan && (
            <span className="muted" style={{ fontSize: 13 }}>
              Generated {when(plan.createdAt)} {plan.aiEnhanced ? "(AI-synthesized tasks)" : "(algorithmic)"}
            </span>
          )}
        </div>

        <div className="row between" style={{ gap: 16, alignItems: "flex-end" }}>
          <div className="row" style={{ gap: 14, flex: 1 }}>
            <div style={{ minWidth: 200, flex: 1 }}>
              <div className="row between" style={{ marginBottom: 4 }}>
                <label style={{ margin: 0 }}>Target exam date</label>
                {examDate && (
                  <button
                    type="button"
                    onClick={() => setExamDate("")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--brand-primary)",
                      fontSize: 12,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Clear date
                  </button>
                )}
              </div>
              <input
                type="date"
                min={todayStr}
                max={endOfMonthStr}
                value={examDate}
                onChange={(e) => handleExamDateChange(e.target.value)}
              />
            </div>

            <div style={{ minWidth: 140, flex: 1 }}>
              <label>{examDate ? "Days (calculated)" : "Days to plan"}</label>
              <input
                type="number"
                min={1}
                max={30}
                value={examDate ? daysUntil(examDate) : days}
                disabled={!!examDate}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </div>

            <div style={{ minWidth: 140, flex: 1 }}>
              <label>Daily study hours</label>
              <input
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              />
            </div>
          </div>

          <div style={{ flexShrink: 0 }}>
            <Button onClick={rebuild} loading={busy} size="lg">
              Rebuild Revision Plan ↺
            </Button>
          </div>
        </div>
      </div>

      {stale && (
        <div style={{ marginTop: 12 }}>
          <Alert kind="info">
            Your gap report has new quiz results since this plan was generated. Click <b>“Rebuild Revision Plan”</b> to synchronize.
          </Alert>
        </div>
      )}
      {warn && (
        <div style={{ marginTop: 12 }}><Alert kind="error">{warn}</Alert></div>
      )}

      {plan && (
        <>
          <div className="spacer" />

          {/* Completion Progress Meter */}
          <div className="card" style={{ padding: "18px 22px" }}>
            <div className="row between">
              <b>
                Progress: {Math.round((doneMin / 60) * 10) / 10}h completed of {Math.round((totalMin / 60) * 10) / 10}h scheduled ({plan.days} days @ {plan.hoursPerDay}h/day)
              </b>
              <span className="badge brand">
                {totalMin ? Math.round((doneMin / totalMin) * 100) : 0}% completed
              </span>
            </div>
            <div className="bar" style={{ marginTop: 10 }}>
              <span style={{ width: `${totalMin ? (doneMin / totalMin) * 100 : 0}%` }} />
            </div>
          </div>

          {/* Daily Schedule Timeline */}
          {plan.schedule.map((d) => {
            const mins = d.blocks.reduce((s, b) => s + b.minutes, 0);
            return (
              <section key={d.day} style={{ marginTop: 24 }}>
                <div className="row between" style={{ marginBottom: 10 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="badge brand" style={{ fontSize: 13, padding: "4px 10px" }}>Day {d.day}</span>
                    <h2 style={{ margin: 0, fontSize: 18 }}>
                      {d.date ? fmtDate(d.date) : `Day ${d.day} Milestone`}
                    </h2>
                  </div>
                  <span className="muted" style={{ fontSize: 13 }}>
                    Allocated: {Math.floor(mins / 60)}h {mins % 60}m of {Math.round(plan.hoursPerDay * 60)} min
                  </span>
                </div>

                <div className="stack" style={{ gap: 10 }}>
                  {d.blocks.length === 0 && (
                    <div className="card" style={{ padding: "16px 20px" }}>
                      <p className="muted" style={{ margin: 0 }}>Rest or buffer block. Review past notes.</p>
                    </div>
                  )}
                  {d.blocks.map((b) => {
                    const lvl = levelOf(b.topicId);
                    return (
                      <div
                        className="card"
                        key={b.id}
                        style={{
                          opacity: b.done ? 0.6 : 1,
                          borderLeft: `4px solid ${b.done ? "var(--strong)" : "var(--brand-primary)"}`,
                          transition: "all 0.2s ease",
                        }}
                      >
                        <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 14 }}>
                          <input
                            type="checkbox"
                            checked={!!b.done}
                            onChange={() => toggle(b.id)}
                            style={{ marginTop: 4, width: 20, height: 20, cursor: "pointer", accentColor: "var(--brand-primary)" }}
                            aria-label="Mark task done"
                          />
                          <div style={{ flex: 1 }}>
                            <div className="row between">
                              <div className="row" style={{ gap: 6 }}>
                                <b style={{ textDecoration: b.done ? "line-through" : "none", fontSize: 16 }}>
                                  {b.topicName}
                                </b>
                                <span className="badge brand">{KIND_LABEL[b.kind]}</span>
                                {b.priority && <PriorityBadge p={b.priority} />}
                                {lvl && b.kind !== "retest" && <LevelBadge level={lvl} />}
                              </div>
                              <span className="badge">{b.minutes} min</span>
                            </div>

                            <p style={{ margin: "8px 0", fontSize: 14.5 }}>{b.activity}</p>

                            {b.practice && (
                              <div style={{ background: "var(--panel-alt)", padding: "8px 12px", borderRadius: "8px", margin: "6px 0", fontSize: 13.5 }}>
                                <span className="muted">Practice challenge: </span>“{b.practice}”
                              </div>
                            )}

                            {b.successCriteria && (
                              <p style={{ fontSize: 13.5, margin: "6px 0", color: "var(--strong-ink)", fontWeight: 500 }}>
                                ✓ Mastery check: {b.successCriteria}
                              </p>
                            )}

                            {b.kind === "retest" && (
                              <div style={{ marginTop: 8 }}>
                                <Link className="btn sm" href="/quiz">Take Follow-up Quiz Now →</Link>
                              </div>
                            )}

                            {b.focus.length > 0 && (
                              <div style={{ marginTop: 6 }}>
                                {b.focus.map((f, fi) => (
                                  <span key={`${f}-${fi}`} className="chip">
                                    {f}
                                  </span>
                                ))}
                              </div>
                            )}

                            {b.sources.length > 0 && (
                              <div className="stack" style={{ gap: 4, marginTop: 8 }}>
                                {b.sources.map((s, si) => (
                                  <div key={`${s}-${si}`} className="cite">
                                    📖 Study chunk: {s}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
