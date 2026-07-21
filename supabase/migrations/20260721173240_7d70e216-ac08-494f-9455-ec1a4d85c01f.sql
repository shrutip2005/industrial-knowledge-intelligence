
CREATE POLICY "kg_nodes: insert authenticated" ON public.kg_nodes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "kg_nodes: update authenticated" ON public.kg_nodes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "kg_edges: insert authenticated" ON public.kg_edges FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "kg_edges: update authenticated" ON public.kg_edges FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE UNIQUE INDEX IF NOT EXISTS kg_edges_source_target_uniq ON public.kg_edges (source_id, target_id);
