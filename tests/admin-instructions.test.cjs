"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const edge = fs.readFileSync(require.resolve("../supabase/functions/mahi-ai-chat/index.ts"), "utf8");
const helper = fs.readFileSync(require.resolve("../supabase/functions/mahi-ai-chat/admin-instructions.ts"), "utf8");

test("saved owner instructions are normalized and compiled into the request context", () => {
  assert.match(helper, /export function buildMahiAIAdminInstructionContext/);
  assert.match(helper, /export function normalizeMahiAIAdminConfig/);
  assert.match(edge, /getCachedMahiAIAdminConfig\(\)/);
  assert.match(edge, /buildMahiAIAdminInstructionContext\(adminInstructionConfig\)/);
  assert.match(edge, /const adminInstructionContext = \[/);
});

test("a last-known-good admin configuration survives temporary database failures", () => {
  assert.match(edge, /let lastGoodMahiAIAdminConfig: MahiAIAdminConfig \| null = null/);
  assert.match(edge, /if \(lastGoodMahiAIAdminConfig\)/);
  assert.match(edge, /admin_config_last_good_cache_used/);
  assert.match(edge, /lastGoodMahiAIAdminConfig = config/);
});

test("normal chat and explicit task-mode responses receive the owner instruction context", () => {
  assert.match(edge, /function systemPrompt\(task: string, activeProvider = "", adminInstructionContext = ""\)/);
  assert.match(edge, /adminInstructionContext \? "\\n\\n" \+ adminInstructionContext/);
  assert.match(edge, /generateTaskModeAnswer\(taskMode, available, providerMessages, task, attachments, adminInstructionContext/);
  assert.match(edge, /taskModeInstruction\(requestedTaskMode\)/);
});

test("deterministic owner lookup rules use the same response persistence pipeline", () => {
  assert.match(helper, /export function matchAdminInstructionLookupRule/);
  assert.match(edge, /matchAdminInstructionLookupRule\(adminInstructionConfig, displayPrompt\)/);
  assert.match(edge, /admin_instruction_rule_answered/);
  assert.match(edge, /adminInstructionAnswer/);
});
