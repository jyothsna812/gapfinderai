"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Alert, Button, PageHead, when } from "@/components/ui";
import type { DocStatus, MaterialKind } from "@/lib/types";
import { addMaterial, uploadMaterialFile, buildTopicMap, parseFile, removeMaterial, removeAllMaterials } from "@/lib/workflows";

const KINDS: { value: MaterialKind; label: string; hint: string }[] = [
  { value: "syllabus", label: "Syllabus", hint: "List of units/topics. Authoritative guide for building the topic tree." },
  { value: "notes", label: "Textbook / Notes", hint: "Chapters, lecture slides, study guides. Quiz questions and explanations are retrieved from here." },
  { value: "past_paper", label: "Past Exam Paper", hint: "Previous exams. Used to calculate exam weight and prioritize high-frequency topics." },
];
const LIFECYCLE: DocStatus[] = ["uploaded", "processing", "analyzed", "indexed", "ready"];
const label = (k?: MaterialKind) => KINDS.find((x) => x.value === k)?.label ?? "—";

function Lifecycle({ status }: { status: DocStatus }) {
  const i = LIFECYCLE.indexOf(status);
  return (
    <div className="lifecycle">
      {LIFECYCLE.map((s, k) => (
        <span key={s} className={k < i || status === "ready" ? "done" : k === i ? "now" : ""}>
          {s[0].toUpperCase() + s.slice(1)}
        </span>
      ))}
    </div>
  );
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function MaterialsPage() {
  const { data, update, user } = useApp();
  const router = useRouter();
  const [kind, setKind] = useState<MaterialKind>("notes");
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [live, setLive] = useState<{ name: string; status: DocStatus; error?: string }[]>([]);
  const [msgs, setMsgs] = useState<{ kind: "error" | "ok" | "info"; text: string }[]>([]);

  async function ingestOneFile(file: File) {
    const setStatus = (status: DocStatus, error?: string) =>
      setLive((l) => l.map((x) => (x.name === file.name ? { ...x, status, error } : x)));
    setLive((l) => [...l.filter((x) => x.name !== file.name), { name: file.name, status: "uploaded" }]);
    try {
      setStatus("processing");
      const current = await update((d) => d); // latest saved data
      setStatus("analyzed");
      await pause(100);
      setStatus("indexing");
      const userId = user?.id || user?.email || "demo_student";
      const result = await uploadMaterialFile(current, file, kind, userId);
      if (result.duplicateOf) {
        setStatus("error", `Duplicate of “${result.duplicateOf}” — skipped.`);
        return;
      }
      await update(() => result.data);
      await pause(150);
      setStatus("ready");
      setMsgs((m) => [
        ...m,
        { kind: "ok", text: `“${file.name}”: chunked, embedded with Gemini, and indexed into Qdrant Cloud.` },
        ...result.warnings.map((w) => ({ kind: "info" as const, text: `“${file.name}”: ${w}` })),
      ]);
    } catch (e) {
      setStatus("error", (e as Error).message);
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setMsgs([]);
    setBusy("Embedding & indexing vectors in Qdrant Cloud…");
    for (const f of Array.from(files)) await ingestOneFile(f);
    setBusy("");
  }

  async function onPaste() {
    if (pasteText.trim().length < 20) return setMsgs([{ kind: "error", text: "Paste at least a few lines of text." }]);
    const name = pasteName || `${label(kind)} (pasted)`;
    const file = new File([pasteText], `${name}.txt`, { type: "text/plain" });
    setMsgs([]);
    await ingestOneFile(file);
    setPasteText("");
    setPasteName("");
  }

  async function onBuildMap() {
    if (data.attempts.length && !confirm("Rebuild the topic map? Topics with the same name keep their progress history.")) return;
    setBusy("Syllabus Mapping Agent is building your topic map…");
    setMsgs([]);
    try {
      const next = await buildTopicMap(data);
      await update(() => next);
      router.push("/topics");
    } catch (e) {
      setMsgs([{ kind: "error", text: (e as Error).message }]);
    } finally {
      setBusy("");
    }
  }

  async function onDeleteAll() {
    if (!data.materials.length) return;
    if (
      !confirm(
        `Are you sure you want to delete all ${data.materials.length} uploaded document(s)?\n\nThis will remove all indexed files, vector chunks, and reset mapped topics.`
      )
    ) {
      return;
    }
    setBusy("Removing all study materials and indexed vectors…");
    try {
      const userId = user?.id || user?.email || "demo_student";
      for (const m of data.materials) {
        fetch(`/api/ingest?id=${encodeURIComponent(m.id)}&userId=${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => {});
      }
      await update((d) => removeAllMaterials(d));
      setMsgs([{ kind: "ok", text: "Successfully deleted all uploaded materials and indexed search chunks." }]);
    } catch (e) {
      setMsgs([{ kind: "error", text: (e as Error).message || "Failed to remove materials" }]);
    } finally {
      setBusy("");
    }
  }

  const has = (k: MaterialKind) => data.materials.some((m) => m.kind === k);

  return (
    <>
      <PageHead
        title="1 · Study Material & Ingestion"
        desc="Upload your curriculum syllabus, textbook chapters or notes, and past exam papers. The Ingestion pipeline parses sections, detects headings, builds hybrid vectors, and establishes verifiable source citations."
      />

      {/* Primary Workflow Action Banner */}
      <div
        className="card"
        style={{
          background: "linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%)",
          border: "1px solid #bbf7d0",
          boxShadow: "var(--shadow)",
        }}
      >
        <div className="row between" style={{ gap: 16 }}>
          <div>
            <span className="badge strong" style={{ marginBottom: 6 }}>Topic Structure Ready</span>
            <h2 style={{ fontSize: 19, margin: "2px 0 6px" }}>
              {data.topics.length ? `${data.topics.length} topics currently mapped` : "Ready to generate your Syllabus Topic Map"}
            </h2>
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              The Syllabus Mapping Agent parses your uploaded syllabus and links past-paper questions to discover focus areas.
            </p>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <Button
              onClick={onBuildMap}
              loading={busy.startsWith("Syllabus")}
              disabled={!data.materials.length || !!busy}
              size="lg"
            >
              {data.topics.length ? "Rebuild Topic Map" : "Build Topic Map →"}
            </Button>
          </div>
        </div>
      </div>

      <div className="spacer" />

      {busy && <Alert kind="info">{busy}</Alert>}
      {msgs.map((m, i) => (
        <div key={i} style={{ marginTop: 6 }}><Alert kind={m.kind}>{m.text}</Alert></div>
      ))}
      {(busy || msgs.length > 0) && <div className="spacer" />}

      <div className="grid grid-2">
        {/* Ingestion Input Card */}
        <div className="card stack">
          <div className="card-header">
            <h2>Ingest New Document</h2>
          </div>

          <div>
            <label>Target document classification</label>
            <div className="row" style={{ gap: 8 }}>
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  className={`btn sm ${kind === k.value ? "" : "secondary"}`}
                  onClick={() => setKind(k.value)}
                  type="button"
                >
                  {k.label} {has(k.value) && "✓"}
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              {KINDS.find((k) => k.value === kind)!.hint}
            </p>
          </div>

          <div style={{ background: "var(--panel-alt)", padding: "16px", borderRadius: "12px", border: "1px dashed var(--line)" }}>
            <label style={{ marginBottom: 6 }}>Select files (PDF, TXT, or MD — max 4 MB each)</label>
            <input
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain"
              multiple
              disabled={!!busy}
              onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
            />
          </div>

          <div className="muted" style={{ textAlign: "center", fontSize: 12.5, margin: "4px 0" }}>
            — or paste direct study notes text —
          </div>

          <input
            type="text"
            placeholder="Document label (e.g. Chapter 4 Human Excretion)"
            value={pasteName}
            onChange={(e) => setPasteName(e.target.value)}
          />
          <textarea
            placeholder="Paste study text here. Markdown headers (e.g. # Chapter 1 or 2.1 Nephron function) are automatically identified as citation checkpoints."
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />

          <div className="action-toolbar">
            <Button
              variant="secondary"
              onClick={onPaste}
              disabled={!pasteText.trim() || !!busy}
            >
              + Ingest Pasted Text
            </Button>
          </div>

          {live.length > 0 && (
            <div className="stack" style={{ gap: 8, marginTop: 10 }}>
              <label style={{ margin: 0 }}>Active ingestion queue</label>
              {live.map((l) => (
                <div key={l.name} className="row between" style={{ fontSize: 13.5, background: "var(--panel-alt)", padding: "6px 12px", borderRadius: "8px" }}>
                  <span><b>{l.name}</b></span>
                  {l.status === "error" ? <span className="badge weak">{l.error}</span> : <Lifecycle status={l.status} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Readiness Checklist Card */}
        <div className="card">
          <div className="card-header">
            <h2>Preparation Checklist</h2>
            <span className="badge brand">Diagnostic Readiness</span>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <div className="row between" style={{ padding: "8px 12px", background: has("syllabus") ? "var(--strong-soft)" : "var(--panel-alt)", borderRadius: "10px", border: "1px solid var(--line)" }}>
              <span><b>1. Syllabus Uploaded</b> (Defines topic hierarchy)</span>
              <span>{has("syllabus") ? "✅ Completed" : "⚪ Pending"}</span>
            </div>
            <div className="row between" style={{ padding: "8px 12px", background: has("notes") ? "var(--strong-soft)" : "var(--panel-alt)", borderRadius: "10px", border: "1px solid var(--line)" }}>
              <span><b>2. Notes / Textbook</b> (Source for questions & explanations)</span>
              <span>{has("notes") ? "✅ Completed" : "⚪ Pending"}</span>
            </div>
            <div className="row between" style={{ padding: "8px 12px", background: has("past_paper") ? "var(--strong-soft)" : "var(--panel-alt)", borderRadius: "10px", border: "1px solid var(--line)" }}>
              <span><b>3. Past Papers</b> (Weights frequency of topics)</span>
              <span>{has("past_paper") ? "✅ Completed" : "⚪ Pending"}</span>
            </div>
            <div className="row between" style={{ padding: "8px 12px", background: data.topics.length ? "var(--strong-soft)" : "var(--panel-alt)", borderRadius: "10px", border: "1px solid var(--line)" }}>
              <span><b>4. Topic Tree Built</b> (Ready for diagnostic testing)</span>
              <span>{data.topics.length ? "✅ Completed" : "⚪ Pending"}</span>
            </div>
          </div>

          <div className="spacer" />
          <p className="muted" style={{ fontSize: 13 }}>
            <b>Document Processing Lifecycle:</b> Uploaded → Processing (text extraction) → Analyzed (headings & duplicates) → Indexed (hybrid vector indexing) → Ready.
          </p>
        </div>
      </div>

      <div className="spacer" />

      {/* Uploaded Documents Table */}
      <div className="card">
        <div className="card-header row between" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>Indexed Study Documents ({data.materials.length})</h2>
            <span className="muted" style={{ fontSize: 13 }}>{data.chunks.length} total search chunks indexed</span>
          </div>
          {data.materials.length > 0 && (
            <Button
              size="sm"
              variant="danger"
              disabled={!!busy}
              onClick={onDeleteAll}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              🗑️ Delete All Materials
            </Button>
          )}
        </div>
        {!data.materials.length ? (
          <p className="muted" style={{ padding: "24px 0", textAlign: "center" }}>No documents indexed yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document Name</th>
                  <th>Classification</th>
                  <th>Status</th>
                  <th>Pages / Words</th>
                  <th>Indexed Chunks</th>
                  <th>Created</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.materials.map((m) => {
                  const chunks = data.chunks.filter((c) => c.materialId === m.id);
                  return (
                    <tr key={m.id}>
                      <td>
                        <b>{m.name}</b>
                        {m.warnings?.map((w) => <div key={w} style={{ fontSize: 12, color: "var(--medium)" }}>⚠ {w}</div>)}
                      </td>
                      <td>
                        <span className="badge">{label(m.kind)}</span>
                        {m.detectedKind && m.detectedKind !== m.kind && (
                          <div className="muted" style={{ fontSize: 11 }}>Detected: {label(m.detectedKind)}</div>
                        )}
                      </td>
                      <td>
                        {(m.status ?? "ready") === "ready" ? (
                          <span className="badge strong">✓ Ready</span>
                        ) : (
                          <Lifecycle status={m.status} />
                        )}
                      </td>
                      <td>{m.pages.length} p. · {(m.wordCount ?? 0).toLocaleString()} words</td>
                      <td>
                        <b>{chunks.length} chunks</b>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {(m.headings ?? []).slice(0, 3).join(" · ")}{(m.headings?.length ?? 0) > 3 ? " …" : ""}
                        </div>
                      </td>
                      <td className="muted">{when(m.createdAt)}</td>
                      <td style={{ textAlign: "right" }}>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            if (confirm(`Remove “${m.name}” and its indexed vectors?`)) {
                              const userId = user?.id || user?.email || "demo_student";
                              fetch(`/api/ingest?id=${encodeURIComponent(m.id)}&userId=${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => {});
                              await update((d) => removeMaterial(d, m.id));
                            }
                          }}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
