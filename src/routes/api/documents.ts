// GET /api/documents  → list documents visible to the caller
// POST /api/documents (multipart form) → upload PDF/TXT/MD; server-side parse + chunk + embed + entity extraction
import { createFileRoute } from "@tanstack/react-router";
import { authFromRequest, jsonResponse, handleError } from "@/lib/supabase-scoped.server";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

export const Route = createFileRoute("/api/documents")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { supabase } = await authFromRequest(request);
          const { data, error } = await supabase
            .from("documents")
            .select("*")
            .order("created_at", { ascending: true });
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
          return jsonResponse({ documents: data ?? [] });
        } catch (e) { return handleError(e); }
      },

      POST: async ({ request }) => {
        try {
          const { supabase, userId } = await authFromRequest(request);
          const contentType = request.headers.get("content-type") ?? "";
          let name = "";
          let text = "";
          let pagesCount = 1;
          const perPage: { page: number; text: string }[] = [];

          if (contentType.includes("multipart/form-data")) {
            const form = await request.formData();
            const file = form.get("file");
            if (!(file instanceof File)) {
              return jsonResponse({ error: "No file provided" }, { status: 400 });
            }
            if (file.size > MAX_BYTES) {
              return jsonResponse({ error: `File too large. Max ${MAX_BYTES / 1024 / 1024} MB.` }, { status: 400 });
            }
            name = file.name;
            const lower = name.toLowerCase();
            const bytes = new Uint8Array(await file.arrayBuffer());

            if (lower.endsWith(".pdf") || file.type === "application/pdf") {
              const { extractPdfText } = await import("@/lib/pdf.server");
              const pages = await extractPdfText(bytes);
              perPage.push(...pages);
              text = pages.map((p) => p.text).join("\n\n").trim();
              pagesCount = pages.length || 1;
              if (!text) return jsonResponse({ error: "This PDF appears to be a scanned image with no extractable text. OCR support is coming soon." }, { status: 400 });
            } else if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".csv") || lower.endsWith(".log") || file.type.startsWith("text/")) {
              text = new TextDecoder("utf-8").decode(bytes).trim();
              if (!text) return jsonResponse({ error: "File is empty." }, { status: 400 });
              pagesCount = Math.max(1, Math.ceil(text.length / 1800));
            } else {
              return jsonResponse({ error: "Unsupported file type. Upload PDF, TXT, MD, CSV or LOG." }, { status: 400 });
            }
          } else {
            // JSON path (legacy): { name, text, doc_type }
            const body = (await request.json()) as { name?: string; text?: string };
            if (!body?.name || !body?.text) return jsonResponse({ error: "name and text required" }, { status: 400 });
            name = body.name;
            text = body.text;
            pagesCount = Math.max(1, Math.ceil(text.length / 1800));
          }

          const { embedText, chunkText, llmChat } = await import("@/lib/ai.server");

          // Insert document (RLS enforces user_id = auth.uid())
          const { data: doc, error: docErr } = await supabase
            .from("documents")
            .insert({
              name,
              doc_type: name.toLowerCase().endsWith(".pdf") ? "pdf" : "text",
              pages: pagesCount,
              status: "processing",
              ocr_text: text.slice(0, 200000),
              user_id: userId,
            })
            .select()
            .single();
          if (docErr || !doc) return jsonResponse({ error: docErr?.message ?? "insert failed" }, { status: 500 });

          // Chunk (page-aware if we have per-page text)
          let chunkRows: { document_id: string; chunk_index: number; page: number; content: string; embedding: string; user_id: string }[] = [];
          try {
            if (perPage.length) {
              let idx = 0;
              for (const p of perPage) {
                const parts = chunkText(p.text);
                for (const c of parts) {
                  const emb = await embedText(c);
                  chunkRows.push({
                    document_id: doc.id,
                    chunk_index: idx++,
                    page: p.page,
                    content: c,
                    embedding: emb as unknown as string,
                    user_id: userId,
                  });
                }
              }
            } else {
              const parts = chunkText(text);
              chunkRows = await Promise.all(
                parts.map(async (content, i) => ({
                  document_id: doc.id,
                  chunk_index: i,
                  page: Math.max(1, Math.ceil(((i + 1) / parts.length) * pagesCount)),
                  content,
                  embedding: (await embedText(content)) as unknown as string,
                  user_id: userId,
                })),
              );
            }
            if (chunkRows.length) {
              const { error: chunkErr } = await supabase.from("chunks").insert(chunkRows);
              if (chunkErr) throw chunkErr;
            }
          } catch (e) {
            await supabase.from("documents").update({ status: "error" }).eq("id", doc.id);
            return jsonResponse({ error: "Embedding failed: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
          }

          // Best-effort entity extraction + knowledge graph + compliance derivation
          try {
            const raw = await llmChat(
              [
                {
                  role: "system",
                  content:
                    'You extract industrial entities. Return ONLY compact JSON: {"entities":[{"type":"equipment|failure|date|person|finding|regulation|procedure","label":"..."}]}. No prose. Max 15 entities.',
                },
                { role: "user", content: text.slice(0, 4000) },
              ],
              { temperature: 0, max_tokens: 500 },
            );
            const m = raw.match(/\{[\s\S]*\}/);
            if (m) {
              const parsed = JSON.parse(m[0]) as { entities?: { type: string; label: string }[] };
              const clean = (parsed.entities ?? [])
                .filter((e) => e.label && e.type)
                .slice(0, 20);

              if (clean.length) {
                await supabase.from("entities").insert(
                  clean.map((e) => ({ document_id: doc.id, entity_type: e.type, label: e.label, user_id: userId })),
                );

                // Knowledge graph: create a document node + entity nodes + edges
                const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
                const colorFor = (t: string) =>
                  ({ equipment: "#4fd1c5", failure: "#f56565", procedure: "#f6ad55", regulation: "#9f7aea", finding: "#63b3ed", person: "#ecc94b", date: "#a0aec0", document: "#8fbde8" } as Record<string, string>)[t] ?? "#8fbde8";
                const rand = (min: number, max: number) => Math.random() * (max - min) + min;

                const docNodeId = `doc-${doc.id.slice(0, 8)}`;
                const nodes: { id: string; label: string; node_type: string; detail: string; x: number; y: number; r: number; color: string }[] = [
                  { id: docNodeId, label: name, node_type: "document", detail: `${pagesCount} page(s)`, x: rand(120, 680), y: rand(80, 420), r: 22, color: colorFor("document") },
                ];
                const edges: { source_id: string; target_id: string; relation: string }[] = [];
                for (const e of clean) {
                  const nid = `${e.type}-${slug(e.label)}`;
                  if (!nid) continue;
                  nodes.push({
                    id: nid,
                    label: e.label,
                    node_type: e.type,
                    detail: `Mentioned in ${name}`,
                    x: rand(60, 740),
                    y: rand(40, 460),
                    r: 16,
                    color: colorFor(e.type),
                  });
                  edges.push({ source_id: docNodeId, target_id: nid, relation: "mentions" });
                }
                if (nodes.length) await supabase.from("kg_nodes").upsert(nodes, { onConflict: "id" });
                if (edges.length) await supabase.from("kg_edges").upsert(edges, { onConflict: "source_id,target_id" });

                // Compliance items derived from regulation / finding entities
                const compRows = clean
                  .filter((e) => e.type === "regulation" || e.type === "finding")
                  .map((e) => ({
                    title: e.label,
                    description: `Detected in ${name}`,
                    regulation: e.type === "regulation" ? e.label : "Internal finding",
                    status: e.type === "regulation" ? "ok" : "missing",
                    user_id: userId,
                  }));
                if (compRows.length) await supabase.from("compliance_items").insert(compRows);
              }
            }
          } catch { /* non-fatal */ }


          await supabase.from("documents").update({ status: "done" }).eq("id", doc.id);
          return jsonResponse({ ok: true, document_id: doc.id, chunks: chunkRows.length, pages: pagesCount });
        } catch (e) { return handleError(e); }
      },
    },
  },
});
