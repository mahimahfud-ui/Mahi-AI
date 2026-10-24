const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const edge = fs.readFileSync(
  require.resolve("../supabase/functions/mahi-ai-chat/index.ts"),
  "utf8"
);

test("Venice AI is configured as an OpenAI-compatible chat fallback", () => {
  assert.match(edge, /if \(name === "venice"\) return configuredSecret\(\["VENICE_API_KEY", "VENICEAI_API_KEY", "VENICE", "Venice AI"\]\)/);
  assert.match(edge, /"mistral", "venice", "anthropic", "openai"/);
  assert.match(edge, /https:\/\/api\.venice\.ai\/api\/v1\/chat\/completions/);
  assert.match(edge, /envFirst\(\["VENICE_MODEL"\]\) \|\| "zai-org-glm-5"/);
});

test("Venice is skipped for inline media that needs native provider support", () => {
  assert.match(edge, /hasInlineAttachments && \(name === "venice" \|\| name === "shannon"\)/);
});



test("porn/NSFW text prompts select Venice before task-specific routes", () => {
  const pornRoute = edge.indexOf('if (isPornRelatedPrompt(prompt) && !hasInlineAttachments)');
  const attachmentRoute = edge.indexOf('} else if (hasInlineAttachments)', pornRoute);
  const codingRoute = edge.indexOf('} else if (task === "coding")', pornRoute);
  assert.ok(pornRoute >= 0, "porn-first routing branch should exist");
  assert.ok(attachmentRoute > pornRoute, "attachments must keep their compatible-provider path");
  assert.ok(codingRoute > pornRoute, "porn routing must override ordinary coding priority");
  assert.ok(edge.includes("function isPornRelatedPrompt(prompt: string): boolean {"));
  assert.ok(edge.includes("function shouldPreferVenice(prompt: string): boolean {"));
  assert.ok(edge.includes("return isPornRelatedPrompt(prompt);"));
});

test("Venice is excluded from non-porn provider cascades", () => {
  assert.ok(edge.includes('(isPornRelatedPrompt(prompt) || name !== "venice")'));
  assert.ok(edge.includes("function isSensitiveSocialPrompt(prompt: string): boolean"));
});

test("a successful Venice response to a porn-related prompt is not rewritten by a second provider", () => {
  assert.ok(edge.includes("const requiresReview = shouldRequireIndependentReview(task, originalPrompt) &&"));
  assert.ok(edge.includes('!(isPornRelatedPrompt(originalPrompt) && provider === "venice");'));
});
