const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const ui = fs.readFileSync(require.resolve("../public/workspace.js"), "utf8");
const css = fs.readFileSync(require.resolve("../public/workspace.css"), "utf8");
const edge = fs.readFileSync(require.resolve("../supabase/functions/mahi-ai-chat/index.ts"), "utf8");
const workspace = fs.readFileSync(require.resolve("../supabase/functions/mahi-ai-chat/workspace.ts"), "utf8");
const migration = fs.readFileSync(require.resolve("../supabase/migrations/20261120141108_mahicloud_persistent_workspace_memory_tasks.sql"), "utf8");
const controlMigration = fs.readFileSync(require.resolve("../supabase/migrations/20261120141320_add_workspace_ai_index_control.sql"), "utf8");
const retentionMigration = fs.readFileSync(require.resolve("../supabase/migrations/20261120143023_workspace_history_retention_limits.sql"), "utf8");
const permissionsMigration = fs.readFileSync(require.resolve("../supabase/migrations/20261120143247_workspace_least_privilege_grants.sql"), "utf8");
const apiOnlyMigration = fs.readFileSync(require.resolve("../supabase/migrations/20261120143607_workspace_api_only_mutations.sql"), "utf8");
const relevanceMigration = fs.readFileSync(require.resolve("../supabase/migrations/20261120143800_require_relevance_for_workspace_context.sql"), "utf8");

test("MahiCloud exposes a persistent workspace from the sidebar and loads the editor assets", () => {
  assert.match(html, /id="openWorkspace"/);
  assert.match(html, /workspace\.css/);
  assert.match(html, /workspace\.js/);
  assert.match(html, /MahiWorkspace\?\.init/);
  assert.match(ui, /window\.MahiWorkspace = \{ init, open, close, setUserId, getActiveTask \}/);
  assert.match(css, /\.workspace-dialog/);
});

test("workspace files are owner-scoped, versioned, editable and can be excluded from AI context", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.mahi_ai_workspace_files/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.mahi_ai_workspace_file_versions/);
  assert.match(migration, /Users manage their own workspace files/);
  assert.match(migration, /Users read their own workspace file history/);
  assert.match(controlMigration, /index_for_ai boolean NOT NULL DEFAULT true/);
  assert.match(workspace, /function saveFile/);
  assert.match(workspace, /function deleteFile/);
  assert.match(workspace, /file_versions/);
  assert.match(workspace, /file_restore/);
  assert.match(ui, /Allow MahiCloud to use this file in relevant chats/);
  assert.match(ui, /Version history/);
});

test("structured memories have edit/delete/archive/version/restore controls and replace opaque chat excerpts", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.mahi_ai_memory_entries/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.mahi_ai_memory_versions/);
  assert.match(migration, /Users manage their own structured memories/);
  assert.match(edge, /MAHICLOUD STRUCTURED MEMORY/);
  assert.match(edge, /recent_messages: \[\]/);
  assert.match(edge, /Only claim that something is remembered when a matching fact appears below/);
  assert.match(ui, /memory_versions/);
  assert.match(ui, /memory_restore/);
  assert.match(ui, /memory_archive/);
  assert.match(ui, /memory_delete/);
});

test("task continuity supports branches, checkpoints, event history and selected-task context injection", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.mahi_ai_tasks/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.mahi_ai_task_branches/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.mahi_ai_task_branch_versions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.mahi_ai_task_events/);
  assert.match(workspace, /task_branch_create/);
  assert.match(workspace, /task_checkpoint/);
  assert.match(workspace, /task_branch_restore/);
  assert.match(ui, /Fork branch/);
  assert.match(ui, /Checkpoint now/);
  assert.match(edge, /workspaceTaskId/);
  assert.match(edge, /workspaceService\.saveChatEvent/);
  assert.match(ui, /workspace_task_id: selected\.task_id/);
  assert.match(ui, /workspace_branch_id: selected\.branch_id/);
  assert.match(html, /workspace_branch_id/);
});

test("task and branch quotas can be managed by archiving without trapping the user", () => {
  assert.match(workspace, /Task limit reached \(25 active tasks\)/);
  assert.match(workspace, /Branch limit reached \(5 branches per task\)/);
  assert.match(workspace, /task_branch_update/);
  assert.match(ui, /Archive task/);
  assert.match(ui, /Restore task/);
  assert.match(ui, /Archive branch/);
  assert.match(ui, /Restore branch/);
  assert.match(ui, /Use in chats/);
});

test("workspace history retention and database grants are explicitly bounded", () => {
  assert.match(retentionMigration, /revision <= NEW\.revision - 20/);
  assert.match(retentionMigration, /OFFSET 30/);
  assert.match(permissionsMigration, /REVOKE ALL ON TABLE/);
  assert.match(permissionsMigration, /GRANT SELECT ON TABLE[\s\S]*mahi_ai_memory_versions/);
  assert.match(permissionsMigration, /GRANT SELECT, INSERT ON TABLE public\.mahi_ai_task_events/);
  assert.match(permissionsMigration, /FROM PUBLIC, anon, authenticated/);
  assert.match(apiOnlyMigration, /REVOKE ALL ON TABLE[\s\S]*FROM authenticated/);
  assert.match(apiOnlyMigration, /GRANT SELECT ON TABLE[\s\S]*TO authenticated/);
});

test("AI workspace context never falls back to unrelated recent files", () => {
  assert.match(relevanceMigration, /WHERE relevance > 0/);
  assert.doesNotMatch(relevanceMigration, /OR NOT EXISTS/);
  assert.match(edge, /AI access is disabled for/);
  assert.match(edge, /I did not read or overwrite it/);
});

test("workspace AI file writes require explicit instructions and preserve account ownership", () => {
  assert.match(workspace, /parseWorkspaceFileIntent/);
  assert.match(workspace, /WORKSPACE_FILE_BYTES/);
  assert.match(workspace, /workspaceLooksSensitive/);
  assert.match(edge, /workspace_action/);
  assert.match(edge, /workspaceAccess\.blockedUsers/);
  assert.match(edge, /workspaceService\.saveFile/);
  assert.match(edge, /workspaceService\.loadWorkspaceKnowledge/);
});
