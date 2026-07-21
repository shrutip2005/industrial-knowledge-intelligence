// POST /api/chat  { question: string }
// RAG: embed → pgvector search (RLS-scoped) → Lovable AI Gateway LLM → cite sources
import { createFileRoute } from "@tanstack/react-router";
import { authFromRequest, jsonResponse, handleError } from "@/lib/supabase-scoped.server";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { supabase, userId } = await authFromRequest(request);
          const body = (await request.json()) as { question?: string; session_id?: string };
          const question = body?.question?.trim();
          const session = body?.session_id ?? `user-${userId}`;
          if (!question) return jsonResponse({ error: "question required" }, { status: 400 });

          const { embedText, llmChat } = await import("@/lib/ai.server");

          await supabase.from("chat_messages").insert({
            session_id: session, role: "user", content: question, user_id: userId,
          });

          const qEmb = await embedText(question);
          const { data: matches, error: mErr } = await supabase.rpc("match_chunks", {
            query_embedding: qEmb as unknown as string,
            match_count: 5,
          });
          if (mErr) return jsonResponse({ error: mErr.message }, { status: 500 });

          const rows = (matches as { id: string; document_name: string; page: number; content: string; similarity: number }[] | null) ?? [];

          if (!rows.length) {
            const answer = "I don't have any indexed documents for this account yet. Upload a PDF or text file first, then ask again.";
            await supabase.from("chat_messages").insert({
              session_id: session, role: "assistant", content: answer, confidence: 0.2, user_id: userId,
            });
            return jsonResponse({ answer, citations: [], confidence: 0.2 });
          }

          const context = rows
            .map((r, i) => `[${i + 1}] ${r.document_name} (p.${r.page}, similarity ${r.similarity.toFixed(2)}):\n${r.content}`)
            .join("\n\n");

          const answer = await llmChat(
            [
              {
                role: "system",
                content:
                  "You are the Industrial Knowledge Intelligence copilot. Answer strictly from the provided context, cite sources inline as [1], [2] where relevant, keep answers under 180 words, and be direct. If the context does not contain the answer, say so.",
              },
              { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` },
            ],
            { temperature: 0.15, max_tokens: 500 },
          );

          const avg = rows.reduce((s, r) => s + r.similarity, 0) / rows.length;
          const confidence = Math.max(0.3, Math.min(0.98, avg));
          const citations = rows.map((r) => ({ doc: r.document_name, page: r.page, snippet: r.content.slice(0, 140) }));

          await supabase.from("chat_messages").insert({
            session_id: session, role: "assistant", content: answer, citations, confidence, user_id: userId,
          });

          return jsonResponse({ answer, citations, confidence });
        } catch (e) { return handleError(e); }
      },
    },
  },
});
