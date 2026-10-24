const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const edge = fs.readFileSync(
  require.resolve("../supabase/functions/mahi-ai-chat/index.ts"),
  "utf8"
);

test("Gemini quota failures try alternate stable free-tier models for normal and streaming calls", () => {
  assert.ok(edge.includes("function geminiModelCandidates()"));
  assert.ok(edge.includes('return [...new Set([configured, "gemini-3.8-flash", "gemini-3.6-flash"])]'));
  assert.ok(edge.includes("function canRetryGeminiModel(reason: string): boolean"));
  assert.ok(edge.includes('logStructured("warn", "gemini_model_fallback"'));
  assert.ok(edge.includes('const fallbackUrl = "https://generativelanguage.googleapis.com/v1beta/models/"'));
  assert.ok(edge.includes("if (useGemini && canRetryGeminiModel(reason))"));
  assert.ok(edge.includes("The runtime does not currently record which Gemini model succeeded"));
});

test("Gemini model retries do not mask invalid credentials and daily limits are cooled down", () => {
  assert.ok(edge.includes("invalid api key|unauthorized|permission denied|access denied"));
  assert.ok(edge.includes("free-models-per-day|tokens? per day|daily quota|per-day quota|daily limit"));
  assert.ok(edge.includes("return 6 * 60 * 60_000"));
  assert.ok(edge.includes("return 90_000"));
});

test("configured provider keys activate fallback routes without extra enable flags", () => {
  for (const providerLine of [
    'if (name === "cloudflare") return configuredSecret(["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY", "Cloudflare"]);',
    'if (name === "shannon") return configuredSecret(["SHANNON_API_KEY", "SHANNONAI_API_KEY", "SHANNON_AI_API_KEY", "Shannon AI"]);',
    'if (name === "deepseek") return configuredSecret(["DEEPSEEK_API_KEY", "DeepSeek"]);',
    'if (name === "openai") return configuredSecret(["OPENAI_API_KEY"]);',
    'if (name === "anthropic") return configuredSecret(["ANTHROPIC_API_KEY"]);'
  ]) assert.ok(edge.includes(providerLine), "missing configured fallback route: " + providerLine);
  assert.ok(edge.includes('const fallback = ["gemini", "groq", "openrouter", "cloudflare", "shannon"'));
});

test("ordinary chat failover is bounded for speed while research and attachments get more time", () => {
  assert.ok(edge.includes('const totalProviderBudgetMs = (task === "web_research" || task === "code_execution" || hasInlineAttachments) ? 105000 : 60000;'));
  assert.ok(edge.includes("const maxAttemptMs = taskNeedsLongToolExecution ? 24000 : index === 0 ? 11000 : 8500;"));
  assert.ok(edge.includes("const providerBudget = Math.max(5000, Math.min(maxAttemptMs, remaining - 6000));"));
});
