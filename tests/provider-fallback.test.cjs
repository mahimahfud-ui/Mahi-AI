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
});

test("Gemini model retries do not mask invalid credentials and daily limits are cooled down", () => {
  assert.ok(edge.includes("invalid api key|unauthorized|permission denied|access denied"));
  assert.ok(edge.includes("free-models-per-day|tokens? per day|daily quota|per-day quota|daily limit"));
  assert.ok(edge.includes("return 6 * 60 * 60_000"));
  assert.ok(edge.includes("return 90_000"));
});
