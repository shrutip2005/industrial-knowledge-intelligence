
-- 1) Add user_id columns (nullable so demo rows stay shared)
ALTER TABLE public.documents      ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.chunks         ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.entities       ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.chat_messages  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.work_orders    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.incidents      ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.compliance_items ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS documents_user_idx      ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS chunks_user_idx         ON public.chunks(user_id);
CREATE INDEX IF NOT EXISTS entities_user_idx       ON public.entities(user_id);
CREATE INDEX IF NOT EXISTS chat_messages_user_idx  ON public.chat_messages(user_id);
CREATE INDEX IF NOT EXISTS work_orders_user_idx    ON public.work_orders(user_id);
CREATE INDEX IF NOT EXISTS incidents_user_idx      ON public.incidents(user_id);
CREATE INDEX IF NOT EXISTS compliance_items_user_idx ON public.compliance_items(user_id);

-- 2) Drop existing permissive policies
DROP POLICY IF EXISTS "public all documents"        ON public.documents;
DROP POLICY IF EXISTS "public all chunks"           ON public.chunks;
DROP POLICY IF EXISTS "public all entities"         ON public.entities;
DROP POLICY IF EXISTS "public all chat_messages"    ON public.chat_messages;
DROP POLICY IF EXISTS "public all work_orders"      ON public.work_orders;
DROP POLICY IF EXISTS "public all incidents"        ON public.incidents;
DROP POLICY IF EXISTS "public all compliance_items" ON public.compliance_items;
DROP POLICY IF EXISTS "public all kg_nodes"         ON public.kg_nodes;
DROP POLICY IF EXISTS "public all kg_edges"         ON public.kg_edges;

-- 3) New policies: own rows OR shared-demo (user_id IS NULL) for reads;
--    writes require ownership. Chat messages are strictly private.

-- documents
CREATE POLICY "documents: read own or shared" ON public.documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "documents: insert own" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "documents: update own" ON public.documents
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "documents: delete own" ON public.documents
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- chunks
CREATE POLICY "chunks: read own or shared" ON public.chunks
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "chunks: insert own" ON public.chunks
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "chunks: delete own" ON public.chunks
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- entities
CREATE POLICY "entities: read own or shared" ON public.entities
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "entities: insert own" ON public.entities
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "entities: delete own" ON public.entities
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- chat_messages (strictly private)
CREATE POLICY "chat_messages: own only" ON public.chat_messages
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- work_orders
CREATE POLICY "work_orders: read own or shared" ON public.work_orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "work_orders: insert own" ON public.work_orders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- incidents
CREATE POLICY "incidents: read own or shared" ON public.incidents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "incidents: insert own" ON public.incidents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- compliance_items
CREATE POLICY "compliance_items: read own or shared" ON public.compliance_items
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "compliance_items: insert own" ON public.compliance_items
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- kg_nodes & kg_edges: shared read-only demo data for now
CREATE POLICY "kg_nodes: read all authenticated" ON public.kg_nodes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kg_edges: read all authenticated" ON public.kg_edges
  FOR SELECT TO authenticated USING (true);

-- 4) Rewrite match_chunks so it scopes to caller
DROP FUNCTION IF EXISTS public.match_chunks(vector, int);
DROP FUNCTION IF EXISTS public.match_chunks(vector, integer);

CREATE OR REPLACE FUNCTION public.match_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  document_name text,
  page int,
  content text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.document_id,
    d.name AS document_name,
    c.page,
    c.content,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.chunks c
  JOIN public.documents d ON d.id = c.document_id
  WHERE c.user_id = auth.uid() OR c.user_id IS NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_chunks(vector, int) TO authenticated;
