// POST /api/compliance-gap — Compliance gap-detection agent.
// Cross-checks the user's uploaded document corpus against an India-relevant
// regulation checklist and returns a per-requirement verdict (present / partial
// / missing) with evidence citations.
import { createFileRoute } from "@tanstack/react-router";
import { authFromRequest, jsonResponse, handleError } from "@/lib/supabase-scoped.server";

interface Requirement {
  id: string;
  regulation: string;
  title: string;
  query: string;      // semantic search seed
  keywords: string[]; // hard-signal keywords
}

const CHECKLIST: Requirement[] = [
  { id: "fa-vessel", regulation: "Factory Act · Rule 61", title: "Pressure vessel inspection certificate",
    query: "pressure vessel inspection certificate hydrotest annual", keywords: ["pressure vessel", "hydrotest", "IBR", "inspection certificate"] },
  { id: "oisd-116", regulation: "OISD-116", title: "Fire protection & hydrocarbon storage safety audit",
    query: "fire protection hydrocarbon storage foam sprinkler audit", keywords: ["fire water", "foam", "OISD", "hydrocarbon storage", "sprinkler"] },
  { id: "peso-license", regulation: "PESO", title: "PESO license & storage compliance",
    query: "PESO license explosive petroleum storage compliance", keywords: ["PESO", "explosives", "petroleum storage"] },
  { id: "cpcb-emissions", regulation: "CPCB", title: "Emissions & effluent monitoring report",
    query: "stack emission effluent monitoring quarterly report CPCB", keywords: ["stack emission", "effluent", "CPCB", "consent to operate"] },
  { id: "operator-comp", regulation: "Factory Act · s.7A", title: "Operator competency & training records",
    query: "operator training certification sign-off competency", keywords: ["training record", "competency", "certification", "sign-off"] },
  { id: "spm-cal", regulation: "ISO 9001 · 7.1.5", title: "Instrument calibration & measurement records",
    query: "instrument calibration measurement traceability record", keywords: ["calibration", "traceability", "measurement record"] },
  { id: "lockout", regulation: "IS 15656", title: "Lockout-tagout (LOTO) procedure",
    query: "lockout tagout LOTO isolation procedure permit to work", keywords: ["lockout", "tagout", "LOTO", "permit to work"] },
  { id: "erp", regulation: "MSIHC Rules", title: "On-site emergency response plan",
    query: "emergency response plan evacuation mock drill on-site", keywords: ["emergency response", "evacuation", "mock drill", "MSIHC"] },
];

export const Route = createFileRoute("/api/compliance-gap")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { supabase, userId } = await authFromRequest(request);
          const { embedText, llmChat } = await import("@/lib/ai.server");

          // Pull user's document names for context; if none, short-circuit.
          const { data: docs } = await supabase.from("documents").select("id, name").eq("user_id", userId);
          const docCount = (docs ?? []).length;

          const results: {
            id: string; regulation: string; title: string;
            status: "ok" | "partial" | "missing";
            rationale: string;
            evidence: { doc: string; page: number; snippet: string }[];
          }[] = [];

          for (const req of CHECKLIST) {
            const qEmb = await embedText(req.query);
            const { data: matches } = await supabase.rpc("match_chunks", {
              query_embedding: qEmb as unknown as string,
              match_count: 3,
            });
            const hits = (matches as { document_name: string; page: number; content: string; similarity: number }[] | null) ?? [];
            const topSim = hits[0]?.similarity ?? 0;

            // Keyword corroboration for a hard signal.
            const kwHit = hits.some((h) => req.keywords.some((k) => h.content.toLowerCase().includes(k.toLowerCase())));

            if (docCount === 0 || hits.length === 0) {
              results.push({
                id: req.id, regulation: req.regulation, title: req.title,
                status: "missing",
                rationale: docCount === 0
                  ? "No documents uploaded yet — upload the relevant certificate / report to establish evidence."
                  : "No matching passage found in your uploaded corpus.",
                evidence: [],
              });
              continue;
            }

            const evidence = hits.slice(0, 2).map((h) => ({
              doc: h.document_name, page: h.page, snippet: h.content.slice(0, 220),
            }));

            // Ask the LLM to judge presence given the retrieved snippets.
            const verdict = await llmChat(
              [
                { role: "system", content: 'You verify regulatory compliance evidence. Respond in strict JSON: {"status":"ok"|"partial"|"missing","rationale":"1-2 sentences"}. "ok" only if the snippets clearly satisfy the requirement; "partial" if related but incomplete; "missing" if unrelated.' },
                { role: "user", content: `Requirement: ${req.regulation} — ${req.title}\n\nRetrieved snippets:\n${hits.map((h, i) => `[${i + 1}] ${h.document_name} p.${h.page}: ${h.content.slice(0, 400)}`).join("\n\n")}` },
              ],
              { temperature: 0, max_tokens: 180 },
            );
            const m = verdict.match(/\{[\s\S]*\}/);
            let status: "ok" | "partial" | "missing" = "missing";
            let rationale = "Unable to evaluate.";
            if (m) {
              try {
                const parsed = JSON.parse(m[0]) as { status?: string; rationale?: string };
                if (parsed.status === "ok" || parsed.status === "partial" || parsed.status === "missing") status = parsed.status;
                if (parsed.rationale) rationale = parsed.rationale;
              } catch { /* fall through */ }
            }
            // Guardrail: if similarity is very low and no keyword hit, force missing.
            if (topSim < 0.3 && !kwHit && status !== "missing") {
              status = "missing";
              rationale = "Retrieved passages have weak semantic overlap with the requirement.";
            }
            results.push({ id: req.id, regulation: req.regulation, title: req.title, status, rationale, evidence });
          }

          const summary = {
            total: results.length,
            ok: results.filter((r) => r.status === "ok").length,
            partial: results.filter((r) => r.status === "partial").length,
            missing: results.filter((r) => r.status === "missing").length,
          };

          return jsonResponse({ summary, results, doc_count: docCount });
        } catch (e) { return handleError(e); }
      },
    },
  },
});
