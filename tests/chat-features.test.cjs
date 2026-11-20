const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const edge = fs.readFileSync(require.resolve("../supabase/functions/mahi-ai-chat/index.ts"), "utf8");

test("the current composer exposes search, temporary chat, attachments, voice and task modes", () => {
  for (const id of ["newChat", "search", "tTemp", "in", "send", "attach", "file", "mic", "tMode", "taskModeMenu", "jumpLatest"]) {
    assert.ok(html.includes('id="' + id + '"'), "missing current chat control: " + id);
  }
  assert.match(html, /searchMessages: q => Api\.rest/);
  assert.match(html, /function toggleTemp\(\)/);
  assert.match(html, /temporary_chat: S\.temp/);
});

test("the markdown renderer creates Copy and Run actions and delegates both actions", () => {
  assert.match(html, /data-run aria-label="Run code in preview"/);
  assert.match(html, /data-copy>Copy/);
  assert.match(html, /MAIN\.addEventListener\("click", e => \{/);
  assert.match(html, /closest\("\[data-run\]"\)/);
  assert.match(html, /closest\("\[data-copy\]"\)/);
  assert.match(html, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(html, /function openCodePreview\(box\)/);
});

test("temporary chats are excluded from durable history and long-term memory", () => {
  assert.match(edge, /const temporaryChat = input\?\.temporary_chat === true/);
  assert.match(edge, /temporaryChat/);
  assert.match(edge, /persistConversation/);
  assert.match(edge, /userMemoryContext = \{ enabled: false, memories: \[\], recent_messages: \[\] \}/);
});

test("provider routing and credentials remain server-side", () => {
  assert.match(edge, /configuredSecret\(/);
  assert.match(edge, /providerIsConfigured\(/);
  assert.match(edge, /KNOWN_PROVIDERS/);
  assert.doesNotMatch(html, /GEMINI_API_KEY|OPENROUTER_API_KEY|GROQ_API_KEY|service_role/i);
});
