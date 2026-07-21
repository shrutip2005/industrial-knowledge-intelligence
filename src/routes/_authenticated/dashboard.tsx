import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { authJson, authUpload } from "@/lib/api-client";
import logoAsset from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Workspace — Industrial Knowledge Intelligence" },
      { name: "description", content: "Your private industrial knowledge workspace — upload documents, ask the copilot, run RCA and compliance checks." },
      { property: "og:title", content: "Workspace — Industrial Knowledge Intelligence" },
      { property: "og:description", content: "Private workspace for RAG copilot, RCA and compliance intelligence." },
    ],
  }),
  component: Dashboard,
});

/* ---------------- Types ---------------- */
interface Doc { id: string; name: string; doc_type: string; pages: number; status: string; ocr_text: string; }
interface Entity { id: string; entity_type: string; label: string; }
interface KgNode { id: string; label: string; node_type: string; detail: string; x: number; y: number; r: number; color: string; }
interface KgEdge { id: string; source_id: string; target_id: string; }
interface CompItem { id: string; title: string; description: string; regulation: string; status: "ok" | "missing" | "critical"; }
interface WorkOrder { id: string; equipment: string; description: string; reported_by: string; root_cause: string; status: string; occurred_at: string; }
interface Citation { doc: string; page: number; snippet: string; }
interface ChatMsg { role: "user" | "assistant"; content: string; citations?: Citation[]; confidence?: number; }

const IconUpload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 16V4M12 4L7 9M12 4l5 5" />
    <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);
const IconDoc = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8fbde8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);

function highlightMarks(text: string, terms: string[]) {
  if (!text) return "";
  let out = escapeHtml(text);
  for (const t of terms) {
    if (!t) continue;
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    out = out.replace(re, "<mark>$1</mark>");
  }
  return out;
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
}

function Dashboard() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string>("");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [activeDoc, setActiveDoc] = useState(0);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [nodes, setNodes] = useState<KgNode[]>([]);
  const [edges, setEdges] = useState<KgEdge[]>([]);
  const [comp, setComp] = useState<CompItem[]>([]);
  const [wos, setWos] = useState<WorkOrder[]>([]);
  const [topFailure, setTopFailure] = useState<{ name: string; count: number }>({ name: "…", count: 0 });
  const [ocrOpen, setOcrOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [q, setQ] = useState("");
  const [thinking, setThinking] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const [rcaOut, setRcaOut] = useState("");
  const [rcaBusy, setRcaBusy] = useState(false);

  const [hover, setHover] = useState<{ n: KgNode; x: number; y: number } | null>(null);
  const kgRef = useRef<SVGSVGElement>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3200); };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? ""));
  }, []);

  const loadAll = async () => {
    const [d, e, kg, c, m] = await Promise.all([
      authJson<{ documents: Doc[] }>("/api/documents"),
      authJson<{ entities: Entity[] }>("/api/entities"),
      authJson<{ nodes: KgNode[]; edges: KgEdge[] }>("/api/knowledge-graph"),
      authJson<{ items: CompItem[] }>("/api/compliance"),
      authJson<{ work_orders: WorkOrder[]; top_failure: { name: string; count: number } }>("/api/maintenance"),
    ]);
    setDocs(d.documents);
    setEntities(e.entities);
    setNodes(kg.nodes);
    setEdges(kg.edges);
    setComp(c.items);
    setWos(m.work_orders);
    setTopFailure(m.top_failure);
  };

  useEffect(() => { loadAll().catch((err) => showToast("Load failed: " + String(err))); }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const active = docs[activeDoc];
  const entityCounts = useMemo(() => {
    const c: Record<string, number> = {};
    entities.forEach((e) => (c[e.entity_type] = (c[e.entity_type] ?? 0) + 1));
    return c;
  }, [entities]);
  const highlightTerms = useMemo(() => entities.map((e) => e.label), [entities]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        showToast(`Ingesting ${f.name} — parsing, chunking & embedding…`);
        const form = new FormData();
        form.append("file", f);
        try {
          await authUpload<{ ok: boolean; chunks: number }>("/api/documents", form);
        } catch (err) {
          showToast(`${f.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      await loadAll();
      showToast("Processing complete — documents indexed and ready to query.");
    } finally {
      setUploading(false);
    }
  };

  const ask = async (question: string) => {
    if (!question.trim() || thinking) return;
    setMessages((m) => [...m, { role: "user", content: question }]);
    setQ("");
    setThinking(true);
    setTimeout(() => chatRef.current?.scrollTo({ top: 1e9 }), 30);
    try {
      const r = await authJson<{ answer: string; citations: Citation[]; confidence: number }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ question }),
      });
      setMessages((m) => [...m, { role: "assistant", content: r.answer, citations: r.citations, confidence: r.confidence }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: "Copilot error: " + (err instanceof Error ? err.message : String(err)) }]);
    } finally {
      setThinking(false);
      setTimeout(() => chatRef.current?.scrollTo({ top: 1e9 }), 30);
    }
  };

  const runRca = async () => {
    const equipment = wos[0]?.equipment ?? "Pump P-101";
    setRcaBusy(true);
    setRcaOut(`Running RCA on ${equipment} — gathering work orders, embedding query, retrieving context…`);
    try {
      const r = await authJson<{ analysis: string }>("/api/rca", {
        method: "POST",
        body: JSON.stringify({ equipment }),
      });
      setRcaOut(r.analysis);
    } catch (err) {
      setRcaOut("RCA failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRcaBusy(false);
    }
  };

  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const pulseNode = nodes.find((n) => n.id === "p101");
  const failureSpark = [30, 50, 35, 70, 45, 90];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={logoAsset.url} alt="Industrial Knowledge Intelligence logo" width={40} height={40} style={{ display: "block", borderRadius: 8 }} />
          <div>
            <div className="brand-t1">Industrial Knowledge<br />Intelligence Platform</div>
            <div className="brand-t2">Plant Ops · AI Copilot</div>
          </div>
        </div>

        <div className="side-section" style={{ paddingBottom: 8 }}>
          <button className="upload-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M12 4L7 9M12 4l5 5" />
              <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            </svg>
            {uploading ? "Ingesting…" : "Upload Documents"}
          </button>
          <input
            ref={fileRef} type="file" multiple
            accept=".pdf,.txt,.md,.csv,.log,application/pdf,text/plain,text/markdown,text/csv"
            style={{ display: "none" }}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div style={{ fontSize: 11, color: "#5f7396", marginTop: 8, lineHeight: 1.5 }}>
            PDF, TXT, MD, CSV, LOG. Server-side parse, chunk & vector embedding. Max 12 MB.
          </div>
        </div>

        <div className="side-section" style={{ paddingTop: 4 }}>
          <div className="side-label">Uploaded Documents <span>{docs.length}</span></div>
          <div className="doc-list">
            {docs.length === 0 && (
              <div style={{ fontSize: 12, color: "#5f7396", padding: "12px 4px" }}>
                No documents yet — upload a PDF or text file to begin.
              </div>
            )}
            {docs.map((d, i) => (
              <div key={d.id} className={`doc-item ${i === activeDoc ? "active" : ""}`} onClick={() => setActiveDoc(i)}>
                <div className="doc-icon"><IconDoc /></div>
                <div className="doc-meta">
                  <div className="doc-name">{d.name}</div>
                  <div className="doc-sub">{d.pages} pages</div>
                </div>
                <span className={`pill ${d.status === "done" ? "pill-done" : "pill-proc"}`}>
                  {d.status === "done" ? "INDEXED" : d.status === "error" ? "ERROR" : "PROCESSING"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="side-section" style={{ borderTop: "1px solid rgba(255,255,255,.08)", marginTop: "auto" }}>
          <div className="side-label">Extracted Entities <span>{entities.length}</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {Object.entries(entityCounts).map(([type, n]) => (
              <span key={type} className="mini-chip"><b>{n}</b> {type}</span>
            ))}
          </div>
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontSize: 11, color: "#8fbde8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {userEmail || "Signed in"}
            </div>
            <button
              onClick={signOut}
              style={{ background: "transparent", border: "1px solid rgba(255,255,255,.15)", color: "#e6edf7", padding: "6px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", fontWeight: 600 }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1>Industrial Knowledge Intelligence Platform</h1>
            <div className="sub">Unified AI brain for engineers, technicians & plant managers</div>
          </div>
          <div className="badge-live">
            <span className="dot" />
            {docs.length} docs indexed
          </div>
        </div>

        <div className="content">
          <div className="grid-2">
            <div className="panel panel-pad">
              <div className="section-title">
                <h2>Document Upload & Ingestion</h2>
                <span className="desc">Drag & drop to ingest</span>
              </div>
              <div
                className={`upload-area ${dragOver ? "dragover" : ""}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              >
                <IconUpload />
                <div style={{ fontWeight: 600, fontSize: 14 }}>Drop files here, or click to browse</div>
                <div style={{ fontSize: 12, color: "var(--ink-600)", marginTop: 4 }}>
                  Engineering manuals · work orders · inspection reports · safety procedures
                </div>
                <div className="filetypes">
                  <span className="ftag">.PDF</span>
                  <span className="ftag">.TXT</span>
                  <span className="ftag">.MD</span>
                  <span className="ftag">.CSV</span>
                  <span className="ftag">.LOG</span>
                </div>
              </div>
            </div>

            <div className="panel panel-pad">
              <div className="section-title">
                <h2>OCR & Text Extraction</h2>
                <span className="desc">{active?.name ?? "No document selected"}</span>
              </div>
              <div className="ocr-toggle" onClick={() => setOcrOpen((v) => !v)}>
                <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3b7ec4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16v16H4z" /><path d="M8 9h8M8 13h6" />
                  </svg>
                  View extracted text
                </div>
                <svg className={`chevron ${ocrOpen ? "open" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4a5872" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </div>
              <div className={`ocr-body ${ocrOpen ? "open" : ""}`}>
                <div className="ocr-text" dangerouslySetInnerHTML={{ __html: highlightMarks(active?.ocr_text ?? "Upload a document to see extracted text.", highlightTerms) }} />
              </div>
            </div>
          </div>

          <div className="panel panel-pad">
            <div className="section-title">
              <h2>AI Entity Extraction</h2>
              <span className="desc">Auto-tagged across {docs.length} document{docs.length === 1 ? "" : "s"}</span>
            </div>
            <div className="chip-grid">
              {entities.length === 0 && <div style={{ fontSize: 13, color: "var(--ink-400)" }}>No entities yet — upload a document to populate.</div>}
              {entities.map((e) => (
                <span key={e.id} className={`chip chip-${e.entity_type}`}>
                  <span className="dot2" />
                  <span className="val">{e.label}</span>
                </span>
              ))}
            </div>
            <div className="legend">
              {[["Equipment", "var(--steel-500)"],["Failure Type", "var(--red)"],["Date", "var(--yellow)"],["Personnel", "#8a5cd9"],["Finding", "var(--green)"],["Regulatory Ref.", "#3aa7a0"]].map(([lbl, col]) => (
                <div key={lbl} className="legend-item"><span className="dot2" style={{ background: col }} />{lbl}</div>
              ))}
            </div>
          </div>

          <div className="panel panel-pad">
            <div className="section-title">
              <h2>Knowledge Graph Visualization</h2>
              <span className="desc">Hover nodes for detail</span>
            </div>
            <div className="kg-wrap">
              <div className="kg-legend">
                <div className="li"><span className="sw" style={{ background: "var(--steel-500)" }} />Equipment</div>
                <div className="li"><span className="sw" style={{ background: "#6b7fa3" }} />Document</div>
                <div className="li"><span className="sw" style={{ background: "var(--red)" }} />Failure</div>
                <div className="li"><span className="sw" style={{ background: "var(--green)" }} />Procedure</div>
              </div>
              <svg ref={kgRef} viewBox="0 0 900 380" style={{ width: "100%", height: "auto", display: "block" }}>
                {edges.map((e) => {
                  const a = nodeById[e.source_id]; const b = nodeById[e.target_id];
                  if (!a || !b) return null;
                  return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#d3dbe6" strokeWidth={1.6} />;
                })}
                {pulseNode && (
                  <circle cx={pulseNode.x} cy={pulseNode.y} r={pulseNode.r} fill="none" stroke={pulseNode.color} strokeWidth={2} opacity={0.5}>
                    <animate attributeName="r" values={`${pulseNode.r};${pulseNode.r + 12};${pulseNode.r}`} dur="2.6s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0;0.5" dur="2.6s" repeatCount="indefinite" />
                  </circle>
                )}
                {nodes.map((n) => (
                  <g key={n.id} className="kg-node"
                    onMouseMove={(ev) => {
                      const rect = kgRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      setHover({ n, x: ev.clientX - rect.left + 14, y: ev.clientY - rect.top - 10 });
                    }}
                    onMouseLeave={() => setHover(null)}
                  >
                    <circle cx={n.x} cy={n.y} r={n.r} fill={n.color} stroke="#fff" strokeWidth={2.5} />
                    <text x={n.x} y={n.y + n.r + 15} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#152238">{n.label}</text>
                  </g>
                ))}
                {nodes.length === 0 && (
                  <text x="450" y="190" textAnchor="middle" fontSize={13} fill="#8ea0bc">
                    Knowledge graph populates as you upload documents.
                  </text>
                )}
              </svg>
              {hover && (
                <div className="kg-tooltip" style={{ left: hover.x, top: hover.y, opacity: 1 }}>
                  <b>{hover.n.label}</b><br />{hover.n.detail}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="section-title">
              <h2>Maintenance Intelligence & RCA</h2>
              <span className="desc">Derived from work order & failure history</span>
            </div>
            <div className="grid-3">
              <div className="panel mcard">
                <div className="mtitle">⚠ Most Common Failure</div>
                <div className="mvalue" style={{ textTransform: "capitalize" }}>{topFailure.name}</div>
                <div className="spark">
                  {failureSpark.map((h, i) => (<div key={i} style={{ height: `${h}%` }} className={h > 60 ? "hi" : ""} />))}
                </div>
                <div className="mnote">{topFailure.count} occurrences across work order history</div>
              </div>
              <div className="panel mcard">
                <div className="mtitle">🔁 Work Orders Logged</div>
                <div className="mvalue">
                  {wos.length}
                  <span style={{ fontSize: 14, color: "var(--ink-400)", fontWeight: 600 }}> total</span>
                </div>
                <div className="mnote">
                  {wos.filter((w) => w.status === "closed").length} closed ·{" "}
                  {wos.filter((w) => w.status !== "closed").length} open
                </div>
                <div className="mfoot">Track sign-off & recurring root causes</div>
              </div>
              <div className="panel mcard">
                <div className="mtitle">🤖 RCA Agent</div>
                <button className="upload-btn" style={{ marginTop: 8 }} onClick={runRca} disabled={rcaBusy || wos.length === 0}>
                  {rcaBusy ? "Analyzing…" : `Run RCA on ${wos[0]?.equipment ?? "top asset"}`}
                </button>
                <div className="mnote">Fuses work orders, manual, inspection findings via AI.</div>
              </div>
            </div>
            {rcaOut && (
              <div className="panel panel-pad" style={{ marginTop: 16 }}>
                <div className="section-title">
                  <h2>RCA Agent Output</h2>
                  <span className="desc">Grounded in {wos.length} work orders + document context</span>
                </div>
                <div className="rca-out">{rcaOut}</div>
              </div>
            )}
          </div>

          <div className="panel panel-pad">
            <div className="section-title">
              <h2>Compliance & Quality Check</h2>
              <span className="desc">Required documentation status</span>
            </div>
            {comp.length === 0 && <div style={{ fontSize: 13, color: "var(--ink-400)" }}>No compliance items yet.</div>}
            {comp.map((c) => (
              <div key={c.id} className="comp-row">
                <div className={`comp-dot ${c.status}`} />
                <div style={{ flex: 1 }}>
                  <div className="comp-title">{c.title}</div>
                  <div className="comp-desc">
                    {c.description} {c.regulation && <span style={{ color: "var(--steel-500)", fontWeight: 600 }}>· {c.regulation}</span>}
                  </div>
                </div>
                <div className={`comp-tag ${c.status}`}>
                  {c.status === "ok" ? "COMPLETE" : c.status === "missing" ? "MISSING DOC" : "CRITICAL GAP"}
                </div>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel-pad" style={{ paddingBottom: 0 }}>
              <div className="section-title">
                <h2>RAG-Powered AI Copilot</h2>
                <span className="desc">Grounded in your uploaded documents · AI + pgvector</span>
              </div>
            </div>
            <div className="chat-shell">
              <div className="chat-log" ref={chatRef}>
                {messages.length === 0 && (
                  <div className="msg ai">
                    <div className="msg-label">AI Copilot</div>
                    <div className="bubble">
                      Hi — I'm your industrial knowledge copilot. Upload a document, then ask me anything about equipment, failures, procedures or personnel across your indexed docs. I'll cite my sources.
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`msg ${m.role === "user" ? "user" : "ai"}`}>
                    <div className="msg-label">{m.role === "user" ? "You" : "AI Copilot"}</div>
                    <div className="bubble">{m.content}</div>
                    {m.citations && m.citations.length > 0 && (
                      <div className="cite-box">
                        <div className="cite-title">Sources</div>
                        {m.citations.map((c, j) => (
                          <div key={j} className="cite-item">📄 {c.doc} <span className="p">p.{c.page}</span></div>
                        ))}
                        {typeof m.confidence === "number" && (
                          <div className="confidence">
                            <span>Confidence</span>
                            <div className="conf-bar"><div className="conf-fill" style={{ width: `${Math.round(m.confidence * 100)}%` }} /></div>
                            <span>{Math.round(m.confidence * 100)}%</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {thinking && (
                  <div className="msg ai">
                    <div className="msg-label">AI Copilot</div>
                    <div className="bubble"><div className="typing"><span /><span /><span /></div></div>
                  </div>
                )}
              </div>
              <div className="suggested">
                {[
                  "What are the common failures in my documents and what preventive maintenance should be scheduled?",
                  "Summarize the most recent inspection findings.",
                  "Who performed the last inspection and when?",
                ].map((s) => (
                  <div key={s} className="sugg-chip" onClick={() => ask(s)}>{s}</div>
                ))}
              </div>
              <div className="chat-input-row">
                <input
                  className="chat-input"
                  placeholder="Ask about equipment, failures, procedures…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ask(q)}
                />
                <button className="send-btn" onClick={() => ask(q)} disabled={thinking || !q.trim()}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div style={{ textAlign: "center", fontSize: 11, color: "var(--ink-400)", padding: "6px 0 4px" }}>
            Cloud database + pgvector · AI Gateway · Row-Level Security enabled · Signed in as {userEmail || "you"}
          </div>
        </div>
      </main>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
