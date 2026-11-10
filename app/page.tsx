"use client";
import Link from "next/link";
import { useApp } from "@/components/AppProvider";

const STEPS = [
  ["1. Ingest Materials", "Upload syllabus, textbook chapters, lecture notes, and past papers (PDF, TXT, MD)."],
  ["2. Map Knowledge", "A hierarchical topic tree is parsed from your syllabus; past exam questions are mapped to topics."],
  ["3. Grounded Diagnostic", "Adaptive diagnostic quiz generated strictly from your material — every question cites its source chunk."],
  ["4. Measure Gaps", "Each topic is mathematically measured: 🔴 Weak, 🟡 Medium, 🟢 Strong, or ⚪ Not assessed — backed by evidence."],
  ["5. Adaptive Plan", "A day-by-day revision schedule built around your available daily hours and target exam date."],
  ["6. Dynamic Re-testing", "Every subsequent diagnostic quiz recalculates mastery and automatically updates the revision plan."],
];

const FEATURES = [
  ["Diagnosis, Not Blind Chat", "The core product is an objective topic-level gap report backed by answer telemetry — chat is only an assistant."],
  ["Verifiable Source Citations", "Diagnostic questions, explanations, and revision tasks cite specific page chunks from your books."],
  ["Mathematical Mastery Scoring", "Transparent weighted model factoring question difficulty, recency, and response format with confidence indicators."],
  ["Exam-Aware Prioritization", "Past-paper frequency analysis ensures you focus on high-yield exam concepts and critical prerequisites first."],
  ["Personalized Daily Schedule", "Adapts to your daily study hours, target exam date, and incorporates spaced retention reviews."],
  ["Ten Specialized Agents", "Ingestion, mapping, hybrid retrieval, past-paper analysis, question synthesis, evaluation, diagnosis, planning, and telemetry."],
];

const SAMPLE = [
  { name: "Excretion", level: "weak", m: 0, why: "Selected “urea is reabsorbed” in consecutive diagnostics — persistent recurring misconception." },
  { name: "Nutrition & Photosynthesis", level: "medium", m: 51, why: "Light reaction understood (+40 pts); dark-reaction inputs remain confused." },
  { name: "Respiration", level: "medium", m: 71, why: "Lactic acid vs ethanol differentiation correct; short answers miss role of oxygen." },
  { name: "Transportation", level: "strong", m: 91, why: "Consistently accurate on heart chambers, double circulation, and pressure gradients." },
];

export default function Landing() {
  const { ready, user } = useApp();
  const cta = ready && user ? { href: "/dashboard", label: "Open Workspace →" } : { href: "/login", label: "Get Started Free →" };

  return (
    <div className="landing">
      <header className="land-nav">
        <div className="logo" style={{ padding: 0, color: "var(--ink)" }}>
          <span className="logo-mark">◎</span>
          <span style={{ fontWeight: 800, fontSize: 18 }}>GapFinder AI</span>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <a href="#how">How It Works</a>
          <a href="#features">Features</a>
          <a href="#sample">Sample Report</a>
          <Link className="btn sm" href={cta.href}>{ready && user ? "Dashboard" : "Log In"}</Link>
        </div>
      </header>

      <section className="hero">
        <span className="badge brand" style={{ marginBottom: 12, padding: "5px 14px", fontSize: 13 }}>
          ✨ Discover Real Knowledge Gaps Before Exam Day
        </span>
        <h1>Stop Studying Everything.<br />Start Fixing What You Don&apos;t Know.</h1>
        <p>
          Students often revise entire chapters uniformly and still miss their critical gaps — because you cannot ask about something you do not know you are missing.
          GapFinder AI evaluates you on <b>your own</b> syllabus, notes, and past papers, isolates your exact misconceptions, and generates an adaptive revision plan.
        </p>
        <div className="row" style={{ justifyContent: "center", gap: 12 }}>
          <Link className="btn lg" href={cta.href}>{cta.label}</Link>
          <a className="btn secondary lg" href="#sample">View Sample Diagnosis</a>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
          Deterministic Evaluation · Grounded Retrieval · No Hallucinated Knowledge
        </p>
      </section>

      <section id="how" className="land-section">
        <h2>How GapFinder AI Works</h2>
        <div className="grid grid-3">
          {STEPS.map(([t, d], i) => (
            <div className="card" key={t} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="qnum">{i + 1}</span>
              <h3 style={{ marginTop: 6, fontSize: 17 }}>{t}</h3>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="sample" className="land-section">
        <h2>Sample Diagnostic Gap Report</h2>
        <div className="card" style={{ padding: 28, boxShadow: "var(--shadow-md)" }}>
          <div className="row between" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 12 }}>
            <div>
              <b style={{ fontSize: 16 }}>Subject: Biology — Life Processes</b>
              <div className="muted" style={{ fontSize: 13 }}>Post 2 diagnostic rounds · 5/5 syllabus topics assessed</div>
            </div>
            <span className="badge brand" style={{ fontSize: 14, fontWeight: 700 }}>Overall Mastery: 61%</span>
          </div>

          <div className="stack" style={{ marginTop: 16, gap: 14 }}>
            {SAMPLE.map((s) => (
              <div key={s.name} className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start", gap: 14, borderBottom: "1px solid var(--line-light)", paddingBottom: 12 }}>
                <span className={`badge ${s.level}`} style={{ minWidth: 96, justifyContent: "center", padding: "4px 8px" }}>
                  {s.level === "weak" ? "🔴 Weak" : s.level === "medium" ? "🟡 Medium" : "🟢 Strong"}
                </span>
                <div style={{ flex: 1 }}>
                  <div className="row between">
                    <b>{s.name}</b>
                    <span style={{ fontWeight: 600 }}>{s.m}%</span>
                  </div>
                  <div className={`bar ${s.level}`} style={{ margin: "6px 0" }}>
                    <span style={{ width: `${s.m}%` }} />
                  </div>
                  <span className="muted" style={{ fontSize: 13.5 }}>{s.why}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="alert info" style={{ marginTop: 16 }}>
            <span><b>Automated Action Plan:</b> Day 1 prioritizes Excretion (nephron reabsorption) and dark reactions; spaced review scheduled on Day 3; reassessment on Day 5.</span>
          </div>
        </div>
      </section>

      <section id="features" className="land-section">
        <h2>Engineered for Verifiable Learning</h2>
        <div className="grid grid-3">
          {FEATURES.map(([t, d]) => (
            <div className="card" key={t}>
              <h3 style={{ fontSize: 17, marginBottom: 8 }}>{t}</h3>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="land-section" style={{ textAlign: "center", padding: "64px 20px" }}>
        <h2 style={{ fontSize: 32 }}>Ready to Find Your Real Knowledge Gaps?</h2>
        <p className="muted" style={{ maxWidth: 580, margin: "12px auto 24px", fontSize: 16 }}>
          Upload your notes and past papers, diagnose hidden blindspots, and follow a prioritized revision schedule.
        </p>
        <Link className="btn lg" href={cta.href}>{cta.label}</Link>
      </section>

      <footer className="muted" style={{ textAlign: "center", padding: "32px 0 48px", fontSize: 13, borderTop: "1px solid var(--line)" }}>
        GapFinder AI · Grounded Diagnostic Architecture · Built with Next.js & AI SDK
      </footer>
    </div>
  );
}
