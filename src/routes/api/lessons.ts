// POST /api/lessons — Lessons Learned & Failure Intelligence agent.
// Analyzes incidents + work orders + relevant document chunks to surface
// systemic patterns and proactive warnings.
import { createFileRoute } from "@tanstack/react-router";
import { authFromRequest, jsonResponse, handleError } from "@/lib/supabase-scoped.server";

export const Route = createFileRoute("/api/lessons")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { supabase } = await authFromRequest(request);
          const { embedText, llmChat } = await import("@/lib/ai.server");

          const [{ data: incidents }, { data: wos }] = await Promise.all([
            supabase.from("incidents").select("*").order("occurred_at", { ascending: false }).limit(40),
            supabase.from("work_orders").select("*").order("occurred_at", { ascending: false }).limit(40),
          ]);

          const incs = incidents ?? [];
          const orders = wos ?? [];

          // Pull document context relevant to the observed failure vocabulary.
          const seed = [
            ...incs.map((i) => `${i.equipment ?? ""} ${i.failure_type ?? ""} ${i.narrative ?? ""}`),
            ...orders.map((w) => `${w.equipment ?? ""} ${w.root_cause ?? ""} ${w.description ?? ""}`),
          ].join(" ").slice(0, 800);
          const query = seed || "recurring industrial failure patterns near-miss incidents";
          const qEmb = await embedText(query);
          const { data: matches } = await supabase.rpc("match_chunks", {
            query_embedding: qEmb as unknown as string,
            match_count: 5,
          });

          const incSummary = incs
            .map((i) => `- ${i.occurred_at ?? "n/a"} · ${i.equipment ?? "?"} · ${i.severity ?? "?"} · ${i.failure_type ?? "?"} — ${i.narrative ?? ""}`)
            .join("\n");
          const woSummary = orders
            .map((w) => `- ${w.occurred_at ?? "n/a"} · ${w.equipment} · ${w.status ?? "?"} — ${w.description ?? ""} (root cause: ${w.root_cause ?? "n/a"})`)
            .join("\n");
          const docContext = (matches as { document_name: string; page: number; content: string }[] | null)
            ?.map((m, i) => `[${i + 1}] ${m.document_name} p.${m.page}: ${m.content}`)
            .join("\n\n") ?? "";

          const analysis = await llmChat(
            [
              {
                role: "system",
                content:
                  "You are the Lessons Learned & Failure Intelligence agent. Given historical incidents, work orders and document context, produce a concise briefing with these sections: 1) Systemic Patterns (recurring failure modes across assets), 2) Proactive Warnings (conditions likely to recur — with which asset and why), 3) Cross-team Recommendations (what to change in procedure/inspection/training), 4) Confidence & Data Gaps. Use short bullet lines. Ground every claim in the provided data. If data is thin, say so explicitly.",
              },
              {
                role: "user",
                content: `Incidents (${incs.length}):\n${incSummary || "(none)"}\n\nWork Orders (${orders.length}):\n${woSummary || "(none)"}\n\nRelevant Document Context:\n${docContext || "(none)"}`,
              },
            ],
            { temperature: 0.2, max_tokens: 900 },
          );

          return jsonResponse({
            analysis,
            counts: { incidents: incs.length, work_orders: orders.length, sources: (matches ?? []).length },
          });
        } catch (e) { return handleError(e); }
      },
    },
  },
});
