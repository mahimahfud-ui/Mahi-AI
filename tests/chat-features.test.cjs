const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const edge = fs.readFileSync(
  require.resolve("../supabase/functions/mahi-ai-chat/index.ts"),
  "utf8"
);

test("chat UI wires search, export, temporary chat, stopping, and branching", () => {
  for (const id of [
    "chatSearch",
    "exportMarkdownButton",
    "exportJsonButton",
    "temporaryChatButton",
    "stopButton"
  ]) assert.ok(html.includes('id="' + id + '"'), "missing " + id);
  assert.match(app, /async function handleConversationSearch\(\)/);
  assert.match(app, /\.ilike\("content", "%"\s*\+\s*query\s*\+\s*"%"\)/);
  assert.match(app, /function exportConversation\(format\)/);
  assert.match(app, /function beginBranchFromMessage\(index\)/);
  assert.match(app, /branch_context: branchRequest/);
  assert.match(app, /navigator\.share/);
});

test("message actions provide copy, share, and read-aloud without obsolete rating controls", () => {
  assert.match(app, /Copy this message/);
  assert.match(app, /Share this answer/);
  assert.match(app, /Read MahiCloud's answer aloud/);
  assert.match(app, /function addMessageControls/);
  assert.doesNotMatch(app, /mahicloud:feedback:/i);
  assert.doesNotMatch(app, /Mark this answer as helpful/);
  assert.doesNotMatch(app, /Mark this answer as not helpful/);
});

test("temporary chats skip history and long-term memory, and branches preserve context", () => {
  assert.match(edge, /const temporaryChat = input\?\.temporary_chat === true/);
  assert.match(edge, /if \(temporaryChat\) \{\s*userMemoryContext = \{ enabled: false, memories: \[\], recent_messages: \[\] \}/);
  assert.match(edge, /input\?\.temporary_chat === true/);
  assert.match(edge, /const branchContext = input\?\.branch_context === true/);
  assert.match(edge, /async function saveBranchHistory\(/);
  assert.match(edge, /branchContext \? messages\.slice\(0, -1\) : \[\]/);
});

test("provider routing stays server-side and configured keys activate fallback routes", () => {
  assert.match(edge, /if \(name === "shannon"\) return configuredSecret\(\["SHANNON_API_KEY", "SHANNONAI_API_KEY", "SHANNON_AI_API_KEY", "Shannon AI"\]\)/);
  assert.match(edge, /if \(name === "deepseek"\) return configuredSecret/);
  assert.match(edge, /if \(name === "cloudflare"\) return configuredSecret/);
  assert.match(edge, /if \(name === "openai"\) return configuredSecret/);
  assert.match(edge, /if \(name === "anthropic"\) return configuredSecret/);
  assert.doesNotMatch(app, /GEMINI_API_KEY|OPENROUTER_API_KEY|GROQ_API_KEY/);
});

test("settings panel exposes persistent working chat preferences", () => {
  for (const id of [
    "sidebarResizeHandle", "enterToSendToggle", "chatDensitySelect", "chatFontSizeSelect",
    "autoScrollToggle", "responseStyleSelect", "customInstructionsInput", "autoReadAloudToggle",
    "settingsExportMarkdown", "settingsExportJson", "resetChatPreferences"
  ]) assert.ok(html.includes('id="' + id + '"'), "missing setting " + id);
  assert.match(app, /setupSidebarResize\(\)/);
  assert.match(app, /mahi-ai-sidebar-width/);
  assert.match(app, /CHAT_PREFERENCES_STORAGE_KEY/);
  assert.match(app, /custom_instructions: chatPreferences\.customInstructions/);
  assert.match(app, /response_style: chatPreferences\.responseStyle/);
  assert.match(edge, /const customInstructions = typeof input\?\.custom_instructions/);
  assert.match(edge, /const responseStyle = typeof input\?\.response_style/);
  assert.match(edge, /startProviderStream\(provider, providerMessages, task, attachments, providerBudget, adminInstructionContext\)/);
});
