-- Shared AI-provider health so every Edge Function instance sees the same
-- failure counts, latency and cooldowns. Only the service role touches this table.
create table if not exists public.provider_health (
  provider text primary key,
  successes integer not null default 0,
  failures integer not null default 0,
  avg_latency_ms integer not null default 0,
  cooldown_until_ms bigint not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.provider_health enable row level security;
-- No policies on purpose: anon/authenticated users get no access; the service role bypasses RLS.
revoke all on public.provider_health from anon, authenticated;
