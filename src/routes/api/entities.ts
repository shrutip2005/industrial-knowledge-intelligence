import { createFileRoute } from "@tanstack/react-router";
import { authFromRequest, jsonResponse, handleError } from "@/lib/supabase-scoped.server";

export const Route = createFileRoute("/api/entities")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { supabase } = await authFromRequest(request);
          const { data, error } = await supabase.from("entities").select("*").order("created_at");
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
          return jsonResponse({ entities: data ?? [] });
        } catch (e) { return handleError(e); }
      },
    },
  },
});
