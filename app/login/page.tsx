"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Alert, Button } from "@/components/ui";

export default function LoginPage() {
  const { ready, user, signIn, signUp } = useApp();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("demo@gapfinder.ai");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) {
      if (user.role === "admin") {
        router.replace("/admin/students");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [ready, user, router]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
        if (email.trim().toLowerCase() === "admin@gapfinder.ai") {
          router.replace("/admin/students");
        } else {
          router.replace("/dashboard");
        }
      } else {
        await signUp(name, email, password);
        router.replace("/dashboard");
      }
    } catch (err) {
      setError((err as Error).message || "Authentication failed. Please verify your credentials.");
    } finally {
      setBusy(false);
    }
  }

  async function enterDemo() {
    setError("");
    setBusy(true);
    try {
      await signIn("demo@gapfinder.ai", "demo1234");
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message || "Could not log into demo account.");
    } finally {
      setBusy(false);
    }
  }

  async function enterAdmin() {
    setError("");
    setBusy(true);
    try {
      await signIn("admin@gapfinder.ai", "admin1234");
      router.replace("/admin/students");
    } catch (err) {
      setError((err as Error).message || "Could not log into admin account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="logo" style={{ padding: 0 }}>
          <span className="logo-mark">◎</span>
          <span style={{ fontSize: 20, fontWeight: 800 }}>GapFinder AI</span>
        </div>
        <h1>Find what you don&apos;t know — before the exam does.</h1>
        <p style={{ fontSize: 16.5, maxWidth: 540, lineHeight: 1.6, color: "#cbd5e1" }}>
          You cannot ask about a gap you don&apos;t know you have. GapFinder evaluates your knowledge strictly from <b>your own syllabus, notes, and past papers</b>, detects misconceptions with citations, and adapts your revision schedule as you improve.
        </p>
        <div className="stack" style={{ gap: 10, marginTop: 8 }}>
          <div className="row" style={{ gap: 10, color: "#f8fafc" }}>
            <span style={{ color: "var(--brand-accent)" }}>✓</span> Ingest your syllabus, notes, and past exam papers
          </div>
          <div className="row" style={{ gap: 10, color: "#f8fafc" }}>
            <span style={{ color: "var(--brand-accent)" }}>✓</span> Take grounded diagnostic quizzes with verifiable citations
          </div>
          <div className="row" style={{ gap: 10, color: "#f8fafc" }}>
            <span style={{ color: "var(--brand-accent)" }}>✓</span> Get an objective 🔴 Weak / 🟡 Medium / 🟢 Strong gap diagnosis
          </div>
          <div className="row" style={{ gap: 10, color: "#f8fafc" }}>
            <span style={{ color: "var(--brand-accent)" }}>✓</span> Follow an automated, priority-first daily revision schedule
          </div>
        </div>
      </section>

      <section className="auth-form">
        <div className="card" style={{ boxShadow: "var(--shadow-lg)" }}>
          {/* Quick One-Click Access for Student and Admin */}
          <div className="stack" style={{ gap: 10, marginBottom: 16 }}>
            <Button
              type="button"
              onClick={enterDemo}
              loading={busy && email === "demo@gapfinder.ai"}
              size="lg"
              style={{ width: "100%", background: "var(--brand-gradient)" }}
            >
              ⚡ Student Workspace (demo@gapfinder.ai) →
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={enterAdmin}
              loading={busy && email === "admin@gapfinder.ai"}
              size="lg"
              style={{
                width: "100%",
                background: "linear-gradient(135deg, #0f172a, #1e1b4b)",
                color: "#e2e8f0",
                borderColor: "#4338ca",
              }}
            >
              🛡️ Admin Monitoring Portal (admin@gapfinder.ai) →
            </Button>

            <div className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 2 }}>
              One-click instant login for students or administrators
            </div>
          </div>

          <div className="row between" style={{ margin: "16px 0 12px", borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <span className="muted" style={{ fontSize: 12.5, fontWeight: 600, textTransform: "uppercase" }}>Or use credentials</span>
            <div className="row" style={{ gap: 6 }}>
              <button
                type="button"
                className="badge"
                style={{ cursor: "pointer", background: "var(--canvas-sunken)" }}
                onClick={() => {
                  setMode("login");
                  setEmail("demo@gapfinder.ai");
                  setPassword("demo1234");
                }}
              >
                👤 Student
              </button>
              <button
                type="button"
                className="badge brand"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  setMode("login");
                  setEmail("admin@gapfinder.ai");
                  setPassword("admin1234");
                }}
              >
                🛡️ Admin
              </button>
            </div>
          </div>

          <div className="tabs">
            <button
              className={mode === "login" ? "on" : ""}
              onClick={() => {
                setMode("login");
                setEmail("demo@gapfinder.ai");
                setPassword("demo1234");
                setError("");
              }}
            >
              Sign In
            </button>
            <button
              className={mode === "register" ? "on" : ""}
              onClick={() => {
                setMode("register");
                setEmail("");
                setPassword("");
                setError("");
              }}
            >
              Create Account
            </button>
          </div>

          <form className="stack" onSubmit={submit} style={{ gap: 14 }}>
            {mode === "register" && (
              <div>
                <label>Full name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  required
                />
              </div>
            )}
            <div>
              <label>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                required
              />
            </div>
            <div>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
              />
            </div>

            {error && <Alert kind="error">{error}</Alert>}

            <div style={{ marginTop: 6 }}>
              <Button type="submit" variant="secondary" loading={busy && !!email} size="lg" style={{ width: "100%" }}>
                {mode === "login" ? "Sign In to Workspace →" : "Create Account →"}
              </Button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
