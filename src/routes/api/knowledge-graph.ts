import { createFileRoute } from "@tanstack/react-router";
import { authFromRequest, jsonResponse, handleError } from "@/lib/supabase-scoped.server";

export const Route = createFileRoute("/api/knowledge-graph")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { supabase } = await authFromRequest(request);
          const [{ data: nodes }, { data: edges }] = await Promise.all([
            supabase.from("kg_nodes").select("*"),
            supabase.from("kg_edges").select("*"),
          ]);
          return jsonResponse({ nodes: nodes ?? [], edges: edges ?? [] });
        } catch (e) { return handleError(e); }
      },
    },
  },
});
