# PS_08 - Industrial Knowledge Intelligence Platform

**AI for Industrial Knowledge Intelligence: Unified Asset & Operations Brain**

A working prototype for the "Industrial Intelligence / Document Management / Knowledge Engineering / Quality" challenge. It ingests heterogeneous plant documents — PDFs, manuals, work orders, inspection reports, safety procedures — and turns them into a queryable, actionable, continuously-updated knowledge layer that engineers, technicians and plant managers can use at the point of need.

---

## 1. Problem context (recap)

Professionals in asset-intensive industries spend ~35% of their working hours searching for information, clarifying instructions, or recreating documents that already exist somewhere in the organisation (McKinsey, 2024). In India, the average large plant operates across **7–12 disconnected document systems** — P&IDs in one place, work orders in another, SOPs in a third, inspection records in a fourth, regulatory submissions scattered across email (NASSCOM-EY). BIS Research links this fragmentation to **18–22% of unplanned downtime** in Indian heavy industry.

On top of that, ~25% of India's experienced industrial engineers will retire within the decade, taking undocumented operational knowledge with them.

**Knowledge fragmentation is not a file-management problem — it's a safety, quality and operational-efficiency problem.**

---

## 2. What this platform does

A single web app that a plant team signs into, with five agents on top of one shared corpus:

| # | Agent | Status |
|---|---|---|
| 1 | **Universal Document Ingestion & Knowledge Graph Agent** — extracts entities & auto-grows the KG on every upload | ✅ Implemented |
| 2 | **Expert Knowledge Copilot** — RAG chat with citations + confidence, mobile-friendly | ✅ Implemented |
| 3 | **Maintenance Intelligence & RCA Agent** — fuses work orders + docs to produce structured RCAs | ✅ Implemented |
| 4 | **Quality & Regulatory Compliance Intelligence** — gap-detection against an India-relevant checklist | ✅ Implemented |
| 5 | **Lessons Learned & Failure Intelligence Engine** — patterns across incidents + work orders + docs | ✅ Implemented |
| — | P&ID / drawing computer-vision parsing | ⏳ Roadmap |
| — | Real-time OPC/telemetry ingestion for predictive maintenance | ⏳ Roadmap |

Every user is isolated by Postgres Row-Level Security. Shared demo/seed rows stay read-only.

---

## 3. Architecture

```text
                                ┌────────────────────────────────────┐
                                │      Browser (React 19 + Vite)     │
                                │   Auth · Upload · Dashboard · Chat │
                                └───────────────┬────────────────────┘
                                                │  fetch  (bearer token attached
                                                │          by start.ts middleware)
                                                ▼
                        ┌────────────────────────────────────────────┐
                        │  TanStack Start server (Cloudflare Worker) │
                        │  createServerFn + /api/* server routes     │
                        │  Auth middleware validates JWT             │
                        └───────────┬──────────────────┬─────────────┘
                                    │                  │
                          ┌─────────▼─────────┐  ┌─────▼─────────────┐
                          │ Lovable AI Gateway│  │ Supabase / Postgres│
                          │  embeddings:      │  │  pgvector          │
                          │  text-embed-3-sm  │  │  RLS per user      │
                          │  chat:            │  │  match_chunks RPC  │
                          │  gemini-2.5-flash │  │  auth.users        │
                          └───────────────────┘  └────────────────────┘
```

**Runtime**: TanStack Start v1 (React 19 + Vite 7) on Cloudflare Workers, Tailwind v4.
**Backend**: Lovable Cloud (managed Supabase) with `pgvector`, Postgres RLS on every user table.
**AI**: Lovable AI Gateway — `openai/text-embedding-3-small` (1536-dim, matches pgvector column) and `google/gemini-2.5-flash` for chat, entity extraction, RCA, lessons and compliance verdicts. No user-provided API keys required.
**Auth**: Email/password + Google OAuth via the Lovable auth broker.

---

## 4. Data model

| Table | Purpose | Isolation |
|---|---|---|
| `documents` | uploaded files, page count, OCR text | RLS: owner + shared demo |
| `chunks` | ~1.2 KB text chunks with 1536-dim embeddings | RLS: owner + shared demo |
| `entities` | equipment/failure/date/person/finding/regulation labels | RLS: owner + shared demo |
| `kg_nodes` / `kg_edges` | knowledge graph derived from entity extraction | shared (upserted on stable slug IDs) |
| `work_orders` | CMMS-style records powering RCA + maintenance stats | RLS: owner + shared demo |
| `incidents` | incident + near-miss log fueling Lessons Learned | RLS: owner + shared demo |
| `compliance_items` | per-user derived compliance items | RLS: owner + shared demo |
| `chat_messages` | copilot conversation history | RLS: owner only |

`match_chunks(query_embedding, match_count)` is a `SECURITY DEFINER` SQL function that returns cosine-similarity matches restricted to `user_id = auth.uid() OR is_shared = true`, so retrieval respects tenant boundaries even inside the RPC.

---

## 5. Ingestion pipeline (`POST /api/documents`)

```text
File (PDF/TXT/MD/CSV/LOG, ≤12 MB)
  │
  ▼
[Server-side parse]           unpdf (edge-safe pdfjs) for PDFs; UTF-8 for text
  │  → per-page text array
  ▼
[Chunk]                       paragraph-packed to ~1.2k chars, hard-capped at 4k
  │
  ▼
[Embed]                       Lovable AI · text-embedding-3-small (1536-d)
  │
  ▼
[Persist]                     documents + chunks (with page numbers, user_id)
  │
  ▼
[Entity extraction]           Gemini 2.5 Flash, strict JSON, max 15 entities
  │
  ▼
[Knowledge graph update]      upsert doc node + entity nodes + "mentions" edges
  │                             ← this is what kills the "static seed" critique
  ▼
[Compliance seed]             regulation/finding entities → compliance_items
  │
  ▼
document.status = 'done'      new nodes/edges/entities visible on dashboard
```

Every step is best-effort past the "persist" stage — a failure in entity extraction never loses the indexed chunks.

---

## 6. Query pipeline — the five agents

### 6.1 Expert Knowledge Copilot — `POST /api/chat`
1. Embed the user question.
2. `match_chunks` returns top-K RLS-scoped chunks.
3. Gemini 2.5 Flash answers grounded in the retrieved snippets.
4. Response includes `citations: [{doc, page, snippet}]` and a `confidence` score used to render the confidence bar in the UI.

### 6.2 Maintenance Intelligence & RCA — `POST /api/rca`
1. Pulls all work orders for the target equipment.
2. Embeds `"{equipment} failure history maintenance root cause"` and retrieves 4 doc chunks (manuals, inspection reports).
3. LLM writes a structured RCA with fixed sections — Failure Pattern, Root Cause Hypothesis, Contributing Factors, Predictive Maintenance Recommendation, Sources.

### 6.3 Compliance Gap Detection — `POST /api/compliance-gap`
Built-in India-relevant checklist (**8 requirements** covering Factory Act, OISD-116, PESO, CPCB, MSIHC, ISO 9001, IS 15656). For each requirement:
1. Semantic search over the user's corpus.
2. Keyword corroboration (hard signal).
3. LLM verdict: `ok | partial | missing` + one-sentence rationale.
4. Guardrail: low similarity + no keyword hit → forced `missing`, no hallucinated compliance.
Returns summary counts + per-requirement evidence citations (doc name, page, snippet).

### 6.4 Lessons Learned & Failure Intelligence — `POST /api/lessons`
1. Pulls last 40 incidents + 40 work orders.
2. Seeds a semantic search from the combined failure vocabulary → 5 relevant doc passages.
3. LLM produces a briefing with fixed sections — Systemic Patterns, Proactive Warnings, Cross-team Recommendations, Confidence & Data Gaps.
4. Includes explicit "data is thin" acknowledgement when the corpus is small — no fabricated patterns.

### 6.5 Knowledge Graph — auto-populated
Every document upload appends a document node + one node per extracted entity, wired by `mentions` edges. The frontend renders a fully interactive SVG graph (drag nodes, drag background to pan, scroll to zoom, +/−/Reset controls).

---

## 7. Security model

- **RLS everywhere on user tables.** No `USING (true)` policies. Policies: `auth.uid() = user_id OR is_shared = true` for SELECT; `auth.uid() = user_id` for writes; `chat_messages` fully owner-scoped.
- **`match_chunks` RPC** re-applies the same predicate inside the function so vector search cannot leak cross-tenant chunks.
- **Bearer-token attacher** in `src/start.ts` puts the current Supabase session on every server-fn call; `authFromRequest` validates the token via `supabase.auth.getClaims()` on every `/api/*` handler.
- **Server-role admin key** (`supabaseAdmin`) is never used at runtime — only in migrations.
- **Public API surface** (`/api/public/*`) — none. Every endpoint is authenticated.

---

## 8. UX principles

- **One screen, one workspace.** The dashboard is the app; no per-agent page-switching.
- **Every AI answer cites its source.** Confidence bar + document/page snippets under every copilot reply.
- **Interactive knowledge graph.** Drag, zoom, pan. Not a static screenshot.
- **Realistic empty states.** Before you upload anything, Maintenance and Compliance panels show clearly-labeled `SAMPLE DATA` so the app is legible for evaluators without demo prep.
- **Mobile-friendly copilot.** The chat + citations layout wraps on narrow viewports for field technicians on phones.
- **Sign in → land on empty workspace → upload PDF → see chunks/entities/KG/citations appear → chat cites the PDF.** End-to-end in under a minute.

---

## 9. Repository layout

```
src/
  routes/
    __root.tsx                      HTML shell, providers, auth listener
    index.tsx                       Landing page
    auth.tsx                        Email + Google sign-in
    _authenticated/
      route.tsx                     Managed auth gate (ssr:false)
      dashboard.tsx                 The workspace UI
    api/
      documents.ts                  Upload + parse + chunk + embed + KG update
      chat.ts                       RAG copilot
      rca.ts                        Root Cause Analysis agent
      lessons.ts                    Lessons Learned agent
      compliance.ts                 List derived compliance items
      compliance-gap.ts             India regulation gap-detection agent
      entities.ts                   List extracted entities
      knowledge-graph.ts            List kg_nodes + kg_edges
      maintenance.ts                Work-order stats + top failure
  components/
    KnowledgeGraph.tsx              Interactive draggable/zoomable SVG graph
  lib/
    ai.server.ts                    embedText, llmChat, chunkText helpers
    pdf.server.ts                   unpdf-based edge PDF parser
    supabase-scoped.server.ts       authFromRequest + JSON helpers
  integrations/supabase/            Auto-generated Supabase clients + types
supabase/                           Config + migrations
```

---

## 10. Local development

```bash
bun install
bun dev            # runs Vite on http://localhost:8080
```

Environment (already managed by Lovable Cloud in production — you do not set these by hand in the hosted app):

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | client | Browser Supabase client |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | server | Server-scoped Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | server (migrations only) | Never used at runtime |
| `LOVABLE_API_KEY` | server | AI Gateway auth (embeddings + chat) |

---

## 11. What's next (roadmap)

- **P&ID / drawing digitisation.** Add a Vision agent to identify equipment tags in scanned P&IDs and link them into the same KG as first-class nodes.
- **Real-time telemetry ingestion.** OPC-UA / MQTT connector → time-series table → RCA agent conditions its recommendations on live operating state.
- **Auto-generated audit evidence packages.** Compliance agent exports a PDF bundle per requirement (evidence snippets + source pages) for statutory audits.
- **Multi-tenant admin console.** Roles for Ops Lead / Technician / Auditor with distinct default views.
- **External failure-mode intelligence.** Cross-reference incidents with public industry failure databases (NIST, OSHA, IChemE Loss Prevention Bulletin).
- **Hindi-first mobile copilot.** Field-technician mode with voice input and Hindi responses grounded in the same corpus.

---

## 12. Evaluation mapping

| Evaluation focus (brief) | Where it shows up in this build |
|---|---|
| Entity extraction accuracy across document types | `POST /api/documents` — strict-JSON prompt, 7 entity types, capped output, populates `entities` + KG |
| Query answer quality on domain benchmarks | `POST /api/chat` — RAG with `match_chunks`, citations + confidence |
| Knowledge graph linkage completeness | Every upload appends nodes + `mentions` edges; interactive UI |
| Time-to-answer vs traditional search | Single query, sub-second retrieval, single-page answer with sources |
| Compliance gap detection accuracy | `POST /api/compliance-gap` — semantic + keyword + LLM verdict + similarity guardrail |
| Cross-functional knowledge discovery | Lessons Learned agent surfaces systemic patterns invisible to any single reviewer |
# by OSM
