const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const edge = fs.readFileSync(
  require.resolve("../supabase/functions/mahi-ai-chat/index.ts"),
  "utf8"
);

test("chat shows Thinking before session setup and ignores backend status text", () => {
  const sendStart = app.indexOf("async function sendMessage(text, options) {");
  const sendEnd = app.indexOf("\n  // Public API Library", sendStart);
  const send = app.slice(sendStart, sendEnd);
  assert.ok(sendStart >= 0 && sendEnd > sendStart, "sendMessage must exist");
  const thinkingIndex = send.indexOf('addMessage("assistant", "", { typing: true, messageIndex: currentMessages.length })');
  const sessionIndex = send.indexOf("if (!session) await ensureSession()");
  assert.ok(thinkingIndex >= 0 && sessionIndex > thinkingIndex,
    "Thinking should render before session initialization");
  assert.ok(app.includes('<span class="thinking-label">Thinking</span>'),
    "typing message must display the Thinking label");
  assert.doesNotMatch(app, /payload\.type === "status" && typeof payload\.message/);
  assert.match(app, /payload\.type === "reset"/);
});

test("Edge Function streams tokens as they arrive and can reset a rejected or corrected draft", () => {
  const start = edge.indexOf("async function streamChatResponse(");
  const end = edge.indexOf("\nDeno.serve", start);
  const stream = edge.slice(start, end);
  assert.ok(start >= 0 && end > start, "streamChatResponse must exist");
  const loop = stream.indexOf("while (!cancelled)");
  const buffer = stream.indexOf("completeText += next.value;");
  const delta = stream.indexOf('sseEvent(controller, encoder, { type: "delta", text: next.value });');
  const review = stream.indexOf("const review: { answer: string;");
  const accepted = stream.indexOf("chosen = { provider, text: review.answer, reviewer: review.reviewer };");
  const resetRejected = stream.indexOf('sseEvent(controller, encoder, { type: "reset" });', accepted);
  assert.ok(loop >= 0 && buffer > loop, "candidate answer must be read from the provider stream");
  assert.ok(delta > buffer && delta < review, "users should see answer tokens before quality review finishes");
  assert.ok(review > delta && accepted > review, "high-impact answers still receive an independent review");
  assert.ok(stream.includes("if (liveStreamText.trim() !== finalAnswer)"), "a corrected answer replaces only the visible draft");
  assert.ok(stream.includes("if (attemptStreamed) {") && resetRejected > accepted,
    "failed or rejected partial drafts must be cleared before fallback");
  assert.ok(edge.includes("function shouldRequireIndependentReview("), "fast-path routing policy must exist");
  assert.ok(edge.includes('["coding", "reasoning", "web_research", "code_execution"]'));
  assert.ok(edge.includes("provider_answer_rejected"));
  assert.ok(edge.includes("provider_answer_accepted"));
  assert.ok(edge.includes("allProvidersFailedMessage(displayUserText, failures)"));
});

test("simple low-risk chats skip the second model call while high-impact requests keep review", () => {
  const gateStart = edge.indexOf("function shouldRequireIndependentReview(");
  const gateEnd = edge.indexOf("async function independentlyReviewAnswer(", gateStart);
  const gate = edge.slice(gateStart, gateEnd);
  assert.ok(gateStart >= 0 && gateEnd > gateStart);
  assert.match(gate, /coding|reasoning|web_research|code_execution/);
  assert.match(gate, /medical|health|legal advice|investment|self-harm/);
  assert.match(edge, /answer: candidateText, reviewer: null, verdict: "keep"/);
});

test("a delivered reply survives a conversation-history refresh error", () => {
  const sendStart = app.indexOf("async function sendMessage(text, options) {");
  const sendEnd = app.indexOf("\n  // Public API Library", sendStart);
  const send = app.slice(sendStart, sendEnd);
  assert.match(send, /let responseCompleted = false;/);
  assert.match(send, /responseCompleted = true;/);
  assert.ok(send.includes("await refreshConversations();") && send.includes("catch (historyError)"));
  assert.ok(send.includes("if (responseCompleted) {") && send.includes('currentMessages[currentMessages.length - 1]?.role !== "assistant"'));
});

test("coding uses a fast provider first and fallback attempts are bounded", () => {
  const codingStart = edge.indexOf('} else if (task === "coding") {');
  const reasoningStart = edge.indexOf('} else if (task === "reasoning") {', codingStart);
  const coding = edge.slice(codingStart, reasoningStart);
  assert.ok(coding.includes('preferred = ["groq", "gemini", "openrouter"'));
  assert.ok(edge.includes('const totalProviderBudgetMs = (task === "web_research" || task === "code_execution" || hasInlineAttachments) ? 105000 : 60000;'));
  assert.ok(edge.includes("const maxAttemptMs = taskNeedsLongToolExecution ? 24000 : index === 0 ? 11000 : 8500;"));
  assert.ok(edge.includes("const providerBudget = Math.max(5000, Math.min(maxAttemptMs, remaining - 6000));"));
  assert.ok(edge.includes(").slice(0, 3);"), "review retries up to three alternate providers");
  assert.ok(edge.includes("perReviewerTimeoutMs, reviewSystem"));
});
