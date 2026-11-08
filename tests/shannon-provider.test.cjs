const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const edge = fs.readFileSync(
  require.resolve("../supabase/functions/mahi-ai-chat/index.ts"),
  "utf8"
);
const readme = fs.readFileSync(require.resolve("../README.md"), "utf8");

test("Shannon is enabled by its configured key and uses the official OpenAI-compatible endpoint", () => {
  assert.match(edge, /name === "shannon"\) return configuredSecret\(\["SHANNON_API_KEY", "SHANNONAI_API_KEY", "SHANNON_AI_API_KEY", "Shannon AI"\]\)/);
  assert.match(edge, /SHANNON_API_KEY/);
  assert.match(edge, /https:\/\/api\.shannon-ai\.com\/v1\/chat\/completions/);
  assert.match(edge, /envFirst\(\["SHANNON_MODEL"\]\) \|\| "shannon-3"/);
  assert.match(edge, /provider: name/);
});

test("text-only providers are excluded from inline media fallback routes", () => {
  assert.match(edge, /preferred = \["gemini", "openrouter", "shannon", "deepseek", "groq"/);
  assert.match(edge, /\.filter\(\(name\) => providerIsConfigured\(name, task\) &&\s*!\(hasInlineAttachments && \(name === "venice" \|\| name === "shannon"\)\)\)/);
  assert.match(edge, /const fallback = isPornRelatedPrompt\(prompt\) && !hasInlineAttachments/);
});

test("Shannon documentation covers opt-in, pricing, and text-only support", () => {
  assert.match(readme, /SHANNON_API_KEY/);
  assert.match(readme, /configured key enables Shannon as a later fallback/);
  assert.match(readme, /Shannon usage may be billed, so check pricing and account balance first/);
  assert.match(readme, /current integration is text-only/);
  assert.match(readme, /attachment requests continue through other eligible providers/);
});
