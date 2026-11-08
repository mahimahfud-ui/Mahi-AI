const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const edge = fs.readFileSync(
  require.resolve("../supabase/functions/mahi-ai-chat/index.ts"),
  "utf8"
);

test("Venice AI is a configured OpenAI-compatible chat provider", () => {
  assert.match(edge, /if \(name === "venice"\) return configuredSecret\(\["VENICE_API_KEY", "VENICEAI_API_KEY", "VENICE", "Venice AI"\]\)/);
  assert.match(edge, /https:\/\/api\.venice\.ai\/api\/v1\/chat\/completions/);
  assert.match(edge, /envFirst\(\["VENICE_MODEL"\]\) \|\| "zai-org-glm-5"/);
});

test("adult text requests put OpenRouter and Venice first in the preferred route", () => {
  const adultRoute = edge.indexOf('if (isPornRelatedPrompt(prompt) && !hasInlineAttachments)');
  const attachmentRoute = edge.indexOf('} else if (hasInlineAttachments)', adultRoute);
  const codingRoute = edge.indexOf('} else if (task === "coding")', adultRoute);

  assert.ok(adultRoute >= 0, "adult-content routing branch should exist");
  assert.ok(attachmentRoute > adultRoute, "inline attachments must use their separate compatible route");
  assert.ok(codingRoute > adultRoute, "adult-content routing must precede ordinary coding priority");
  assert.ok(edge.includes('preferred = ["openrouter", "venice", "groq", "mistral", "deepseek", "gemini", "shannon", "nvidia", "cloudflare", "anthropic", "openai"];'));
  assert.ok(edge.includes('const fallback = isPornRelatedPrompt(prompt) && !hasInlineAttachments'));
  assert.ok(edge.includes("function isPornRelatedPrompt(prompt: string): boolean {"));
  assert.ok(edge.includes("function shouldPreferVenice(prompt: string): boolean {"));
  assert.ok(edge.includes("return isPornRelatedPrompt(prompt);"));
});

test("provider routing uses configured keys and excludes text-only providers from inline attachments", () => {
  assert.ok(edge.includes("const configured = [...new Set([...preferred, ...fallback])]"));
  assert.ok(edge.includes("providerIsConfigured(name, task) &&"));
  assert.ok(edge.includes('!(hasInlineAttachments && (name === "venice" || name === "shannon"))'));
  assert.ok(edge.includes('preferred = ["gemini", "openrouter", "shannon", "deepseek", "groq", "nvidia", "cloudflare", "mistral", "venice", "anthropic", "openai"];'));
  assert.ok(edge.includes("if (!hasInlineImages) preferred ="));
  assert.ok(edge.includes("function isSensitiveSocialPrompt(prompt: string): boolean"));
});

test("independent answer review is opt-in and adult-content requests bypass that review pass", () => {
  assert.ok(edge.includes('if (envFirst(["MAHI_AI_ENABLE_REVIEW"]).toLowerCase() !== "true") return false;'));
  assert.ok(edge.includes("const requiresReview = shouldRequireIndependentReview(task, originalPrompt) &&"));
  assert.ok(edge.includes("!isPornRelatedPrompt(originalPrompt);"));
});

test("the default OpenRouter route is free and request reservation is bounded and idempotent", () => {
  assert.ok(edge.includes('return "openrouter/free";'));
  assert.ok(edge.includes('const general = envFirst(["OPENROUTER_MODEL"]);'));
  assert.ok(edge.includes("function isAllowedOrigin(origin: string): boolean"));
  assert.ok(edge.includes("const MAX_BODY_BYTES = 8_000_000;"));
  assert.ok(edge.includes("const UNLIMITED_PER_USER_REQUEST_LIMIT = 2_147_483_647;"));
  assert.ok(edge.includes("async function reserveUsageRequest(userId: string, requestId: string): Promise<UsageReservation>"));
  assert.ok(edge.includes('rest("rpc/mahi_ai_reserve_request"'));
});
