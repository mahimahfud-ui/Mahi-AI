-- Remove Supabase default broad table grants, then grant only the operations needed.
REVOKE ALL ON TABLE
  public.mahi_ai_memory_entries,
  public.mahi_ai_memory_versions,
  public.mahi_ai_workspace_files,
  public.mahi_ai_workspace_file_versions,
  public.mahi_ai_tasks,
  public.mahi_ai_task_branches,
  public.mahi_ai_task_branch_versions,
  public.mahi_ai_task_events
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.mahi_ai_memory_entries,
  public.mahi_ai_workspace_files,
  public.mahi_ai_tasks,
  public.mahi_ai_task_branches
TO authenticated;

GRANT SELECT ON TABLE
  public.mahi_ai_memory_versions,
  public.mahi_ai_workspace_file_versions,
  public.mahi_ai_task_branch_versions
TO authenticated;

GRANT SELECT, INSERT ON TABLE public.mahi_ai_task_events TO authenticated;

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

GRANT USAGE, SELECT ON SEQUENCE
  public.mahi_ai_memory_versions_id_seq,
  public.mahi_ai_workspace_file_versions_id_seq,
  public.mahi_ai_task_branch_versions_id_seq
TO service_role;
