
-- 1) Add explicit is_shared flag (default false → new user rows are private)
ALTER TABLE public.documents        ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;
ALTER TABLE public.chunks           ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;
ALTER TABLE public.entities         ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;
ALTER TABLE public.work_orders      ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;
ALTER TABLE public.incidents        ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;
ALTER TABLE public.compliance_items ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

-- 2) Backfill existing demo rows (user_id IS NULL) as shared
UPDATE public.documents        SET is_shared = true WHERE user_id IS NULL;
UPDATE public.chunks           SET is_shared = true WHERE user_id IS NULL;
UPDATE public.entities         SET is_shared = true WHERE user_id IS NULL;
UPDATE public.work_orders      SET is_shared = true WHERE user_id IS NULL;
UPDATE public.incidents        SET is_shared = true WHERE user_id IS NULL;
UPDATE public.compliance_items SET is_shared = true WHERE user_id IS NULL;

-- 3) CHECK constraint: every row must EITHER have an owner OR be explicitly shared.
--    This closes the "orphan row becomes public" vector permanently.
ALTER TABLE public.documents        DROP CONSTRAINT IF EXISTS documents_owner_or_shared;
ALTER TABLE public.documents        ADD  CONSTRAINT documents_owner_or_shared        CHECK (user_id IS NOT NULL OR is_shared = true);
ALTER TABLE public.chunks           DROP CONSTRAINT IF EXISTS chunks_owner_or_shared;
ALTER TABLE public.chunks           ADD  CONSTRAINT chunks_owner_or_shared           CHECK (user_id IS NOT NULL OR is_shared = true);
ALTER TABLE public.entities         DROP CONSTRAINT IF EXISTS entities_owner_or_shared;
ALTER TABLE public.entities         ADD  CONSTRAINT entities_owner_or_shared         CHECK (user_id IS NOT NULL OR is_shared = true);
ALTER TABLE public.work_orders      DROP CONSTRAINT IF EXISTS work_orders_owner_or_shared;
ALTER TABLE public.work_orders      ADD  CONSTRAINT work_orders_owner_or_shared      CHECK (user_id IS NOT NULL OR is_shared = true);
ALTER TABLE public.incidents        DROP CONSTRAINT IF EXISTS incidents_owner_or_shared;
ALTER TABLE public.incidents        ADD  CONSTRAINT incidents_owner_or_shared        CHECK (user_id IS NOT NULL OR is_shared = true);
ALTER TABLE public.compliance_items DROP CONSTRAINT IF EXISTS compliance_items_owner_or_shared;
ALTER TABLE public.compliance_items ADD  CONSTRAINT compliance_items_owner_or_shared CHECK (user_id IS NOT NULL OR is_shared = true);

-- 4) Replace SELECT policies: read own rows OR explicitly-shared rows (no more NULL-based sharing)
DROP POLICY IF EXISTS "documents: read own or shared"        ON public.documents;
DROP POLICY IF EXISTS "chunks: read own or shared"           ON public.chunks;
DROP POLICY IF EXISTS "entities: read own or shared"         ON public.entities;
DROP POLICY IF EXISTS "work_orders: read own or shared"      ON public.work_orders;
DROP POLICY IF EXISTS "incidents: read own or shared"        ON public.incidents;
DROP POLICY IF EXISTS "compliance_items: read own or shared" ON public.compliance_items;

CREATE POLICY "documents: read own or shared"        ON public.documents        FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_shared = true);
CREATE POLICY "chunks: read own or shared"           ON public.chunks           FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_shared = true);
CREATE POLICY "entities: read own or shared"         ON public.entities         FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_shared = true);
CREATE POLICY "work_orders: read own or shared"      ON public.work_orders      FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_shared = true);
CREATE POLICY "incidents: read own or shared"        ON public.incidents        FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_shared = true);
CREATE POLICY "compliance_items: read own or shared" ON public.compliance_items FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_shared = true);

-- 5) Add missing owner-scoped UPDATE/DELETE policies (previously blocked entirely — safe to enable now)
CREATE POLICY "work_orders: update own"      ON public.work_orders      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "work_orders: delete own"      ON public.work_orders      FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "incidents: update own"        ON public.incidents        FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "incidents: delete own"        ON public.incidents        FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "compliance_items: update own" ON public.compliance_items FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "compliance_items: delete own" ON public.compliance_items FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 6) Rewrite match_chunks to use is_shared instead of NULL sharing
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
  SELECT c.id, c.document_id, d.name AS document_name, c.page, c.content,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.chunks c
  JOIN public.documents d ON d.id = c.document_id
  WHERE c.embedding IS NOT NULL
    AND (c.user_id = auth.uid() OR c.is_shared = true)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
