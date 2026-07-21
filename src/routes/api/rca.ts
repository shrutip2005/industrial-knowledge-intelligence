// POST /api/rca { equipment: string }
import { createFileRoute } from "@tanstack/react-router";
import { authFromRequest, jsonResponse, handleError } from "@/lib/supabase-scoped.server";

export const Route = createFileRoute("/api/rca")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { supabase } = await authFromRequest(request);
          const body = (await request.json()) as { equipment?: string };
          const equipment = body?.equipment?.trim();
          if (!equipment) return jsonResponse({ error: "equipment required" }, { status: 400 });

          const { embedText, llmChat } = await import("@/lib/ai.server");

          const [{ data: wos }, qEmb] = await Promise.all([
            supabase.from("work_orders").select("*").eq("equipment", equipment),
            embedText(`${equipment} failure history maintenance root cause`),
          ]);

          const { data: matches } = await supabase.rpc("match_chunks", {
            query_embedding: qEmb as unknown as string,
            match_count: 4,
          });

          const woSummary = (wos ?? [])
            .map((w: { id: string; occurred_at: string | null; description: string | null; root_cause: string | null; reported_by: string | null }) =>
              `${w.id} (${w.occurred_at ?? "n/a"}): ${w.description} — root cause: ${w.root_cause} — by ${w.reported_by}`)
            .join("\n");
          const docContext = (matches as { document_name: string; page: number; content: string }[] | null)
            ?.map((m, i) => `[${i + 1}] ${m.document_name} p.${m.page}: ${m.content}`)
            .join("\n\n") ?? "";

          const analysis = await llmChat(
            [
              {
                role: "system",
                content:
                  "You are a Root Cause Analysis agent for industrial maintenance. Produce a concise structured RCA with the sections: 1) Failure Pattern, 2) Root Cause Hypothesis, 3) Contributing Factors, 4) Predictive Maintenance Recommendation (with cadence), 5) Sources. Use short bullet lines. Ground everything in the provided data.",
              },
              {
                role: "user",
                content: `Equipment: ${equipment}\n\nWork Orders:\n${woSummary || "(none)"}\n\nDocument Context:\n${docContext || "(none)"}`,
              },
            ],
            { temperature: 0.2, max_tokens: 700 },
          );

          return jsonResponse({ analysis, work_orders: wos ?? [] });
        } catch (e) { return handleError(e); }
      },
    },
  },
});
