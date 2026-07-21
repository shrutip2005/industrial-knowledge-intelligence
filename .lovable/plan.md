# Industrial Knowledge Intelligence — production-hardening plan

## 1. Current state (analysis)

**What works today**
- TanStack Start app with a single dashboard route (`/`) rendering docs, entities, knowledge graph, compliance items, work orders, RCA agent, and a RAG chat copilot.
- Server routes for `documents`, `chat`, `rca`, `entities`, `knowledge-graph`, `compliance`, `maintenance`, `seed-embeddings`.
- RAG pipeline: chunking + Lovable AI embeddings (`text-embedding-3-small`) + pgvector `match_chunks` RPC + Groq LLM for answers/entities.
- pgvector-backed `chunks` table, demo tables seeded (documents, work orders, kg nodes/edges, compliance).

**What is missing / broken**
1. **No authentication.** Every user sees every other user's uploads, chats and RCA runs. Every RLS policy is `USING (true)` — a full public read/write surface.
2. **No per-user isolation** — no `user_id` on `documents`, `chunks`, `entities`, `chat_messages`, `work_orders`, etc.
3. **PDF upload is broken.** Client does `f.text()` on a PDF → binary blob gets embedded as garbage; user is told "provide a .txt". Also all other binary formats fail.
4. **Uploads run in the browser** with no size limit, no progress, no server-side validation.
5. **`GROQ_API_KEY` is used but never provisioned.** Prior turn the user was asked to set it — we should switch to Lovable AI Gateway (already used for embeddings, no user key needed) for the chat + RCA + entity-extraction LLM calls, so nothing depends on Groq.
6. **Chat sessions are shared** — `session_id` defaults to `"default"` server-side; every browser writes to the same conversation.
7. **`seed-embeddings` and demo tables** run for everyone → new users see other users' seeded/demo content mixed with theirs.
8. **No error boundaries beyond root**, no loading states on the big dashboard, `jfetch` throws raw response text into the UI.
9. **SEO/head metadata** on `/` is generic (only root has metadata) — dashboard route has no `head()`.
10. **Knowledge graph is static seed data** — never updates from user uploads (nodes/edges never link to newly ingested docs).
11. **Compliance items are static seed data** — never derived from user documents.

## 2. What we will build

### A. Authentication + per-user isolation (foundation)
- Enable email/password + Google sign-in via Lovable Cloud.
- Add `/auth` public route (sign-in + sign-up).
- Move the dashboard behind `_authenticated/` (rename `index.tsx` → `_authenticated/dashboard.tsx`, keep `index.tsx` as a landing page with a "Sign in" CTA that redirects signed-in users to `/dashboard`).
- Migration: add `user_id uuid references auth.users(id) on delete cascade` to `documents`, `chunks`, `entities`, `chat_messages`, `work_orders`, `incidents`, `compliance_items`. Backfill demo rows with `user_id = NULL` and treat them as shared demo data OR (preferred) seed per-user on first login via a trigger. We'll go with: **demo rows stay `user_id NULL` and are visible to everyone as read-only seed; user uploads are owner-scoped.**
- Rewrite every RLS policy: drop `USING (true)`; add `auth.uid() = user_id OR user_id IS NULL` for SELECT, and `auth.uid() = user_id` for INSERT/UPDATE/DELETE. `chat_messages` fully owner-scoped (no NULL fallback).
- Convert every `/api/*` route from `supabaseAdmin` to `requireSupabaseAuth`-based `createServerFn` so RLS applies as the signed-in user. Register bearer attacher in `src/start.ts`.
- `match_chunks` RPC rewritten to accept the caller's `auth.uid()` and filter chunks to `user_id = auth.uid() OR user_id IS NULL`.

### B. Real PDF ingestion
- Move upload to a server function that accepts a base64/File payload.
- Parse PDFs server-side with `pdfjs-dist` (Worker-compatible, pure JS) → extract page-level text; fall back to raw text for `.txt`/`.md`.
- Store `pages`, `ocr_text`, per-page offsets so chunks carry accurate `page` numbers instead of the current linear approximation.
- Client: accept `.pdf,.txt,.md`, show progress, size cap (10 MB), reject unsupported types cleanly.
- Chunking upgraded: paragraph split with overlap; embed in batches; write chunks with real `page` numbers.

### C. LLM switch to Lovable AI Gateway
- Replace `groqChat` with a gateway chat call to `google/gemini-2.5-flash` (already-provisioned `LOVABLE_API_KEY`).
- Remove `GROQ_API_KEY` dependency entirely — no user setup needed.

### D. Bug fixes + production polish
- Per-user chat sessions keyed on `auth.uid()` (persist a per-user `session_id` in localStorage).
- Loading skeletons + error toasts for every dashboard panel.
- SEO `head()` on `/`, `/auth`, `/dashboard` with unique titles/descriptions.
- Retry buttons wired to `router.invalidate()`.
- Sign-out button in the sidebar with proper cache teardown.
- Auth state listener in `__root.tsx` filtered to SIGNED_IN/SIGNED_OUT/USER_UPDATED.
- Empty-state UI when a new user has no documents yet (instead of the current broken static panels).
- Knowledge graph + compliance panels: show user's real doc/entity data (derived from their uploads) mixed with the read-only demo baseline, clearly labeled.

### E. Housekeeping
- Delete the `/api/seed-embeddings` endpoint (demo chunks now seeded once in migration).
- Add proper `.pdf` icon + file-type badge in the doc list.
- Sanitize error strings shown to users.

## 3. Technical notes
- pdfjs-dist ESM build works on Cloudflare Workers when we import the `legacy/build/pdf.mjs` entry with no worker (we call `getDocument` with `disableWorker: true` and `useWorkerFetch: false`); pure JS, no native deps.
- All server functions become `createServerFn` in `src/lib/*.functions.ts`; `supabaseAdmin` is only used in the migration-time seed and never at runtime.
- Chunk embed batches capped at 20 concurrent to avoid rate limits.
- RLS: `chunks` policies join through `documents.user_id` via a `security definer` helper to avoid duplicating `user_id` (or we duplicate it for query speed — we'll duplicate for simplicity + index performance).

## 4. Out of scope for this pass
- P&ID computer-vision parsing (drawings).
- Real-time OPC/telemetry ingestion.
- Multi-tenant admin console.
- Full incident/lessons-learned agent (E in the brief) — table exists, UI can come next round.

## 5. Deliverables at end of this task
- Signed-in demo works end-to-end: sign up → land on empty dashboard → upload a PDF → see chunks/entities appear → chat cites the uploaded PDF → sign out → second user sees none of the first user's data.
- No `GROQ_API_KEY` needed.
- No RLS `USING (true)` policies remain on user-data tables.
- Build + typecheck green.

Approve and I'll execute all of it in one pass.
