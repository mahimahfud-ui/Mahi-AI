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

test("Edge Function forwards provider chunks while generating", () => {
  const start = edge.indexOf("async function streamChatResponse(");
  const end = edge.indexOf("\nDeno.serve", start);
  const stream = edge.slice(start, end);
  assert.ok(start >= 0 && end > start, "streamChatResponse must exist");
  const loop = stream.indexOf("while (!cancelled)");
  const delta = stream.indexOf('sseEvent(controller, encoder, { type: "delta", text: next.value });');
  const success = stream.indexOf('if (!completeText.trim()) throw new Error("Provider returned an empty response");');
  assert.ok(loop >= 0 && delta > loop && delta < success,
    "provider deltas must be sent inside the generation loop");
  assert.match(stream, /let attemptStreamed = false;/);
  assert.match(stream, /if \(attemptStreamed\) sseEvent\(controller, encoder, \{ type: "reset" \}\);/);
  assert.match(stream, /if \(finalAnswer !== chosen\.text\)/);
  assert.ok(stream.includes('if (finalAnswer !== chosen.text) {') && stream.includes('for (let offset = 0; offset < finalAnswer.length; offset += 700)'), "only send a replacement if review changes the draft");
});

test("a delivered reply survives a conversation-history refresh error", () => {
  const sendStart = app.indexOf("async function sendMessage(text) {");
  const sendEnd = app.indexOf("\\n  // Public API Library", sendStart);
  const send = app.slice(sendStart, sendEnd);
  assert.match(send, /let responseCompleted = false;/);
  assert.match(send, /responseCompleted = true;/);
  assert.match(send, /await refreshConversations\\(\\);[\\s\\S]*?catch \\(historyError\\)/);
  assert.match(send, /if \\(responseCompleted\\) \\{[\\s\\S]*?currentMessages\\[currentMessages\\.length - 1\\]\\?\\.role !== "assistant"/);
});

test("coding uses a fast provider first and fallback attempts are bounded", () => {
  const codingStart = edge.indexOf('} else if (task === "coding") {');
  const reasoningStart = edge.indexOf('} else if (task === "reasoning") {', codingStart);
  const coding = edge.slice(codingStart, reasoningStart);
  assert.match(coding, /preferred = \\["groq", "gemini", "openrouter"/);
  assert.match(edge, /maxAttemptMs = taskNeedsLongToolExecution \\? 24000 : index === 0 \\? 14000 : 9000/);
  assert.match(edge, /\\)\\.slice\\(0, 1\\);/);
  assert.match(edge, /task, 4500, reviewSystem/);
});
