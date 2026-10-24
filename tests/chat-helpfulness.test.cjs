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
