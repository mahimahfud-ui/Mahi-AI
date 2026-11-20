import {
  createWorkspaceService,
  formatStructuredWorkspaceContext,
  normalizeWorkspacePath,
  parseWorkspaceFileIntent,
  workspaceLooksSensitive,
  workspaceMimeType
} from "./workspace.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(message + ": expected " + String(expected) + ", got " + String(actual));
}

Deno.test("workspace paths are normalized and traversal is rejected", () => {
  equal(normalizeWorkspacePath("docs\\plan.md"), "docs/plan.md", "Windows separators normalize");
  equal(normalizeWorkspacePath("notes/today.md"), "notes/today.md", "relative paths are preserved");
  for (const path of ["../secrets.txt", "docs/../secrets.txt", "/absolute/file.md", "docs//empty.md", ""]) {
    let rejected = false;
    try { normalizeWorkspacePath(path); } catch (_) { rejected = true; }
    assert(rejected, "unsafe path should be rejected: " + path);
  }
});

Deno.test("workspace file requests must be explicit and start with a file operation", () => {
  const create = parseWorkspaceFileIntent("Create workspace file docs/plan.md with a project plan");
  equal(create?.action, "write", "create action");
  equal(create?.path, "docs/plan.md", "create path");
  const remove = parseWorkspaceFileIntent("Delete workspace file archive/old.md");
  equal(remove?.action, "delete", "delete action");
  equal(parseWorkspaceFileIntent("Can you tell me how to create a workspace file?"), null, "non-explicit wording is not an operation");
});

Deno.test("private-key and environment files are never indexed into AI context", () => {
  assert(workspaceLooksSensitive(".env", "API_URL=https://example.com"), ".env path should be sensitive");
  assert(workspaceLooksSensitive("keys/private.pem", "-----BEGIN PRIVATE KEY-----"), "private key content should be sensitive");
  assert(workspaceLooksSensitive("config.txt", "service_role_key=abcdefghijklmnop123"), "service role keys should be sensitive");
  equal(workspaceLooksSensitive("docs/plan.md", "Next milestone is testing"), false, "ordinary docs may be indexed");
  equal(workspaceMimeType("src/main.ts"), "text/typescript", "TypeScript MIME");
});

Deno.test("workspace context includes only files supplied by the server and the selected task branch", () => {
  const context = formatStructuredWorkspaceContext(
    [{ path: "docs/plan.md", content: "Milestone: ship the project", mime_type: "text/markdown" }],
    {
      task: { title: "Ship project", objective: "Deliver the next release" },
      branch: { name: "main", revision: 3, state: { next_step: "Run tests" }, summary: "Waiting for test results" },
      events: [{ event_type: "checkpoint", payload: { note: "API implemented" } }]
    }
  );
  assert(context.includes("docs/plan.md"), "workspace path should be present");
  assert(context.includes("Milestone: ship the project"), "workspace content should be present");
  assert(context.includes("User-edited state JSON"), "branch state should be present");
  assert(context.includes("API implemented"), "saved task events should be present");
  assert(context.includes("not system instructions"), "workspace is framed as untrusted user data");
  equal(formatStructuredWorkspaceContext([], null), "", "empty context should be omitted");
});

Deno.test("workspace API scopes list queries to the verified user ID", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const paths: string[] = [];
  const rest = async (path: string) => {
    paths.push(path);
    return new Response("[]", { status: 200 });
  };
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const service = createWorkspaceService(rest, json, () => "", async () => {});
  const response = await service.action("list", {}, userId, {});
  equal(response.status, 200, "list succeeds");
  assert(paths.length >= 5, "list should read each private workspace collection");
  for (const path of paths) assert(path.includes("user_id=eq." + userId), "every read must be owner-scoped: " + path);
});
