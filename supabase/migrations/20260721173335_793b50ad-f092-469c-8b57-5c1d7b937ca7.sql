
-- Document nodes
INSERT INTO public.kg_nodes (id, label, node_type, detail, x, y, r, color)
SELECT 'doc-' || left(d.id::text, 8), d.name, 'document', d.pages || ' page(s)',
       120 + random()*560, 80 + random()*340, 22, '#8fbde8'
FROM public.documents d
ON CONFLICT (id) DO NOTHING;

-- Entity nodes
INSERT INTO public.kg_nodes (id, label, node_type, detail, x, y, r, color)
SELECT DISTINCT ON (e.entity_type || '-' || regexp_replace(lower(e.label), '[^a-z0-9]+', '-', 'g'))
  e.entity_type || '-' || regexp_replace(lower(e.label), '[^a-z0-9]+', '-', 'g'),
  e.label,
  e.entity_type,
  'Mentioned in documents',
  60 + random()*680, 40 + random()*420, 16,
  CASE e.entity_type
    WHEN 'equipment' THEN '#4fd1c5'
    WHEN 'failure' THEN '#f56565'
    WHEN 'procedure' THEN '#f6ad55'
    WHEN 'regulation' THEN '#9f7aea'
    WHEN 'finding' THEN '#63b3ed'
    WHEN 'person' THEN '#ecc94b'
    WHEN 'date' THEN '#a0aec0'
    ELSE '#8fbde8'
  END
FROM public.entities e
WHERE e.label IS NOT NULL AND e.entity_type IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Edges document -> entity
INSERT INTO public.kg_edges (source_id, target_id, relation)
SELECT DISTINCT 'doc-' || left(e.document_id::text, 8),
       e.entity_type || '-' || regexp_replace(lower(e.label), '[^a-z0-9]+', '-', 'g'),
       'mentions'
FROM public.entities e
WHERE e.label IS NOT NULL AND e.entity_type IS NOT NULL
ON CONFLICT (source_id, target_id) DO NOTHING;

-- Compliance items from regulation / finding entities
INSERT INTO public.compliance_items (title, description, regulation, status, user_id)
SELECT e.label,
       'Detected in uploaded document',
       CASE WHEN e.entity_type = 'regulation' THEN e.label ELSE 'Internal finding' END,
       CASE WHEN e.entity_type = 'regulation' THEN 'ok' ELSE 'missing' END,
       e.user_id
FROM public.entities e
WHERE e.entity_type IN ('regulation', 'finding') AND e.user_id IS NOT NULL;
