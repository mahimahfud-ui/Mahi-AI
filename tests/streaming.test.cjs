const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const edge = fs.readFileSync(
  require.resolve("../supabase/functions/mahi-ai-chat/index.ts"),
  "utf8"
);

test("chat shows Thinking before session setup and ignores backend status text", () => {
  const sendStart = app.indexOf("async function sendMessage(text) {");
  const sendEnd = app.indexOf("\n  // Public API Library", sendStart);
  const send = app.slice(sendStart, sendEnd);
  assert.ok(sendStart >= 0 && sendEnd > sendStart, "sendMessage must exist");
  const thinkingIndex = send.indexOf('addMessage("assistant", "", { typing: true })');
  const sessionIndex = send.indexOf("if (!session) await ensureSession()");
  assert.ok(thinkingIndex >= 0 && sessionIndex > thinkingIndex,
    "Thinking should render before session initialization");
  assert.match(app, /class="thinking-label">Thinking/);
  assert.doesNotMatch(app, /payload\.type === "status" && typeof payload\.message/);
  assert.match(app, /payload\.type === "reset"/);
});

test("Edge Function verifies provider answers before streaming the accepted answer", () => {
  const start = edge.indexOf("async function streamChatResponse(");
  const end = edge.indexOf("\\nDeno.serve", start);
  const stream = edge.slice(start, end);
  assert.ok(start >= 0 && end > start, "streamChatResponse must exist");
  const loop = stream.indexOf("while (!cancelled)");
  const buffer = stream.indexOf("completeText += next.value;");
  const qualityCheck = stream.indexOf("const review = await independentlyReviewAnswer(");
  const accepted = stream.indexOf("chosen = { provider, text: review.answer, reviewer: review.reviewer };");
  const answerDelta = stream.indexOf('sseEvent(controller, encoder, { type: "delta", text: finalAnswer.slice(offset, offset + 700) });');
  assert.ok(loop >= 0 && buffer > loop, "candidate answer must be buffered from the provider");
  assert.ok(qualityCheck > buffer && accepted > qualityCheck, "candidate must pass an independent model check before selection");
  assert.ok(answerDelta > accepted, "only the accepted answer is sent to the client");
  assert.ok(!stream.includes('sseEvent(controller, encoder, { type: "delta", text: next.value });'),
    "unverified provider tokens must not stream to users");
  assert.ok(edge.includes('["keep", "correct", "retry"]'), "reviewer can reject an answer and trigger fallback");
  assert.ok(edge.includes("provider_answer_rejected"));
  assert.ok(edge.includes("provider_answer_accepted"));
  assert.ok(edge.includes("allProvidersFailedMessage(displayUserText)"));
});

test("a delivered reply survives a conversation-history refresh error", () => {
  const sendStart = app.indexOf("async function sendMessage(text) {");
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
  assert.ok(edge.includes("const maxAttemptMs = taskNeedsLongToolExecution ? 24000 : index === 0 ? 14000 : 9000;"));
  assert.ok(edge.includes(").slice(0, 3);"), "review retries up to three alternate providers");
  assert.ok(edge.includes("perReviewerTimeoutMs, reviewSystem"));
});
