-- All browser CRUD is mediated by the authenticated Edge Function.
-- Authenticated clients may read only rows permitted by owner-scoped RLS.
-- Mutations are performed by the Edge Function using service_role after verifying
-- the caller and applying an explicit user_id filter on every query.
REVOKE ALL ON TABLE
  public.mahi_ai_memory_entries,
  public.mahi_ai_memory_versions,
  public.mahi_ai_workspace_files,
  public.mahi_ai_workspace_file_versions,
  public.mahi_ai_tasks,
  public.mahi_ai_task_branches,
  public.mahi_ai_task_branch_versions,
  public.mahi_ai_task_events
FROM authenticated;

GRANT SELECT ON TABLE
  public.mahi_ai_memory_entries,
  public.mahi_ai_memory_versions,
  public.mahi_ai_workspace_files,
  public.mahi_ai_workspace_file_versions,
  public.mahi_ai_tasks,
  public.mahi_ai_task_branches,
  public.mahi_ai_task_branch_versions,
  public.mahi_ai_task_events
TO authenticated;

GRANT ALL ON TABLE
  public.mahi_ai_memory_entries,
  public.mahi_ai_memory_versions,
  public.mahi_ai_workspace_files,
  public.mahi_ai_workspace_file_versions,
  public.mahi_ai_tasks,
  public.mahi_ai_task_branches,
  public.mahi_ai_task_branch_versions,
  public.mahi_ai_task_events
TO service_role;
