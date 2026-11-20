-- Bound version/event retention so long-lived workspaces do not grow without limit.
-- Keep the newest 20 revisions for each file, memory and task branch, plus 30 task events per branch.

INSERT INTO public.mahi_ai_memory_versions
  (entry_id, user_id, revision, snapshot, change_kind, created_at)
SELECT
  m.id, m.user_id, m.revision, to_jsonb(m), 'created', m.created_at
FROM public.mahi_ai_memory_entries m
WHERE m.source_kind = 'legacy_import'
  AND NOT EXISTS (
    SELECT 1 FROM public.mahi_ai_memory_versions v WHERE v.entry_id = m.id
  )
ON CONFLICT (entry_id, revision) DO NOTHING;

CREATE OR REPLACE FUNCTION public.mahi_ai_record_memory_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.mahi_ai_memory_versions (entry_id, user_id, revision, snapshot, change_kind)
  VALUES (
    NEW.id, NEW.user_id, NEW.revision, to_jsonb(NEW),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'created'
      WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'deleted'
      WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restored'
      WHEN OLD.is_archived = false AND NEW.is_archived = true THEN 'archived'
      ELSE 'edited'
    END
  );
  DELETE FROM public.mahi_ai_memory_versions
  WHERE entry_id = NEW.id AND revision <= NEW.revision - 20;
  RETURN NEW;
END;
$$;

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
  DELETE FROM public.mahi_ai_workspace_file_versions
  WHERE file_id = NEW.id AND revision <= NEW.revision - 20;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mahi_ai_record_task_branch_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.mahi_ai_task_branch_versions
    (branch_id, task_id, user_id, revision, state, summary, checkpoint_note)
  VALUES (
    NEW.id, NEW.task_id, NEW.user_id, NEW.revision, NEW.state, NEW.summary,
    CASE WHEN TG_OP = 'INSERT' THEN 'Branch created' ELSE 'Checkpoint updated' END
  );
  DELETE FROM public.mahi_ai_task_branch_versions
  WHERE branch_id = NEW.id AND revision <= NEW.revision - 20;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mahi_ai_trim_task_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.mahi_ai_task_events e
  WHERE e.id IN (
    SELECT id
    FROM public.mahi_ai_task_events
    WHERE user_id = NEW.user_id
      AND task_id = NEW.task_id
      AND branch_id = NEW.branch_id
    ORDER BY created_at DESC, id DESC
    OFFSET 30
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mahi_ai_task_events_trim_after_insert ON public.mahi_ai_task_events;
CREATE TRIGGER mahi_ai_task_events_trim_after_insert
  AFTER INSERT ON public.mahi_ai_task_events
  FOR EACH ROW EXECUTE FUNCTION public.mahi_ai_trim_task_events();
