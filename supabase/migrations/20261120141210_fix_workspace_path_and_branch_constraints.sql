ALTER TABLE public.mahi_ai_task_branches
  DROP CONSTRAINT IF EXISTS mahi_ai_task_branches_parent_fkey;
ALTER TABLE public.mahi_ai_task_branches
  ADD CONSTRAINT mahi_ai_task_branches_parent_fkey
  FOREIGN KEY (parent_branch_id, task_id, user_id)
  REFERENCES public.mahi_ai_task_branches(id, task_id, user_id);

ALTER TABLE public.mahi_ai_workspace_files
  DROP CONSTRAINT IF EXISTS mahi_ai_workspace_files_path_check;
ALTER TABLE public.mahi_ai_workspace_files
  ADD CONSTRAINT mahi_ai_workspace_files_path_check
  CHECK (
    char_length(path) between 1 and 240
    and path !~ '(^/|(^|/)\.\.(/|$)|[[:cntrl:]])'
  );