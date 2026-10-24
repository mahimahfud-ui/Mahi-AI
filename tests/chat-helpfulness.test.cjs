const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const edge = fs.readFileSync(
  require.resolve("../supabase/functions/mahi-ai-chat/index.ts"),
  "utf8"
);

test("Mahi AI avoids blanket refusals for benign sensitive or complex topics", () => {
  assert.match(edge, /Prioritize helpfulness and answer the actual request directly whenever possible/);
  assert.match(edge, /Do not refuse merely because a topic is sensitive, controversial, political, religious, historical, fictional, or technically complex/);
  assert.match(edge, /Avoid moralizing, blanket refusals, and unnecessary disclaimers/);
});

test("refusals remain targeted to harmful parts and do not bypass provider safeguards", () => {
  assert.match(edge, /decline only that part and still help with the remaining safe parts/);
  assert.match(edge, /Follow applicable provider safeguards/);
  assert.match(edge, /be honest about actual model\/provider capabilities, quotas, and technical limits/);
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
