-- Mahi-AI owner admin control: private config, revocable sessions and login throttling.
create table if not exists public.mahi_ai_admin_config (
  id text primary key check (id = 'global'),
  config jsonb not null default '{"enabled":true,"globalInstructions":"","categories":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.mahi_ai_admin_config (id, config)
values ('global', '{
  "enabled": true,
  "globalInstructions": "",
  "categories": [
    {"id":"general","name":"General","description":"Default behavior for common questions.","keywords":["general","help","question"],"instructions":"","subcategories":[]},
    {"id":"bengali-language","name":"Bengali & Banglish","description":"Bangla, Banglish, translation and localization.","keywords":["বাংলা","bangla","banglish","translation","translate"],"instructions":"","subcategories":[]},
    {"id":"coding-development","name":"Coding & Development","description":"Programming, debugging and app development.","keywords":["coding","code","programming","website","app","bug"],"instructions":"","subcategories":[]},
    {"id":"research-facts","name":"Research & Facts","description":"Research, fact-checking and explanations.","keywords":["research","facts","sources","verify","analysis"],"instructions":"","subcategories":[]},
    {"id":"writing-creativity","name":"Writing & Creativity","description":"Writing, editing, creative work and content.","keywords":["writing","story","essay","caption","creative"],"instructions":"","subcategories":[]}
  ]
}'::jsonb)
on conflict (id) do nothing;

create table if not exists public.mahi_ai_admin_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists mahi_ai_admin_sessions_user_expires_idx
  on public.mahi_ai_admin_sessions (user_id, expires_at desc);

create table if not exists public.mahi_ai_admin_login_attempts (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null default 0 check (attempts >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz
);

alter table public.mahi_ai_admin_config enable row level security;
alter table public.mahi_ai_admin_sessions enable row level security;
alter table public.mahi_ai_admin_login_attempts enable row level security;
revoke all on public.mahi_ai_admin_config, public.mahi_ai_admin_sessions, public.mahi_ai_admin_login_attempts from anon, authenticated;
grant all on public.mahi_ai_admin_config, public.mahi_ai_admin_sessions, public.mahi_ai_admin_login_attempts to service_role;

create or replace function public.mahi_ai_admin_login_gate(p_ip_hash text, p_success boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.mahi_ai_admin_login_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_remaining integer;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', 900, 'remaining_attempts', 0);
  end if;

  loop
    select * into v_attempt from public.mahi_ai_admin_login_attempts where ip_hash = p_ip_hash for update;
    exit when found;
    begin
      insert into public.mahi_ai_admin_login_attempts (ip_hash, attempts, window_started_at)
      values (p_ip_hash, 0, v_now);
    exception when unique_violation then
      null;
    end;
  end loop;

  if p_success is true then
    delete from public.mahi_ai_admin_login_attempts where ip_hash = p_ip_hash;
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0, 'remaining_attempts', 5);
  end if;

  if v_attempt.blocked_until is not null and v_attempt.blocked_until > v_now then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_attempt.blocked_until - v_now)))::integer),
      'remaining_attempts', 0
    );
  end if;

  if p_success is null then
    if v_attempt.window_started_at < v_now - interval '15 minutes' then
      return jsonb_build_object('allowed', true, 'retry_after_seconds', 0, 'remaining_attempts', 5);
    end if;
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0, 'remaining_attempts', greatest(0, 5 - v_attempt.attempts));
  end if;

  if v_attempt.window_started_at < v_now - interval '15 minutes' then
    update public.mahi_ai_admin_login_attempts
      set attempts = 1, window_started_at = v_now, blocked_until = null
      where ip_hash = p_ip_hash returning * into v_attempt;
  else
    update public.mahi_ai_admin_login_attempts
      set attempts = attempts + 1,
          blocked_until = case when attempts + 1 >= 5 then v_now + interval '15 minutes' else null end
      where ip_hash = p_ip_hash returning * into v_attempt;
  end if;

  v_remaining := greatest(0, 5 - v_attempt.attempts);
  return jsonb_build_object(
    'allowed', v_attempt.blocked_until is null or v_attempt.blocked_until <= v_now,
    'retry_after_seconds', case
      when v_attempt.blocked_until is not null and v_attempt.blocked_until > v_now
        then greatest(1, ceil(extract(epoch from (v_attempt.blocked_until - v_now)))::integer)
      else 0 end,
    'remaining_attempts', v_remaining
  );
end;
$$;
revoke all on function public.mahi_ai_admin_login_gate(text, boolean) from public, anon, authenticated;
grant execute on function public.mahi_ai_admin_login_gate(text, boolean) to service_role;
