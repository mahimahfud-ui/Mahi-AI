-- Provider health shared across Edge Function isolates
create table if not exists public.provider_health (
  provider text primary key,
  successes int not null default 0,
  failures int not null default 0,
  avg_latency_ms double precision not null default 0,
  cooldown_until_ms bigint not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.provider_health enable row level security;

-- Only service role (Edge Function) should read/write
drop policy if exists provider_health_service on public.provider_health;
create policy provider_health_service on public.provider_health
  for all using (false) with check (false);
