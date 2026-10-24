create table if not exists public.mahi_ai_user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_key text not null check (char_length(memory_key) between 1 and 100),
  category text not null default 'note'
    check (category = any (array['profile','preference','project','goal','context','note']::text[])),
  memory_value text not null check (char_length(btrim(memory_value)) between 1 and 800),
  source_conversation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mahi_ai_user_memories_user_key_unique unique (user_id, memory_key)
);

create table if not exists public.mahi_ai_user_memory_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists mahi_ai_user_memories_user_updated_idx
  on public.mahi_ai_user_memories (user_id, updated_at desc);
create index if not exists mahi_ai_messages_user_created_memory_idx
  on public.mahi_ai_messages (user_id, created_at desc);

alter table public.mahi_ai_user_memories enable row level security;
alter table public.mahi_ai_user_memory_settings enable row level security;

revoke all on public.mahi_ai_user_memories from public, anon, authenticated;
revoke all on public.mahi_ai_user_memory_settings from public, anon, authenticated;
grant all on public.mahi_ai_user_memories to service_role;
grant all on public.mahi_ai_user_memory_settings to service_role;

create or replace function public.mahi_ai_get_memory_context(
  p_user_id uuid,
  p_exclude_conversation_id uuid default null,
  p_message_limit integer default 12
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with memory_state as (
    select coalesce(
      (select s.enabled
       from public.mahi_ai_user_memory_settings s
       where s.user_id = p_user_id),
      true
    ) as enabled
  ),
  saved_memories as (
    select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) as items
    from (
      select memory_key, category, memory_value, updated_at
      from public.mahi_ai_user_memories
      where user_id = p_user_id
      order by updated_at desc
      limit 15
    ) m
  ),
  prior_messages as (
    select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) as items
    from (
      select c.title as conversation_title,
             m.role,
             left(m.content, 1000) as content,
             m.created_at
      from public.mahi_ai_messages m
      join public.mahi_ai_conversations c
        on c.id = m.conversation_id and c.user_id = m.user_id
      where m.user_id = p_user_id
        and (p_exclude_conversation_id is null or m.conversation_id <> p_exclude_conversation_id)
      order by m.created_at desc
      limit least(greatest(coalesce(p_message_limit, 12), 0), 12)
    ) m
  )
  select jsonb_build_object(
    'enabled', s.enabled,
    'memories', case when s.enabled then sm.items else '[]'::jsonb end,
    'recent_messages', case when s.enabled then pm.items else '[]'::jsonb end
  )
  from memory_state s
  cross join saved_memories sm
  cross join prior_messages pm;
$$;

revoke all on function public.mahi_ai_get_memory_context(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.mahi_ai_get_memory_context(uuid, uuid, integer) to service_role;
