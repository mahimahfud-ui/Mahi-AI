create table if not exists public.mahi_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mahi_ai_conversations_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint mahi_ai_conversations_id_user_unique unique (id, user_id)
);

create table if not exists public.mahi_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 60000),
  created_at timestamptz not null default now(),
  constraint mahi_ai_messages_conversation_owner_fkey
    foreign key (conversation_id, user_id)
    references public.mahi_ai_conversations(id, user_id)
    on delete cascade
);

create table if not exists public.mahi_ai_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  provider text,
  task_type text,
  success boolean not null default false,
  error_code text
);

create index if not exists mahi_ai_conversations_user_updated_idx
  on public.mahi_ai_conversations (user_id, updated_at desc);
create index if not exists mahi_ai_messages_conversation_created_idx
  on public.mahi_ai_messages (conversation_id, created_at);
create index if not exists mahi_ai_usage_user_created_idx
  on public.mahi_ai_usage_events (user_id, created_at desc);

alter table public.mahi_ai_conversations enable row level security;
alter table public.mahi_ai_messages enable row level security;
alter table public.mahi_ai_usage_events enable row level security;

grant select, insert, update, delete on public.mahi_ai_conversations to authenticated;
grant select on public.mahi_ai_messages to authenticated;
revoke all on public.mahi_ai_usage_events from anon, authenticated;

drop policy if exists "Users can read their Mahi AI conversations" on public.mahi_ai_conversations;
create policy "Users can read their Mahi AI conversations"
  on public.mahi_ai_conversations for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their Mahi AI conversations" on public.mahi_ai_conversations;
create policy "Users can create their Mahi AI conversations"
  on public.mahi_ai_conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their Mahi AI conversations" on public.mahi_ai_conversations;
create policy "Users can update their Mahi AI conversations"
  on public.mahi_ai_conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their Mahi AI conversations" on public.mahi_ai_conversations;
create policy "Users can delete their Mahi AI conversations"
  on public.mahi_ai_conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their Mahi AI messages" on public.mahi_ai_messages;
create policy "Users can read their Mahi AI messages"
  on public.mahi_ai_messages for select to authenticated
  using ((select auth.uid()) = user_id);

grant all on public.mahi_ai_conversations, public.mahi_ai_messages, public.mahi_ai_usage_events to service_role;
grant usage, select on sequence public.mahi_ai_usage_events_id_seq to service_role;