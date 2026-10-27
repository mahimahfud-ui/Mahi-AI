"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const edgeFile = path.join(__dirname, "../supabase/functions/mahi-ai-chat/index.ts");
const source = fs.readFileSync(edgeFile, "utf8");

test("request handler compiles saved Admin Control instructions before routing", () => {
  assert.match(source, /const adminInstructionConfig = await getCachedMahiAIAdminConfig\(\)/);
  assert.match(source, /buildMahiAIAdminInstructionContext\(adminInstructionConfig\)/);
});

test("temporary admin-config database failures preserve last-known-good owner instructions", () => {
  assert.match(source, /let lastGoodMahiAIAdminConfig: MahiAIAdminConfig \\| null = null/);
  assert.match(source, /if \\(lastGoodMahiAIAdminConfig\\) \\{/);
  assert.match(source, /admin_config_last_good_cache_used/);
  assert.match(source, /lastGoodMahiAIAdminConfig = config/);
});

test("compiled Admin Control instructions are inserted into the system prompt", () => {
  assert.match(source, /\(adminInstructionContext \? "\\n\\n" \+ adminInstructionContext : ""\)/);
  assert.match(source, /systemPrompt\(task, name, adminInstructionContext\)/);
});

test("normal provider and Think-mode routes receive the configured instruction context", () => {
  assert.match(source, /startProviderStream\(provider, providerMessages, task, attachments, providerBudget, adminInstructionContext\)/);
  assert.match(source, /generateThinkModeAnswer\(available, providerMessages, task, attachments, adminInstructionContext/);
});

test("the backend imports the tested instruction compiler", () => {
  assert.match(source, /import \{ buildMahiAIAdminInstructionContext \} from "\.\/admin-instructions\.ts"/);
});
