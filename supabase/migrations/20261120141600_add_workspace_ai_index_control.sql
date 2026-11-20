ALTER TABLE public.mahi_ai_workspace_files
  ADD COLUMN IF NOT EXISTS index_for_ai boolean NOT NULL DEFAULT true;

ALTER TABLE public.mahi_ai_workspace_file_versions
  ADD COLUMN IF NOT EXISTS index_for_ai boolean NOT NULL DEFAULT true;

DROP TRIGGER IF EXISTS mahi_ai_workspace_files_version_after_write ON public.mahi_ai_workspace_files;
CREATE TRIGGER mahi_ai_workspace_files_version_after_write
  AFTER INSERT OR UPDATE ON public.mahi_ai_workspace_files
  FOR EACH ROW EXECUTE FUNCTION public.mahi_ai_record_workspace_file_version();

CREATE OR REPLACE FUNCTION public.mahi_ai_record_workspace_file_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.mahi_ai_workspace_file_versions
    (file_id, user_id, revision, path, mime_type, content, deleted_at, index_for_ai)
  VALUES
    (NEW.id, NEW.user_id, NEW.revision, NEW.path, NEW.mime_type, NEW.content, NEW.deleted_at, NEW.index_for_ai);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mahi_ai_get_workspace_context(
  p_user_id uuid,
  p_query_text text DEFAULT '',
  p_limit integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH query_terms AS (
    SELECT DISTINCT token
    FROM regexp_split_to_table(lower(left(coalesce(p_query_text, ''), 600)), '[^[:alnum:]]+') AS token
    WHERE char_length(token) >= 3
    LIMIT 8
  ),
  ranked AS (
    SELECT f.id, f.path, f.mime_type, f.content, f.updated_at,
      (SELECT count(*) FROM query_terms q
       WHERE lower(f.path || ' ' || f.content) LIKE '%' || q.token || '%') AS relevance
    FROM public.mahi_ai_workspace_files f
    WHERE f.user_id = p_user_id
      AND f.deleted_at IS NULL
      AND f.index_for_ai = true
  )
  SELECT coalesce(
    jsonb_agg(to_jsonb(r) ORDER BY r.relevance DESC, r.updated_at DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT id, path, mime_type, content, updated_at, relevance
    FROM ranked
    WHERE relevance > 0 OR NOT EXISTS (SELECT 1 FROM query_terms)
    ORDER BY relevance DESC, updated_at DESC
    LIMIT least(greatest(coalesce(p_limit, 5), 1), 5)
  ) r;
$$;
REVOKE ALL ON FUNCTION public.mahi_ai_get_workspace_context(uuid, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mahi_ai_get_workspace_context(uuid, text, integer) TO service_role;