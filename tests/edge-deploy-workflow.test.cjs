const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const workflow = fs.readFileSync(
  require.resolve("../.github/workflows/deploy-mahi-ai-edge.yml"),
  "utf8"
);

test("production Edge Function deployments are main-only and always check out main", () => {
  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(workflow, /if:\s*github\.ref\s*==\s*'refs\/heads\/main'/);
  assert.match(workflow, /uses:\s*actions\/checkout@v4[\s\S]*?with:\s*\n\s*ref:\s*main/);
});

test("production deployments are serialized and use read-only GitHub permissions", () => {
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /concurrency:[\s\S]*?group:\s*mahi-ai-chat-production-deploy/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
});

test("Supabase CLI is pinned and hosted function deployments use noninteractive consent", () => {
  assert.match(workflow, /version:\s*3\.2\.0/);
  assert.doesNotMatch(workflow, /version:\s*latest/i);
  assert.match(workflow, /supabase functions deploy mahi-ai-chat --project-ref [a-z0-9]+ --yes/);
});

test("missing Supabase credentials fail closed instead of reporting a false deployment success", () => {
  assert.match(workflow, /secrets\.SUPABASE_ACCESS_TOKEN/);
  assert.match(workflow, /\[ -z "\$\{SUPABASE_ACCESS_TOKEN:\-\}" \]/);
  assert.match(workflow, /Missing Supabase deploy secret/);
  assert.match(workflow, /exit 1/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});
