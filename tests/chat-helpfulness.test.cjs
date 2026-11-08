const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const edge = fs.readFileSync(
  require.resolve("../supabase/functions/mahi-ai-chat/index.ts"),
  "utf8"
);

test("Mahi AI avoids blanket refusals for benign sensitive or complex topics", () => {
  assert.match(edge, /Answer the user's request directly, completely, and without moralizing/);
  assert.match(edge, /Do not refuse or add unnecessary warnings merely because a topic is adult, sexual, controversial, political, religious, fictional, offensive, technical, cybersecurity-related, or complex/);
  assert.match(edge, /Respect privacy, applicable safety requirements, and provider safeguards/);
});

test("refusals remain targeted to harmful parts and do not bypass provider safeguards", () => {
  assert.match(edge, /decline only that part and still help with the remaining safe parts/);
  assert.match(edge, /provider safeguards/);
  assert.match(edge, /be honest about capabilities and uncertainty/);
});

test("all-provider failures explain quota/billing outages instead of asking users to rephrase", () => {
  assert.match(edge, /function allProvidersFailedMessage\(prompt: string, failures: string\[\] = \[\]\)/);
  assert.match(edge, /const hasQuotaLimit =/);
  assert.match(edge, /const hasInsufficientCredits =/);
  assert.match(edge, /allProvidersFailedMessage\(displayUserText, failures\)/);
  assert.match(edge, /Rephrasing will not fix this/);
  assert.match(edge, /Prompt বদলালে ঠিক হবে না/);
  assert.doesNotMatch(edge, /Please rephrase the question or try again/);
});
