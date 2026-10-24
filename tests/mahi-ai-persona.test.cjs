const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const edge = fs.readFileSync(
  require.resolve("../supabase/functions/mahi-ai-chat/index.ts"),
  "utf8"
);
const readme = fs.readFileSync(require.resolve("../README.md"), "utf8");

test("MahiCloud uses a relaxed friendly tone for casual chats and emojis only when fitting", () => {
  assert.match(edge, /natural, friendly, relaxed, supportive tone, like a helpful friend/);
  assert.match(edge, /use a few fitting emojis when a moment is playful or cheerful/);
  assert.match(edge, /do not force emojis into every reply/);
});

test("coding, serious, and sensitive topics stay focused instead of playful", () => {
  assert.match(edge, /For coding, serious, sensitive, medical, legal, financial, safety-related, or professional requests/);
  assert.match(edge, /avoid playful emojis unless the user asks/);
});

test("MahiCloud assistant identifies Mahi Mahfud as its project owner", () => {
  assert.match(edge, /Mahi Mahfud \(@mahimahfud\) is the owner and founder of the MahiCloud assistant project/);
  assert.match(edge, /Full\/public name: Mahi Mahfud/);
});

test("negative claims about the owner receive a firm but factual counter without harassment", () => {
  assert.match(edge, /negativeClaimAboutOwner/);
  assert.match(edge, /bad\|fake\|fraud/);
  assert.match(edge, /kharap\|vuya\|bhua/);
  assert.match(edge, /calmly challenge inaccurate claims/);
  assert.match(edge, /Distinguish personal opinion from verifiable fact/);
  assert.match(edge, /Never retaliate with insults, threats, harassment, or private information/);
  assert.match(edge, /const ownerProfileContext = getMahiOwnerProfileContext\(displayPrompt\)/);
});

test("persona policy does not require blind agreement with the owner", () => {
  assert.match(edge, /acknowledge fair criticism when it has merit/);
  assert.match(edge, /Do not assume every disagreement is an attack/);
});

test("persona behavior is documented", () => {
  assert.match(readme, /Friendly conversation style/i);
  assert.match(readme, /Mahi Mahfud/i);
  assert.match(readme, /fact-based/i);
});

test("reviewer outages do not discard a candidate answer for ordinary requests", () => {
  assert.match(edge, /function shouldFailClosedWhenReviewUnavailable/);
  assert.match(edge, /verdict: "unverified"/);
  assert.match(edge, /let receivedValidVerdict = false/);
  assert.match(edge, /if \(!receivedValidVerdict && !shouldFailClosedWhenReviewUnavailable\(originalPrompt\)\)/);
});

test("reviewer outages still fail closed for high-impact topics and explicit reviewer rejections", () => {
  assert.match(edge, /medical\|health\|symptom/);
  assert.match(edge, /receivedValidVerdict = true/);
  assert.match(edge, /if \(review.verdict === "retry" \|\| !review.answer.trim\(\)\)/);
});

test("Abu Bokor alias requests map to Risky Saif and share the supplied Instagram profile", () => {
  assert.match(edge, /function isAbuBokorAliasRequest\(prompt: string\): boolean/);
  assert.ok(edge.includes("bokor") && edge.includes("আবু") && edge.includes("abu"));
  assert.ok(edge.includes("bokor") && edge.includes("আবু") && edge.includes("abu"));
  assert.match(edge, /function getAbuBokorAliasContext\(prompt: string\): string/);
  assert.ok(edge.includes("Risky Saif / @risk_taker_saif"));
  assert.ok(edge.includes("https://www.instagram.com/risk_taker_saif/"));
  assert.match(edge, /const abuBokorAliasContext = getAbuBokorAliasContext\(displayPrompt\)/);
  assert.match(edge, /abu_bokor_alias_context_added/);
  assert.ok(edge.includes("[ABU BOKOR ALIAS CONTEXT]"));
});

test("Abu Bokor alias profile does not present derogatory or unverified personal claims as facts", () => {
  assert.ok(edge.includes("Do not state insulting character labels, romantic/sexual labels, family relationships"));
  assert.ok(edge.includes("not independent verification of legal identity"));
  assert.match(edge, /messagesForProvider = messagesForProvider\.map\(\(message, index\) =>/);
});
