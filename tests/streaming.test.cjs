const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const edge = fs.readFileSync(require.resolve("../supabase/functions/mahi-ai-chat/index.ts"), "utf8");

test("the current browser composer sends requests to the real Edge Function and reads its SSE stream", () => {
  const start = html.indexOf("async function send(text, edit)");
  const end = html.indexOf("\nfunction ", start + 20);
  const send = html.slice(start, end);
  assert.ok(start >= 0 && end > start, "current send() handler must exist");
  assert.match(send, /Api\.chat\(/);
  assert.match(send, /res\.body\.getReader\(\)/);
  assert.match(send, /TextDecoder/);
  assert.match(send, /type === "delta"|type === "delta"/);
  assert.match(send, /type === "done"|type === "done"/);
  assert.match(send, /type === "error"|type === "error"/);
});

test("the Edge Function streams answer deltas and a terminal completion event", () => {
  assert.match(edge, /async function streamChatResponse\(/);
  assert.match(edge, /sseEvent\(controller, encoder, \{ type: "delta"/);
  assert.match(edge, /type: "done"/);
  assert.match(edge, /type: "error"/);
  assert.match(edge, /new ReadableStream/);
});

test("task modes influence the same request and backend routing context", () => {
  assert.match(html, /task_mode: taskMode/);
  assert.match(edge, /taskModeInstruction\(requestedTaskMode\)/);
  assert.match(edge, /generateTaskModeAnswer\(taskMode, available/);
});

test("response persistence failures are surfaced to the browser instead of silently succeeding", () => {
  assert.match(edge, /response_save_failed/);
  assert.match(edge, /MahiCloud could not finish or save the response/);
});
