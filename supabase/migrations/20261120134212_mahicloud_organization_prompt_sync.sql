-- MahiCloud chat organization and cross-device Prompt Library sync.
-- Conversation ownership remains enforced by the existing conversation RLS policies.
ALTER TABLE public.mahi_ai_conversations
  ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mahi_ai_conversations_folder_length'
      AND conrelid = 'public.mahi_ai_conversations'::regclass
  ) THEN
    ALTER TABLE public.mahi_ai_conversations
      ADD CONSTRAINT mahi_ai_conversations_folder_length
      CHECK (char_length(folder) <= 40);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mahi_ai_conversations_tags_count'
      AND conrelid = 'public.mahi_ai_conversations'::regclass
  ) THEN
    ALTER TABLE public.mahi_ai_conversations
      ADD CONSTRAINT mahi_ai_conversations_tags_count
      CHECK (cardinality(tags) <= 8);
  END IF;

END
$$;

CREATE INDEX IF NOT EXISTS mahi_ai_conversations_user_folder_updated_idx
  ON public.mahi_ai_conversations (user_id, folder, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.mahi_ai_prompts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 8000),
  category text NOT NULL DEFAULT 'General'
    CHECK (category IN ('General', 'Study', 'Coding', 'Research', 'Writing', 'Planning')),
  favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.mahi_ai_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own MahiCloud prompts"
  ON public.mahi_ai_prompts;
CREATE POLICY "Permanent users can manage their own MahiCloud prompts"
  ON public.mahi_ai_prompts
  FOR ALL TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND COALESCE(((SELECT auth.jwt())->>'is_anonymous')::boolean, true) = false
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND COALESCE(((SELECT auth.jwt())->>'is_anonymous')::boolean, true) = false
  );

-- Newly-created tables are not granted to browser roles automatically.
-- Only authenticated users get the Data API privileges; RLS scopes every row.
REVOKE ALL ON TABLE public.mahi_ai_prompts FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.mahi_ai_prompts TO authenticated;
GRANT ALL ON TABLE public.mahi_ai_prompts TO service_role;

CREATE INDEX IF NOT EXISTS mahi_ai_prompts_user_updated_idx
  ON public.mahi_ai_prompts (user_id, updated_at DESC);

NOTIFY pgrst, 'reload schema';
