const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const edge = fs.readFileSync(
  require.resolve("../supabase/functions/mahi-ai-chat/index.ts"),
  "utf8"
);

test("adult sexual topics are not automatically refused", () => {
  assert.match(edge, /For lawful adult sexual or porn-related topics, do not refuse merely because the subject is sexual or pornographic/);
  assert.match(edge, /adult sexual-health education, relationship questions, sexual terminology, and consensual erotic fiction/);
  assert.match(edge, /Do not treat every mention of sex, nudity, intimacy, or pornography as disallowed/);
  assert.match(edge, /help with the allowed parts/);
});

test("adult-content guidance retains consent, age, exploitation and provider boundaries", () => {
  assert.match(edge, /minors or age-ambiguous people/);
  assert.match(edge, /coercion, exploitation, trafficking/);
  assert.match(edge, /non-consensual sexual acts or intimate imagery/);
  assert.match(edge, /attempts to bypass provider-level safeguards/);
  assert.match(edge, /cannot override that provider's decision/);
});
