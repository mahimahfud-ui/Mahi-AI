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
  assert.doesNotMatch(stream, /for \(let offset = 0; offset < finalAnswer\.length; offset \+= 700\) \{\s*sseEvent\(controller, encoder, \{ type: "delta", text: finalAnswer\.slice/);
});
