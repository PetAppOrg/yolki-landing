-- ════════════════════════════════════════════════════════════════════
-- QUIZ SUBMISSIONS — Tabela pra armazenar respostas do quiz "Seu pet é..."
-- Rodar no Supabase SQL Editor: https://supabase.com/dashboard/project/evfzrtgmuhosvbtbihcg/sql
-- ════════════════════════════════════════════════════════════════════

-- 1) Tabela principal
create table if not exists public.quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  session_id text,

  -- Respostas das 6 perguntas (colunas typed para filtros rápidos)
  especie      text,  -- cao | gato
  idade        text,  -- filhote | adulto | senior
  objetivo     text,  -- saude | comportamento | nutricao | longevidade
  conhecimento text,  -- quase-nada | basico | muito
  duvida       text,  -- comportamento | saude | nutricao | comecar
  tempo        text,  -- novo | medio | antigo

  -- Contexto
  user_agent text,
  referrer   text,
  answers    jsonb    -- cópia completa das respostas (JSON bruto)
);

create index if not exists quiz_submissions_created_at_idx
  on public.quiz_submissions (created_at desc);

create index if not exists quiz_submissions_session_id_idx
  on public.quiz_submissions (session_id);

-- 2) Row-Level Security
alter table public.quiz_submissions enable row level security;

-- Anon só pode INSERIR (nunca ler ou atualizar)
create policy "anon_insert_quiz"
  on public.quiz_submissions
  for insert
  to anon
  with check (true);

-- (Leitura exige service_role — nenhuma policy de select pra anon)


-- ════════════════════════════════════════════════════════════════════
-- VIEWS úteis pra relatórios (rodar no SQL Editor ou consumir via Dashboard)
-- ════════════════════════════════════════════════════════════════════

-- Visão geral dos últimos 7 dias
create or replace view public.quiz_week_summary as
select
  count(*)                                   as total,
  count(distinct session_id)                 as unique_users,
  count(*) filter (where especie = 'cao')    as cao,
  count(*) filter (where especie = 'gato')   as gato,
  count(*) filter (where idade = 'filhote')  as filhote,
  count(*) filter (where idade = 'adulto')   as adulto,
  count(*) filter (where idade = 'senior')   as senior,
  count(*) filter (where conhecimento = 'quase-nada') as conh_baixo,
  count(*) filter (where conhecimento = 'basico')     as conh_medio,
  count(*) filter (where conhecimento = 'muito')      as conh_alto
from public.quiz_submissions
where created_at > now() - interval '7 days';


-- Breakdown por combinação pergunta/resposta
create or replace view public.quiz_answers_breakdown as
select question, answer, count(*) as total
from (
  select 'especie'       as question, especie      as answer from public.quiz_submissions where especie      is not null
  union all select 'idade',        idade        from public.quiz_submissions where idade        is not null
  union all select 'objetivo',     objetivo     from public.quiz_submissions where objetivo     is not null
  union all select 'conhecimento', conhecimento from public.quiz_submissions where conhecimento is not null
  union all select 'duvida',       duvida       from public.quiz_submissions where duvida       is not null
  union all select 'tempo',        tempo        from public.quiz_submissions where tempo        is not null
) t
group by question, answer
order by question, total desc;


-- ════════════════════════════════════════════════════════════════════
-- RELATÓRIO SEMANAL (opções)
-- ════════════════════════════════════════════════════════════════════

-- OPÇÃO A (mais simples): abre o Dashboard Supabase toda segunda
--   https://supabase.com/dashboard/project/evfzrtgmuhosvbtbihcg/editor → quiz_submissions

-- OPÇÃO B: query manual semanal via SQL Editor
--   select * from public.quiz_week_summary;
--   select * from public.quiz_answers_breakdown;

-- OPÇÃO C (automatizado): Edge Function + pg_cron
--   1. Criar edge function `send-quiz-weekly-report` que:
--      - consulta as views
--      - formata email em HTML
--      - envia via Resend/Postmark pro email do DPO/founder
--   2. Agendar via Supabase cron (toda segunda 09:00 BRT):
--      select cron.schedule(
--        'weekly-quiz-report',
--        '0 12 * * 1',  -- UTC, = 09:00 BRT
--        $$ select net.http_post(
--             url := 'https://evfzrtgmuhosvbtbihcg.supabase.co/functions/v1/send-quiz-weekly-report',
--             headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
--           ) $$
--      );
