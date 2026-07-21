import { createFileRoute } from "@tanstack/react-router";
import { authFromRequest, jsonResponse, handleError } from "@/lib/supabase-scoped.server";

export const Route = createFileRoute("/api/maintenance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { supabase } = await authFromRequest(request);
          const { data } = await supabase.from("work_orders").select("*").order("occurred_at");
          const orders = data ?? [];
          const failureCounts: Record<string, number> = {};
          for (const w of orders as { root_cause: string | null }[]) {
            const k = (w.root_cause ?? "unknown").trim();
            failureCounts[k] = (failureCounts[k] ?? 0) + 1;
          }
          const topFailure = Object.entries(failureCounts).sort((a, b) => b[1] - a[1])[0] ?? ["n/a", 0];
          return jsonResponse({
            work_orders: orders,
            top_failure: { name: topFailure[0], count: topFailure[1] },
            failure_counts: failureCounts,
          });
        } catch (e) { return handleError(e); }
      },
    },
  },
});
