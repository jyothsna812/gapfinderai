"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Bar, Button, ConfidenceBadge, Empty, LevelBadge, PageHead, pct } from "@/components/ui";
import type { Level, Topic, TopicStatus } from "@/lib/types";
import { citeLabel } from "@/lib/types";
import { addTopic, assignPastQuestion, deleteTopic, updateTopic } from "@/lib/workflows";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export default function TopicsPage() {
  const { data, update } = useApp();
  const report = data.reports[data.reports.length - 1];
  const [sel, setSel] = useState<string>(data.topics[0]?.id ?? "");
  const [editing, setEditing] = useState(false);
  const statusOf = (id: string) => report?.topics.find((t) => t.topicId === id);
  const levelOf = (id: string): Level => statusOf(id)?.level ?? "untested";
  const maxW = Math.max(1, ...data.topics.map((t) => t.examWeight));
  const review = data.pastQuestions.filter((q) => q.needsReview);
  const rare = data.topics.filter((t) => t.examWeight === 0 && data.pastQuestions.length > 0);

  useEffect(() => {
    if (!data.topics.find((t) => t.id === sel)) setSel(data.topics[0]?.id ?? "");
  }, [data.topics, sel]);

  if (!data.topics.length)
    return (
      <>
        <PageHead title="2 · Syllabus map" />
        <Empty title="No topic map generated">
          Upload a syllabus on the <Link href="/materials">Materials</Link> page and click “Build topic map”.
        </Empty>
      </>
    );

  const topic = data.topics.find((t) => t.id === sel) ?? data.topics[0];
  const st = statusOf(topic.id);

  return (
    <>
      <PageHead
        title="2 · Syllabus Topic Architecture"
        desc={
          <>
            Parsed directly from your curriculum syllabus by the Syllabus Mapping Agent. Sections and exam questions are linked
            deterministically via hybrid BM25 and vector retrieval.
          </>
        }
      >
        <Button
          variant="secondary"
          onClick={() => {
            const name = prompt("New topic name (as written in your syllabus):");
            if (name?.trim()) update((d) => addTopic(d, name.trim()));
          }}
        >
          + Add Custom Topic
        </Button>
        <Link className="btn" href="/quiz">Take Diagnostic Quiz →</Link>
      </PageHead>

      <div className="split">
        {/* Left: Syllabus Topic Navigation Tree */}
        <div className="card">
          <div className="card-header" style={{ marginBottom: 10 }}>
            <div>
              <h2 style={{ fontSize: 18 }}>{data.subject} Curriculum</h2>
              <span className="muted" style={{ fontSize: 12 }}>{data.topics.length} topics structured</span>
            </div>
            <div className="row" style={{ gap: 8, fontSize: 12 }}>
              <span className="row" style={{ gap: 4 }}><span className="dot strong" /> Strong</span>
              <span className="row" style={{ gap: 4 }}><span className="dot medium" /> Medium</span>
              <span className="row" style={{ gap: 4 }}><span className="dot weak" /> Weak</span>
              <span className="row" style={{ gap: 4 }}><span className="dot untested" /> Untested</span>
            </div>
          </div>

          <div className="tree">
            {data.topics.map((t) => (
              <div key={t.id}>
                <button
                  className={`tree-node ${t.id === topic.id ? "sel" : ""}`}
                  onClick={() => { setSel(t.id); setEditing(false); }}
                >
                  <span className={`dot ${levelOf(t.id)}`} />
                  <b style={{ flex: 1, fontSize: 14 }}>{t.name}</b>
                  {t.prerequisites.length > 0 && (
                    <span className="chip" title="Prerequisites defined">↳ {t.prerequisites.length}</span>
                  )}
                  <span className="muted" style={{ fontSize: 12 }}>{t.examWeight} Qs</span>
                </button>

                <div className="tree-sub">
                  {t.subtopics.map((s) => {
                    const weak = statusOf(t.id)?.weakSubtopics.includes(s);
                    return (
                      <span
                        key={s}
                        className="chip"
                        style={weak ? { background: "var(--weak-soft)", color: "var(--weak)", borderColor: "var(--weak-border)" } : undefined}
                      >
                        {s}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Selected Topic Details & Source Mapping */}
        <div className="card sticky">
          {!editing ? (
            <TopicDetail
              topic={topic}
              status={st}
              onEdit={() => setEditing(true)}
              onDelete={() => confirm(`Delete “${topic.name}”? Linked past questions become unmapped.`) && update((d) => deleteTopic(d, topic.id))}
            />
          ) : (
            <TopicEditor
              topic={topic}
              all={data.topics}
              onCancel={() => setEditing(false)}
              onSave={async (patch) => {
                await update((d) => updateTopic(d, topic.id, patch));
                setEditing(false);
              }}
            />
          )}

          <div className="spacer" />
          <div className="row between" style={{ fontSize: 13, marginBottom: 4 }}>
            <span className="muted">Exam frequency weight</span>
            <b>{topic.examWeight} past-paper question{topic.examWeight === 1 ? "" : "s"}</b>
          </div>
          <Bar value={topic.examWeight / maxW} />

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontSize: 13.5, color: "var(--brand-primary)", fontWeight: 600 }}>
              Grounded notes chunks ({topic.sourceChunkIds.length} sections)
            </summary>
            <div className="stack" style={{ gap: 6, marginTop: 8 }}>
              {topic.sourceChunkIds.map((id, idx) => {
                const c = data.chunks.find((x) => x.id === id);
                return c ? <div className="cite" key={`${id}-${idx}`}>📖 {citeLabel(c)}</div> : null;
              })}
            </div>
          </details>

          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", fontSize: 13.5, color: "var(--brand-primary)", fontWeight: 600 }}>
              Past exam questions on this topic ({data.pastQuestions.filter((q) => q.topicId === topic.id).length})
            </summary>
            <ul style={{ paddingLeft: 18, margin: "8px 0 0", fontSize: 13.5 }}>
              {data.pastQuestions.filter((q) => q.topicId === topic.id).map((q) => (
                <li key={q.id} style={{ marginBottom: 4 }}>
                  {q.text} <span className="muted" style={{ fontSize: 12 }}>({q.marks ?? "?"} mk · {q.difficulty})</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>

      <div className="spacer" />

      {/* Past Papers Question Classification Table */}
      <div className="card">
        <div className="card-header">
          <h2>Past Exam Paper Analysis & Mapping</h2>
          {rare.length > 0 && (
            <span className="badge" style={{ fontSize: 12 }}>
              Rarely examined: {rare.map((t) => t.name).join(", ")}
            </span>
          )}
        </div>
        <p className="muted" style={{ fontSize: 13.5, margin: "0 0 14px" }}>
          Every question is automatically mapped to syllabus topics. You can reassign any question to adjust topic exam weights.
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Exam Question</th>
                <th>Marks</th>
                <th>Format</th>
                <th>Difficulty</th>
                <th>Assigned Topic</th>
                <th>Alignment</th>
              </tr>
            </thead>
            <tbody>
              {data.pastQuestions.map((q) => (
                <tr key={q.id} style={q.needsReview ? { background: "var(--medium-soft)" } : undefined}>
                  <td style={{ maxWidth: 440 }}>
                    {q.text}
                    {q.needsReview && (
                      <div style={{ color: "var(--medium-ink)", fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                        ⚠️ Low retrieval confidence — please verify topic assignment
                      </div>
                    )}
                  </td>
                  <td><b>{q.marks ?? "—"}</b></td>
                  <td><span className="chip">{q.qtype}</span></td>
                  <td>
                    <span className={`badge ${q.difficulty === "hard" ? "weak" : q.difficulty === "medium" ? "medium" : "strong"}`}>
                      {q.difficulty}
                    </span>
                  </td>
                  <td>
                    <select
                      value={q.topicId ?? ""}
                      onChange={(e) => update((d) => assignPastQuestion(d, q.id, e.target.value || null))}
                      style={{ minWidth: 170, padding: "5px 8px", fontSize: 13 }}
                    >
                      <option value="">(Unmapped)</option>
                      {data.topics.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className="badge brand" style={{ fontSize: 12 }}>
                      {pct(q.confidence)} confidence
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function TopicDetail({ topic, status: st, onEdit, onDelete }: { topic: Topic; status?: TopicStatus; onEdit: () => void; onDelete: () => void }) {
  const { data } = useApp();
  const prereqNames = topic.prerequisites.map((id) => data.topics.find((t) => t.id === id)?.name).filter(Boolean);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row between">
        <h2 style={{ margin: 0, fontSize: 19 }}>{topic.name}</h2>
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" variant="secondary" onClick={onEdit}>Edit Topic</Button>
          <Button size="sm" variant="danger" onClick={onDelete}>Delete</Button>
        </div>
      </div>

      <div className="row" style={{ gap: 6 }}>
        <LevelBadge level={st?.level ?? "untested"} />
        {st && st.level !== "untested" && <ConfidenceBadge c={st.confidence} />}
        {topic.edited && <span className="chip">User modified</span>}
      </div>

      {topic.description && <p style={{ margin: 0, fontSize: 14 }}>{topic.description}</p>}

      {st && st.level !== "untested" && (
        <div style={{ background: "var(--panel-alt)", padding: "10px 14px", borderRadius: "10px" }}>
          <div className="row between" style={{ fontSize: 13, marginBottom: 4 }}>
            <span className="muted">Mastery · {st.correctAnswers}/{st.questionsAttempted} questions correct</span>
            <b>{pct(st.mastery)}</b>
          </div>
          <Bar value={st.mastery} level={st.level} />
        </div>
      )}

      {topic.learningObjectives.length > 0 && (
        <div>
          <label>Learning Objectives</label>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
            {topic.learningObjectives.map((o) => <li key={o}>{o}</li>)}
          </ul>
        </div>
      )}

      {prereqNames.length > 0 && (
        <div style={{ fontSize: 13.5 }}>
          <span className="muted">Prerequisites: </span>
          {prereqNames.map((n) => <span key={n} className="chip">{n}</span>)}
        </div>
      )}

      {!!st?.misconceptions.length && (
        <div>
          <label>Identified Misconceptions</label>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "var(--weak)" }}>
            {st.misconceptions.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}

      {st && (
        <div className="alert info" style={{ fontSize: 13.5, marginTop: 4 }}>
          <span><b>Recommended: </b>{st.recommendedAction}</span>
          <Link href={`/explain?topic=${encodeURIComponent(topic.name)}`} style={{ fontWeight: 600 }}>
            Explain topic →
          </Link>
        </div>
      )}
    </div>
  );
}

function TopicEditor({ topic, all, onSave, onCancel }: { topic: Topic; all: Topic[]; onSave: (p: Partial<Topic>) => void; onCancel: () => void }) {
  const [name, setName] = useState(topic.name);
  const [description, setDescription] = useState(topic.description);
  const [subtopics, setSubtopics] = useState(topic.subtopics.join("\n"));
  const [objectives, setObjectives] = useState(topic.learningObjectives.join("\n"));
  const [keywords, setKeywords] = useState(topic.keywords.join(", "));
  const [prereqs, setPrereqs] = useState<string[]>(topic.prerequisites);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Edit Syllabus Topic</h2>
      <div><label>Topic title</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><label>Description</label><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div><label>Subtopics (one per line)</label><textarea value={subtopics} onChange={(e) => setSubtopics(e.target.value)} /></div>
      <div><label>Learning objectives (one per line)</label><textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} /></div>
      <div><label>Keywords (comma-separated for retrieval)</label><input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} /></div>
      <div>
        <label>Prerequisites</label>
        <div className="row" style={{ gap: 6 }}>
          {all.filter((t) => t.id !== topic.id).map((t) => (
            <label key={t.id} className="chip" style={{ cursor: "pointer", fontWeight: 400, color: "var(--ink)", margin: 0 }}>
              <input
                type="checkbox"
                checked={prereqs.includes(t.id)}
                onChange={(e) => setPrereqs((p) => (e.target.checked ? [...p, t.id] : p.filter((x) => x !== t.id)))}
              />{" "}
              {t.name}
            </label>
          ))}
        </div>
      </div>
      <div className="action-toolbar" style={{ marginTop: 8 }}>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button
          onClick={() =>
            onSave({
              name: name.trim() || topic.name,
              description,
              subtopics: lines(subtopics),
              learningObjectives: lines(objectives),
              keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
              prerequisites: prereqs,
            })
          }
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
}
