
create extension if not exists vector;

-- ============ TABLES ============
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  doc_type text not null default 'manual',
  pages int default 1,
  status text not null default 'done',
  ocr_text text default '',
  created_at timestamptz not null default now()
);

create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index int not null default 0,
  page int default 1,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index chunks_doc_idx on public.chunks(document_id);
create index chunks_embed_idx on public.chunks using hnsw (embedding vector_cosine_ops);

create table public.entities (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade,
  entity_type text not null,
  label text not null,
  created_at timestamptz not null default now()
);
create index entities_type_idx on public.entities(entity_type);

create table public.kg_nodes (
  id text primary key,
  label text not null,
  node_type text not null,
  detail text,
  x float default 0,
  y float default 0,
  r float default 18,
  color text default '#3b7ec4'
);
create table public.kg_edges (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.kg_nodes(id) on delete cascade,
  target_id text not null references public.kg_nodes(id) on delete cascade,
  relation text default 'related'
);

create table public.work_orders (
  id text primary key,
  equipment text not null,
  description text,
  reported_by text,
  root_cause text,
  status text default 'closed',
  occurred_at date,
  created_at timestamptz not null default now()
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  equipment text,
  failure_type text,
  severity text default 'medium',
  narrative text,
  occurred_at date,
  created_at timestamptz not null default now()
);

create table public.compliance_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  regulation text,
  status text not null default 'ok', -- ok | missing | critical
  created_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null default 'default',
  role text not null,
  content text not null,
  citations jsonb default '[]'::jsonb,
  confidence float default 0.85,
  created_at timestamptz not null default now()
);
create index chat_msgs_session_idx on public.chat_messages(session_id, created_at);

-- ============ GRANTS ============
grant select, insert, update, delete on public.documents        to anon, authenticated;
grant select, insert, update, delete on public.chunks           to anon, authenticated;
grant select, insert, update, delete on public.entities         to anon, authenticated;
grant select, insert, update, delete on public.kg_nodes         to anon, authenticated;
grant select, insert, update, delete on public.kg_edges         to anon, authenticated;
grant select, insert, update, delete on public.work_orders      to anon, authenticated;
grant select, insert, update, delete on public.incidents        to anon, authenticated;
grant select, insert, update, delete on public.compliance_items to anon, authenticated;
grant select, insert, update, delete on public.chat_messages    to anon, authenticated;
grant all on public.documents,public.chunks,public.entities,public.kg_nodes,public.kg_edges,public.work_orders,public.incidents,public.compliance_items,public.chat_messages to service_role;

-- ============ RLS (permissive for demo prototype) ============
alter table public.documents        enable row level security;
alter table public.chunks           enable row level security;
alter table public.entities         enable row level security;
alter table public.kg_nodes         enable row level security;
alter table public.kg_edges         enable row level security;
alter table public.work_orders      enable row level security;
alter table public.incidents        enable row level security;
alter table public.compliance_items enable row level security;
alter table public.chat_messages    enable row level security;

create policy "public all documents"        on public.documents        for all using (true) with check (true);
create policy "public all chunks"           on public.chunks           for all using (true) with check (true);
create policy "public all entities"         on public.entities         for all using (true) with check (true);
create policy "public all kg_nodes"         on public.kg_nodes         for all using (true) with check (true);
create policy "public all kg_edges"         on public.kg_edges         for all using (true) with check (true);
create policy "public all work_orders"      on public.work_orders      for all using (true) with check (true);
create policy "public all incidents"        on public.incidents        for all using (true) with check (true);
create policy "public all compliance_items" on public.compliance_items for all using (true) with check (true);
create policy "public all chat_messages"    on public.chat_messages    for all using (true) with check (true);

-- ============ RAG search function ============
create or replace function public.match_chunks(
  query_embedding vector(1536),
  match_count int default 5
) returns table (
  id uuid,
  document_id uuid,
  document_name text,
  page int,
  content text,
  similarity float
) language sql stable as $$
  select c.id, c.document_id, d.name as document_name, c.page, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
grant execute on function public.match_chunks(vector, int) to anon, authenticated, service_role;

-- ============ SEED DATA ============
insert into public.documents (id, name, doc_type, pages, status, ocr_text) values
('11111111-1111-1111-1111-111111111111','Pump_P101_Manual.pdf','manual',24,'done',
$$SECTION 4 — MAINTENANCE SCHEDULE

Equipment: Pump P-101 (Centrifugal, 75kW)
Manufacturer: Hallgren Fluid Systems
Installed: 2019-03-11

4.2 Recommended bearing inspection interval: every 5 months under normal load conditions. Reduce interval to 3 months if operating above 85% rated capacity for sustained periods.

4.3 Known failure modes for this pump class:
 - Bearing wear (most frequent — 62% of reported cases)
 - Seal leakage at drive-end gland
 - Cavitation under low suction head

4.4 Personnel authorized for isolation & lockout:
 R. Fernandez, T. Okafor (Level 2 Mechanical Certified)$$),
('22222222-2222-2222-2222-222222222222','Work_Order_History.pdf','workorder',11,'done',
$$WORK ORDER LOG — Q1–Q4

WO-4402  2024-02-18  Pump P-101  Bearing replacement
 Reported by: T. Okafor  Root cause: bearing wear

WO-4433  2024-06-02  Pump P-101  Bearing replacement
 Reported by: R. Fernandez  Root cause: bearing wear

WO-4471  2024-10-29  Pump P-101  Seal reseated
 Reported by: T. Okafor  Root cause: seal leakage
 Status: technician sign-off pending

WO-4488  2025-01-07  Valve V-202  Corrosion noted
 Reported by: M. Álvarez$$),
('33333333-3333-3333-3333-333333333333','Inspection_Report_IR102.pdf','inspection',6,'done',
$$INSPECTION REPORT IR-102
Site: Unit 3 Pump House   Date: 2025-01-15
Inspector: R. Fernandez

FINDINGS:
 - Pump P-101 drive-end bearing shows early-stage wear, consistent with prior WO-4402 / WO-4433 history
 - Recommend inspection cadence tightened to every 5 months
 - Vibration reading within tolerance (2.1 mm/s RMS)

REGULATORY REFERENCE: OSHA 1910.147 (Lockout/Tagout)
STATUS: Filed & signed off by QA$$),
('44444444-4444-4444-4444-444444444444','Safety_Procedure.pdf','safety',8,'done',
$$SAFETY PROCEDURE — PUMP ISOLATION
Document Rev: C   Reviewed: 2025-04-02

1. Confirm lockout/tagout per OSHA 1910.147
2. Isolate Pump P-101 from Valve V-202 upstream feed
3. Bleed residual pressure before seal or bearing access
4. Authorized personnel: T. Okafor, R. Fernandez

Related regulatory reference: ISO 45001 §8.1.2$$);

-- Entities
insert into public.entities (entity_type, label) values
('equipment','Pump P-101'),('equipment','Valve V-202'),('equipment','Motor M-30'),
('failure','Bearing wear'),('failure','Seal leakage'),('failure','Corrosion'),
('date','2025-01-15'),('date','2024-10-29'),
('person','R. Fernandez'),('person','T. Okafor'),
('finding','Early-stage bearing wear'),('finding','Vibration within tolerance'),
('regulation','OSHA 1910.147'),('regulation','ISO 45001');

-- KG
insert into public.kg_nodes (id,label,node_type,detail,x,y,r,color) values
('p101','Pump P-101','equipment','Centrifugal pump, Unit 3 · installed 2019',450,190,26,'#3b7ec4'),
('manual','Manual','document','Pump_P101_Manual.pdf — maintenance schedule',180,80,17,'#6b7fa3'),
('wo','Work Orders','document','4 work orders logged for P-101, WO-4402→WO-4488',220,300,19,'#6b7fa3'),
('bearing','Bearing Wear','failure','3 occurrences in 12 months — most common failure',650,110,20,'#d94f4f'),
('seal','Seal Leakage','failure','1 occurrence — WO-4471, Oct 2024',700,230,16,'#d94f4f'),
('ir','Inspection Report IR-102','document','Filed 2025-01-15 by R. Fernandez',470,340,18,'#6b7fa3'),
('safety','Safety Procedure','procedure','Pump isolation procedure, Rev C',750,340,16,'#1c9d5a'),
('v202','Valve V-202','equipment','Upstream isolation valve — corrosion noted Jan 2025',800,70,15,'#3b7ec4');

insert into public.kg_edges (source_id,target_id,relation) values
('p101','manual','described_in'),('p101','wo','has_orders'),('wo','bearing','root_cause'),
('wo','seal','root_cause'),('bearing','ir','observed_in'),('p101','ir','inspected_in'),
('ir','safety','references'),('p101','safety','governed_by'),('p101','v202','connected_to');

-- Work orders
insert into public.work_orders (id,equipment,description,reported_by,root_cause,status,occurred_at) values
('WO-4402','Pump P-101','Bearing replacement','T. Okafor','bearing wear','closed','2024-02-18'),
('WO-4433','Pump P-101','Bearing replacement','R. Fernandez','bearing wear','closed','2024-06-02'),
('WO-4471','Pump P-101','Seal reseated','T. Okafor','seal leakage','pending sign-off','2024-10-29'),
('WO-4488','Valve V-202','Corrosion noted','M. Álvarez','corrosion','open','2025-01-07');

-- Compliance
insert into public.compliance_items (title,description,regulation,status) values
('Inspection Report — IR-102','Filed on schedule, reviewed & signed off by QA','OSHA 1910.147','ok'),
('Safety Procedure — Pump Isolation','Current revision on file, last reviewed 3 months ago','ISO 45001','ok'),
('Work Order Closure — WO-4471','Missing technician sign-off on bearing replacement','OISD-125','missing'),
('Pressure Vessel Recert. — P-101','Certification expired 14 days ago, no renewal filed','PESO','critical');
