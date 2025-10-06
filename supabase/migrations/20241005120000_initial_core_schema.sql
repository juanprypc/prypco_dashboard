-- Supabase migration: initial schema for loyalty ledger and agent data
-- This script creates three tables: agent_profiles, loyalty_points, loyalty_points_monthly
-- All tables live in the public schema. Adjust as needed before running `supabase db push`.

create table if not exists public.agent_profiles (
  id text primary key,
  code text unique,
  display_name text,
  investor_promo_code text,
  investor_whatsapp_link text,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_points (
  id text primary key,
  agent_id text,
  agent_code text,
  agent_display_name text,
  points integer not null,
  type text not null,
  type_display_name text,
  rule_code text not null,
  status text not null,
  description_display_name text,
  earned_at timestamptz,
  expires_at timestamptz,
  source_txn text[],
  source_channel text[],
  created_time timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_points_nonzero check (points is not null)
);

-- Optional foreign key once agent table fully populated
-- alter table public.loyalty_points
--   add constraint loyalty_points_agent_fk foreign key (agent_id)
--   references public.agent_profiles (id);

create index if not exists loyalty_points_agent_created_time_idx
  on public.loyalty_points (agent_id, created_time desc);

create index if not exists loyalty_points_agent_code_created_time_idx
  on public.loyalty_points (agent_code, created_time desc);

create index if not exists loyalty_points_status_idx
  on public.loyalty_points (status);

create table if not exists public.loyalty_points_monthly (
  agent_id text not null,
  month date not null,
  positive_points integer not null default 0,
  negative_points integer not null default 0,
  total_transactions integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (agent_id, month)
);

create index if not exists loyalty_points_monthly_agent_idx
  on public.loyalty_points_monthly (agent_id);
