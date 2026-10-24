const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const edge = fs.readFileSync(
  require.resolve("../supabase/functions/mahi-ai-chat/index.ts"),
  "utf8"
);
const readme = fs.readFileSync(require.resolve("../README.md"), "utf8");

test("Shannon is opt-in and uses the official OpenAI-compatible endpoint", () => {
  assert.match(edge, /name === "shannon"\) return flagEnabled\("ENABLE_SHANNON_FALLBACK"\)/);
  assert.match(edge, /SHANNON_API_KEY/);
  assert.match(edge, /https:\/\/api\.shannon-ai\.com\/v1\/chat\/completions/);
  assert.match(edge, /envFirst\(\["SHANNON_MODEL"\]\) \|\| "shannon-3"/);
  assert.match(edge, /provider: name/);
});

test("Shannon participates in automatic selection and provider failover", () => {
  assert.match(edge, /preferred = \["groq", "gemini", "openrouter", "shannon"/);
  assert.match(edge, /const fallback = \["gemini", "groq", "openrouter", "shannon"/);
  assert.match(edge, /if \(shouldPreferShannon\(prompt\) && !hasInlineAttachments\)/);
  assert.match(edge, /name === "shannon" && !shouldPreferShannon\(prompt\)/);
  assert.match(edge, /name === "shannon"\) \{/);
});

test("Shannon configuration docs warn about billing and server-side secrets", () => {
  assert.match(readme, /SHANNON_API_KEY/);
  assert.match(readme, /ENABLE_SHANNON_FALLBACK=true/);
  assert.match(readme, /checking Shannon's pricing and account balance/);
  assert.match(readme, /current integration is text-only/);
});
