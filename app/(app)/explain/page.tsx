"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Button, PageHead } from "@/components/ui";
import { citeLabel } from "@/lib/types";
import type { RetrievedChunk } from "@/lib/retrieval";
import { CONFIG } from "@/lib/config";

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: RetrievedChunk[];
}

const NOT_FOUND = "I couldn't find this in your uploaded material.";
const MIN_SCORE = CONFIG.retrieval.minExplainScore; // BM25 score below which we treat retrieval as "nothing relevant"

export default function ExplainPage() {
  const { data, retriever } = useApp();
  const weakTopics = (data.reports[data.reports.length - 1]?.topics ?? []).filter((t) => t.level === "weak" || t.level === "medium").slice(0, 4);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  // deep link from the gap report: /explain?topic=...&focus=...
  useEffect(() => {
    if (started.current) return;
    const p = new URLSearchParams(window.location.search);
    const direct = p.get("q");
    if (direct) {
      started.current = true;
      ask(direct);
      return;
    }
    const topic = p.get("topic");
    if (topic) {
      started.current = true;
      const focus = p.get("focus");
      ask(`Explain ${focus ? `${focus} in ${topic}` : topic} simply, step by step.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    const history = [...msgs, { role: "user" as const, content: q }];

    // RETRIEVAL (deterministic, in the browser): include the previous question for short follow-ups
    const prevUser = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
    const query = q.split(/\s+/).length < 6 ? `${q} ${prevUser}` : q;
    const hits = retriever.search(query, CONFIG.retrieval.contextChunks, ["notes"]).filter((h) => h.score >= MIN_SCORE);

    if (!hits.length) {
      setMsgs([...history, { role: "assistant", content: `${NOT_FOUND} Try different words, or upload the chapter that covers it.`, sources: [] }]);
      return;
    }

    setMsgs([...history, { role: "assistant", content: "", sources: hits }]);
    setBusy(true);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          context: hits.map((h, i) => ({ n: i + 1, label: citeLabel(h), text: h.text })),
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs((m) => [...m.slice(0, -1), { ...m[m.length - 1], content: acc }]);
      }
    } catch (e) {
      setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: `⚠️ ${(e as Error).message}`, sources: [] }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title="Learning Assistant & AI Copilot"
        desc={
          <>
            Ask for grounded concept breakdowns, step-by-step walkthroughs, or practice drills.
            All responses are <b>strictly retrieved from your uploaded textbook and notes</b> with verifiable section citations.
          </>
        }
      >
        {msgs.length > 0 && <Button variant="secondary" size="sm" onClick={() => setMsgs([])}>Clear Chat</Button>}
      </PageHead>

      {!data.chunks.length ? (
        <div className="card" style={{ padding: 36, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📖</div>
          <h3>Upload notes first</h3>
          <p className="muted">The AI assistant is strictly grounded and only answers questions based on your uploaded material.</p>
        </div>
      ) : (
        <>
          {msgs.length === 0 && (
            <div className="card">
              <div className="card-header" style={{ marginBottom: 8 }}>
                <h2>Suggested Concept Queries</h2>
                <span className="muted" style={{ fontSize: 13 }}>Click any topic to start a targeted explanation</span>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                {data.topics.slice(0, 10).map((t) => (
                  <button key={t.id} className="btn sm secondary" onClick={() => ask(`Explain ${t.name} simply, step by step.`)}>
                    💡 Explain: {t.name}
                  </button>
                ))}
              </div>

              {weakTopics.length > 0 && (
                <>
                  <div className="spacer" />
                  <div style={{ borderTop: "1px solid var(--line-light)", paddingTop: 14 }}>
                    <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                      <span className="badge weak">Targeted Gap Drills</span>
                      <span className="muted" style={{ fontSize: 13 }}>Focus on diagnosed weak spots</span>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      {weakTopics.map((t) => (
                        <button
                          key={t.topicId}
                          className="btn sm"
                          style={{ background: "var(--weak-soft)", color: "var(--weak-ink)", borderColor: "var(--weak-border)" }}
                          onClick={() => ask(`Give me 3 practice questions with answers on ${t.weakSubtopics[0] ?? t.name} (${t.name}).`)}
                        >
                          🎯 Drill: {t.weakSubtopics[0] ?? t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="spacer" />

          {/* Chat Stream View */}
          <div className="chat">
            {msgs.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4, opacity: 0.8 }}>
                  {m.role === "user" ? "You" : "🤖 GapFinder Grounded AI"}
                </div>
                {m.content || (busy && i === msgs.length - 1 ? "Synthesizing answer from your notes chunks…" : "")}
                {m.role === "assistant" && !!m.sources?.length && (
                  <div className="sources">
                    <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Citations from your material:</span>
                    {m.sources.map((s, k) => (
                      <details key={`${s.id}-${k}`} className="cite" style={{ cursor: "pointer" }}>
                        <summary>[{k + 1}] {citeLabel(s)}</summary>
                        <div style={{ color: "var(--ink)", marginTop: 6, whiteSpace: "pre-wrap", fontSize: 12.5 }}>{s.text}</div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottom} />
          </div>

          <div className="spacer" />

          {/* Grounded Question Docked Input Bar */}
          <form
            className="row"
            style={{
              flexWrap: "nowrap",
              position: "sticky",
              bottom: 16,
              background: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(12px)",
              padding: "10px 14px",
              borderRadius: "14px",
              border: "1px solid var(--line)",
              boxShadow: "var(--shadow-md)",
              gap: 10,
            }}
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about any concept, equation, or process in your study material…"
              style={{ border: "none", boxShadow: "none", padding: "8px 4px", fontSize: 15 }}
            />
            <Button type="submit" loading={busy} size="lg">
              Ask Assistant →
            </Button>
          </form>
        </>
      )}
    </>
  );
}
