"use client";
// Admin student monitoring portal: monitor diagnostic results, time spent, and student logins.
// Supports both Supabase cloud API and local store telemetry for reliable offline/demo operation.
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuthUser } from "@/lib/auth";
import { useApp } from "@/components/AppProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Alert, Button, LevelBadge, PageHead, pct } from "@/components/ui";
import { formatMinutes, levelOf } from "@/lib/admin-summary";
import * as store from "@/lib/store";

type Role = "student" | "teacher" | "admin";

interface Row {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  createdAt: string;
  lastSignIn: string | null;
  loginCount: number;
  subject: string;
  materials: number;
  topics: number;
  quizzes: number;
  mastery: number | null;
  avgScore: number | null;
  weakTopics: string[];
  timeSpentMinutes: number;
  studyMinutes: number;
  quizMinutes: number;
  lastActive: string | null;
}

interface Detail {
  profile: { id: string; email: string; fullName: string; role: Role; createdAt: string; updatedAt: string };
  auth: { lastSignIn: string | null; loginCount: number; confirmed: boolean };
  study: null | {
    subject: string;
    materials: { name: string; kind: string }[];
    topicCount: number;
    attempts: { at: number; questions: number; score: number }[];
    mastery: number | null;
    coverage: { assessed: number; total: number } | null;
    weakTopics: string[];
    summary: string;
    hasPlan: boolean;
    planDays: number;
    studyMinutes: number;
    totalScheduledMinutes: number;
    completedBlocksCount: number;
    quizMinutes: number;
    totalTimeMinutes: number;
    avgScore: number | null;
    plan?: any;
    savedAt: string;
  };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const sb = getSupabaseBrowserClient();
  const session = (await sb?.auth.getSession().catch(() => null))?.data?.session;
  const token = session?.access_token;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init?.headers as Record<string, string>) || {}),
  };
  const res = await fetch(url, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}

const fmt = (s?: string | number | null) => {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
};

const fmtDate = (s?: string | number | null) => {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
};

export default function AdminStudentsPage() {
  const { user } = useApp();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "error" | "ok" | "info"; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | Role>("student");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "student" as Role });
  const [edit, setEdit] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", email: "", password: "", role: "student" as Role });
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // First try server API if Supabase is active
      const r = await api<{ students: any[]; warning?: string }>("/api/admin/students");
      if (Array.isArray(r.students) && r.students.length > 0) {
        setRows(
          r.students.map((s) => ({
            id: s.id,
            email: s.email,
            fullName: s.fullName,
            role: s.role,
            createdAt: s.createdAt,
            lastSignIn: s.lastSignIn,
            loginCount: s.loginCount ?? 1,
            subject: s.subject || "",
            materials: s.materials ?? 0,
            topics: s.topics ?? 0,
            quizzes: s.quizzes ?? 0,
            mastery: s.mastery ?? null,
            avgScore: s.avgScore ?? null,
            weakTopics: s.weakTopics ?? [],
            timeSpentMinutes: s.timeSpentMinutes ?? (s.quizzes ? s.quizzes * 15 : 0),
            studyMinutes: s.studyMinutes ?? 0,
            quizMinutes: s.quizMinutes ?? (s.quizzes ? s.quizzes * 15 : 0),
            lastActive: s.lastActive ?? s.lastSignIn,
          }))
        );
        if (r.warning) setMsg({ kind: "info", text: r.warning });
        return;
      }
      throw new Error("No remote students");
    } catch {
      // Fallback: Load comprehensive telemetry directly from local store
      const localRecords = await store.getStudentMonitoringList();
      const mapped: Row[] = localRecords.map((rec) => ({
        id: rec.id,
        email: rec.email,
        fullName: rec.fullName,
        role: rec.role,
        createdAt: new Date(rec.createdAt).toISOString(),
        lastSignIn: rec.lastSignIn ? new Date(rec.lastSignIn).toISOString() : null,
        loginCount: rec.loginCount,
        subject: rec.subject,
        materials: rec.materials,
        topics: rec.topics,
        quizzes: rec.quizzes,
        mastery: rec.mastery,
        avgScore: rec.avgScore,
        weakTopics: rec.weakTopics,
        timeSpentMinutes: rec.timeSpentMinutes,
        studyMinutes: rec.studyMinutes,
        quizMinutes: rec.quizMinutes,
        lastActive: rec.lastActive ? new Date(rec.lastActive).toISOString() : null,
      }));
      setRows(mapped);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") {
      setAllowed(true);
      load();
    } else {
      getAuthUser().then((u) => {
        const ok = u?.role === "admin";
        setAllowed(ok);
        if (ok) load();
      });
    }
  }, [user, load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (role === "all" || r.role === role) && (!s || r.fullName.toLowerCase().includes(s) || r.email.toLowerCase().includes(s)));
  }, [rows, q, role]);

  const students = rows.filter((r) => r.role === "student");
  const activeQuizzes = students.filter((r) => r.quizzes > 0);
  const assessed = students.filter((r) => r.mastery != null);
  const avgMastery = assessed.length ? assessed.reduce((s, r) => s + (r.mastery ?? 0), 0) / assessed.length : null;
  const totalStudyMinutes = students.reduce((sum, r) => sum + r.timeSpentMinutes, 0);
  const totalLogins = students.reduce((sum, r) => sum + r.loginCount, 0);

  async function run(fn: () => Promise<unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "ok", text: okText });
      await load();
      return true;
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      try {
        await api("/api/admin/students", { method: "POST", body: JSON.stringify(form) });
      } catch {
        // Fallback to local store creation
        await store.adminCreateStudent(form);
      }
    }, `Created student account for ${form.email}`);
    setForm({ fullName: "", email: "", password: "", role: "student" });
    setAdding(false);
  }

  function openEdit(r: Row) {
    setEdit(r);
    setEditForm({ fullName: r.fullName, email: r.email, password: "", role: r.role });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const body: Record<string, string> = {};
    if (editForm.fullName !== edit.fullName) body.fullName = editForm.fullName;
    if (editForm.email !== edit.email) body.email = editForm.email;
    if (editForm.role !== edit.role) body.role = editForm.role;
    if (editForm.password) body.password = editForm.password;
    if (!Object.keys(body).length) return setEdit(null);

    await run(async () => {
      try {
        await api(`/api/admin/students/${edit.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } catch {
        await store.adminUpdateStudent(edit.id, body as any);
      }
    }, `Saved changes for ${edit.email}`);
    setEdit(null);
  }

  async function remove(r: Row) {
    if (!confirm(`Delete ${r.fullName} (${r.email})?\n\nThis permanently removes their account, quiz results, and study history.`)) return;
    await run(async () => {
      try {
        await api(`/api/admin/students/${r.id}`, { method: "DELETE" });
      } catch {
        await store.adminDeleteStudent(r.id);
      }
    }, `Deleted ${r.email}`);
  }

  async function view(r: Row) {
    setBusy(true);
    try {
      try {
        const d = await api<Detail>(`/api/admin/students/${r.id}`);
        setDetail(d);
      } catch {
        // Local store fallback
        const d = await store.getStudentMonitoringDetail(r.id);
        if (d) setDetail(d as Detail);
      }
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (allowed === null) return <div className="muted" style={{ padding: 48, textAlign: "center" }}>Checking administrative permissions…</div>;
  if (!allowed)
    return (
      <>
        <PageHead title="Student Monitoring Portal" />
        <Alert kind="error">
          Administrative access required. Please sign in with an admin credential (such as <b>admin@gapfinder.ai</b> / <b>admin1234</b>).
        </Alert>
      </>
    );

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(10,12,30,.65)",
    backdropFilter: "blur(4px)",
    display: "grid",
    placeItems: "center",
    zIndex: 90,
    padding: 16,
  };

  return (
    <>
      <PageHead
        title="Student Monitoring Portal"
        desc="Real-time administrative telemetry: track student diagnostic results, knowledge gaps, study hours spent, and login sessions."
      >
        <Button variant="secondary" onClick={load} loading={loading}>
          ↺ Refresh data
        </Button>
        <Button onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Add student account"}
        </Button>
      </PageHead>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {/* Admin KPI Header Cards */}
      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, textTransform: "uppercase" }}>Enrolled Students</div>
          <h2 style={{ margin: "6px 0 2px" }}>{students.length}</h2>
          <div className="muted" style={{ fontSize: 12 }}>{activeQuizzes.length} students took quizzes</div>
        </div>

        <div className="card">
          <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, textTransform: "uppercase" }}>Diagnostic Mastery</div>
          <h2 style={{ margin: "6px 0 2px" }}>{avgMastery == null ? "—" : pct(avgMastery)}</h2>
          <div className="muted" style={{ fontSize: 12 }}>Across {assessed.length} assessed students</div>
        </div>

        <div className="card">
          <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, textTransform: "uppercase" }}>Total Time Spent</div>
          <h2 style={{ margin: "6px 0 2px" }}>{formatMinutes(totalStudyMinutes)}</h2>
          <div className="muted" style={{ fontSize: 12 }}>Revision plans + quizzes completed</div>
        </div>

        <div className="card">
          <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, textTransform: "uppercase" }}>Total Student Logins</div>
          <h2 style={{ margin: "6px 0 2px" }}>{totalLogins}</h2>
          <div className="muted" style={{ fontSize: 12 }}>Active authentication sessions</div>
        </div>
      </div>

      {adding && (
        <form className="card stack" onSubmit={addUser} style={{ marginBottom: 20 }}>
          <h3>Add new student account</h3>
          <div className="grid grid-2">
            <div>
              <label>Full name</label>
              <input
                type="text"
                required
                placeholder="e.g. Maya Lin"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div>
              <label>Email address</label>
              <input
                type="email"
                required
                placeholder="student@gapfinder.ai"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label>Initial password (min 6 characters)</label>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div>
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
          </div>
          <div>
            <Button type="submit" loading={busy}>
              Create Student Account
            </Button>
          </div>
        </form>
      )}

      {/* Main Student Monitoring Table */}
      <div className="card">
        <div className="row between" style={{ marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div className="row" style={{ gap: 10, flex: 1, minWidth: 260 }}>
            <input
              type="text"
              placeholder="Filter by name or email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ maxWidth: 320 }}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "all" | Role)}
              style={{ maxWidth: 160 }}
            >
              <option value="student">Students only</option>
              <option value="teacher">Teachers</option>
              <option value="admin">Admins</option>
              <option value="all">All accounts</option>
            </select>
          </div>
          <span className="muted" style={{ fontSize: 13 }}>
            Showing <b>{shown.length}</b> account{shown.length === 1 ? "" : "s"}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Logins & Activity</th>
                <th>Diagnostic Results</th>
                <th>Time Spent</th>
                <th>Knowledge Gaps</th>
                <th>Course / Files</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const isOnline = r.lastSignIn && Date.now() - new Date(r.lastSignIn).getTime() < 3600 * 1000 * 4;
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--ink)" }}>{r.fullName}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{r.email}</div>
                      {r.role !== "student" && (
                        <span className="badge brand" style={{ marginTop: 4, display: "inline-block" }}>
                          {r.role}
                        </span>
                      )}
                    </td>

                    <td>
                      <div className="row" style={{ gap: 6, alignItems: "center" }}>
                        <span
                          className="dot"
                          style={{
                            background: isOnline ? "var(--good)" : "var(--muted)",
                            boxShadow: isOnline ? "0 0 8px rgba(16,185,129,.4)" : "none",
                          }}
                        />
                        <span style={{ fontSize: 12.5, fontWeight: 500 }}>
                          {fmt(r.lastSignIn)}
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                        <b>{r.loginCount}</b> session{r.loginCount === 1 ? "" : "s"} · Joined {fmtDate(r.createdAt)}
                      </div>
                    </td>

                    <td>
                      {r.mastery == null ? (
                        <span className="muted" style={{ fontSize: 12.5 }}>Untested</span>
                      ) : (
                        <div>
                          <div className="row" style={{ gap: 6, alignItems: "center" }}>
                            <LevelBadge level={levelOf(r.mastery)} />
                            <b style={{ fontSize: 13.5 }}>{pct(r.mastery)}</b>
                          </div>
                          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                            {r.quizzes} quiz{r.quizzes === 1 ? "" : "zes"}
                            {r.avgScore != null && ` · ${pct(r.avgScore)} avg`}
                          </div>
                        </div>
                      )}
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 13.5 }}>
                        ⏱️ {formatMinutes(r.timeSpentMinutes)}
                      </div>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                        {formatMinutes(r.studyMinutes)} study · {formatMinutes(r.quizMinutes)} quiz
                      </div>
                    </td>

                    <td>
                      {r.weakTopics.length ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {r.weakTopics.slice(0, 2).map((wt, i) => (
                            <span key={i} className="badge weak" style={{ fontSize: 11, padding: "1px 6px" }}>
                              {wt}
                            </span>
                          ))}
                          {r.weakTopics.length > 2 && (
                            <span className="badge" style={{ fontSize: 11, padding: "1px 6px" }}>
                              +{r.weakTopics.length - 2}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>None detected</span>
                      )}
                    </td>

                    <td>
                      <div style={{ fontSize: 12.5 }}>{r.subject || "No subject"}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {r.materials} document{r.materials === 1 ? "" : "s"} · {r.topics} topics
                      </div>
                    </td>

                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <Button size="sm" variant="secondary" onClick={() => view(r)}>
                        📊 View telemetry
                      </Button>{" "}
                      <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>
                        Edit
                      </Button>{" "}
                      <Button size="sm" variant="danger" onClick={() => remove(r)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}

              {!shown.length && !loading && (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 32 }}>
                    No students match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Student Modal */}
      {edit && (
        <div style={overlay} onClick={() => setEdit(null)}>
          <form className="card stack" style={{ width: "min(480px, 100%)" }} onClick={(e) => e.stopPropagation()} onSubmit={saveEdit}>
            <h3>Edit account: {edit.email}</h3>
            <div>
              <label>Full name</label>
              <input
                type="text"
                required
                value={editForm.fullName}
                onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
              />
            </div>
            <div>
              <label>Email address</label>
              <input
                type="email"
                required
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div>
              <label>Role</label>
              <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <div>
              <label>New password (leave blank to keep current password)</label>
              <input
                type="password"
                minLength={6}
                placeholder="••••••••"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              />
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <Button type="submit" loading={busy}>
                Save Changes
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEdit(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Student Detailed Telemetry Modal */}
      {detail && (
        <div style={overlay} onClick={() => setDetail(null)}>
          <div
            className="card stack"
            style={{
              width: "min(780px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "var(--shadow-lg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="row between" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 12 }}>
              <div>
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>{detail.profile.fullName}</h3>
                  <span className="badge brand">{detail.profile.role}</span>
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{detail.profile.email}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setDetail(null)}>
                ✕ Close
              </Button>
            </div>

            {/* Quick 3-Metric Bar */}
            <div className="grid grid-3" style={{ margin: "4px 0" }}>
              <div className="card" style={{ background: "var(--canvas-sunken)", padding: "12px 16px" }}>
                <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, textTransform: "uppercase" }}>Overall Mastery</div>
                <div className="row" style={{ gap: 6, alignItems: "center", marginTop: 4 }}>
                  <LevelBadge level={levelOf(detail.study?.mastery)} />
                  <b style={{ fontSize: 16 }}>{detail.study?.mastery == null ? "Untested" : pct(detail.study.mastery)}</b>
                </div>
              </div>

              <div className="card" style={{ background: "var(--canvas-sunken)", padding: "12px 16px" }}>
                <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, textTransform: "uppercase" }}>Total Time Spent</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>
                  ⏱️ {formatMinutes(detail.study?.totalTimeMinutes ?? 0)}
                </div>
              </div>

              <div className="card" style={{ background: "var(--canvas-sunken)", padding: "12px 16px" }}>
                <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, textTransform: "uppercase" }}>Login Sessions</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>
                  🔑 {detail.auth.loginCount} login{detail.auth.loginCount === 1 ? "" : "s"}
                </div>
              </div>
            </div>

            {/* Section 1: Authentication & Logins */}
            <div className="card" style={{ padding: "14px 18px" }}>
              <h4 style={{ margin: "0 0 10px" }}>🔐 Authentication & Logins</h4>
              <div className="grid grid-2" style={{ fontSize: 13 }}>
                <div><b>Last Login:</b> {fmt(detail.auth.lastSignIn)}</div>
                <div><b>Total Logins:</b> {detail.auth.loginCount} session{detail.auth.loginCount === 1 ? "" : "s"}</div>
                <div><b>Account Created:</b> {fmtDate(detail.profile.createdAt)}</div>
                <div><b>Status:</b> <span className="badge strong">Verified Active</span></div>
              </div>
            </div>

            {/* Section 2: Results & Knowledge Gaps */}
            <div className="card" style={{ padding: "14px 18px" }}>
              <h4 style={{ margin: "0 0 10px" }}>📊 Diagnostic Results & Knowledge Gaps</h4>
              {!detail.study ? (
                <div className="muted">No study data recorded yet for this student.</div>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  <div className="grid grid-2" style={{ fontSize: 13 }}>
                    <div><b>Subject:</b> {detail.study.subject || "Not assigned"}</div>
                    <div><b>Coverage:</b> {detail.study.coverage ? `${detail.study.coverage.assessed} of ${detail.study.coverage.total} topics assessed` : `${detail.study.topicCount} topics mapped`}</div>
                    <div><b>Diagnostic Quizzes:</b> {detail.study.attempts.length} completed</div>
                    <div><b>Average Score:</b> {detail.study.avgScore != null ? pct(detail.study.avgScore) : "—"}</div>
                  </div>

                  <div>
                    <b style={{ fontSize: 13 }}>Flagged Weak Topics (Knowledge Gaps):</b>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {detail.study.weakTopics.length ? (
                        detail.study.weakTopics.map((wt, i) => (
                          <span key={i} className="badge weak" style={{ fontSize: 12 }}>
                            🔴 {wt}
                          </span>
                        ))
                      ) : (
                        <span className="badge strong" style={{ fontSize: 12 }}>
                          🟢 No critical knowledge gaps detected
                        </span>
                      )}
                    </div>
                  </div>

                  {detail.study.summary && (
                    <div className="quote" style={{ margin: "4px 0", fontSize: 13 }}>
                      &ldquo;{detail.study.summary}&rdquo;
                    </div>
                  )}

                  {detail.study.attempts.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <b style={{ fontSize: 13 }}>Diagnostic Quiz History:</b>
                      <table style={{ marginTop: 6, fontSize: 12.5 }}>
                        <thead>
                          <tr>
                            <th>Date & Time</th>
                            <th>Questions</th>
                            <th>Score</th>
                            <th>Time Spent</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.study.attempts.map((a, i) => (
                            <tr key={i}>
                              <td>{fmt(a.at)}</td>
                              <td>{a.questions} items</td>
                              <td><b>{pct(a.score)}</b></td>
                              <td>~{Math.round(a.questions * 1.5)}m</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Section 3: Time Spending & Revision Plan Progress */}
            {detail.study && (
              <div className="card" style={{ padding: "14px 18px" }}>
                <h4 style={{ margin: "0 0 10px" }}>⏱️ Time Spending & Revision Progress</h4>
                <div className="grid grid-2" style={{ fontSize: 13, marginBottom: 12 }}>
                  <div><b>Total Platform Time:</b> {formatMinutes(detail.study.totalTimeMinutes)}</div>
                  <div><b>Revision Study Time:</b> {formatMinutes(detail.study.studyMinutes)}</div>
                  <div><b>Diagnostic Quiz Time:</b> {formatMinutes(detail.study.quizMinutes)}</div>
                  <div><b>Tasks Completed:</b> {detail.study.completedBlocksCount} revision tasks</div>
                </div>

                {detail.study.plan?.schedule && (
                  <div>
                    <b style={{ fontSize: 13 }}>Revision Schedule Tasks:</b>
                    <div className="stack" style={{ gap: 6, marginTop: 8, maxHeight: 180, overflowY: "auto" }}>
                      {detail.study.plan.schedule.flatMap((day: any, dIdx: number) =>
                        (day.blocks || []).map((b: any, bIdx: number) => (
                          <div
                            key={`${dIdx}-${bIdx}`}
                            className="row between"
                            style={{
                              padding: "6px 10px",
                              background: b.done ? "rgba(16,185,129,.08)" : "var(--canvas-sunken)",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--line)",
                              fontSize: 12.5,
                            }}
                          >
                            <div className="row" style={{ gap: 8, alignItems: "center" }}>
                              <span>{b.done ? "✅" : "⏳"}</span>
                              <span style={{ textDecoration: b.done ? "line-through" : "none", color: b.done ? "var(--muted)" : "var(--ink)" }}>
                                Day {dIdx + 1}: {b.task}
                              </span>
                            </div>
                            <span className="badge" style={{ fontSize: 11 }}>
                              {b.minutes} mins {b.done ? "completed" : "pending"}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
