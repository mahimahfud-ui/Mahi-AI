const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync(require.resolve("../supabase/functions/mahi-ai-chat/index.ts"), "utf8");

test("Rafi-name queries receive the owner-provided playful eFootball profile context", () => {
  assert.match(source, /function isMainulHaqueRafiRequest\(prompt: string\)/);
  assert.match(source, /mainul\[\\s_-\]\*\(\?:haque/);
  assert.match(source, /function getMainulHaqueRafiContext\(prompt: string\): string/);
  assert.match(source, /PES\/eFootball superfan whose gaming life revolves around PES\/eFootball/);
  assert.match(source, /Bura Team/);
  assert.match(source, /Osustho Team/);
  assert.match(source, /Jowan Team/);
  assert.match(source, /Goalkeeper Team/);
  assert.match(source, /mainulHaqueRafiContext = getMainulHaqueRafiContext\(displayPrompt\)/);
  assert.match(source, /mainul_haque_rafi_context_added/);
  assert.match(source, /not independently verified/);
});
