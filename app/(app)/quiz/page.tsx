"use client";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Alert, Button, Empty, PageHead, pct, when } from "@/components/ui";
import type { Attempt, Confidence, QuizQuestion } from "@/lib/types";
import { QUESTION_TYPE_LABEL, citeLabel } from "@/lib/types";
import { attemptScore } from "@/lib/analysis";
import { completeLoop, displayAnswer, evaluateAttempt, generateQuiz, type QuizBuild } from "@/lib/workflows";

type Phase = "setup" | "taking" | "done";

export default function QuizPage() {
  const { data, update } = useApp();
  const [phase, setPhase] = useState<Phase>("setup");
  const [count, setCount] = useState(8);
  const [quiz, setQuiz] = useState<QuizBuild | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState<Record<string, Confidence>>({});
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<Attempt | null>(null);
  const [review, setReview] = useState<string>("");

  if (!data.topics.length)
    return (
      <>
        <PageHead title="3 · Diagnostic quiz" />
        <Empty title="Build your topic map first">
          Go to <Link href="/materials">Materials</Link>, upload your syllabus and notes, then build the topic map.
        </Empty>
      </>
    );

  async function start() {
    setError("");
    setBusy("Retrieving sections from your notes and generating grounded questions…");
    try {
      const q = await generateQuiz(data, count);
      setQuiz(q);
      setAnswers({});
      setConfidence({});
      setIdx(0);
      setPhase("taking");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function submit() {
    if (!quiz) return;
    const missing = quiz.questions.filter((q) => !answers[q.id]?.trim()).length;
    if (missing && !confirm(`${missing} question(s) unanswered — they will count as wrong. Submit anyway?`)) return;
    setError("");
    setBusy("Answer Evaluation Agent is checking your answers against the sources…");
    try {
      const log = quiz.log;
      const { attempt, warning } = await evaluateAttempt(data, quiz.questions, answers, confidence, log);
      setBusy("Updating your diagnosis and revision plan…");
      const out = await completeLoop(data, attempt, log);
      await update(() => out.data);
      setWarnings([warning, ...out.warnings].filter(Boolean) as string[]);
      setResult(attempt);
      setPhase("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const pastAttempt = data.attempts.find((a) => a.id === review);
  const answered = quiz ? quiz.questions.filter((q) => answers[q.id]?.trim()).length : 0;

  return (
    <>
      <PageHead
        title="3 · Diagnostic Quiz"
        desc={
          <>
            Questions are generated <b>strictly from your uploaded material</b>. Each question cites its source chunk and
            validates misconceptions. Answers are scored against the ground truth.
          </>
        }
      />
      {busy && <Alert kind="info">{busy}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      {(busy || error) && <div className="spacer" />}

      {phase === "setup" && (
        <div className="grid grid-2">
          <div className="card stack">
            <div className="card-header">
              <h2>Configure Diagnostic Session</h2>
            </div>
            <div>
              <label>Number of questions</label>
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[5, 8, 10, 12].map((n) => (
                  <option key={n} value={n}>{n} questions (~{Math.round(n * 1.5)} min)</option>
                ))}
              </select>
            </div>
            <p className="muted" style={{ fontSize: 13.5 }}>
              {data.attempts.length
                ? "Adaptive Mode: More questions on weak & unassessed topics, targeting the subtopics and misconceptions from previous attempts."
                : "Initial Diagnostic: Balanced coverage across syllabus topics to discover baseline strengths and gaps."}
            </p>
            <div className="card-footer">
              <span className="muted" style={{ fontSize: 12.5 }}>6 question formats supported</span>
              <Button onClick={start} loading={!!busy} size="lg">
                Generate Diagnostic Quiz →
              </Button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Diagnostic History</h2>
              <span className="muted" style={{ fontSize: 13 }}>{data.attempts.length} attempts recorded</span>
            </div>
            {!data.attempts.length ? (
              <p className="muted" style={{ padding: "20px 0", textAlign: "center" }}>No previous diagnostic attempts found.</p>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {[...data.attempts].sort((a, b) => b.createdAt - a.createdAt).map((a, i, arr) => (
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
                      <div style={{ fontWeight: 600 }}>Attempt #{arr.length - i} · {pct(attemptScore(a))}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{when(a.createdAt)} · {a.questions.length} questions</div>
                    </div>
                    <Button size="sm" variant={review === a.id ? "secondary" : "ghost"} onClick={() => setReview(review === a.id ? "" : a.id)}>
                      {review === a.id ? "Close" : "Review Details"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {phase === "setup" && pastAttempt && (
        <>
          <div className="spacer" />
          <AttemptReview attempt={pastAttempt} />
        </>
      )}

      {phase === "taking" && quiz && (() => {
        const q = quiz.questions[idx];
        const isLast = idx === quiz.questions.length - 1;
        return (
          <>
            <Alert kind="ok">
              Retrieved {quiz.retrieved} section(s) from your notes → {quiz.questions.length} questions passed verification.
              {quiz.rejected.length ? ` (${quiz.rejected.length} invalid questions filtered out)` : ""}
            </Alert>
            <div className="spacer" />

            {/* Quiz Progress & Question Switcher Bar */}
            <div className="card" style={{ padding: "16px 20px" }}>
              <div className="row between" style={{ fontSize: 13.5, marginBottom: 8 }}>
                <b>Question {idx + 1} of {quiz.questions.length}</b>
                <span className="badge brand">{answered} / {quiz.questions.length} answered</span>
              </div>
              <div className="progress">
                <span style={{ width: `${((idx + 1) / quiz.questions.length) * 100}%` }} />
              </div>
              <div className="row" style={{ gap: 6, marginTop: 12 }}>
                {quiz.questions.map((x, i) => {
                  const isCurrent = i === idx;
                  const isDone = Boolean(answers[x.id]?.trim());
                  return (
                    <button
                      key={x.id}
                      onClick={() => setIdx(i)}
                      className="chip"
                      style={{
                        minWidth: 32,
                        justifyContent: "center",
                        border: isCurrent ? "2px solid var(--brand-primary)" : "1px solid var(--line)",
                        cursor: "pointer",
                        fontWeight: isCurrent ? 700 : 500,
                        background: isDone ? "var(--brand-soft)" : "transparent",
                        color: isDone ? "var(--brand-primary)" : "var(--ink)",
                      }}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="spacer" />

            {/* The Active Question Card */}
            <QuestionCard
              n={idx + 1}
              q={q}
              value={answers[q.id] ?? ""}
              onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
              conf={confidence[q.id]}
              onConf={(c) => setConfidence((x) => ({ ...x, [q.id]: c }))}
            />

            {/* Structured Quiz Navigation Bar (Clear Button Placement) */}
            <div className="quiz-nav-bar">
              <div className="quiz-nav-left">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => confirm("Discard current quiz progress?") && setPhase("setup")}
                  disabled={!!busy}
                >
                  ✕ Discard Quiz
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                  disabled={idx === 0 || !!busy}
                >
                  ← Previous
                </Button>
              </div>

              <div className="quiz-nav-right">
                {!isLast && (
                  <Button
                    variant="secondary"
                    onClick={submit}
                    loading={!!busy}
                    title="Submit completed answers now"
                  >
                    Finish Early
                  </Button>
                )}
                {!isLast ? (
                  <Button onClick={() => setIdx((i) => i + 1)} size="lg">
                    Next Question →
                  </Button>
                ) : (
                  <Button onClick={submit} loading={!!busy} size="lg">
                    ✓ Submit All Answers
                  </Button>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {phase === "done" && result && (
        <>
          <div
            className="card"
            style={{
              background: "linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)",
              border: "1px solid #c7d2fe",
              padding: "24px 28px",
            }}
          >
            <div className="row between" style={{ gap: 16 }}>
              <div>
                <span className="badge brand" style={{ marginBottom: 6 }}>Diagnostic Completed</span>
                <h2 style={{ fontSize: 26, margin: "4px 0" }}>
                  Your Diagnostic Score: <b style={{ color: "var(--brand-primary)" }}>{pct(attemptScore(result))}</b>
                </h2>
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                  Your topic mastery levels, misconception telemetry, and day-by-day revision plan have been updated.
                </p>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <Link className="btn lg" href="/report">
                  Explore Gap Report →
                </Link>
                <Link className="btn secondary" href="/plan">
                  View Revision Plan
                </Link>
                <Button variant="secondary" onClick={() => { setPhase("setup"); setResult(null); }}>
                  Retake Diagnostic
                </Button>
              </div>
            </div>
          </div>

          {warnings.map((w) => (
            <div key={w} style={{ marginTop: 12 }}><Alert>{w}</Alert></div>
          ))}
          <div className="spacer" />
          <AttemptReview attempt={result} />
        </>
      )}
    </>
  );
}

function QuestionCard({
  n, q, value, onChange, conf, onConf,
}: { n: number; q: QuizQuestion; value: string; onChange: (v: string) => void; conf?: Confidence; onConf: (c: Confidence) => void }) {
  const picked = new Set(value.split(",").filter(Boolean));
  return (
    <div className="card">
      <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 14 }}>
        <span className="qnum">{n}</span>
        <div style={{ flex: 1 }}>
          <div className="row" style={{ gap: 6, marginBottom: 10 }}>
            <span className="badge brand">{q.topicName}</span>
            <span className="chip">{QUESTION_TYPE_LABEL[q.type]}</span>
            <span className={`badge ${q.difficulty === "hard" ? "weak" : q.difficulty === "medium" ? "medium" : "strong"}`}>{q.difficulty}</span>
            <span className="chip">{q.marks} mark{q.marks > 1 ? "s" : ""}</span>
          </div>

          <p style={{ fontWeight: 600, fontSize: 17, margin: "0 0 16px", color: "var(--ink)" }}>{q.question}</p>

          {(q.type === "mcq" || q.type === "true_false") &&
            q.options!.map((o, i) => {
              const isSelected = value === String(i);
              return (
                <label key={i} className={`option ${isSelected ? "selected" : ""}`}>
                  <input type="radio" name={q.id} checked={isSelected} onChange={() => onChange(String(i))} />
                  <span>
                    <b style={{ color: isSelected ? "var(--brand-primary)" : "var(--ink)", marginRight: 6 }}>
                      {String.fromCharCode(65 + i)}.
                    </b>
                    {o}
                  </span>
                </label>
              );
            })}

          {q.type === "multi_select" && (
            <>
              <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Select all that apply.</p>
              {q.options!.map((o, i) => {
                const isSelected = picked.has(String(i));
                return (
                  <label key={i} className={`option ${isSelected ? "selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        const next = new Set(picked);
                        e.target.checked ? next.add(String(i)) : next.delete(String(i));
                        onChange([...next].sort().join(","));
                      }}
                    />
                    <span>
                      <b style={{ color: isSelected ? "var(--brand-primary)" : "var(--ink)", marginRight: 6 }}>
                        {String.fromCharCode(65 + i)}.
                      </b>
                      {o}
                    </span>
                  </label>
                );
              })}
            </>
          )}

          {q.type === "fill_blank" && (
            <div style={{ marginTop: 10, maxWidth: 420 }}>
              <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type the missing concept / term..." />
            </div>
          )}

          {q.type === "numerical" && (
            <div className="row" style={{ flexWrap: "nowrap", gap: 8, marginTop: 10 }}>
              <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Enter calculated value..." style={{ maxWidth: 240 }} />
              {q.unit && <span className="muted" style={{ fontWeight: 600 }}>{q.unit}</span>}
            </div>
          )}

          {q.type === "short" && (
            <div style={{ marginTop: 10 }}>
              <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder="Write your concise explanation in 1-3 sentences..." />
            </div>
          )}

          <div className="card-footer" style={{ marginTop: 18 }}>
            <div className="row" style={{ gap: 8, fontSize: 13 }}>
              <span className="muted">Confidence self-rating:</span>
              <div className="conf">
                {(["low", "medium", "high"] as Confidence[]).map((c) => (
                  <button key={c} type="button" className={conf === c ? "on" : ""} onClick={() => onConf(c)}>
                    {c[0].toUpperCase() + c.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="cite" style={{ padding: "6px 12px", fontSize: 12 }}>
              📖 Source verified: {citeLabel(q.citation)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttemptReview({ attempt }: { attempt: Attempt }) {
  const ev = new Map(attempt.evaluations.map((e) => [e.questionId, e]));
  return (
    <div className="stack" style={{ gap: 14 }}>
      <h2>Answers & Grounded Feedback</h2>
      {attempt.questions.map((q, i) => {
        const e = ev.get(q.id);
        const ans = attempt.answers[q.id] ?? "";
        const ok = e?.correct;
        const picked = new Set(ans.split(",").filter(Boolean));
        const key = new Set((q.answerIndices ?? (q.answerIndex != null ? [q.answerIndex] : [])).map(String));
        const conf = attempt.confidence?.[q.id];
        return (
          <div
            className="card"
            key={q.id}
            style={{
              borderLeft: `5px solid ${ok ? "var(--strong)" : e && e.score > 0 ? "var(--medium)" : "var(--weak)"}`,
            }}
          >
            <div className="row between">
              <div className="row" style={{ gap: 6 }}>
                <span className="qnum">{i + 1}</span>
                <span className="badge brand">{q.topicName}</span>
                <span className="chip">{q.subtopic}</span>
                <span className="chip">{QUESTION_TYPE_LABEL[q.type]} · {q.difficulty ?? "medium"} · {q.marks ?? 1} mk</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {conf && <span className="chip" title="Your confidence">Felt: {conf}</span>}
                <span className={`badge ${ok ? "strong" : e && e.score > 0 ? "medium" : "weak"}`}>
                  {ok ? "✓ Correct" : e && e.score > 0 ? `Partly right (${pct(e.score)})` : "✗ Needs Work"}
                </span>
              </div>
            </div>

            <p style={{ fontWeight: 600, fontSize: 15.5, marginTop: 12 }}>{q.question}</p>

            {q.options ? (
              <div style={{ marginTop: 8 }}>
                {q.options.map((o, k) => {
                  const isKey = key.has(String(k));
                  const isPicked = picked.has(String(k));
                  return (
                    <div
                      key={k}
                      className={`option ${isKey ? "correct" : isPicked ? "wrong" : ""}`}
                      style={{ cursor: "default", margin: "4px 0" }}
                    >
                      <span>
                        <b>{String.fromCharCode(65 + k)}.</b> {o}
                        {isKey && " — (Correct Answer)"}
                        {isPicked && !isKey && " — (Your Answer)"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="stack" style={{ gap: 6, fontSize: 14, margin: "8px 0" }}>
                <div><span className="muted">Your submitted answer:</span> <b>{displayAnswer(q, ans) || "(empty)"}</b></div>
                <div><span className="muted">Model reference answer:</span> <b style={{ color: "var(--strong)" }}>{q.modelAnswer}</b></div>
                {q.rubric?.length ? <div><span className="muted">Rubric items:</span> {q.rubric.join(" · ")}</div> : null}
              </div>
            )}

            {e && (
              <div style={{ background: "var(--panel-alt)", padding: "10px 14px", borderRadius: "10px", marginTop: 10 }}>
                <b>Diagnostic insight: </b>
                <span>{e.feedback}</span>
                {e.misconception && (
                  <div style={{ color: "var(--weak)", marginTop: 4, fontWeight: 600 }}>
                    Identified misconception: {e.misconception}
                  </div>
                )}
              </div>
            )}

            <div className="row between" style={{ marginTop: 12, alignItems: "center" }}>
              <div className="cite" style={{ flex: 1 }}>
                📖 {citeLabel(q.citation)} — <q>{q.citation.quote}</q>
              </div>
              {!ok && (
                <Link
                  className="btn sm secondary"
                  href={`/explain?q=${encodeURIComponent(`I answered "${displayAnswer(q, ans)}" to: "${q.question}". The correct answer is "${q.modelAnswer}". Explain my mistake and the right idea.`)}`}
                  style={{ marginLeft: 10 }}
                >
                  Ask Assistant →
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
