-- MahiCloud: user-owned workspace, editable structured memory, and resumable task branches.
-- All writes to these records are also available through the authenticated mahi-ai-chat workspace_action API.

create table if not exists public.mahi_ai_memory_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_key text not null check (char_length(memory_key) between 1 and 120),
  category text not null default 'note'
    check (category = any (array['profile','preference','project','goal','context','note','decision','workflow']::text[])),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) in ('object','array')),
  tags text[] not null default '{}'::text[] check (cardinality(tags) <= 12),
  confidence numeric(3,2) not null default 1.00 check (confidence >= 0 and confidence <= 1),
  source_kind text not null default 'user'
    check (source_kind = any (array['user','explicit_chat','auto_detected','legacy_import','workspace_import']::text[])),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  is_archived boolean not null default false,
  deleted_at timestamptz,
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, memory_key),
  unique (id, user_id)
);

create index if not exists mahi_ai_memory_entries_user_updated_idx
  on public.mahi_ai_memory_entries (user_id, updated_at desc)
  where deleted_at is null and is_archived = false;
create index if not exists mahi_ai_memory_entries_user_category_idx
  on public.mahi_ai_memory_entries (user_id, category)
  where deleted_at is null;

create table if not exists public.mahi_ai_memory_versions (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.mahi_ai_memory_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null check (revision >= 1),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  change_kind text not null check (change_kind in ('created','edited','archived','deleted','restored')),
  created_at timestamptz not null default now(),
  unique (entry_id, revision)
);
create index if not exists mahi_ai_memory_versions_user_entry_idx
  on public.mahi_ai_memory_versions (user_id, entry_id, revision desc);

create table if not exists public.mahi_ai_workspace_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null check (
    char_length(path) between 1 and 240
    and path !~ '(^/|(^|/)\\.\\.(/|$)|[[:cntrl:]])'
  ),
  mime_type text not null default 'text/markdown' check (char_length(mime_type) between 1 and 120),
  content text not null default '' check (octet_length(content) <= 262144),
  revision integer not null default 1 check (revision >= 1),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, path),
  unique (id, user_id)
);
create index if not exists mahi_ai_workspace_files_user_updated_idx
  on public.mahi_ai_workspace_files (user_id, updated_at desc)
  where deleted_at is null;
create index if not exists mahi_ai_workspace_files_user_path_idx
  on public.mahi_ai_workspace_files (user_id, path);

create table if not exists public.mahi_ai_workspace_file_versions (
  id bigint generated always as identity primary key,
  file_id uuid not null references public.mahi_ai_workspace_files(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null check (revision >= 1),
  path text not null,
  mime_type text not null,
  content text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (file_id, revision)
);
create index if not exists mahi_ai_workspace_file_versions_user_file_idx
  on public.mahi_ai_workspace_file_versions (user_id, file_id, revision desc);

create table if not exists public.mahi_ai_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  objective text not null default '' check (char_length(objective) <= 6000),
  status text not null default 'active'
    check (status = any (array['active','paused','completed','archived']::text[])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists mahi_ai_tasks_user_updated_idx
  on public.mahi_ai_tasks (user_id, updated_at desc);

create table if not exists public.mahi_ai_task_branches (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  parent_branch_id uuid,
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  summary text not null default '' check (char_length(summary) <= 6000),
  status text not null default 'active'
    check (status = any (array['active','paused','merged','archived']::text[])),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mahi_ai_task_branches_task_owner_fkey
    foreign key (task_id, user_id) references public.mahi_ai_tasks(id, user_id) on delete cascade,
  constraint mahi_ai_task_branches_parent_fkey
    foreign key (parent_branch_id, task_id, user_id)
    references public.mahi_ai_task_branches(id, task_id, user_id) on delete set null,
  unique (task_id, name),
  unique (id, task_id, user_id)
);
create index if not exists mahi_ai_task_branches_task_updated_idx
  on public.mahi_ai_task_branches (user_id, task_id, updated_at desc);

create table if not exists public.mahi_ai_task_branch_versions (
  id bigint generated always as identity primary key,
  branch_id uuid not null,
  task_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null check (revision >= 1),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  summary text not null default '',
  checkpoint_note text not null default '' check (char_length(checkpoint_note) <= 1000),
  created_at timestamptz not null default now(),
  constraint mahi_ai_task_branch_versions_branch_owner_fkey
    foreign key (branch_id, task_id, user_id)
    references public.mahi_ai_task_branches(id, task_id, user_id) on delete cascade,
  unique (branch_id, revision)
);
create index if not exists mahi_ai_task_branch_versions_user_branch_idx
  on public.mahi_ai_task_branch_versions (user_id, branch_id, revision desc);

create table if not exists public.mahi_ai_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  branch_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('chat_turn','checkpoint','note')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  constraint mahi_ai_task_events_branch_owner_fkey
    foreign key (branch_id, task_id, user_id)
    references public.mahi_ai_task_branches(id, task_id, user_id) on delete cascade
);
create index if not exists mahi_ai_task_events_user_branch_created_idx
  on public.mahi_ai_task_events (user_id, branch_id, created_at desc);

-- Preserve existing user memories as editable, versioned entries.
insert into public.mahi_ai_memory_entries
  (user_id, memory_key, category, title, content, source_kind, provenance, created_at, updated_at)
select
  m.user_id,
  left(m.memory_key, 120),
  case when m.category in ('profile','preference','project','goal','context','note') then m.category else 'note' end,
  left(coalesce(nullif(initcap(m.category), ''), 'Saved memory'), 120),
  left(m.memory_value, 4000),
  'legacy_import',
  jsonb_build_object('legacy_memory_key', m.memory_key, 'legacy_source_conversation_id', m.source_conversation_id),
  m.created_at,
  m.updated_at
from public.mahi_ai_user_memories m
on conflict (user_id, memory_key) do nothing;

-- Record an immutable snapshot after every memory/file/branch create or edit.
create or replace function public.mahi_ai_record_memory_version()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.mahi_ai_memory_versions (entry_id, user_id, revision, snapshot, change_kind)
    values (NEW.id, NEW.user_id, NEW.revision, to_jsonb(NEW), 'created');
  else
    insert into public.mahi_ai_memory_versions (entry_id, user_id, revision, snapshot, change_kind)
    values (
      NEW.id, NEW.user_id, NEW.revision, to_jsonb(NEW),
      case
        when OLD.deleted_at is null and NEW.deleted_at is not null then 'deleted'
        when OLD.deleted_at is not null and NEW.deleted_at is null then 'restored'
        when OLD.is_archived = false and NEW.is_archived = true then 'archived'
        else 'edited'
      end
    );
  end if;
  return NEW;
end;
$$;

create or replace function public.mahi_ai_record_workspace_file_version()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.mahi_ai_workspace_file_versions
    (file_id, user_id, revision, path, mime_type, content, deleted_at)
  values
    (NEW.id, NEW.user_id, NEW.revision, NEW.path, NEW.mime_type, NEW.content, NEW.deleted_at);
  return NEW;
end;
$$;

create or replace function public.mahi_ai_record_task_branch_version()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.mahi_ai_task_branch_versions
    (branch_id, task_id, user_id, revision, state, summary, checkpoint_note)
  values (
    NEW.id, NEW.task_id, NEW.user_id, NEW.revision, NEW.state, NEW.summary,
    case when TG_OP = 'INSERT' then 'Branch created' else 'Checkpoint updated' end
  );
  return NEW;
end;
$$;

drop trigger if exists mahi_ai_memory_entries_version_after_write on public.mahi_ai_memory_entries;
create trigger mahi_ai_memory_entries_version_after_write
  after insert or update on public.mahi_ai_memory_entries
  for each row execute function public.mahi_ai_record_memory_version();

drop trigger if exists mahi_ai_workspace_files_version_after_write on public.mahi_ai_workspace_files;
create trigger mahi_ai_workspace_files_version_after_write
  after insert or update on public.mahi_ai_workspace_files
  for each row execute function public.mahi_ai_record_workspace_file_version();

drop trigger if exists mahi_ai_task_branches_version_after_write on public.mahi_ai_task_branches;
create trigger mahi_ai_task_branches_version_after_write
  after insert or update on public.mahi_ai_task_branches
  for each row execute function public.mahi_ai_record_task_branch_version();

alter table public.mahi_ai_memory_entries enable row level security;
alter table public.mahi_ai_memory_versions enable row level security;
alter table public.mahi_ai_workspace_files enable row level security;
alter table public.mahi_ai_workspace_file_versions enable row level security;
alter table public.mahi_ai_tasks enable row level security;
alter table public.mahi_ai_task_branches enable row level security;
alter table public.mahi_ai_task_branch_versions enable row level security;
alter table public.mahi_ai_task_events enable row level security;

revoke all on public.mahi_ai_memory_entries, public.mahi_ai_memory_versions,
  public.mahi_ai_workspace_files, public.mahi_ai_workspace_file_versions,
  public.mahi_ai_tasks, public.mahi_ai_task_branches,
  public.mahi_ai_task_branch_versions, public.mahi_ai_task_events
from public, anon;

grant select, insert, update, delete on public.mahi_ai_memory_entries,
  public.mahi_ai_workspace_files, public.mahi_ai_tasks, public.mahi_ai_task_branches
to authenticated;
grant select on public.mahi_ai_memory_versions,
  public.mahi_ai_workspace_file_versions, public.mahi_ai_task_branch_versions
to authenticated;
grant select, insert on public.mahi_ai_task_events to authenticated;

grant all on public.mahi_ai_memory_entries, public.mahi_ai_memory_versions,
  public.mahi_ai_workspace_files, public.mahi_ai_workspace_file_versions,
  public.mahi_ai_tasks, public.mahi_ai_task_branches,
  public.mahi_ai_task_branch_versions, public.mahi_ai_task_events
to service_role;
grant usage, select on sequence public.mahi_ai_memory_versions_id_seq,
  public.mahi_ai_workspace_file_versions_id_seq,
  public.mahi_ai_task_branch_versions_id_seq to service_role;

drop policy if exists "Users manage their own structured memories" on public.mahi_ai_memory_entries;
create policy "Users manage their own structured memories"
  on public.mahi_ai_memory_entries for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users read their own memory history" on public.mahi_ai_memory_versions;
create policy "Users read their own memory history"
  on public.mahi_ai_memory_versions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own workspace files" on public.mahi_ai_workspace_files;
create policy "Users manage their own workspace files"
  on public.mahi_ai_workspace_files for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users read their own workspace file history" on public.mahi_ai_workspace_file_versions;
create policy "Users read their own workspace file history"
  on public.mahi_ai_workspace_file_versions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own tasks" on public.mahi_ai_tasks;
create policy "Users manage their own tasks"
  on public.mahi_ai_tasks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own task branches" on public.mahi_ai_task_branches;
create policy "Users manage their own task branches"
  on public.mahi_ai_task_branches for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users read their own task branch history" on public.mahi_ai_task_branch_versions;
create policy "Users read their own task branch history"
  on public.mahi_ai_task_branch_versions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read and append their own task events" on public.mahi_ai_task_events;
create policy "Users read and append their own task events"
  on public.mahi_ai_task_events for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users append their own task events" on public.mahi_ai_task_events;
create policy "Users append their own task events"
  on public.mahi_ai_task_events for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Context is built only from editable/versioned memory, not opaque recent-chat excerpts.
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
    select coalesce(jsonb_agg(to_jsonb(m) order by m.updated_at desc), '[]'::jsonb) as items
    from (
      select id, memory_key, category, title, content, data, tags, confidence,
             source_kind, updated_at, revision
      from public.mahi_ai_memory_entries
      where user_id = p_user_id and deleted_at is null and is_archived = false
      order by updated_at desc
      limit 40
    ) m
  )
  select jsonb_build_object(
    'enabled', s.enabled,
    'memories', case when s.enabled then sm.items else '[]'::jsonb end,
    'recent_messages', '[]'::jsonb
  )
  from memory_state s
  cross join saved_memories sm;
$$;

create or replace function public.mahi_ai_get_workspace_context(
  p_user_id uuid,
  p_query_text text default '',
  p_limit integer default 5
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with query_terms as (
    select distinct token
    from regexp_split_to_table(lower(left(coalesce(p_query_text, ''), 600)), '[^[:alnum:]]+') as token
    where char_length(token) >= 3
    limit 8
  ),
  ranked as (
    select f.id, f.path, f.mime_type, f.content, f.updated_at,
      (select count(*) from query_terms q
       where lower(f.path || ' ' || f.content) like '%' || q.token || '%') as relevance
    from public.mahi_ai_workspace_files f
    where f.user_id = p_user_id and f.deleted_at is null
  )
  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.relevance desc, r.updated_at desc),
    '[]'::jsonb
  )
  from (
    select id, path, mime_type, content, updated_at, relevance
    from ranked
    where relevance > 0 or not exists (select 1 from query_terms)
    order by relevance desc, updated_at desc
    limit least(greatest(coalesce(p_limit, 5), 1), 5)
  ) r;
$$;

create or replace function public.mahi_ai_get_task_context(
  p_user_id uuid,
  p_task_id uuid,
  p_branch_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'task', jsonb_build_object('id', t.id, 'title', t.title, 'objective', t.objective, 'status', t.status, 'updated_at', t.updated_at),
    'branch', jsonb_build_object('id', b.id, 'name', b.name, 'state', b.state, 'summary', b.summary, 'status', b.status, 'revision', b.revision),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at asc)
      from (
        select event_type, payload, created_at
        from public.mahi_ai_task_events
        where user_id = p_user_id and task_id = t.id and branch_id = b.id
        order by created_at desc
        limit 16
      ) e
    ), '[]'::jsonb)
  )
  from public.mahi_ai_tasks t
  join public.mahi_ai_task_branches b
    on b.task_id = t.id and b.user_id = t.user_id
  where t.user_id = p_user_id
    and t.id = p_task_id
    and b.id = p_branch_id
    and t.status in ('active','paused')
    and b.status in ('active','paused');
$$;

revoke all on function public.mahi_ai_get_memory_context(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.mahi_ai_get_memory_context(uuid, uuid, integer) to service_role;
revoke all on function public.mahi_ai_get_workspace_context(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.mahi_ai_get_workspace_context(uuid, text, integer) to service_role;
revoke all on function public.mahi_ai_get_task_context(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.mahi_ai_get_task_context(uuid, uuid, uuid) to service_role;
